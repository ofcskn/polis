export interface AgentIdentity {
  id: string;
  minecraftUsername: string;
  persona: string;
  role?: string;
}

export function agentIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): AgentIdentity {
  const id = env.AGENT_ID;
  const minecraftUsername = env.AGENT_MINECRAFT_USERNAME;

  if (!id || !minecraftUsername) {
    throw new Error('AGENT_ID and AGENT_MINECRAFT_USERNAME must be set');
  }

  return {
    id,
    minecraftUsername,
    persona: env.AGENT_PERSONA ?? '',
    role: env.AGENT_ROLE,
  };
}
