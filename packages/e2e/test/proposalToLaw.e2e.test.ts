import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBot, type Bot } from 'mineflayer';
import { createWorldStateServer, type WorldStateServer } from '@polis/world-state';
import {
  AgentLoopController,
  MinecraftActionAdapter,
  PuppetBrain,
  WorldStateClient,
  type Action,
  type Perception,
} from '@polis/agent-runtime';

const MINECRAFT_HOST = 'localhost';
const MINECRAFT_PORT = 25566;
const WORLD_STATE_PORT = 41297;
const WORLD_STATE_URL = `http://localhost:${WORLD_STATE_PORT}/`;

let tempDir: string;
let worldState: WorldStateServer;
let httpServer: Server;
let observerBot: Bot;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'polis-e2e-'));
  worldState = createWorldStateServer({
    baseUrl: WORLD_STATE_URL,
    dbPath: join(tempDir, 'e2e.sqlite'),
  });
  await new Promise<void>((resolve) => {
    httpServer = worldState.app.listen(WORLD_STATE_PORT, resolve);
  });

  observerBot = createBot({
    host: MINECRAFT_HOST,
    port: MINECRAFT_PORT,
    username: 'polis_e2e_obs',
    auth: 'offline',
  });
  await new Promise<void>((resolve, reject) => {
    observerBot.once('spawn', () => resolve());
    observerBot.once('error', reject);
    observerBot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
  });
}, 60_000);

afterAll(() => {
  worldState.close();
  httpServer.close();
  observerBot.end();
  rmSync(tempDir, { recursive: true, force: true });
});

interface ProposalView {
  id: string;
  status: string;
  votes: Record<string, 'yes' | 'no'>;
}

describe('proposal to law, end to end', () => {
  it('lets one agent propose a law, another vote it active, and announces it in chat', async () => {
    const proposalDescription = 'Protect the town hall from griefing';
    const chatHeard: string[] = [];
    observerBot.on('chat', (username, message) => {
      chatHeard.push(`${username}: ${message}`);
    });

    const proposerScript = (perception: Perception, tick: number): Action[] => {
      if (tick === 0) return [{ kind: 'registerAgent' }];
      if (tick === 1) return [{ kind: 'proposeLaw', description: proposalDescription }];

      const proposals = perception.worldState.openProposals as ProposalView[];
      const mine = proposals.find((p) => p.status !== 'rejected');
      if (mine?.status === 'active') {
        return [{ kind: 'chat', text: `The law passed: ${proposalDescription}` }];
      }
      if (mine?.status === 'draft' && !mine.votes['agent-a']) {
        return [{ kind: 'vote', proposalId: mine.id, choice: 'yes' }];
      }
      return [{ kind: 'idle' }];
    };

    const voterScript = (perception: Perception, tick: number): Action[] => {
      if (tick === 0) return [{ kind: 'registerAgent' }];

      const proposals = perception.worldState.openProposals as ProposalView[];
      const draft = proposals.find((p) => p.status === 'draft' && !p.votes['agent-b']);
      if (draft) {
        return [{ kind: 'vote', proposalId: draft.id, choice: 'yes' }];
      }
      return [{ kind: 'idle' }];
    };

    // Paper's default connection-throttle rejects a second connection from
    // the same IP that arrives too soon after the first; space out each of
    // this test's three bot connections (observerBot above, then these two).
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const proposerAdapter = await MinecraftActionAdapter.connect({
      host: MINECRAFT_HOST,
      port: MINECRAFT_PORT,
      username: 'lenser_a_bot',
    });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const voterAdapter = await MinecraftActionAdapter.connect({
      host: MINECRAFT_HOST,
      port: MINECRAFT_PORT,
      username: 'lenser_b_bot',
    });
    const proposerWorldState = await WorldStateClient.connect(WORLD_STATE_URL);
    const voterWorldState = await WorldStateClient.connect(WORLD_STATE_URL);

    const proposer = new AgentLoopController(
      'agent-a',
      proposerAdapter,
      proposerWorldState,
      new PuppetBrain(proposerScript)
    );
    const voter = new AgentLoopController(
      'agent-b',
      voterAdapter,
      voterWorldState,
      new PuppetBrain(voterScript)
    );

    await proposer.runOnce(); // tick 0: agent-a registers
    await voter.runOnce(); // tick 0: agent-b registers
    await proposer.runOnce(); // tick 1: agent-a proposes the law
    await voter.runOnce(); // tick 1: agent-b votes yes (1 of 2)
    await proposer.runOnce(); // tick 2: agent-a votes yes (2 of 2) -> active

    const list = await proposerWorldState.send({ skill: 'list_proposals' });
    expect(list.ok).toBe(true);
    const activeProposal = (list.data as ProposalView[]).find((p) => p.status === 'active');
    expect(activeProposal).toBeDefined();

    await proposer.runOnce(); // tick 3: agent-a sees the active law and announces it
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(chatHeard.some((line) => line.includes('The law passed'))).toBe(true);

    proposerAdapter.disconnect();
    voterAdapter.disconnect();
  }, 60_000);
});
