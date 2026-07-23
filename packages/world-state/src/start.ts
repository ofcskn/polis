import { createWorldStateServer } from './server.js';

const PORT = Number(process.env.PORT ?? 41241);
const BASE_URL = process.env.WORLD_STATE_BASE_URL ?? `http://localhost:${PORT}/`;
const DB_PATH = process.env.WORLD_STATE_DB_PATH ?? './world-state.sqlite';

const { app } = createWorldStateServer({ baseUrl: BASE_URL, dbPath: DB_PATH });

app.listen(PORT, () => {
  console.log(`[world-state] listening on port ${PORT}`);
  console.log(`[world-state] agent card: ${BASE_URL}.well-known/agent-card.json`);
});
