import type { Action, AgentBrain, MinecraftPort, Perception, WorldStatePort } from './types.js';

export class AgentLoopController {
  private tick = 0;
  private openProposals: unknown[] = [];

  constructor(
    private readonly agentId: string,
    private readonly adapter: MinecraftPort,
    private readonly worldState: WorldStatePort,
    private readonly brain: AgentBrain
  ) {}

  async runOnce(): Promise<void> {
    const snapshot = this.adapter.perceive();
    const listResult = await this.worldState.send({ skill: 'list_proposals' });
    if (listResult.ok) {
      this.openProposals = listResult.data as unknown[];
    }

    const perception: Perception = {
      tick: this.tick,
      chatMessages: snapshot.chatMessages,
      position: snapshot.position,
      health: snapshot.health,
      worldState: { openProposals: this.openProposals },
    };

    const actions = await this.brain.decide(perception);
    for (const action of actions) {
      await this.dispatch(action);
    }

    this.tick += 1;
  }

  private async dispatch(action: Action): Promise<void> {
    switch (action.kind) {
      case 'chat':
      case 'moveTo':
      case 'dig':
        await this.adapter.dispatch(action);
        return;
      case 'registerAgent':
        await this.worldState.send({
          skill: 'register_agent',
          agentId: this.agentId,
          role: action.role,
        });
        return;
      case 'proposeLaw':
        await this.worldState.send({
          skill: 'propose_law',
          agentId: this.agentId,
          description: action.description,
        });
        return;
      case 'vote':
        await this.worldState.send({
          skill: 'vote',
          agentId: this.agentId,
          proposalId: action.proposalId,
          choice: action.choice,
        });
        return;
      case 'transferCurrency':
        await this.worldState.send({
          skill: 'transfer_currency',
          agentId: this.agentId,
          toAgentId: action.toAgentId,
          amount: action.amount,
        });
        return;
      case 'idle':
        return;
    }
  }
}
