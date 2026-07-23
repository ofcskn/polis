import { randomUUID } from 'node:crypto';
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server';
import { Role, TaskState, type Artifact, type Message, type Task } from '@a2a-js/sdk';
import { parseWorldStateCommand, type WorldStateCommandResult } from '@polis/protocol';
import type { GovernanceEngine } from './governanceEngine.js';
import type { CurrencyLedger } from './currencyLedger.js';

export class WorldStateAgentExecutor implements AgentExecutor {
  constructor(
    private readonly governance: GovernanceEngine,
    private readonly ledger: CurrencyLedger
  ) {}

  async cancelTask(): Promise<void> {
    // World-State commands complete synchronously; there is nothing to cancel.
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = requestContext.userMessage;
    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;

    const taskSnapshot: Task = requestContext.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined,
      },
      artifacts: [],
      history: [userMessage],
      metadata: userMessage.metadata,
    };
    eventBus.publish(AgentEvent.task(taskSnapshot));

    const result = this.dispatch(userMessage);

    const artifact: Artifact = {
      artifactId: randomUUID(),
      name: 'WorldStateCommandResult',
      description: 'Result of a World-State command',
      parts: [
        {
          content: { $case: 'text', value: JSON.stringify(result) },
          metadata: undefined,
          filename: '',
          mediaType: 'application/json',
        },
      ],
      metadata: undefined,
      extensions: [],
    };
    eventBus.publish(
      AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact,
        lastChunk: true,
        append: false,
        metadata: undefined,
      })
    );

    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_COMPLETED,
          timestamp: new Date().toISOString(),
          message: undefined,
        },
        metadata: undefined,
      })
    );
  }

  private dispatch(userMessage: Message): WorldStateCommandResult {
    const textPart = userMessage.parts.find((part) => part.content?.$case === 'text');
    if (!textPart || textPart.content?.$case !== 'text') {
      return { ok: false, error: 'World-State commands must be a text part' };
    }

    try {
      const command = parseWorldStateCommand(textPart.content.value);
      switch (command.skill) {
        case 'register_agent':
          this.governance.registerAgent(command.agentId, command.role);
          return { ok: true, data: { agentId: command.agentId } };
        case 'propose_law':
          return {
            ok: true,
            data: this.governance.proposeLaw(command.agentId, command.description),
          };
        case 'vote':
          return {
            ok: true,
            data: this.governance.vote(command.agentId, command.proposalId, command.choice),
          };
        case 'transfer_currency':
          this.ledger.transfer(command.agentId, command.toAgentId, command.amount);
          return { ok: true, data: { transferred: command.amount } };
        case 'list_proposals':
          return { ok: true, data: this.governance.listProposals(command.status) };
        default: {
          const exhaustiveCheck: never = command;
          throw new Error(`Unhandled skill: ${JSON.stringify(exhaustiveCheck)}`);
        }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
