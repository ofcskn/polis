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
  const minecraftHost = process.env.MINECRAFT_HOST ?? 'localhost';
  const minecraftPort = Number(process.env.MINECRAFT_PORT ?? 25565);
  const worldStateUrl = process.env.WORLD_STATE_URL ?? 'http://world-state:41241/';
  const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS ?? 5000);
  const brainKind = process.env.AGENT_BRAIN ?? 'ollama';

  console.log(
    `[${identity.id}] connecting to Minecraft at ${minecraftHost}:${minecraftPort} as ${identity.minecraftUsername}...`
  );
  const adapter = await MinecraftActionAdapter.connect({
    host: minecraftHost,
    port: minecraftPort,
    username: identity.minecraftUsername,
  });
  console.log(`[${identity.id}] connected to Minecraft and spawned.`);

  console.log(`[${identity.id}] connecting to World-State Agent at ${worldStateUrl}...`);
  const worldState = await WorldStateClient.connect(worldStateUrl);
  console.log(`[${identity.id}] connected to World-State Agent.`);

  // Registration is a hard prerequisite for proposeLaw/vote (GovernanceEngine.requireAgent), so
  // it's done deterministically here rather than left to a brain's judgment — an LLM brain that
  // never gets around to calling registerAgent would otherwise be silently locked out of
  // governance for the rest of the run.
  await worldState.send({ skill: 'register_agent', agentId: identity.id, role: identity.role });
  console.log(`[${identity.id}] registered with World-State Agent (role: ${identity.role ?? 'none'}).`);

  const brain = buildBrain(identity);
  console.log(
    `[${identity.id}] brain: ${brainKind}${brainKind === 'ollama' ? ` (model: ${process.env.OLLAMA_MODEL ?? 'qwen2.5:7b'}, url: ${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'})` : ''}, ticking every ${tickIntervalMs}ms.`
  );

  const controller = new AgentLoopController(identity.id, adapter, worldState, brain);

  await controller.runOnce();
  // A tick can legitimately take longer than tickIntervalMs (e.g. a slow Ollama response), and
  // setInterval doesn't wait for the previous callback to finish — without this guard, two
  // runOnce() calls can overlap and race on the same AgentLoopController.tick value, corrupting
  // both perception (they'd both see it and increment it once) and world-state (double dispatch
  // of the same decision).
  let tickInFlight = false;
  setInterval(() => {
    if (tickInFlight) {
      console.log(`[${identity.id}] skipping tick, previous one is still running.`);
      return;
    }
    tickInFlight = true;
    controller
      .runOnce()
      .catch((error) => {
        console.error(`[${identity.id}] tick failed`, error);
      })
      .finally(() => {
        tickInFlight = false;
      });
  }, tickIntervalMs);
}

main().catch((error) => {
  console.error('Agent runtime failed to start', error);
  process.exit(1);
});
