import { describe, it, expect } from 'vitest';
import { AgentLoopController } from '../src/agentLoopController.js';
import type {
  Action,
  AgentBrain,
  MinecraftPerceptionSnapshot,
  MinecraftPort,
  Perception,
  WorldStatePort,
} from '../src/types.js';
import type { WorldStateCommand, WorldStateCommandResult } from '@polis/protocol';

class FakeMinecraftPort implements MinecraftPort {
  public dispatched: Action[] = [];
  private snapshot: MinecraftPerceptionSnapshot = {
    chatMessages: [],
    position: undefined,
    health: undefined,
  };

  setSnapshot(snapshot: MinecraftPerceptionSnapshot): void {
    this.snapshot = snapshot;
  }

  perceive(): MinecraftPerceptionSnapshot {
    return this.snapshot;
  }

  async dispatch(action: Action): Promise<void> {
    this.dispatched.push(action);
  }
}

class FakeWorldStatePort implements WorldStatePort {
  public sent: WorldStateCommand[] = [];

  async send(command: WorldStateCommand): Promise<WorldStateCommandResult> {
    this.sent.push(command);
    if (command.skill === 'list_proposals') {
      return { ok: true, data: [] };
    }
    return { ok: true, data: {} };
  }
}

class ScriptedBrain implements AgentBrain {
  constructor(private readonly actions: Action[]) {}
  decide(_perception: Perception): Action[] {
    return this.actions;
  }
}

describe('AgentLoopController', () => {
  it('routes Minecraft actions to the Minecraft port', async () => {
    const minecraft = new FakeMinecraftPort();
    const worldState = new FakeWorldStatePort();
    const brain = new ScriptedBrain([{ kind: 'chat', text: 'hello' }]);
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();

    expect(minecraft.dispatched).toEqual([{ kind: 'chat', text: 'hello' }]);
  });

  it('routes governance actions to the World-State port with the agent id attached', async () => {
    const minecraft = new FakeMinecraftPort();
    const worldState = new FakeWorldStatePort();
    const brain = new ScriptedBrain([
      { kind: 'proposeLaw', description: 'Protect the town hall' },
    ]);
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();

    expect(worldState.sent).toContainEqual({
      skill: 'propose_law',
      agentId: 'agent-a',
      description: 'Protect the town hall',
    });
  });

  it('polls open proposals from World-State and includes them in perception', async () => {
    const minecraft = new FakeMinecraftPort();
    const worldState = new FakeWorldStatePort();
    let seenPerception: Perception | undefined;
    const brain: AgentBrain = {
      decide(perception) {
        seenPerception = perception;
        return [];
      },
    };
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();

    expect(seenPerception?.worldState.openProposals).toEqual([]);
    expect(worldState.sent).toContainEqual({ skill: 'list_proposals' });
  });

  it('does not call the World-State port for chat, move, dig, or idle actions', async () => {
    const minecraft = new FakeMinecraftPort();
    const worldState = new FakeWorldStatePort();
    const brain = new ScriptedBrain([{ kind: 'idle' }]);
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();

    expect(worldState.sent).toEqual([{ skill: 'list_proposals' }]);
  });
});
