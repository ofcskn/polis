import { describe, it, expect } from 'vitest';
import { CurrencyLedger, InsufficientFundsError } from '../src/currencyLedger.js';
import { UnknownAgentError } from '../src/governanceEngine.js';
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

describe('CurrencyLedger', () => {
  it('throws when checking the balance of an unknown agent', () => {
    const repository = new FakeRepository();
    const ledger = new CurrencyLedger(repository);

    expect(() => ledger.balance('ghost')).toThrow(UnknownAgentError);
  });

  it('returns a registered agent balance', () => {
    const repository = new FakeRepository();
    repository.saveAgent({ id: 'agent-a', balance: 10 });
    const ledger = new CurrencyLedger(repository);

    expect(ledger.balance('agent-a')).toBe(10);
  });

  it('transfers funds between two registered agents', () => {
    const repository = new FakeRepository();
    repository.saveAgent({ id: 'agent-a', balance: 10 });
    repository.saveAgent({ id: 'agent-b', balance: 0 });
    const ledger = new CurrencyLedger(repository);

    ledger.transfer('agent-a', 'agent-b', 4);

    expect(ledger.balance('agent-a')).toBe(6);
    expect(ledger.balance('agent-b')).toBe(4);
  });

  it('throws InsufficientFundsError when the sender cannot cover the amount', () => {
    const repository = new FakeRepository();
    repository.saveAgent({ id: 'agent-a', balance: 2 });
    repository.saveAgent({ id: 'agent-b', balance: 0 });
    const ledger = new CurrencyLedger(repository);

    expect(() => ledger.transfer('agent-a', 'agent-b', 4)).toThrow(InsufficientFundsError);
    expect(ledger.balance('agent-a')).toBe(2);
    expect(ledger.balance('agent-b')).toBe(0);
  });

  it('throws when the sender is unknown', () => {
    const repository = new FakeRepository();
    repository.saveAgent({ id: 'agent-b', balance: 0 });
    const ledger = new CurrencyLedger(repository);

    expect(() => ledger.transfer('ghost', 'agent-b', 1)).toThrow(UnknownAgentError);
  });

  it('throws on a non-positive transfer amount', () => {
    const repository = new FakeRepository();
    repository.saveAgent({ id: 'agent-a', balance: 10 });
    repository.saveAgent({ id: 'agent-b', balance: 0 });
    const ledger = new CurrencyLedger(repository);

    expect(() => ledger.transfer('agent-a', 'agent-b', 0)).toThrow(
      'Transfer amount must be positive'
    );
  });
});
