import { describe, it, expect } from 'vitest';
import { parseWorldStateCommand, serializeWorldStateCommand } from '../src/commands.js';

describe('parseWorldStateCommand', () => {
  it('parses a valid register_agent command', () => {
    const json = JSON.stringify({ skill: 'register_agent', agentId: 'agent-a' });
    expect(parseWorldStateCommand(json)).toEqual({ skill: 'register_agent', agentId: 'agent-a' });
  });

  it('parses a valid propose_law command', () => {
    const json = JSON.stringify({
      skill: 'propose_law',
      agentId: 'agent-a',
      description: 'Protect the town hall',
    });
    expect(parseWorldStateCommand(json)).toEqual({
      skill: 'propose_law',
      agentId: 'agent-a',
      description: 'Protect the town hall',
    });
  });

  it('parses a valid vote command', () => {
    const json = JSON.stringify({
      skill: 'vote',
      agentId: 'agent-a',
      proposalId: 'p1',
      choice: 'yes',
    });
    expect(parseWorldStateCommand(json)).toEqual({
      skill: 'vote',
      agentId: 'agent-a',
      proposalId: 'p1',
      choice: 'yes',
    });
  });

  it('parses a valid list_proposals command with no status', () => {
    const json = JSON.stringify({ skill: 'list_proposals' });
    expect(parseWorldStateCommand(json)).toEqual({ skill: 'list_proposals', status: undefined });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseWorldStateCommand('not json')).toThrow('Invalid WorldStateCommand JSON');
  });

  it('throws on an unknown skill', () => {
    const json = JSON.stringify({ skill: 'launch_missiles' });
    expect(() => parseWorldStateCommand(json)).toThrow('Unknown skill: launch_missiles');
  });

  it('throws when a required field is missing', () => {
    const json = JSON.stringify({ skill: 'vote', agentId: 'agent-a' });
    expect(() => parseWorldStateCommand(json)).toThrow(
      'vote command requires proposalId and choice'
    );
  });
});

describe('serializeWorldStateCommand', () => {
  it('round-trips through parseWorldStateCommand', () => {
    const original = {
      skill: 'transfer_currency',
      agentId: 'agent-a',
      toAgentId: 'agent-b',
      amount: 5,
    } as const;
    expect(parseWorldStateCommand(serializeWorldStateCommand(original))).toEqual(original);
  });
});
