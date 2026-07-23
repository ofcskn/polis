export type ProposalStatus = 'draft' | 'active' | 'rejected';

export interface Proposal {
  id: string;
  description: string;
  proposerId: string;
  status: ProposalStatus;
  votes: Record<string, 'yes' | 'no'>;
  createdAt: string;
}

export interface AgentRecord {
  id: string;
  role?: string;
  balance: number;
}
