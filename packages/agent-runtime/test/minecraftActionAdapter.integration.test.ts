import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBot, type Bot } from 'mineflayer';
import { MinecraftActionAdapter } from '../src/minecraftActionAdapter.js';

const HOST = 'localhost';
const PORT = 25566;

let observerBot: Bot;
let adapter: MinecraftActionAdapter;

beforeAll(async () => {
  adapter = await MinecraftActionAdapter.connect({
    host: HOST,
    port: PORT,
    username: 'polis_adapter',
  });

  // Paper's default connection-throttle rejects a second connection from the
  // same IP that arrives too soon after the first; wait it out before
  // connecting the observer bot.
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  observerBot = createBot({
    host: HOST,
    port: PORT,
    username: 'polis_observer',
    auth: 'offline',
  });
  await new Promise<void>((resolve, reject) => {
    observerBot.once('spawn', () => resolve());
    observerBot.once('error', reject);
    observerBot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
  });
}, 60_000);

afterAll(() => {
  adapter.disconnect();
  observerBot.end();
});

describe('MinecraftActionAdapter', () => {
  it('captures chat sent by another player', async () => {
    observerBot.chat('hello from the observer');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const snapshot = adapter.perceive();
    expect(snapshot.chatMessages).toContainEqual({
      username: 'polis_observer',
      message: 'hello from the observer',
    });
  });

  it('sends chat that another player receives', async () => {
    const received = new Promise<string>((resolve) => {
      observerBot.once('chat', (username, message) => {
        if (username === 'polis_adapter') resolve(message);
      });
    });

    await adapter.dispatch({ kind: 'chat', text: 'hello from the adapter' });

    expect(await received).toBe('hello from the adapter');
  });
});
