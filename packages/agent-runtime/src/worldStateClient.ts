import { randomUUID } from 'node:crypto';
import { ClientFactory, type Client } from '@a2a-js/sdk/client';
import { Role, type Message, type SendMessageResult, type Task } from '@a2a-js/sdk';
import {
  serializeWorldStateCommand,
  type WorldStateCommand,
  type WorldStateCommandResult,
} from '@polis/protocol';
import type { WorldStatePort } from './types.js';

export class WorldStateClient implements WorldStatePort {
  private constructor(private readonly client: Client) {}

  static async connect(baseUrl: string): Promise<WorldStateClient> {
    const factory = new ClientFactory();
    const client = await factory.createFromUrl(baseUrl);
    return new WorldStateClient(client);
  }

  async send(command: WorldStateCommand): Promise<WorldStateCommandResult> {
    const message: Message = {
      messageId: randomUUID(),
      contextId: '',
      taskId: '',
      role: Role.ROLE_USER,
      parts: [
        {
          content: { $case: 'text', value: serializeWorldStateCommand(command) },
          metadata: undefined,
          filename: '',
          mediaType: 'text/plain',
        },
      ],
      metadata: undefined,
    } as Message;

    const result = await this.client.sendMessage({
      tenant: '',
      message,
      configuration: undefined,
      metadata: {},
    });

    return this.extractResult(result);
  }

  private extractResult(result: SendMessageResult): WorldStateCommandResult {
    const task = result as Task;
    const part = task.artifacts?.[0]?.parts[0];
    if (part?.content?.$case === 'text') {
      return JSON.parse(part.content.value) as WorldStateCommandResult;
    }
    throw new Error('World-State response did not contain a text artifact');
  }
}
