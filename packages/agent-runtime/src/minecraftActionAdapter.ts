import { createBot, type Bot } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import type {
  Action,
  MinecraftPerceptionSnapshot,
  MinecraftPort,
  NearbyBlock,
  NearbyEntity,
} from './types.js';

const { pathfinder, Movements, goals } = pathfinderPkg;

const NEARBY_BLOCK_RADIUS = 12;
const NEARBY_BLOCK_LIMIT = 20;
const NEARBY_ENTITY_RADIUS = 24;
const NEARBY_ENTITY_LIMIT = 10;
const MOVE_TIMEOUT_MS = 15_000;

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

    bot.loadPlugin(pathfinder);

    await new Promise<void>((resolve, reject) => {
      bot.once('spawn', () => resolve());
      bot.once('error', reject);
      bot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
    });

    bot.pathfinder.setMovements(new Movements(bot));

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
      nearbyBlocks: this.scanNearbyBlocks(),
      nearbyEntities: this.scanNearbyEntities(),
    };
  }

  async dispatch(action: Action): Promise<string> {
    switch (action.kind) {
      case 'chat':
        this.bot.chat(action.text);
        return `Said: "${action.text}"`;
      case 'moveTo':
        return this.moveTo(action.x, action.y, action.z);
      case 'dig':
        return this.dig(action.x, action.y, action.z);
      default:
        return '';
    }
  }

  disconnect(): void {
    this.bot.end();
  }

  private async moveTo(x: number, y: number, z: number): Promise<string> {
    const goal = new goals.GoalNear(x, y, z, 1);
    try {
      await Promise.race([
        this.bot.pathfinder.goto(goal),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timed out')), MOVE_TIMEOUT_MS)
        ),
      ]);
      return `Moved to (${x}, ${y}, ${z}).`;
    } catch (error) {
      return `Could not reach (${x}, ${y}, ${z}): ${(error as Error).message}`;
    }
  }

  private async dig(x: number, y: number, z: number): Promise<string> {
    const block = this.bot.blockAt(new Vec3(x, y, z));
    if (!block || block.name === 'air') {
      return `No block to dig at (${x}, ${y}, ${z}).`;
    }
    if (!block.diggable) {
      return `Block at (${x}, ${y}, ${z}) (${block.name}) is not diggable.`;
    }
    try {
      await this.bot.dig(block);
      return `Dug ${block.name} at (${x}, ${y}, ${z}).`;
    } catch (error) {
      return `Failed to dig (${x}, ${y}, ${z}): ${(error as Error).message}`;
    }
  }

  private scanNearbyBlocks(): NearbyBlock[] {
    if (!this.bot.entity) return [];
    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block) => block.type !== 0 && block.name !== undefined,
      maxDistance: NEARBY_BLOCK_RADIUS,
      count: NEARBY_BLOCK_LIMIT * 4,
    });

    const origin = this.bot.entity.position;
    return positions
      .map((pos) => ({ pos, block: this.bot.blockAt(pos) }))
      .filter((entry): entry is { pos: Vec3; block: NonNullable<ReturnType<Bot['blockAt']>> } =>
        entry.block !== null
      )
      .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin))
      .slice(0, NEARBY_BLOCK_LIMIT)
      .map(({ pos, block }) => ({ type: block.name, x: pos.x, y: pos.y, z: pos.z }));
  }

  private scanNearbyEntities(): NearbyEntity[] {
    if (!this.bot.entity) return [];
    const origin = this.bot.entity.position;
    return Object.values(this.bot.entities)
      .filter((entity) => entity !== this.bot.entity && entity.position)
      .map((entity) => ({
        name: entity.username ?? entity.name ?? entity.type,
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
        distance: entity.position.distanceTo(origin),
      }))
      .filter((entity) => entity.distance <= NEARBY_ENTITY_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEARBY_ENTITY_LIMIT);
  }
}
