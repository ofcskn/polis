import { describe, it, expect } from 'vitest';
import { PuppetBrain } from '../../src/brains/puppetBrain.js';
import type { Perception } from '../../src/types.js';

const emptyPerception: Perception = {
  tick: 0,
  chatMessages: [],
  position: undefined,
  health: undefined,
  worldState: { openProposals: [] },
};

describe('PuppetBrain', () => {
  it('returns the actions produced by its script and advances an internal tick counter', () => {
    const seenTicks: number[] = [];
    const brain = new PuppetBrain((_perception, tick) => {
      seenTicks.push(tick);
      return [{ kind: 'idle' }];
    });

    expect(brain.decide(emptyPerception)).toEqual([{ kind: 'idle' }]);
    expect(brain.decide(emptyPerception)).toEqual([{ kind: 'idle' }]);
    expect(seenTicks).toEqual([0, 1]);
  });
});
