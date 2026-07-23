import { describe, it, expect } from 'vitest';
import { GovernanceEngine, UnknownAgentError } from '../src/governanceEngine.js';
import type { WorldStateRepository } from '../src/repository.js';
import type { AgentRecord, Proposal, ProposalStatus } from '../src/domain.js';

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

describe('GovernanceEngine', () => {
  it('registers an agent with an optional role and zero starting balance', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);

    engine.registerAgent('agent-a', 'blacksmith');

    expect(repository.getAgent('agent-a')).toEqual({
      id: 'agent-a',
      role: 'blacksmith',
      balance: 0,
    });
  });

  it('throws when a non-registered agent proposes a law', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);

    expect(() => engine.proposeLaw('ghost', 'x')).toThrow(UnknownAgentError);
  });

  it('creates a draft proposal', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');

    const proposal = engine.proposeLaw('agent-a', 'Protect the town hall');

    expect(proposal.status).toBe('draft');
    expect(proposal.description).toBe('Protect the town hall');
    expect(proposal.proposerId).toBe('agent-a');
    expect(engine.listProposals('draft')).toEqual([proposal]);
  });

  it('throws when a non-registered agent votes', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');
    const proposal = engine.proposeLaw('agent-a', 'x');

    expect(() => engine.vote('ghost', proposal.id, 'yes')).toThrow(UnknownAgentError);
  });

  it('throws when voting on an unknown proposal', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');

    expect(() => engine.vote('agent-a', 'no-such-id', 'yes')).toThrow('Unknown proposal');
  });

  it('activates a proposal once yes-votes exceed half of registered agents', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');
    engine.registerAgent('agent-b');
    engine.registerAgent('agent-c');
    const proposal = engine.proposeLaw('agent-a', 'Protect the town hall');

    engine.vote('agent-a', proposal.id, 'yes');
    let updated = engine.vote('agent-b', proposal.id, 'yes');

    expect(updated.status).toBe('active');
  });

  it('stays in draft while votes have not reached a majority', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');
    engine.registerAgent('agent-b');
    engine.registerAgent('agent-c');
    const proposal = engine.proposeLaw('agent-a', 'x');

    const updated = engine.vote('agent-a', proposal.id, 'yes');

    expect(updated.status).toBe('draft');
  });

  it('rejects a proposal once no-votes reach half of registered agents', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');
    engine.registerAgent('agent-b');
    engine.registerAgent('agent-c');
    const proposal = engine.proposeLaw('agent-a', 'x');

    const updated = engine.vote('agent-b', proposal.id, 'no');

    expect(updated.status).toBe('rejected');
  });

  it('ignores further votes once a proposal is no longer in draft', () => {
    const repository = new FakeRepository();
    const engine = new GovernanceEngine(repository);
    engine.registerAgent('agent-a');
    engine.registerAgent('agent-b');
    const proposal = engine.proposeLaw('agent-a', 'x');
    engine.vote('agent-a', proposal.id, 'yes');
    engine.vote('agent-b', proposal.id, 'yes');

    const afterActive = engine.vote('agent-a', proposal.id, 'no');

    expect(afterActive.status).toBe('active');
  });
});
