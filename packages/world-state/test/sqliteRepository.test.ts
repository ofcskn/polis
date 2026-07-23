import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteWorldStateRepository } from '../src/sqliteRepository.js';

let tempDir: string | undefined;
let repo: SqliteWorldStateRepository | undefined;

afterEach(() => {
  repo?.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
  repo = undefined;
});

function makeRepo(): SqliteWorldStateRepository {
  tempDir = mkdtempSync(join(tmpdir(), 'polis-world-state-'));
  repo = new SqliteWorldStateRepository(join(tempDir, 'test.sqlite'));
  return repo;
}

describe('SqliteWorldStateRepository', () => {
  it('saves and retrieves a proposal', () => {
    const repository = makeRepo();
    repository.saveProposal({
      id: 'p1',
      description: 'Protect the town hall',
      proposerId: 'agent-a',
      status: 'draft',
      votes: {},
      createdAt: '2026-07-23T00:00:00.000Z',
    });

    expect(repository.getProposal('p1')).toEqual({
      id: 'p1',
      description: 'Protect the town hall',
      proposerId: 'agent-a',
      status: 'draft',
      votes: {},
      createdAt: '2026-07-23T00:00:00.000Z',
    });
  });

  it('updates a proposal on conflict', () => {
    const repository = makeRepo();
    repository.saveProposal({
      id: 'p1',
      description: 'Protect the town hall',
      proposerId: 'agent-a',
      status: 'draft',
      votes: {},
      createdAt: '2026-07-23T00:00:00.000Z',
    });
    repository.saveProposal({
      id: 'p1',
      description: 'Protect the town hall',
      proposerId: 'agent-a',
      status: 'active',
      votes: { 'agent-a': 'yes', 'agent-b': 'yes' },
      createdAt: '2026-07-23T00:00:00.000Z',
    });

    expect(repository.getProposal('p1')?.status).toBe('active');
    expect(repository.getProposal('p1')?.votes).toEqual({ 'agent-a': 'yes', 'agent-b': 'yes' });
  });

  it('lists proposals filtered by status', () => {
    const repository = makeRepo();
    repository.saveProposal({
      id: 'p1',
      description: 'A',
      proposerId: 'agent-a',
      status: 'draft',
      votes: {},
      createdAt: '2026-07-23T00:00:00.000Z',
    });
    repository.saveProposal({
      id: 'p2',
      description: 'B',
      proposerId: 'agent-a',
      status: 'active',
      votes: {},
      createdAt: '2026-07-23T00:00:00.000Z',
    });

    expect(repository.listProposals('active').map((p) => p.id)).toEqual(['p2']);
    expect(
      repository
        .listProposals()
        .map((p) => p.id)
        .sort()
    ).toEqual(['p1', 'p2']);
  });

  it('saves and retrieves an agent, including balance updates', () => {
    const repository = makeRepo();
    repository.saveAgent({ id: 'agent-a', role: 'blacksmith', balance: 10 });
    expect(repository.getAgent('agent-a')).toEqual({
      id: 'agent-a',
      role: 'blacksmith',
      balance: 10,
    });

    repository.saveAgent({ id: 'agent-a', role: 'blacksmith', balance: 15 });
    expect(repository.getAgent('agent-a')?.balance).toBe(15);
  });

  it('lists all registered agents', () => {
    const repository = makeRepo();
    repository.saveAgent({ id: 'agent-a', balance: 0 });
    repository.saveAgent({ id: 'agent-b', balance: 0 });
    expect(
      repository
        .listAgents()
        .map((a) => a.id)
        .sort()
    ).toEqual(['agent-a', 'agent-b']);
  });
});
