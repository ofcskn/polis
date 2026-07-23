import { createBot, type Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Action, MinecraftPerceptionSnapshot, MinecraftPort } from './types.js';

export class MinecraftActionAdapter implements MinecraftPort {
  private readonly bot: Bot;
  private pendingChat: { username: string; message: string }[] = [];

  private constructor(bot: Bot) {
    this.bot = bot;
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;
      this.pendingChat.push({ username, message });
    });
  }

  static async connect(options: {
    host: string;
    port: number;
    username: string;
    version?: string;
  }): Promise<MinecraftActionAdapter> {
    const bot = createBot({
      host: options.host,
      port: options.port,
      username: options.username,
      version: options.version,
      auth: 'offline',
    });

    await new Promise<void>((resolve, reject) => {
      bot.once('spawn', () => resolve());
      bot.once('error', reject);
      bot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
    });

    return new MinecraftActionAdapter(bot);
  }

  perceive(): MinecraftPerceptionSnapshot {
    const chatMessages = this.pendingChat;
    this.pendingChat = [];
    return {
      chatMessages,
      position: this.bot.entity
        ? { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z }
        : undefined,
      health: this.bot.health,
    };
  }

  async dispatch(action: Action): Promise<void> {
    switch (action.kind) {
      case 'chat':
        this.bot.chat(action.text);
        return;
      case 'moveTo':
        await this.bot.lookAt(new Vec3(action.x, action.y, action.z));
        return;
      case 'dig': {
        const block = this.bot.blockAt(new Vec3(action.x, action.y, action.z));
        if (block) {
          await this.bot.dig(block);
        }
        return;
      }
      default:
        return;
    }
  }

  disconnect(): void {
    this.bot.end();
  }
}
