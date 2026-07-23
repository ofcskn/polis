import type { AgentRecord, Proposal, ProposalStatus } from './domain.js';

export interface WorldStateRepository {
  saveProposal(proposal: Proposal): void;
  getProposal(id: string): Proposal | undefined;
  listProposals(status?: ProposalStatus): Proposal[];
  saveAgent(agent: AgentRecord): void;
  getAgent(id: string): AgentRecord | undefined;
  listAgents(): AgentRecord[];
}
