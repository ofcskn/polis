import { describe, it, expect } from 'vitest';
import { agentIdentityFromEnv } from '../src/agentIdentity.js';

describe('agentIdentityFromEnv', () => {
  it('builds an identity from environment variables', () => {
    const identity = agentIdentityFromEnv({
      AGENT_ID: 'agent-a',
      AGENT_MINECRAFT_USERNAME: 'agent-a-bot',
      AGENT_PERSONA: 'A pragmatic builder.',
      AGENT_ROLE: 'blacksmith',
    } as NodeJS.ProcessEnv);

    expect(identity).toEqual({
      id: 'agent-a',
      minecraftUsername: 'agent-a-bot',
      persona: 'A pragmatic builder.',
      role: 'blacksmith',
    });
  });

  it('defaults persona to an empty string and role to undefined', () => {
    const identity = agentIdentityFromEnv({
      AGENT_ID: 'agent-a',
      AGENT_MINECRAFT_USERNAME: 'agent-a-bot',
    } as NodeJS.ProcessEnv);

    expect(identity.persona).toBe('');
    expect(identity.role).toBeUndefined();
  });

  it('throws when AGENT_ID is missing', () => {
    expect(() =>
      agentIdentityFromEnv({ AGENT_MINECRAFT_USERNAME: 'agent-a-bot' } as NodeJS.ProcessEnv)
    ).toThrow('AGENT_ID and AGENT_MINECRAFT_USERNAME must be set');
  });

  it('throws when AGENT_MINECRAFT_USERNAME is missing', () => {
    expect(() => agentIdentityFromEnv({ AGENT_ID: 'agent-a' } as NodeJS.ProcessEnv)).toThrow(
      'AGENT_ID and AGENT_MINECRAFT_USERNAME must be set'
    );
  });
});
