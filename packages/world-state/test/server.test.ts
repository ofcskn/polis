import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ClientFactory } from '@a2a-js/sdk/client';
import { Role, type Message, type SendMessageResult, type Task } from '@a2a-js/sdk';
import { createWorldStateServer, type WorldStateServer } from '../src/server.js';

const PORT = 41299;
const BASE_URL = `http://localhost:${PORT}/`;

let tempDir: string;
let worldState: WorldStateServer;
let httpServer: Server;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'polis-world-state-server-'));
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

function textMessage(text: string): Message {
  return {
    messageId: randomUUID(),
    contextId: '',
    taskId: '',
    role: Role.ROLE_USER,
    parts: [
      {
        content: { $case: 'text', value: text },
        metadata: undefined,
        filename: '',
        mediaType: 'text/plain',
      },
    ],
    metadata: undefined,
  } as Message;
}

function resultText(result: SendMessageResult): string {
  const task = result as Task;
  const part = task.artifacts?.[0]?.parts[0];
  if (part?.content?.$case === 'text') {
    return part.content.value;
  }
  throw new Error('Expected a task result with a text artifact');
}

describe('World-State A2A server', () => {
  it('serves its agent card', async () => {
    const response = await fetch(`${BASE_URL}.well-known/agent-card.json`);
    expect(response.status).toBe(200);
    const card = await response.json();
    expect(card.name).toBe('Polis World-State Agent');
  });

  it('registers two agents and lets one propose and pass a law', async () => {
    const factory = new ClientFactory();
    const client = await factory.createFromUrl(BASE_URL);

    await client.sendMessage({
      tenant: '',
      message: textMessage(JSON.stringify({ skill: 'register_agent', agentId: 'agent-a' })),
      configuration: undefined,
      metadata: {},
    });
    await client.sendMessage({
      tenant: '',
      message: textMessage(JSON.stringify({ skill: 'register_agent', agentId: 'agent-b' })),
      configuration: undefined,
      metadata: {},
    });

    const proposeResult = await client.sendMessage({
      tenant: '',
      message: textMessage(
        JSON.stringify({
          skill: 'propose_law',
          agentId: 'agent-a',
          description: 'Protect the town hall',
        })
      ),
      configuration: undefined,
      metadata: {},
    });
    const proposal = JSON.parse(resultText(proposeResult));
    expect(proposal.ok).toBe(true);
    const proposalId = proposal.data.id;

    await client.sendMessage({
      tenant: '',
      message: textMessage(
        JSON.stringify({ skill: 'vote', agentId: 'agent-a', proposalId, choice: 'yes' })
      ),
      configuration: undefined,
      metadata: {},
    });
    const finalVote = await client.sendMessage({
      tenant: '',
      message: textMessage(
        JSON.stringify({ skill: 'vote', agentId: 'agent-b', proposalId, choice: 'yes' })
      ),
      configuration: undefined,
      metadata: {},
    });

    const voteResult = JSON.parse(resultText(finalVote));
    expect(voteResult.data.status).toBe('active');
  });
});
