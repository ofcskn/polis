import { describe, it, expect } from 'vitest';
import { parseActionsFromResponse, validateAction } from '../../src/brains/actionValidation.js';

describe('validateAction', () => {
  it('accepts a well-formed action of each kind', () => {
    const samples: unknown[] = [
      { kind: 'chat', text: 'hi' },
      { kind: 'moveTo', x: 1, y: 2, z: 3 },
      { kind: 'dig', x: 1, y: 2, z: 3 },
      { kind: 'registerAgent' },
      { kind: 'registerAgent', role: 'builder' },
      { kind: 'proposeLaw', description: 'Protect the town hall' },
      { kind: 'vote', proposalId: 'abc', choice: 'yes' },
      { kind: 'transferCurrency', toAgentId: 'agent-b', amount: 10 },
      { kind: 'idle' },
    ];
    for (const sample of samples) {
      expect(validateAction(sample)).toBeUndefined();
    }
  });

  it('rejects a missing or unknown kind', () => {
    expect(validateAction({})).toMatch(/unknown or missing "kind"/);
    expect(validateAction({ kind: 'flyToTheMoon' })).toMatch(/unknown or missing "kind"/);
  });

  it('rejects non-object candidates', () => {
    expect(validateAction('chat')).toMatch(/must be a JSON object/);
    expect(validateAction(null)).toMatch(/must be a JSON object/);
    expect(validateAction([{ kind: 'idle' }])).toMatch(/must be a JSON object/);
  });

  it('rejects an action missing required fields', () => {
    expect(validateAction({ kind: 'chat' })).toMatch(/requires a string "text"/);
    expect(validateAction({ kind: 'moveTo', x: 1, y: 2 })).toMatch(/requires numeric/);
    expect(validateAction({ kind: 'vote', proposalId: 'abc', choice: 'maybe' })).toMatch(/choice/);
    expect(validateAction({ kind: 'transferCurrency', toAgentId: 'agent-b' })).toMatch(
      /numeric "amount"/
    );
  });
});

describe('parseActionsFromResponse', () => {
  it('parses a clean JSON array', () => {
    const { actions, errors } = parseActionsFromResponse('[{"kind":"idle"}]');
    expect(actions).toEqual([{ kind: 'idle' }]);
    expect(errors).toEqual([]);
  });

  it('extracts a JSON array wrapped in prose or a markdown fence', () => {
    const raw = 'Sure, here is my plan:\n```json\n[{"kind":"chat","text":"hi"}]\n```\nDone.';
    const { actions, errors } = parseActionsFromResponse(raw);
    expect(actions).toEqual([{ kind: 'chat', text: 'hi' }]);
    expect(errors).toEqual([]);
  });

  it('reports an error and returns no actions when there is no array at all', () => {
    const { actions, errors } = parseActionsFromResponse('I will go chat with the player.');
    expect(actions).toEqual([]);
    expect(errors).toEqual(['response did not contain a JSON array']);
  });

  it('reports an error for malformed JSON', () => {
    const { actions, errors } = parseActionsFromResponse('[{"kind":"chat", "text":]');
    expect(actions).toEqual([]);
    expect(errors[0]).toMatch(/invalid JSON/);
  });

  it('repairs a single action object wrapped in an extra unescaped string layer', () => {
    // Real qwen2.5:7b output observed in practice: each object wrapped in stray quotes with the
    // inner quotes left unescaped, which breaks JSON.parse entirely (not just producing a string
    // element), since the parser reads the first `"` after `[` as closing an empty string.
    const raw = '["{"kind":"moveTo","x":-43,"y":64,"z":-91}"]';
    const { actions, errors } = parseActionsFromResponse(raw);
    expect(actions).toEqual([{ kind: 'moveTo', x: -43, y: 64, z: -91 }]);
    expect(errors).toEqual([]);
  });

  it('repairs multiple stringified action objects in one response', () => {
    const raw = '["{"kind":"chat","text":"Hello there"},{"kind":"idle"}"]';
    const { actions, errors } = parseActionsFromResponse(raw);
    expect(actions).toEqual([{ kind: 'chat', text: 'Hello there' }, { kind: 'idle' }]);
    expect(errors).toEqual([]);
  });

  it('drops invalid entries but keeps valid ones, reporting a reason for each drop', () => {
    const raw = JSON.stringify([{ kind: 'idle' }, { kind: 'chat' }, { kind: 'nonsense' }]);
    const { actions, errors } = parseActionsFromResponse(raw);
    expect(actions).toEqual([{ kind: 'idle' }]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/rejected/);
  });
});
