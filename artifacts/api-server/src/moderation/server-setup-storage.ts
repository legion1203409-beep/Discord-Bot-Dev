import { pool } from "@workspace/db";
import type { SetupJournal } from "./server-setup";

export async function withSetupJournal<T>(guildId: string, run: (
  journal: SetupJournal, save: (journal: SetupJournal) => Promise<void>,
) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  let broken = false;
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS discord_server_setup (
      guild_id text PRIMARY KEY, journal jsonb NOT NULL DEFAULT '{}'::jsonb
    )`);
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [`server-setup:${guildId}`]);
    if (!lock.rows[0].locked) throw new Error("O configurare este deja în curs pe acest server. Reîncearcă după finalizare.");
    locked = true;
    const result = await client.query("SELECT journal FROM discord_server_setup WHERE guild_id = $1", [guildId]);
    return await run(result.rows[0]?.journal ?? {}, async journal => {
      await client.query(`INSERT INTO discord_server_setup(guild_id, journal) VALUES($1, $2::jsonb)
        ON CONFLICT(guild_id) DO UPDATE SET journal = EXCLUDED.journal`, [guildId, JSON.stringify(journal)]);
    });
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`server-setup:${guildId}`]); }
      catch { broken = true; }
    }
    client.release(broken);
  }
}
