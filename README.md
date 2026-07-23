# Polis

Polis lets human players and small populations of LLM-driven agents share a
single Minecraft world behind a proxy, with governance, roles, and a currency
emerging from agent negotiation rather than being scripted by the server.

## Architecture

- `packages/protocol` — shared wire-format types for World-State commands.
- `packages/world-state` — the civilization's shared state (agent registry,
  law proposals, currency ledger), exposed as an A2A-addressable agent.
- `packages/agent-runtime` — connects an agent to Minecraft (via mineflayer)
  and to the World-State Agent (via A2A), driven by a pluggable `AgentBrain`.
- `gate/`, `docker-compose.yml` — Gate proxy and Paper server wiring both
  human and agent Minecraft connections into one world.

## Development

```bash
npm install
npm test
```

## Running the stack

```bash
docker compose up --build
```

Connect a Minecraft client (Java or Bedrock) to the host running Gate on
port 25565 (Java) or 19132 (Bedrock).
