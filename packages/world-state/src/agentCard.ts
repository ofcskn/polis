import { A2A_PROTOCOL_VERSION, type AgentCard } from '@a2a-js/sdk';

export function buildWorldStateAgentCard(baseUrl: string): AgentCard {
  return {
    name: 'Polis World-State Agent',
    description:
      'Owns the shared civilization state for a Polis world: the agent registry, law proposals and votes, and the currency ledger.',
    supportedInterfaces: [
      {
        url: baseUrl,
        protocolBinding: 'JSONRPC',
        tenant: '',
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: 'Polis',
      url: baseUrl,
    },
    version: '0.1.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'register_agent',
        name: 'Register Agent',
        description: 'Registers an agent in the world, optionally with a role.',
        tags: ['governance'],
        examples: ['{"skill":"register_agent","agentId":"agent-a"}'],
        inputModes: ['text'],
        outputModes: ['text'],
        securityRequirements: [],
      },
      {
        id: 'propose_law',
        name: 'Propose Law',
        description: 'Proposes a new law for the world to vote on.',
        tags: ['governance'],
        examples: ['{"skill":"propose_law","agentId":"agent-a","description":"..."}'],
        inputModes: ['text'],
        outputModes: ['text'],
        securityRequirements: [],
      },
      {
        id: 'vote',
        name: 'Vote',
        description: 'Casts a vote on an open law proposal.',
        tags: ['governance'],
        examples: ['{"skill":"vote","agentId":"agent-a","proposalId":"...","choice":"yes"}'],
        inputModes: ['text'],
        outputModes: ['text'],
        securityRequirements: [],
      },
      {
        id: 'transfer_currency',
        name: 'Transfer Currency',
        description: 'Transfers currency between two registered agents.',
        tags: ['economy'],
        examples: [
          '{"skill":"transfer_currency","agentId":"agent-a","toAgentId":"agent-b","amount":5}',
        ],
        inputModes: ['text'],
        outputModes: ['text'],
        securityRequirements: [],
      },
      {
        id: 'list_proposals',
        name: 'List Proposals',
        description: 'Lists law proposals, optionally filtered by status.',
        tags: ['governance'],
        examples: ['{"skill":"list_proposals","status":"draft"}'],
        inputModes: ['text'],
        outputModes: ['text'],
        securityRequirements: [],
      },
    ],
    documentationUrl: '',
    signatures: [],
  };
}
