import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Role, TaskState, type Message } from '@a2a-js/sdk';
import {
  RequestContext,
  type AgentExecutionEvent,
  type ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { WorldStateAgentExecutor } from '../src/agentExecutor.js';
import { GovernanceEngine } from '../src/governanceEngine.js';
import { CurrencyLedger } from '../src/currencyLedger.js';
import type { AgentRecord, Proposal, ProposalStatus } from '../src/domain.js';
import type { WorldStateRepository } from '../src/repository.js';

class FakeRepository implements WorldStateRepository {
  private proposals = new Map<string, Proposal>();
  private agents = new Map<string, AgentRecord>();

  saveProposal(proposal: Proposal): void {
    this.proposals.set(proposal.id, proposal);
  }
  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }
  listProposals(status?: ProposalStatus): Proposal[] {
    const all = [...this.proposals.values()];
    return status ? all.filter((p) => p.status === status) : all;
  }
  saveAgent(agent: AgentRecord): void {
    this.agents.set(agent.id, agent);
  }
  getAgent(id: string): AgentRecord | undefined {
    return this.agents.get(id);
  }
  listAgents(): AgentRecord[] {
    return [...this.agents.values()];
  }
}

class RecordingEventBus implements ExecutionEventBus {
  public events: AgentExecutionEvent[] = [];
  publish(event: AgentExecutionEvent): void {
    this.events.push(event);
  }
  on(..._args: unknown[]): this {
    return this;
  }
  off(..._args: unknown[]): this {
    return this;
  }
  once(..._args: unknown[]): this {
    return this;
  }
  removeAllListeners(..._args: unknown[]): this {
    return this;
  }
  finished(): void {}
}

function textMessage(text: string): Message {
  return {
    messageId: randomUUID(),
    contextId: 'ctx-1',
    taskId: 'task-1',
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

function contextFor(message: Message): RequestContext {
  return new RequestContext(
    { tenant: '', message, configuration: undefined, metadata: undefined },
    'task-1',
    'ctx-1',
    {} as never
  );
}

function makeExecutor(): { executor: WorldStateAgentExecutor; repository: FakeRepository } {
  const repository = new FakeRepository();
  const executor = new WorldStateAgentExecutor(
    new GovernanceEngine(repository),
    new CurrencyLedger(repository)
  );
  return { executor, repository };
}

describe('WorldStateAgentExecutor', () => {
  it('registers an agent, persists it, and publishes a completed task', async () => {
    const { executor, repository } = makeExecutor();
    const bus = new RecordingEventBus();

    await executor.execute(
      contextFor(textMessage(JSON.stringify({ skill: 'register_agent', agentId: 'agent-a' }))),
      bus
    );

    expect(repository.getAgent('agent-a')).toEqual({ id: 'agent-a', role: undefined, balance: 0 });

    const statusEvents = bus.events.filter((event) => event.kind === 'statusUpdate');
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].kind === 'statusUpdate' && statusEvents[0].data.status.state).toBe(
      TaskState.TASK_STATE_COMPLETED
    );
  });

  it('publishes a structured error artifact for an unknown agent', async () => {
    const { executor } = makeExecutor();
    const bus = new RecordingEventBus();

    await executor.execute(
      contextFor(
        textMessage(JSON.stringify({ skill: 'propose_law', agentId: 'ghost', description: 'x' }))
      ),
      bus
    );

    const artifactEvents = bus.events.filter((event) => event.kind === 'artifactUpdate');
    expect(artifactEvents).toHaveLength(1);
    const event = artifactEvents[0];
    if (event.kind !== 'artifactUpdate') throw new Error('unreachable');
    const part = event.data.artifact.parts[0];
    expect(part.content?.$case).toBe('text');
    const result = part.content?.$case === 'text' ? JSON.parse(part.content.value) : undefined;
    expect(result).toEqual({ ok: false, error: 'Unknown agent: ghost' });
  });

  it('completes a full propose-and-vote round trip through the executor', async () => {
    const { executor, repository } = makeExecutor();
    const bus = new RecordingEventBus();

    async function send(command: unknown) {
      const localBus = new RecordingEventBus();
      await executor.execute(contextFor(textMessage(JSON.stringify(command))), localBus);
      const artifact = localBus.events.find((e) => e.kind === 'artifactUpdate');
      if (!artifact || artifact.kind !== 'artifactUpdate') throw new Error('no artifact');
      const part = artifact.data.artifact.parts[0];
      if (part.content?.$case !== 'text') throw new Error('no text part');
      return JSON.parse(part.content.value);
    }

    await send({ skill: 'register_agent', agentId: 'agent-a' });
    await send({ skill: 'register_agent', agentId: 'agent-b' });
    const proposeResult = await send({
      skill: 'propose_law',
      agentId: 'agent-a',
      description: 'Protect the town hall',
    });
    expect(proposeResult.ok).toBe(true);
    const proposalId = proposeResult.data.id;

    await send({ skill: 'vote', agentId: 'agent-a', proposalId, choice: 'yes' });
    const finalVote = await send({ skill: 'vote', agentId: 'agent-b', proposalId, choice: 'yes' });

    expect(finalVote.ok).toBe(true);
    expect(finalVote.data.status).toBe('active');
    expect(bus.events).toEqual([]);
  });
});
