import { randomUUID } from 'node:crypto';
import type { Proposal, ProposalStatus } from './domain.js';
import type { WorldStateRepository } from './repository.js';

export class UnknownAgentError extends Error {
  constructor(agentId: string) {
    super(`Unknown agent: ${agentId}`);
  }
}

export class GovernanceEngine {
  constructor(private readonly repository: WorldStateRepository) {}

  registerAgent(agentId: string, role?: string): void {
    const existing = this.repository.getAgent(agentId);
    this.repository.saveAgent({ id: agentId, role, balance: existing?.balance ?? 0 });
  }

  proposeLaw(agentId: string, description: string): Proposal {
    this.requireAgent(agentId);
    const proposal: Proposal = {
      id: randomUUID(),
      description,
      proposerId: agentId,
      status: 'draft',
      votes: {},
      createdAt: new Date().toISOString(),
    };
    this.repository.saveProposal(proposal);
    return proposal;
  }

  vote(agentId: string, proposalId: string, choice: 'yes' | 'no'): Proposal {
    this.requireAgent(agentId);
    const proposal = this.repository.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Unknown proposal: ${proposalId}`);
    }
    if (proposal.status !== 'draft') {
      return proposal;
    }

    const votes = { ...proposal.votes, [agentId]: choice };
    const totalAgents = this.repository.listAgents().length - 1; // Exclude proposer from quorum
    const yesVotes = Object.values(votes).filter((v) => v === 'yes').length;
    const noVotes = Object.values(votes).filter((v) => v === 'no').length;

    let status: ProposalStatus = 'draft';
    if (yesVotes > totalAgents / 2) {
      status = 'active';
    } else if (noVotes >= totalAgents / 2) {
      status = 'rejected';
    }

    const updated: Proposal = { ...proposal, votes, status };
    this.repository.saveProposal(updated);
    return updated;
  }

  listProposals(status?: ProposalStatus): Proposal[] {
    return this.repository.listProposals(status);
  }

  private requireAgent(agentId: string): void {
    if (!this.repository.getAgent(agentId)) {
      throw new UnknownAgentError(agentId);
    }
  }
}
