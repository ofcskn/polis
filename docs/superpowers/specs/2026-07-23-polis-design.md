# Polis: AI + Human Civilization Proxy for Minecraft

## Summary

Polis lets human players and small populations of LLM-driven agents share a
single Minecraft world behind a proxy, with governance, roles, and a currency
emerging from agent negotiation rather than being scripted by the server.
It draws on Project Sid's finding that populations of LLM agents in
Minecraft can autonomously specialize into roles and adopt shared rules
("Project Sid: Many-Agent Simulations toward AI Civilization", Altera.AL,
2024), scaled down to a 3-10 agent MVP, with agent-to-agent and
agent-to-governance communication carried over the A2A (Agent2Agent)
protocol instead of ad hoc APIs.

## Goals

- Human players and AI agents connect to the same Minecraft world through a
  single proxy, on both Java and Bedrock clients.
- Roles, laws, and a currency emerge from agent proposals and voting — no
  hardcoded outcomes.
- Agent-to-agent and agent-to-governance messaging uses the A2A protocol so
  agents remain autonomous, discoverable peers rather than tool-wrapped
  functions.
- The system runs at small scale (3-10 agents) on a single machine via
  Docker Compose, with a path to larger deployments later without a
  rewrite.

## Non-Goals

- Reproducing Project Sid's full scale (10-1000+ agents) or its complete
  PIANO multi-module architecture. A single decision loop per agent is in
  scope for the MVP; a multi-module brain is a future extension.
- Hardcoding governance/economy outcomes (that would defeat the purpose —
  see Non-Goal in spirit, not mechanism).
- Building a general-purpose Minecraft server management platform. Polis
  targets one world/proxy configuration.

## Architecture

Four independently deployable services, orchestrated via Docker Compose:

1. **Paper (Minecraft server)** — Java Edition-native world both humans and
   agents inhabit.
2. **Gate proxy** (minekube/gate) — routes all Minecraft connections
   (human and agent) to Paper. Bundles Geyser for Bedrock client support.
   Not involved in agent-to-agent or agent-to-governance traffic.
3. **World-State Agent** — an A2A-addressable service owning the
   civilization's shared state: registered roles, active laws, and a
   currency ledger. Implemented as its own agent (publishes an A2A Agent
   Card advertising skills `propose_law`, `vote`, `register_role`,
   `transfer_currency`, `check_ledger`/`list_proposals`) rather than a
   plain REST API, so agent-to-governance calls use the same protocol and
   pattern as agent-to-agent calls.
4. **Agent Runtime** — one container per agent, each holding:
   - a mineflayer connection for Minecraft perception/actions (the
     human-visible channel: chat, movement, mining, building),
   - an OpenAI Agents SDK-driven decision loop,
   - an A2A server (publishing this agent's own Agent Card) and A2A client
     for agent-to-agent and agent-to-World-State communication (the
     structured, human-invisible-by-default channel).

Two communication channels are deliberately kept separate: in-game chat is
what humans read and can address agents through; A2A carries structured
negotiation, proposals, and delegation between agents and the World-State
Agent. Because A2A traffic is not visible in-game, each agent's system
prompt establishes a norm of announcing meaningful outcomes (a new law
passing, a completed trade) in Minecraft chat, so human players can observe
the emergent civilization rather than being locked out of it.

## Components (OOAD / GRASP)

### Agent Runtime

| Class | Responsibility | GRASP pattern |
|---|---|---|
| `AgentBrain` (interface), `OpenAIAgentBrain` (impl) | `decide(perception) -> [Action]`. No knowledge of mineflayer or A2A wiring. | Polymorphism |
| `MinecraftActionAdapter` | Translates mineflayer events into `Perception`; translates `Action` into mineflayer calls. | Low Coupling |
| `A2AServer` / `A2AClient` | Publishes this agent's Agent Card; sends/receives A2A messages to peers and the World-State Agent. | Low Coupling |
| `AgentLoopController` | Per tick: merges perception from `MinecraftActionAdapter` and inbound A2A messages, invokes `AgentBrain`, routes resulting actions to the correct adapter. | Controller |
| `AgentIdentity` (value object) | Name, persona/goal text, role — source of truth for both the LLM system prompt and the A2A Agent Card. | Information Expert |

### World-State Agent

| Class | Responsibility | GRASP pattern |
|---|---|---|
| `WorldStateAgentServer` | A2A server exposing governance/economy skills. | Pure Fabrication |
| `GovernanceEngine` | Proposal/vote/quorum logic; law lifecycle (draft -> active -> repealed). | Information Expert |
| `CurrencyLedger` | Balance and transfer validation. | Information Expert |
| `WorldStateRepository` (interface) + SQLite implementation | Persistence, hidden behind an interface. | Protected Variations |

### Orchestration

| Piece | Responsibility | GRASP pattern |
|---|---|---|
| `AgentConfig` (per-agent YAML) + Docker Compose | Holds each agent's persona/init data; builds the corresponding `AgentRuntime` container. | Creator |
| Gate | Routes human and agent Minecraft connections to Paper. | Indirection |

Design invariant: `AgentBrain` never imports mineflayer or A2A libraries;
`MinecraftActionAdapter` and `A2AClient`/`A2AServer` never import the LLM
SDK. All cross-boundary communication goes through small `Perception`/
`Action` data shapes, so swapping the LLM provider or the persistence layer
is a localized change.

## Data Flow

Example: a human's suggestion becomes law.

1. Human types in Minecraft chat: "Should we protect the town hall from
   griefing?" Paper broadcasts the chat event; a nearby agent's
   `MinecraftActionAdapter` captures it as part of `Perception`.
2. `AgentLoopController` passes `Perception` to `OpenAIAgentBrain`, which
   decides to call its `propose_law` tool (an A2A message to the
   World-State Agent).
3. `A2AClient` sends the proposal; `GovernanceEngine` creates a `Proposal`
   (draft status), persists it via `WorldStateRepository`, and returns a
   task id.
4. Other agents discover the open proposal (polling `list_proposals` each
   tick) and cast votes via their own A2A calls.
5. Once quorum is reached — a simple majority (more yes than no votes) of
   agents currently connected to the world, with non-responding agents
   after a timeout counted as abstentions rather than blocking votes —
   `GovernanceEngine` transitions the proposal to an active `Law` and
   persists the change.
6. On its next tick, the proposing agent observes the new law and
   announces it in Minecraft chat, closing the loop back to the human.

## Error Handling

- LLM call failure or timeout: `AgentLoopController` catches it, the agent
  idles that tick, and retries with backoff on the next — the container
  never crashes on a single bad call.
- mineflayer disconnect: the adapter reconnects automatically; actions
  pause while perception resumes once the connection is restored. Gate
  handles routing continuity.
- Unreachable A2A peer: the client retries with backoff, then drops the
  message with a logged warning; `GovernanceEngine` treats a
  non-responding agent as an abstention (timeout-based) for quorum
  purposes rather than blocking indefinitely.
- Malformed or hallucinated tool calls: validated against a schema before
  dispatch. Invalid calls are no-op'd and logged, and the brain receives
  an "invalid action" observation on its next tick so it can self-correct.
- Concurrent World-State writes: optimistic concurrency via a version
  column; conflicting writes are rejected and retried rather than silently
  overwritten.

## Testing Strategy

- `GovernanceEngine` / `CurrencyLedger`: pure unit tests covering proposal
  lifecycle, quorum math, and overdraft rejection — no LLM or Minecraft
  dependency.
- `MinecraftActionAdapter`: integration tests against a real Paper server
  in Docker, driven by a scripted (non-LLM) bot client, asserting that
  actions change game state as expected.
- `AgentBrain`: unit tests against a mocked LLM client returning canned
  tool calls, validating the dispatch/validation logic deterministically
  with no API cost.
- A2A layer: contract tests between two in-process server/client pairs,
  verifying Agent Card and JSON-RPC message shapes.
- End-to-end smoke test: the full Compose stack brought up with two
  scripted "puppet" agents (canned decision sequences, no LLM) that join,
  chat, and drive a proposal through to an active law — validates the
  pipeline before spending API tokens on real LLM-driven runs.

## Deployment

- Local development and initial runs via Docker Compose on a single
  machine.
- Repository structured as an open-source project (MIT license, public),
  with the design written so moving Paper, Gate, the World-State Agent,
  and Agent Runtime containers to a cloud host later is a configuration
  change rather than a rewrite.

## Open Questions / Future Work

- Whether a multi-module PIANO-style brain (separate fast-reactive and
  slow-planning loops per agent) is worth adding once the single-loop MVP
  is validated.
- Whether the World-State Agent should broadcast proposal/vote events
  proactively (via A2A streaming) instead of relying on agents to poll
  `list_proposals` each tick.
- Scaling path beyond a single Paper server (multiple worlds routed
  through Gate) once the small-scale MVP demonstrates emergent behavior.
