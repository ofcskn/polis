import type { WorldStateCommand, WorldStateCommandResult } from '@polis/protocol';

export interface Perception {
  tick: number;
  chatMessages: { username: string; message: string }[];
  position: { x: number; y: number; z: number } | undefined;
  health: number | undefined;
  worldState: {
    openProposals: unknown[];
  };
}

export type Action =
  | { kind: 'chat'; text: string }
  | { kind: 'moveTo'; x: number; y: number; z: number }
  | { kind: 'dig'; x: number; y: number; z: number }
  | { kind: 'registerAgent'; role?: string }
  | { kind: 'proposeLaw'; description: string }
  | { kind: 'vote'; proposalId: string; choice: 'yes' | 'no' }
  | { kind: 'transferCurrency'; toAgentId: string; amount: number }
  | { kind: 'idle' };

export interface AgentBrain {
  decide(perception: Perception): Action[] | Promise<Action[]>;
}

export interface MinecraftPerceptionSnapshot {
  chatMessages: { username: string; message: string }[];
  position: { x: number; y: number; z: number } | undefined;
  health: number | undefined;
}

export interface MinecraftPort {
  perceive(): MinecraftPerceptionSnapshot;
  dispatch(action: Action): Promise<void>;
}

export interface WorldStatePort {
  send(command: WorldStateCommand): Promise<WorldStateCommandResult>;
}
