import { describe, it, expect, vi } from 'vitest';
import { OllamaBrain } from '../../src/brains/ollamaBrain.js';
import type { Perception } from '../../src/types.js';

const emptyPerception: Perception = {
  tick: 0,
  chatMessages: [],
  position: undefined,
  health: undefined,
  worldState: { openProposals: [] },
};

function fakeResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('OllamaBrain', () => {
  it('sends the agent id and persona in the system prompt, model in the body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({ message: { content: '[{"kind":"idle"}]' } })
    );
    const brain = new OllamaBrain({
      agentId: 'agent-a',
      persona: 'A pragmatic builder',
      model: 'llama3.2',
      baseUrl: 'http://ollama-test:11434',
      fetchFn,
    });

    await brain.decide(emptyPerception);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('http://ollama-test:11434/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('llama3.2');
    expect(body.messages[0].content).toContain('agent-a');
    expect(body.messages[0].content).toContain('A pragmatic builder');
  });

  it('returns validated actions parsed from the model response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      fakeResponse({ message: { content: '[{"kind":"chat","text":"hello"}]' } })
    );
    const brain = new OllamaBrain({ agentId: 'agent-a', persona: '', fetchFn });

    const actions = await brain.decide(emptyPerception);

    expect(actions).toEqual([{ kind: 'chat', text: 'hello' }]);
  });

  it('returns idle when the model response has no valid actions', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(fakeResponse({ message: { content: 'I will just wander around.' } }));
    const brain = new OllamaBrain({ agentId: 'agent-a', persona: '', fetchFn });

    const actions = await brain.decide(emptyPerception);

    expect(actions).toEqual([{ kind: 'idle' }]);
  });

  it('feeds the previous tick rejection reasons back into the next prompt', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ message: { content: '[{"kind":"bogus"}]' } }))
      .mockResolvedValueOnce(fakeResponse({ message: { content: '[{"kind":"idle"}]' } }));
    const brain = new OllamaBrain({ agentId: 'agent-a', persona: '', fetchFn });

    await brain.decide(emptyPerception);
    await brain.decide(emptyPerception);

    const secondCallBody = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(secondCallBody.messages[1].content).toContain('previous response had problems');
  });

  it('backs off after a failed request instead of retrying every tick', async () => {
    let time = 0;
    const fetchFn = vi.fn().mockRejectedValue(new Error('connection refused'));
    const brain = new OllamaBrain({
      agentId: 'agent-a',
      persona: '',
      fetchFn,
      now: () => time,
      baseBackoffMs: 1000,
    });

    const first = await brain.decide(emptyPerception);
    expect(first).toEqual([{ kind: 'idle' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Still within the backoff window: no new network call.
    time += 500;
    const second = await brain.decide(emptyPerception);
    expect(second).toEqual([{ kind: 'idle' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Past the backoff window: tries again.
    time += 600;
    await brain.decide(emptyPerception);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('resets the backoff after a subsequent success', async () => {
    let time = 0;
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(fakeResponse({ message: { content: '[{"kind":"idle"}]' } }));
    const brain = new OllamaBrain({
      agentId: 'agent-a',
      persona: '',
      fetchFn,
      now: () => time,
      baseBackoffMs: 1000,
    });

    await brain.decide(emptyPerception); // fails, schedules backoff until t=1000
    time += 1500;
    await brain.decide(emptyPerception); // succeeds, resets backoff
    expect(fetchFn).toHaveBeenCalledTimes(2);

    time += 1; // barely any time later — no backoff should be in effect
    await brain.decide(emptyPerception);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
