export type WorldStateCommand =
  | { skill: 'register_agent'; agentId: string; role?: string }
  | { skill: 'propose_law'; agentId: string; description: string }
  | { skill: 'vote'; agentId: string; proposalId: string; choice: 'yes' | 'no' }
  | { skill: 'transfer_currency'; agentId: string; toAgentId: string; amount: number }
  | { skill: 'list_proposals'; status?: 'draft' | 'active' | 'rejected' };

export type WorldStateCommandResult = { ok: true; data: unknown } | { ok: false; error: string };

export function serializeWorldStateCommand(command: WorldStateCommand): string {
  return JSON.stringify(command);
}

export function parseWorldStateCommand(json: string): WorldStateCommand {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Invalid WorldStateCommand JSON');
  }

  if (typeof raw !== 'object' || raw === null || !('skill' in raw)) {
    throw new Error('Invalid WorldStateCommand JSON');
  }

  const r = raw as Record<string, unknown>;

  switch (r.skill) {
    case 'register_agent':
      if (typeof r.agentId !== 'string') {
        throw new Error('register_agent command requires agentId');
      }
      return {
        skill: 'register_agent',
        agentId: r.agentId,
        role: typeof r.role === 'string' ? r.role : undefined,
      };
    case 'propose_law':
      if (typeof r.agentId !== 'string' || typeof r.description !== 'string') {
        throw new Error('propose_law command requires agentId and description');
      }
      return { skill: 'propose_law', agentId: r.agentId, description: r.description };
    case 'vote':
      if (
        typeof r.agentId !== 'string' ||
        typeof r.proposalId !== 'string' ||
        (r.choice !== 'yes' && r.choice !== 'no')
      ) {
        throw new Error('vote command requires proposalId and choice');
      }
      return { skill: 'vote', agentId: r.agentId, proposalId: r.proposalId, choice: r.choice };
    case 'transfer_currency':
      if (
        typeof r.agentId !== 'string' ||
        typeof r.toAgentId !== 'string' ||
        typeof r.amount !== 'number'
      ) {
        throw new Error('transfer_currency command requires agentId, toAgentId and amount');
      }
      return {
        skill: 'transfer_currency',
        agentId: r.agentId,
        toAgentId: r.toAgentId,
        amount: r.amount,
      };
    case 'list_proposals':
      return {
        skill: 'list_proposals',
        status:
          r.status === 'draft' || r.status === 'active' || r.status === 'rejected'
            ? r.status
            : undefined,
      };
    default:
      throw new Error(`Unknown skill: ${String(r.skill)}`);
  }
}
