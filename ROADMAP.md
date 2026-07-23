# Roadmap

This repository is the foundation described in [README.md](README.md#current-scope):
a working World-State Agent, an Agent Runtime that can join real Minecraft
through Gate, and a scripted `PuppetBrain` proving the whole pipeline end to
end. Everything below is deliberately **not** in this repository yet.

Phases are ordered by dependency, not by commitment — later phases assume
earlier ones exist, but none of this is scheduled.

## Phase 1 — A Real Agent Brain

The `AgentBrain` interface (`decide(perception) -> Action[] | Promise<Action[]>`,
widened to allow async implementations) exists specifically so this phase
doesn't touch anything below it.

- [x] An LLM-backed `AgentBrain` implementation:
      [`OllamaBrain`](packages/agent-runtime/src/brains/ollamaBrain.ts),
      calling a local Ollama server rather than a cloud SDK, so the
      foundation runs with no API key. A Claude Agent SDK / OpenAI Agents
      SDK-backed brain is still open if a cloud-hosted option is wanted
      later — same interface, new class.
- [x] Per-agent persona/goal text (`AgentIdentity.persona`) actually shapes
      behavior — `OllamaBrain` injects it into the system prompt;
      `docker-compose.yml`'s `agent-a` / `agent-b` already carry distinct
      personas.
- [x] Validation of LLM-proposed actions against the `Action` schema before
      dispatch
      ([`actionValidation.ts`](packages/agent-runtime/src/brains/actionValidation.ts)),
      with rejected-action reasons fed back into the *next* tick's prompt
      so the model can self-correct instead of the tick silently no-op'ing.
- [x] Cost/latency controls: exponential backoff on repeated Ollama request
      failures (`OllamaBrain`'s `baseBackoffMs`/`maxBackoffMs`).
- [ ] Tick interval tuned to model latency rather than the fixed default —
      `TICK_INTERVAL_MS` is still a static env var; a model that's
      routinely slower or faster than 5s isn't accounted for automatically.

## Phase 2 — Peer-to-Peer Agent Negotiation

Today agents only talk *to* the World-State Agent. The original design
called for each agent to also run its own A2A server so agents can address
each other directly (trade offers, delegation, "can you vote yes on this").

- [ ] Each Agent Runtime container runs an A2A server publishing its own
      Agent Card (identity, role, skills) alongside its existing A2A
      client.
- [ ] `AgentLoopController` merges inbound peer messages into `Perception`
      alongside Minecraft chat and World-State proposals.
- [ ] A discovery mechanism (today, direct URLs; longer term, e.g. an Agent
      Card registry the World-State Agent maintains) so agents can find
      each other without hardcoded addresses.

## Phase 3 — Governance and Economy Depth

- [ ] World-State broadcasts proposal/vote events proactively over A2A
      streaming instead of agents polling `list_proposals` every tick.
- [ ] Currency use beyond `transfer_currency`: pricing, markets, or a
      simple exchange, if agent behavior shows a need for one.
- [ ] Role enforcement: today `role` is stored but not consulted by
      anything — a natural extension is skills or governance weight tied
      to role.
- [ ] A PIANO-style multi-module brain (a fast reactive loop for chat
      responsiveness, a slower loop for planning, both sharing state) if a
      single-loop `AgentBrain` proves too slow to feel responsive in-game —
      see the design spec's Non-Goals for why this was deferred from the
      foundation.

## Phase 4 — Production Hardening

The foundation makes two deliberate MVP-scope security trade-offs, both
fine for a local/private deployment and both worth revisiting before any
public-facing use:

- [ ] Minecraft runs in offline mode (`ONLINE_MODE: FALSE`,
      `onlineMode: false` in Gate) so bots without Microsoft accounts can
      connect. A public deployment needs either a mixed-auth setup (humans
      authenticated, agents allow-listed) or a different bot-auth story.
- [ ] The World-State A2A server has no authentication
      (`UserBuilder.noAuthentication`). Before any multi-tenant or
      internet-facing deployment, this needs real auth — the SDK already
      supports security schemes on the Agent Card.
- [ ] `WorldStateClient.extractResult` collapses any non-`Task`-shaped A2A
      response into a generic error, discarding the real failure reason —
      worth hardening once peer-to-peer A2A (Phase 2) means more failure
      modes can reach it.
- [ ] A command that fails validation still reports `TASK_STATE_COMPLETED`
      at the A2A task level (the failure is only visible in the artifact
      payload) — intentional today, but worth reconsidering if a client
      ever keys off task state instead of parsing the artifact.
- [ ] CI: run `npm test` (and, on a runner with Docker, `npm run
      test:integration`) on every push/PR.
- [ ] Cloud deployment path for Paper, Gate, World-State, and Agent Runtime
      containers — the design was written so this is a configuration
      change, not a rewrite, but that claim is untested against a real
      cloud target.

## Phase 5 — Scale and Reach

- [ ] Verify Bedrock cross-play end to end (Gate's `bedrock: true` /
      Geyser wiring is in place but only Java clients have been tested
      live).
- [ ] Beyond 3-10 agents: revisit tick cadence, SQLite write contention,
      and A2A request volume before scaling toward Project Sid's 10-1000+
      agent range.
- [ ] Multiple worlds routed through one Gate instance (Gate already
      supports multi-backend routing; the World-State Agent's data model
      would need a notion of "which world" a proposal belongs to).

## Known Test-Suite Follow-Ups

Minor, non-blocking items flagged in the foundation's final review:

- [ ] `AgentLoopController`'s `openProposals` field on `Perception` holds
      *all* proposals (not just open ones) since `list_proposals` is
      called with no status filter — every brain today re-filters by
      status, but the field name is misleading for whoever writes the
      next `AgentBrain`.
- [ ] `packages/e2e`'s test relies on fixed 5-second sleeps to dodge
      Paper's connection throttle — pragmatic for a manually-run
      integration test, but worth replacing with a real readiness check if
      it ever runs in CI.
