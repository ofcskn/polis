import Database from 'better-sqlite3';
import type { AgentRecord, Proposal, ProposalStatus } from './domain.js';
import type { WorldStateRepository } from './repository.js';

export class SqliteWorldStateRepository implements WorldStateRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        proposerId TEXT NOT NULL,
        status TEXT NOT NULL,
        votes TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        role TEXT,
        balance REAL NOT NULL
      );
    `);
  }

  saveProposal(proposal: Proposal): void {
    this.db
      .prepare(
        `INSERT INTO proposals (id, description, proposerId, status, votes, createdAt)
         VALUES (@id, @description, @proposerId, @status, @votes, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           description = excluded.description,
           status = excluded.status,
           votes = excluded.votes`
      )
      .run({ ...proposal, votes: JSON.stringify(proposal.votes) });
  }

  getProposal(id: string): Proposal | undefined {
    const row = this.db.prepare(`SELECT * FROM proposals WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToProposal(row) : undefined;
  }

  listProposals(status?: ProposalStatus): Proposal[] {
    const rows = status
      ? (this.db.prepare(`SELECT * FROM proposals WHERE status = ?`).all(status) as Record<
          string,
          unknown
        >[])
      : (this.db.prepare(`SELECT * FROM proposals`).all() as Record<string, unknown>[]);
    return rows.map((row) => this.rowToProposal(row));
  }

  saveAgent(agent: AgentRecord): void {
    this.db
      .prepare(
        `INSERT INTO agents (id, role, balance) VALUES (@id, @role, @balance)
         ON CONFLICT(id) DO UPDATE SET role = excluded.role, balance = excluded.balance`
      )
      .run({ id: agent.id, role: agent.role ?? null, balance: agent.balance });
  }

  getAgent(id: string): AgentRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as
      | { id: string; role: string | null; balance: number }
      | undefined;
    return row ? { id: row.id, role: row.role ?? undefined, balance: row.balance } : undefined;
  }

  listAgents(): AgentRecord[] {
    const rows = this.db.prepare(`SELECT * FROM agents`).all() as {
      id: string;
      role: string | null;
      balance: number;
    }[];
    return rows.map((row) => ({ id: row.id, role: row.role ?? undefined, balance: row.balance }));
  }

  close(): void {
    this.db.close();
  }

  private rowToProposal(row: Record<string, unknown>): Proposal {
    return {
      id: row.id as string,
      description: row.description as string,
      proposerId: row.proposerId as string,
      status: row.status as ProposalStatus,
      votes: JSON.parse(row.votes as string),
      createdAt: row.createdAt as string,
    };
  }
}
