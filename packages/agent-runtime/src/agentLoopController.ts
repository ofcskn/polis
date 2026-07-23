import type { Action, AgentBrain, MinecraftPort, Perception, WorldStatePort } from './types.js';

export class AgentLoopController {
  private tick = 0;
  private openProposals: unknown[] = [];
  private lastActionResults: string[] = [];

  constructor(
    private readonly agentId: string,
    private readonly adapter: MinecraftPort,
    private readonly worldState: WorldStatePort,
    private readonly brain: AgentBrain
  ) {}

  async runOnce(): Promise<void> {
    const snapshot = this.adapter.perceive();
    const listResult = await this.worldState.send({ skill: 'list_proposals' });
    if (listResult.ok) {
      this.openProposals = listResult.data as unknown[];
    }

    const perception: Perception = {
      tick: this.tick,
      chatMessages: snapshot.chatMessages,
      position: snapshot.position,
      health: snapshot.health,
      nearbyBlocks: snapshot.nearbyBlocks,
      nearbyEntities: snapshot.nearbyEntities,
      lastActionResults: this.lastActionResults,
      worldState: { openProposals: this.openProposals },
    };

    const actions = await this.brain.decide(perception);
    const results: string[] = [];
    for (const action of actions) {
      results.push(await this.dispatch(action));
    }
    this.lastActionResults = results;

    this.tick += 1;
  }

  private async dispatch(action: Action): Promise<string> {
    switch (action.kind) {
      case 'chat':
      case 'moveTo':
      case 'dig':
        return this.adapter.dispatch(action);
      case 'registerAgent': {
        const result = await this.worldState.send({
          skill: 'register_agent',
          agentId: this.agentId,
          role: action.role,
        });
        return result.ok ? `Registered (role: ${action.role ?? 'none'}).` : `Register failed: ${result.error}`;
      }
      case 'proposeLaw': {
        const result = await this.worldState.send({
          skill: 'propose_law',
          agentId: this.agentId,
          description: action.description,
        });
        return result.ok
          ? `Proposed law: "${action.description}"`
          : `Propose law failed: ${result.error}`;
      }
      case 'vote': {
        const result = await this.worldState.send({
          skill: 'vote',
          agentId: this.agentId,
          proposalId: action.proposalId,
          choice: action.choice,
        });
        return result.ok
          ? `Voted ${action.choice} on proposal ${action.proposalId}.`
          : `Vote failed: ${result.error}`;
      }
      case 'transferCurrency': {
        const result = await this.worldState.send({
          skill: 'transfer_currency',
          agentId: this.agentId,
          toAgentId: action.toAgentId,
          amount: action.amount,
        });
        return result.ok
          ? `Transferred ${action.amount} to ${action.toAgentId}.`
          : `Transfer failed: ${result.error}`;
      }
      case 'idle':
        return 'Idled.';
    }
  }
}
