import type { Action, AgentBrain, Perception } from '../types.js';
import { parseActionsFromResponse } from './actionValidation.js';

// A long-running world can accumulate far more open proposals than a small local model's context
// can usefully digest; sending them all in one prompt was observed to make the model summarize
// or echo the list back in prose instead of returning a valid Action array. Capping this keeps
// prompt size bounded regardless of how much governance history piles up.
const MAX_PROPOSALS_IN_PROMPT = 5;

export interface OllamaBrainOptions {
  agentId: string;
  persona: string;
  baseUrl?: string;
  model?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

const SYSTEM_PROMPT_TEMPLATE = `You are {agentId}, an autonomous agent living in a shared Minecraft world alongside other agents and human players. Your persona: {persona}

You participate in the world two ways: acting in Minecraft (chat, movement, digging) and participating in this world's self-governance (proposing laws, voting, transferring currency) through a shared World-State Agent.

Respond with ONLY a JSON array of actions to take this tick, no prose before or after. Each element must be one of:
- {"kind":"chat","text":string}
- {"kind":"moveTo","x":number,"y":number,"z":number}
- {"kind":"dig","x":number,"y":number,"z":number}
- {"kind":"registerAgent","role"?:string}
- {"kind":"proposeLaw","description":string}
- {"kind":"vote","proposalId":string,"choice":"yes"|"no"}
- {"kind":"transferCurrency","toAgentId":string,"amount":number}
- {"kind":"idle"}

IMPORTANT: for "moveTo" and "dig", you can ONLY use coordinates that appear in the "Nearby blocks" or "Nearby entities" list below — never invent coordinates. If nothing in that list is relevant to what you want to do, use "idle" or "chat" instead this tick; the list will change as you look around. "moveTo" does real pathfinding (it can fail if there's no path) and "dig" only works on a real, diggable block — check "Results of your last actions" to see whether your previous move/dig actually succeeded.

Return an empty array [] or a single {"kind":"idle"} if there is nothing worth doing this tick. Keep chat messages short and in character.`;

/**
 * An LLM-backed AgentBrain that calls a local Ollama server. Fills the Phase 1 slot described in
 * ROADMAP.md: Perception -> prompt, model response -> validated Action[], with malformed
 * responses degrading to idle instead of crashing the tick, and the previous tick's rejection
 * reasons fed back so the model can self-correct.
 */
export class OllamaBrain implements AgentBrain {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  private lastErrors: string[] = [];
  private consecutiveFailures = 0;
  private nextAllowedAttemptAt = 0;

  constructor(private readonly options: OllamaBrainOptions) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'llama3.2';
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.baseBackoffMs = options.baseBackoffMs ?? 2000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
  }

  async decide(perception: Perception): Promise<Action[]> {
    const tag = `[${this.options.agentId} tick ${perception.tick}]`;

    if (this.now() < this.nextAllowedAttemptAt) {
      console.log(`${tag} skipping request, backing off until ${new Date(this.nextAllowedAttemptAt).toISOString()}`);
      return [{ kind: 'idle' }];
    }

    try {
      const content = await this.requestCompletion(perception);
      console.log(`${tag} raw model response: ${content}`);
      const { actions, errors } = parseActionsFromResponse(content);
      if (errors.length > 0) {
        console.log(`${tag} rejected part of the response: ${JSON.stringify(errors)}`);
      }
      console.log(`${tag} decided actions: ${JSON.stringify(actions)}`);
      this.lastErrors = errors;
      this.onSuccess();
      return actions.length > 0 ? actions : [{ kind: 'idle' }];
    } catch (error) {
      console.error(`${tag} request failed:`, error);
      this.lastErrors = [`request failed: ${(error as Error).message}`];
      this.onFailure();
      return [{ kind: 'idle' }];
    }
  }

  private async requestCompletion(perception: Perception): Promise<string> {
    const response = await this.fetchFn(new URL('/api/chat', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: this.systemPrompt() },
          { role: 'user', content: this.userPrompt(perception) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }

    const body = (await response.json()) as { message?: { content?: string } };
    if (typeof body.message?.content !== 'string') {
      throw new Error('Ollama response was missing message.content');
    }
    return body.message.content;
  }

  private systemPrompt(): string {
    return SYSTEM_PROMPT_TEMPLATE.replace('{agentId}', this.options.agentId).replace(
      '{persona}',
      this.options.persona || 'no persona set'
    );
  }

  private userPrompt(perception: Perception): string {
    const proposals = perception.worldState.openProposals;
    const shownProposals = proposals.slice(-MAX_PROPOSALS_IN_PROMPT);
    const lines = [
      `Tick: ${perception.tick}`,
      `Position: ${perception.position ? JSON.stringify(perception.position) : 'unknown'}`,
      `Health: ${perception.health ?? 'unknown'}`,
      `Nearby blocks (only use these coordinates for moveTo/dig): ${JSON.stringify(perception.nearbyBlocks)}`,
      `Nearby entities: ${JSON.stringify(perception.nearbyEntities)}`,
      `Results of your last actions: ${JSON.stringify(perception.lastActionResults)}`,
      `Recent chat: ${JSON.stringify(perception.chatMessages)}`,
      `Open proposals (showing ${shownProposals.length} most recent of ${proposals.length} total): ${JSON.stringify(shownProposals)}`,
    ];
    if (this.lastErrors.length > 0) {
      lines.push(
        `Your previous response had problems and those actions were skipped: ${JSON.stringify(this.lastErrors)}. Fix this in your JSON array.`
      );
    }
    return lines.join('\n');
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.nextAllowedAttemptAt = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    const backoff = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * 2 ** (this.consecutiveFailures - 1)
    );
    this.nextAllowedAttemptAt = this.now() + backoff;
  }
}
