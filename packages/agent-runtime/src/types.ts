import type { WorldStateCommand, WorldStateCommandResult } from '@polis/protocol';

export interface NearbyBlock {
  type: string;
  x: number;
  y: number;
  z: number;
}

export interface NearbyEntity {
  name: string;
  x: number;
  y: number;
  z: number;
  distance: number;
}

export interface Perception {
  tick: number;
  chatMessages: { username: string; message: string }[];
  position: { x: number; y: number; z: number } | undefined;
  health: number | undefined;
  nearbyBlocks: NearbyBlock[];
  nearbyEntities: NearbyEntity[];
  /** Outcome of each action dispatched last tick (e.g. "Moved to (12, 64, -30)."), so a brain
   *  can tell whether what it tried actually happened instead of guessing blind next tick. */
  lastActionResults: string[];
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
  nearbyBlocks: NearbyBlock[];
  nearbyEntities: NearbyEntity[];
}

export interface MinecraftPort {
  perceive(): MinecraftPerceptionSnapshot;
  /** Returns a short human-readable outcome (e.g. "No path found to (12, 64, -30)."), fed back
   *  into the next tick's Perception.lastActionResults so a brain can course-correct. */
  dispatch(action: Action): Promise<string>;
}

export interface WorldStatePort {
  send(command: WorldStateCommand): Promise<WorldStateCommandResult>;
}
