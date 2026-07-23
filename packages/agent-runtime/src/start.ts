import { agentIdentityFromEnv } from './agentIdentity.js';
import { AgentLoopController } from './agentLoopController.js';
import { MinecraftActionAdapter } from './minecraftActionAdapter.js';
import { WorldStateClient } from './worldStateClient.js';
import { PuppetBrain } from './brains/puppetBrain.js';
import { OllamaBrain } from './brains/ollamaBrain.js';
import type { AgentBrain } from './types.js';

function buildBrain(identity: { id: string; role?: string; persona: string }): AgentBrain {
  const kind = process.env.AGENT_BRAIN ?? 'ollama';

  if (kind === 'puppet') {
    // Registration already happens deterministically in main() before the loop starts.
    return new PuppetBrain(() => [{ kind: 'idle' }]);
  }

  return new OllamaBrain({
    agentId: identity.id,
    persona: identity.persona,
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL,
  });
}

async function main() {
  const identity = agentIdentityFromEnv();
  const minecraftHost = process.env.MINECRAFT_HOST ?? 'gate';
  const minecraftPort = Number(process.env.MINECRAFT_PORT ?? 25565);
  const worldStateUrl = process.env.WORLD_STATE_URL ?? 'http://world-state:41241/';
  const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS ?? 5000);

  const adapter = await MinecraftActionAdapter.connect({
    host: minecraftHost,
    port: minecraftPort,
    username: identity.minecraftUsername,
  });
  const worldState = await WorldStateClient.connect(worldStateUrl);

  // Registration is a hard prerequisite for proposeLaw/vote (GovernanceEngine.requireAgent), so
  // it's done deterministically here rather than left to a brain's judgment — an LLM brain that
  // never gets around to calling registerAgent would otherwise be silently locked out of
  // governance for the rest of the run.
  await worldState.send({ skill: 'register_agent', agentId: identity.id, role: identity.role });

  const brain = buildBrain(identity);

  const controller = new AgentLoopController(identity.id, adapter, worldState, brain);

  await controller.runOnce();
  setInterval(() => {
    controller.runOnce().catch((error) => {
      console.error(`[${identity.id}] tick failed`, error);
    });
  }, tickIntervalMs);
}

main().catch((error) => {
  console.error('Agent runtime failed to start', error);
  process.exit(1);
});
