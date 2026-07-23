import express from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { buildWorldStateAgentCard } from './agentCard.js';
import { WorldStateAgentExecutor } from './agentExecutor.js';
import { GovernanceEngine } from './governanceEngine.js';
import { CurrencyLedger } from './currencyLedger.js';
import { SqliteWorldStateRepository } from './sqliteRepository.js';

export interface WorldStateServer {
  app: express.Express;
  repository: SqliteWorldStateRepository;
  close: () => void;
}

export function createWorldStateServer(options: {
  baseUrl: string;
  dbPath: string;
}): WorldStateServer {
  const repository = new SqliteWorldStateRepository(options.dbPath);
  const governance = new GovernanceEngine(repository);
  const ledger = new CurrencyLedger(repository);
  const executor = new WorldStateAgentExecutor(governance, ledger);
  const taskStore = new InMemoryTaskStore();
  const agentCard = buildWorldStateAgentCard(options.baseUrl);
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

  const app = express();
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  return { app, repository, close: () => repository.close() };
}
