import type { Action, AgentBrain, Perception } from '../types.js';

export type PuppetScript = (perception: Perception, tick: number) => Action[];

export class PuppetBrain implements AgentBrain {
  private tick = 0;

  constructor(private readonly script: PuppetScript) {}

  decide(perception: Perception): Action[] {
    const actions = this.script(perception, this.tick);
    this.tick += 1;
    return actions;
  }
}
