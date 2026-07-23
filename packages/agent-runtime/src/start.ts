import { agentIdentityFromEnv } from './agentIdentity.js';
import { AgentLoopController } from './agentLoopController.js';
import { MinecraftActionAdapter } from './minecraftActionAdapter.js';
import { WorldStateClient } from './worldStateClient.js';
import { PuppetBrain } from './brains/puppetBrain.js';

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

  const brain = new PuppetBrain((_perception, tick) => {
    if (tick === 0) {
      return [{ kind: 'registerAgent', role: identity.role }];
    }
    return [{ kind: 'idle' }];
  });

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
