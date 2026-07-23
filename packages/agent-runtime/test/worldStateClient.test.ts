import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldStateServer, type WorldStateServer } from '@polis/world-state';
import { WorldStateClient } from '../src/worldStateClient.js';

const PORT = 41298;
const BASE_URL = `http://localhost:${PORT}/`;

let tempDir: string;
let worldState: WorldStateServer;
let httpServer: Server;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'polis-agent-runtime-'));
  worldState = createWorldStateServer({ baseUrl: BASE_URL, dbPath: join(tempDir, 'test.sqlite') });
  await new Promise<void>((resolve) => {
    httpServer = worldState.app.listen(PORT, resolve);
  });
});

afterAll(async () => {
  worldState.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
});

describe('WorldStateClient', () => {
  it('registers an agent and proposes a law', async () => {
    const client = await WorldStateClient.connect(BASE_URL);

    const registerResult = await client.send({ skill: 'register_agent', agentId: 'agent-a' });
    expect(registerResult.ok).toBe(true);

    const proposeResult = await client.send({
      skill: 'propose_law',
      agentId: 'agent-a',
      description: 'Protect the town hall',
    });
    expect(proposeResult.ok).toBe(true);
  });

  it('surfaces a World-State error as a non-ok result rather than throwing', async () => {
    const client = await WorldStateClient.connect(BASE_URL);

    const result = await client.send({
      skill: 'propose_law',
      agentId: 'never-registered',
      description: 'x',
    });

    expect(result).toEqual({ ok: false, error: 'Unknown agent: never-registered' });
  });
});
