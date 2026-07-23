import { UnknownAgentError } from './governanceEngine.js';
import type { WorldStateRepository } from './repository.js';

export class InsufficientFundsError extends Error {
  constructor(agentId: string) {
    super(`Insufficient funds for agent: ${agentId}`);
  }
}

export class CurrencyLedger {
  constructor(private readonly repository: WorldStateRepository) {}

  balance(agentId: string): number {
    const agent = this.repository.getAgent(agentId);
    if (!agent) {
      throw new UnknownAgentError(agentId);
    }
    return agent.balance;
  }

  transfer(fromAgentId: string, toAgentId: string, amount: number): void {
    if (amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }
    const from = this.repository.getAgent(fromAgentId);
    const to = this.repository.getAgent(toAgentId);
    if (!from) throw new UnknownAgentError(fromAgentId);
    if (!to) throw new UnknownAgentError(toAgentId);
    if (from.balance < amount) {
      throw new InsufficientFundsError(fromAgentId);
    }

    this.repository.saveAgent({ ...from, balance: from.balance - amount });
    this.repository.saveAgent({ ...to, balance: to.balance + amount });
  }
}
