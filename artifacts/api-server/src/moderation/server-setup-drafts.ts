import { pool } from "@workspace/db";
import { setupDraftSchema, type SavedSetupDraft, type SetupDraftSaveInput } from "./server-setup-schema";

export class SetupDraftRevisionConflictError extends Error {
  constructor() {
    super("Draftul salvat a fost modificat în altă sesiune. Versiunea locală a fost păstrată.");
  }
}

async function ensureDraftTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_server_setup_drafts (
      guild_id text NOT NULL,
      user_id text NOT NULL,
      draft jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, user_id)
    )
  `);
}

function fromRow(row: { draft: unknown; revision: number; updated_at: Date }): SavedSetupDraft {
  return {
    draft: setupDraftSchema.parse(row.draft),
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getSavedSetupDraft(guildId: string, userId: string): Promise<SavedSetupDraft | null> {
  await ensureDraftTable();
  const { rows } = await pool.query<{ draft: unknown; revision: number; updated_at: Date }>(
    "SELECT draft, revision, updated_at FROM discord_server_setup_drafts WHERE guild_id = $1 AND user_id = $2",
    [guildId, userId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function saveSetupDraft(
  guildId: string,
  userId: string,
  input: SetupDraftSaveInput,
): Promise<SavedSetupDraft> {
  await ensureDraftTable();
  const { rows } = await pool.query<{ draft: unknown; revision: number; updated_at: Date }>(
    `INSERT INTO discord_server_setup_drafts AS saved (guild_id, user_id, draft, revision, updated_at)
     SELECT $1, $2, $3::jsonb, 1, now()
     WHERE $4 = 0
     ON CONFLICT (guild_id, user_id) DO UPDATE
       SET draft = EXCLUDED.draft, revision = saved.revision + 1, updated_at = now()
       WHERE saved.revision = $4
     RETURNING draft, revision, updated_at`,
    [guildId, userId, JSON.stringify(input.draft), input.expectedRevision],
  );
  if (!rows[0]) throw new SetupDraftRevisionConflictError();
  return fromRow(rows[0]);
}
