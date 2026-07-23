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
    nearbyBlocks: [],
    nearbyEntities: [],
  };
  private dispatchResult: string = 'ok';

  setSnapshot(snapshot: MinecraftPerceptionSnapshot): void {
    this.snapshot = snapshot;
  }

  setDispatchResult(result: string): void {
    this.dispatchResult = result;
  }

  perceive(): MinecraftPerceptionSnapshot {
    return this.snapshot;
  }

  async dispatch(action: Action): Promise<string> {
    this.dispatched.push(action);
    return this.dispatchResult;
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

  it('feeds each dispatched action outcome into the next tick perception, empty on the first tick', async () => {
    const minecraft = new FakeMinecraftPort();
    minecraft.setDispatchResult('Moved to (1, 64, 2).');
    const worldState = new FakeWorldStatePort();
    const seenPerceptions: Perception[] = [];
    let tick = 0;
    const brain: AgentBrain = {
      decide(perception) {
        seenPerceptions.push(perception);
        tick += 1;
        return tick === 1 ? [{ kind: 'moveTo', x: 1, y: 64, z: 2 }] : [];
      },
    };
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();
    await controller.runOnce();

    expect(seenPerceptions[0].lastActionResults).toEqual([]);
    expect(seenPerceptions[1].lastActionResults).toEqual(['Moved to (1, 64, 2).']);
  });

  it('reports a governance action outcome including a failure reason', async () => {
    const minecraft = new FakeMinecraftPort();
    class FailingWorldStatePort implements WorldStatePort {
      async send(command: WorldStateCommand): Promise<WorldStateCommandResult> {
        if (command.skill === 'list_proposals') return { ok: true, data: [] };
        return { ok: false, error: 'Unknown agent: agent-a' };
      }
    }
    const worldState = new FailingWorldStatePort();
    const seenPerceptions: Perception[] = [];
    let tick = 0;
    const brain: AgentBrain = {
      decide(perception) {
        seenPerceptions.push(perception);
        tick += 1;
        return tick === 1 ? [{ kind: 'proposeLaw', description: 'Protect the town hall' }] : [];
      },
    };
    const controller = new AgentLoopController('agent-a', minecraft, worldState, brain);

    await controller.runOnce();
    await controller.runOnce();

    expect(seenPerceptions[1].lastActionResults).toEqual([
      'Propose law failed: Unknown agent: agent-a',
    ]);
  });
});
