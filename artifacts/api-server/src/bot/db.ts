import { db, pool } from "@workspace/db";
import { playersTable, activeEventsTable, eventParticipantsTable, eventClaimsTable, botStateTable, activeBossesTable, playerItemsTable, playerTalismansTable, playerDailyQuestsTable } from "@workspace/db";
import type { ActiveBossRow, PlayerItem, PlayerTalisman, PlayerDailyQuest } from "@workspace/db";
import { eq, and, gte, gt, lt, inArray, sql, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Player, EventParticipant } from "@workspace/db";

export type { PlayerItem };
import { CLASSES, isClassKey, classStats, rollRarity, isCompanionKey, companionStats, prestigeStartLevel, monsterSpawnHp } from "./survival";
import { logger } from "../lib/logger";

export type UpgradeKey = "atac" | "def" | "dodge" | "crit" | "hp";

// ─── Multi-guild DB migration ─────────────────────────────────────────────────
// Called once at bot startup. Applies additive schema changes that cannot go
// through interactive Drizzle push (production DB has blocking drift).

export async function runMultiGuildMigrations(): Promise<void> {
  const DEFAULT_GUILD_ID = "1382035307607883816";
  logger.info("multi-guild migrations: starting");

  // players: add guild_id + composite PK (backfill existing rows before NOT NULL)
  const { rowCount: playersBackfilled } = await pool.query(`
    DO $$
    DECLARE
      backfilled int;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'players' AND column_name = 'guild_id'
      ) THEN
        ALTER TABLE players ADD COLUMN guild_id text;
        UPDATE players SET guild_id = '${DEFAULT_GUILD_ID}' WHERE guild_id IS NULL;
        GET DIAGNOSTICS backfilled = ROW_COUNT;
        RAISE NOTICE 'players: backfilled % rows with default guild_id', backfilled;
        ALTER TABLE players ALTER COLUMN guild_id SET NOT NULL;
        ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey;
        ALTER TABLE players ADD PRIMARY KEY (discord_id, guild_id);
        RAISE NOTICE 'players: composite PK applied';
      END IF;
    END $$;
  `);
  logger.info({ playersBackfilled }, "multi-guild migrations: players done");

  // active_events: add guild_id column
  await pool.query(`
    ALTER TABLE active_events ADD COLUMN IF NOT EXISTS guild_id text NOT NULL DEFAULT '${DEFAULT_GUILD_ID}';
  `);
  logger.info("multi-guild migrations: active_events done");

  // active_bosses: migrate from single-column PK (event_id) to composite (event_id, guild_id).
  // Boss fight state is ephemeral — acceptable to drop the old table on first migration.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'active_bosses') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'active_bosses' AND column_name = 'guild_id'
        ) THEN
          DROP TABLE active_bosses;
          RAISE NOTICE 'active_bosses: old single-PK table dropped (ephemeral data)';
        ELSE
          IF EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'active_bosses' AND c.contype = 'p'
              AND array_length(c.conkey, 1) = 1
          ) THEN
            ALTER TABLE active_bosses DROP CONSTRAINT IF EXISTS active_bosses_pkey;
            ALTER TABLE active_bosses ADD PRIMARY KEY (event_id, guild_id);
            RAISE NOTICE 'active_bosses: upgraded to composite PK';
          END IF;
        END IF;
      END IF;
    END $$;
  `);
  logger.info("multi-guild migrations: active_bosses done");

  // event_participants: add guild_id
  await pool.query(`
    ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS guild_id text NOT NULL DEFAULT '${DEFAULT_GUILD_ID}';
  `);
  logger.info("multi-guild migrations: event_participants done");

  // event_claims: add guild_id
  await pool.query(`
    ALTER TABLE event_claims ADD COLUMN IF NOT EXISTS guild_id text NOT NULL DEFAULT '${DEFAULT_GUILD_ID}';
  `);
  logger.info("multi-guild migrations: event_claims done");

  // ─── Prestige system columns ───────────────────────────────────────────────
  const prestigeCols = [
    "prestige_level integer NOT NULL DEFAULT 0",
    "prestige_attack_bonus integer NOT NULL DEFAULT 0",
    "prestige_defense_bonus integer NOT NULL DEFAULT 0",
    "prestige_dodge_bonus integer NOT NULL DEFAULT 0",
    "prestige_crit_bonus integer NOT NULL DEFAULT 0",
    "prestige_hp_bonus integer NOT NULL DEFAULT 0",
  ];
  for (const colDef of prestigeCols) {
    const colName = colDef.split(" ")[0];
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS ${colDef}`);
    logger.info(`multi-guild migrations: prestige column ${colName} ensured`);
  }

  // ─── Talisman system columns ───────────────────────────────────────────────
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS talisman text`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS talisman_level integer NOT NULL DEFAULT 1`);
  logger.info("multi-guild migrations: talisman columns ensured");

  // ─── Player items table ────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_items (
      discord_id text        NOT NULL,
      guild_id   text        NOT NULL,
      item_key   text        NOT NULL,
      quantity   integer     NOT NULL DEFAULT 1,
      PRIMARY KEY (discord_id, guild_id, item_key)
    )
  `);
  logger.info("multi-guild migrations: player_items table ensured");

  // ─── Player talismans table (per-talisman saved levels) ───────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_talismans (
      discord_id   text    NOT NULL,
      guild_id     text    NOT NULL,
      talisman_key text    NOT NULL,
      level        integer NOT NULL DEFAULT 1,
      PRIMARY KEY (discord_id, guild_id, talisman_key)
    )
  `);
  logger.info("multi-guild migrations: player_talismans table ensured");

  // ─── Player daily quests table ─────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_daily_quests (
      discord_id   text    NOT NULL,
      guild_id     text    NOT NULL,
      quest_key    text    NOT NULL,
      quest_date   text    NOT NULL,
      progress     integer NOT NULL DEFAULT 0,
      completed    boolean NOT NULL DEFAULT false,
      reward_given boolean NOT NULL DEFAULT false,
      PRIMARY KEY (discord_id, guild_id, quest_key)
    )
  `);
  logger.info("multi-guild migrations: player_daily_quests table ensured");

  // ─── Items farmed during an event (shown in the event summary) ────────────
  await pool.query(`ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS items_farmed jsonb NOT NULL DEFAULT '{}'::jsonb`);
  logger.info("multi-guild migrations: event_participants.items_farmed ensured");

  // ─── Boss ability charge bar (mini-boss fights) ────────────────────────────
  await pool.query(`ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS boss_charge integer NOT NULL DEFAULT 0`);
  logger.info("multi-guild migrations: event_participants.boss_charge ensured");

  // ─── Boss veteran ranks: per-player per-boss kill counts ──────────────────
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS boss_kills jsonb NOT NULL DEFAULT '{}'::jsonb`);
  logger.info("multi-guild migrations: players.boss_kills ensured");

  // ─── Mana system columns ───────────────────────────────────────────────────
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS mana integer NOT NULL DEFAULT 100`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS mana_level integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS mana_regen_level integer NOT NULL DEFAULT 0`);
  logger.info("multi-guild migrations: players mana columns ensured");

  // ─── Ash Shield own HP pool (per event participant) ────────────────────────
  await pool.query(`ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS shield_hp integer NOT NULL DEFAULT 0`);
  logger.info("multi-guild migrations: event_participants.shield_hp ensured");

  // ─── Per-class saved levels (class switching keeps progress) ──────────────
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS class_levels jsonb NOT NULL DEFAULT '{}'::jsonb`);
  logger.info("multi-guild migrations: players.class_levels ensured");

  // Post-migration verification: confirm every required column is present
  const { rows: missingCols } = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT v.table_name, v.column_name
    FROM (VALUES
      ('players',           'guild_id'),
      ('active_events',     'guild_id'),
      ('event_participants','guild_id'),
      ('event_claims',      'guild_id'),
      ('players',           'prestige_level'),
      ('players',           'prestige_attack_bonus'),
      ('players',           'prestige_defense_bonus'),
      ('players',           'prestige_dodge_bonus'),
      ('players',           'prestige_crit_bonus'),
      ('players',           'prestige_hp_bonus'),
      ('players',           'talisman_level'),
      ('event_participants','items_farmed'),
      ('players',           'boss_kills'),
      ('players',           'class_levels'),
      ('players',           'mana_regen_level'),
      ('event_participants','shield_hp')
    ) AS v(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = v.table_name AND c.column_name = v.column_name
    )
  `);
  if (missingCols.length > 0) {
    logger.error({ missingCols }, "multi-guild migrations: verification FAILED — columns still missing after migration");
    throw new Error(`Multi-guild migration verification failed: missing columns ${JSON.stringify(missingCols)}`);
  }

  // Verify players composite PK
  const { rows: pkCols } = await pool.query<{ column_name: string }>(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'players' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `);
  const pkColNames = pkCols.map((r) => r.column_name);
  if (!pkColNames.includes("guild_id")) {
    logger.error({ pkColNames }, "multi-guild migrations: verification FAILED — players PK does not include guild_id");
    throw new Error("Multi-guild migration verification failed: players PK missing guild_id");
  }

  logger.info({ pkColNames }, "multi-guild migrations: verification passed — all columns and PKs confirmed");

  // ── One-time data restoration (migration data-loss recovery, 2026-07-03) ────
  // The multi-guild schema migration accidentally wiped player progress on the
  // original guild. Restore known values from the last-seen clasament screenshot.
  // Guard: only runs if xp < snapshot (idempotent — safe to re-run on any restart).
  const ORIGINAL_GUILD = "1382035307607883816";
  type SnapshotRow = {
    discordId: string;
    xp: number;
    maxLevel: number;
    deaths: number;
    deathLevel: number;
    retreats: number;
    retreatLevel: number;
  };
  const SNAPSHOT: SnapshotRow[] = [
    { discordId: "585841275765522442",  xp: 47150, maxLevel: 20, deaths:  7, deathLevel: 20, retreats: 4, retreatLevel: 20 }, // _legion09
    { discordId: "1304191735710355472", xp: 44210, maxLevel: 20, deaths: 19, deathLevel: 20, retreats: 0, retreatLevel:  0 }, // _amyiguess_k
    { discordId: "1427614108227862542", xp: 40948, maxLevel: 20, deaths:  7, deathLevel: 20, retreats: 7, retreatLevel: 20 }, // ace_13plm
    { discordId: "693524178275401739",  xp: 20860, maxLevel: 18, deaths: 10, deathLevel: 18, retreats: 9, retreatLevel: 18 }, // nrobert7
    { discordId: "1374099824420458648", xp: 14055, maxLevel: 10, deaths:  2, deathLevel: 10, retreats: 7, retreatLevel: 10 }, // apathosp
    { discordId: "1515718494338027741", xp:   860, maxLevel:  6, deaths:  4, deathLevel:  5, retreats: 0, retreatLevel:  0 }, // sally_is_here00
  ];
  let restored = 0;
  for (const s of SNAPSHOT) {
    const { rowCount } = await pool.query(
      `UPDATE players
         SET xp           = $1,
             max_level    = $2,
             deaths       = $3,
             death_level  = $4,
             retreats     = $5,
             retreat_level = $6
       WHERE discord_id = $7
         AND guild_id   = $8
         AND xp         < $1`,
      [s.xp, s.maxLevel, s.deaths, s.deathLevel, s.retreats, s.retreatLevel,
       s.discordId, ORIGINAL_GUILD],
    );
    if (rowCount && rowCount > 0) restored++;
  }
  if (restored > 0) {
    logger.info({ restored }, "multi-guild migrations: data-loss restoration applied");
  } else {
    logger.info("multi-guild migrations: data-loss restoration — already up-to-date, skipped");
  }
}

// ─── Player helpers ────────────────────────────────────────────────────────────

function playerWhere(discordId: string, guildId: string) {
  return and(eq(playersTable.discordId, discordId), eq(playersTable.guildId, guildId));
}

export async function upsertPlayer(discordId: string, guildId: string, username: string): Promise<Player> {
  const [existing] = await db.select().from(playersTable).where(playerWhere(discordId, guildId));
  if (existing) {
    const [u] = await db.update(playersTable).set({ username }).where(playerWhere(discordId, guildId)).returning();
    return u!;
  }
  const [c] = await db.insert(playersTable).values({ discordId, guildId, username }).returning();
  return c!;
}

/** Atomically increments how many times this player has slain the given boss (veteran ranks). */
export async function incrementBossKill(discordId: string, guildId: string, bossIdx: number): Promise<void> {
  const key = String(bossIdx);
  await db.update(playersTable)
    .set({
      bossKills: sql`jsonb_set(coalesce(${playersTable.bossKills}, '{}'::jsonb), ${sql.raw(`'{${Number(bossIdx)}}'`)}, (coalesce(${playersTable.bossKills}->>${key}, '0')::int + 1)::text::jsonb)`,
    })
    .where(playerWhere(discordId, guildId));
}

export async function recordPlayerDeath(discordId: string, guildId: string, deathLevel: number): Promise<void> {
  const [p] = await db.select().from(playersTable).where(playerWhere(discordId, guildId));
  if (!p) return;
  await db.update(playersTable)
    .set({ deaths: p.deaths + 1, deathLevel })
    .where(playerWhere(discordId, guildId));
}

export async function recordPlayerRetreat(discordId: string, guildId: string, retreatLevel: number): Promise<void> {
  const [p] = await db.select().from(playersTable).where(playerWhere(discordId, guildId));
  if (!p) return;
  await db.update(playersTable)
    .set({ retreats: p.retreats + 1, retreatLevel })
    .where(playerWhere(discordId, guildId));
}

export async function getPlayerById(discordId: string, guildId: string): Promise<Player | null> {
  const [p] = await db.select().from(playersTable).where(playerWhere(discordId, guildId));
  return p ?? null;
}

const PLAYER_RESET = {
  xp: 0, gold: 0, reputation: 0, hp: 100, maxLevel: 0,
  class: null as string | null, companion: null as string | null, companionLevel: 1,
  abilityEmpowerLevel: 0, abilityShieldLevel: 0,
  honorTitle: null as string | null, deaths: 0, deathLevel: 0, retreats: 0, retreatLevel: 0,
  attackBonus: 0, defenseBonus: 0, dodgeBonus: 0, critBonus: 0, maxHpBonus: 0,
  shopAttackCount: 0, shopDefenseCount: 0, shopDodgeCount: 0, shopCritCount: 0, shopHpCount: 0,
  keyRar: 0, keyEpic: 0, keyRegal: 0,
  prestigeLevel: 0, prestigeAttackBonus: 0, prestigeDefenseBonus: 0,
  prestigeDodgeBonus: 0, prestigeCritBonus: 0, prestigeHpBonus: 0,
  talisman: null as string | null, talismanLevel: 1,
};

export async function resetPlayer(discordId: string, guildId: string): Promise<boolean> {
  const res = await db.update(playersTable).set(PLAYER_RESET).where(playerWhere(discordId, guildId)).returning({ id: playersTable.discordId });
  return res.length > 0;
}

export async function resetAllPlayersInGuild(guildId: string): Promise<number> {
  const res = await db.update(playersTable).set(PLAYER_RESET).where(eq(playersTable.guildId, guildId)).returning({ id: playersTable.discordId });
  return res.length;
}

export async function updateMaxLevel(discordId: string, guildId: string, level: number): Promise<void> {
  await db.update(playersTable)
    .set({ maxLevel: sql`GREATEST(${playersTable.maxLevel}, ${level})` })
    .where(playerWhere(discordId, guildId));
}

// Picks a class. The first-ever training is free; retraining (after a reset,
// i.e. class_levels is non-empty) costs `switchFee` Oboli. The saved level for
// that class (if any) is restored, otherwise it starts at 1.
export async function setPlayerClass(discordId: string, guildId: string, classKey: string, switchFee: number): Promise<Player | null> {
  if (!isClassKey(classKey)) return null;
  const fee = sql`CASE WHEN ${playersTable.classLevels} = '{}'::jsonb THEN 0 ELSE ${switchFee} END`;
  const [u] = await db.update(playersTable)
    .set({
      class: classKey,
      classLevel: sql`COALESCE((${playersTable.classLevels}->>${classKey})::int, 1)`,
      gold: sql`${playersTable.gold} - (${fee})`,
    })
    .where(and(
      playerWhere(discordId, guildId),
      sql`${playersTable.class} IS NULL`,
      sql`${playersTable.gold} >= (${fee})`,
    ))
    .returning();
  return u ?? null;
}

// Resets the player's class (class → NULL) but SAVES its level in class_levels,
// so retraining the same path later resumes from where it left off. No refund.
export async function resetPlayerClass(discordId: string, guildId: string): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      classLevels: sql`jsonb_set(${playersTable.classLevels}, ARRAY[${playersTable.class}], to_jsonb(${playersTable.classLevel}))`,
      class: null,
      classLevel: 1,
    })
    .where(and(playerWhere(discordId, guildId), sql`${playersTable.class} IS NOT NULL`))
    .returning();
  return u ?? null;
}

// Resets the player's companion (companion → NULL, level back to 1). No refund.
export async function resetPlayerCompanion(discordId: string, guildId: string): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ companion: null, companionLevel: 1 })
    .where(and(playerWhere(discordId, guildId), sql`${playersTable.companion} IS NOT NULL`))
    .returning();
  return u ?? null;
}

// Buys a companion with Oboli. Permanent: only if the player has none yet.
export async function buyCompanion(discordId: string, guildId: string, companionKey: string, cost: number): Promise<Player | null> {
  if (!isCompanionKey(companionKey)) return null;
  const [u] = await db.update(playersTable)
    .set({ companion: companionKey, companionLevel: 1, gold: sql`${playersTable.gold} - ${cost}` })
    .where(and(playerWhere(discordId, guildId), sql`${playersTable.companion} IS NULL`, gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

// Upgrades the owned companion; `expectedLevel` guards concurrent clicks.
export async function upgradeCompanion(discordId: string, guildId: string, expectedLevel: number, cost: number, xpCost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      companionLevel: sql`${playersTable.companionLevel} + 1`,
      gold: sql`${playersTable.gold} - ${cost}`,
      xp: sql`${playersTable.xp} - ${xpCost}`,
    })
    .where(and(
      playerWhere(discordId, guildId),
      sql`${playersTable.companion} IS NOT NULL`,
      eq(playersTable.companionLevel, expectedLevel),
      gte(playersTable.gold, cost),
      gte(playersTable.xp, xpCost),
    ))
    .returning();
  return u ?? null;
}

export type AbilityKind = "empower" | "shield";

// Unlocks an ability (level 0 → 1) with Oboli.
export async function buyAbility(discordId: string, guildId: string, kind: AbilityKind, cost: number): Promise<Player | null> {
  const col = kind === "empower" ? playersTable.abilityEmpowerLevel : playersTable.abilityShieldLevel;
  const setObj = kind === "empower" ? { abilityEmpowerLevel: 1 } : { abilityShieldLevel: 1 };
  const [u] = await db.update(playersTable)
    .set({ ...setObj, gold: sql`${playersTable.gold} - ${cost}` })
    .where(and(playerWhere(discordId, guildId), eq(col, 0), gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

// Upgrades an owned ability; `expectedLevel` guards concurrent clicks.
export async function upgradeAbility(discordId: string, guildId: string, kind: AbilityKind, expectedLevel: number, cost: number, xpCost: number): Promise<Player | null> {
  const col = kind === "empower" ? playersTable.abilityEmpowerLevel : playersTable.abilityShieldLevel;
  const setObj = kind === "empower"
    ? { abilityEmpowerLevel: sql`${playersTable.abilityEmpowerLevel} + 1` }
    : { abilityShieldLevel: sql`${playersTable.abilityShieldLevel} + 1` };
  const [u] = await db.update(playersTable)
    .set({ ...setObj, gold: sql`${playersTable.gold} - ${cost}`, xp: sql`${playersTable.xp} - ${xpCost}` })
    .where(and(playerWhere(discordId, guildId), eq(col, expectedLevel), gte(col, 1), gte(playersTable.gold, cost), gte(playersTable.xp, xpCost)))
    .returning();
  return u ?? null;
}

// Atomically spends mana for an ability; returns null when the player lacks enough mana.
export async function spendPlayerMana(discordId: string, guildId: string, cost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ mana: sql`${playersTable.mana} - ${cost}` })
    .where(and(playerWhere(discordId, guildId), gte(playersTable.mana, cost)))
    .returning();
  return u ?? null;
}

// Drains mana without failing when the pool is short (atomic GREATEST clamp to 0).
// Used for the Ash Shield strain: absorbing damage also saps mana, but an empty
// pool never blocks the shield — only its own HP does.
export async function drainPlayerMana(discordId: string, guildId: string, amount: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ mana: sql`GREATEST(0, ${playersTable.mana} - ${amount})` })
    .where(playerWhere(discordId, guildId))
    .returning();
  return u ?? null;
}

// Restores mana up to `max` (atomic LEAST clamp); returns the updated player.
export async function regenPlayerMana(discordId: string, guildId: string, amount: number, max: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ mana: sql`LEAST(${max}, ${playersTable.mana} + ${amount})` })
    .where(playerWhere(discordId, guildId))
    .returning();
  return u ?? null;
}

// Upgrades the mana reserve (infinite levels); `expectedLevel` guards concurrent clicks.
// The new max is applied and the current mana is topped up to the new maximum.
export async function upgradeMana(discordId: string, guildId: string, expectedLevel: number, cost: number, xpCost: number, newMax: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      manaLevel: sql`${playersTable.manaLevel} + 1`,
      mana: newMax,
      gold: sql`${playersTable.gold} - ${cost}`,
      xp: sql`${playersTable.xp} - ${xpCost}`,
    })
    .where(and(playerWhere(discordId, guildId), eq(playersTable.manaLevel, expectedLevel), gte(playersTable.gold, cost), gte(playersTable.xp, xpCost)))
    .returning();
  return u ?? null;
}

// Upgrades the mana regen rate (infinite levels); `expectedLevel` guards concurrent clicks.
export async function upgradeManaRegen(discordId: string, guildId: string, expectedLevel: number, cost: number, xpCost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      manaRegenLevel: sql`${playersTable.manaRegenLevel} + 1`,
      gold: sql`${playersTable.gold} - ${cost}`,
      xp: sql`${playersTable.xp} - ${xpCost}`,
    })
    .where(and(playerWhere(discordId, guildId), eq(playersTable.manaRegenLevel, expectedLevel), gte(playersTable.gold, cost), gte(playersTable.xp, xpCost)))
    .returning();
  return u ?? null;
}

// Upgrades the player's class level; `expectedLevel` + `classKey` guard concurrent clicks.
export async function upgradeClass(
  discordId: string, guildId: string, classKey: string, expectedLevel: number,
  goldCost: number, xpCost: number, items: { item: string; qty: number }[],
): Promise<Player | null> {
  if (!isClassKey(classKey)) return null;
  if (expectedLevel < 1 || expectedLevel >= 10) return null;
  const costs: Record<string, number> = {};
  for (const req of items) costs[req.item] = req.qty;

  // Any guard failure inside the transaction throws ROLLBACK_ERR so the whole
  // transaction rolls back — otherwise Drizzle commits on a normal return and
  // already-deducted materials would be lost without the upgrade applying.
  const ROLLBACK_ERR = new Error("upgrade_class_rollback");
  try {
    return await db.transaction(async (tx) => {
      // Deduct each required item atomically; the `gte(quantity, need)` guard
      // makes an insufficient stack return 0 rows, which aborts everything.
      const results = await Promise.all(
        Object.entries(costs).map(([key, need]) =>
          tx.update(playerItemsTable)
            .set({ quantity: sql`${playerItemsTable.quantity} - ${need}` })
            .where(and(
              eq(playerItemsTable.discordId, discordId),
              eq(playerItemsTable.guildId, guildId),
              eq(playerItemsTable.itemKey, key),
              gte(playerItemsTable.quantity, need),
            ))
            .returning({ id: playerItemsTable.discordId })
        )
      );
      if (results.some((r) => r.length === 0)) throw ROLLBACK_ERR;

      const [u] = await tx.update(playersTable)
        .set({
          classLevel: sql`${playersTable.classLevel} + 1`,
          gold: sql`${playersTable.gold} - ${goldCost}`,
          xp: sql`${playersTable.xp} - ${xpCost}`,
        })
        .where(and(
          playerWhere(discordId, guildId),
          eq(playersTable.class, classKey),
          eq(playersTable.classLevel, expectedLevel),
          lt(playersTable.classLevel, 10),
          gte(playersTable.gold, goldCost),
          gte(playersTable.xp, xpCost),
        ))
        .returning();
      if (!u) throw ROLLBACK_ERR;
      return u;
    });
  } catch {
    return null;
  }
}

// Mirrors a freshly-bought/upgraded ability level onto the active participant.
export async function applyAbilityLevelToActiveParticipant(discordId: string, guildId: string, kind: AbilityKind, level: number): Promise<void> {
  const activeIds = db
    .select({ id: activeEventsTable.id })
    .from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), gt(activeEventsTable.expiresAt, new Date()), eq(activeEventsTable.guildId, guildId)));
  const setObj = kind === "empower" ? { empowerLevel: level } : { shieldLevel: level };
  await db.update(eventParticipantsTable)
    .set(setObj)
    .where(and(
      eq(eventParticipantsTable.discordId, discordId),
      eq(eventParticipantsTable.isAlive, true),
      inArray(eventParticipantsTable.eventId, activeIds),
    ));
}

export async function setHonorTitle(discordId: string, guildId: string, title: string): Promise<void> {
  await db.update(playersTable).set({ honorTitle: title }).where(playerWhere(discordId, guildId));
}

// Records a one-time final-boss hit using the unique (eventId, discordId) claim row.
export async function recordFinalBossHit(eventId: number, discordId: string): Promise<boolean> {
  try {
    const [row] = await db.insert(eventClaimsTable)
      .values({ eventId, discordId })
      .onConflictDoNothing()
      .returning();
    return !!row;
  } catch {
    return false;
  }
}

export async function addPlayerGold(discordId: string, guildId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ gold: sql`${playersTable.gold} + ${amount}` })
    .where(playerWhere(discordId, guildId));
}

export async function deductPlayerGold(discordId: string, guildId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ gold: sql`GREATEST(0, ${playersTable.gold} - ${amount})` })
    .where(playerWhere(discordId, guildId));
}

/**
 * Atomically deduct gold only if the player can afford it (WHERE gold >= amount).
 * Returns true if the deduction landed; false if the balance was insufficient
 * (e.g. a concurrent purchase already spent it).
 */
export async function tryDeductPlayerGold(discordId: string, guildId: string, amount: number): Promise<boolean> {
  const { rowCount } = await pool.query(`
    UPDATE players
    SET gold = gold - $1
    WHERE discord_id = $2
      AND guild_id   = $3
      AND gold      >= $1
  `, [amount, discordId, guildId]);
  return (rowCount ?? 0) > 0;
}

export const UPGRADE_DELTA: Record<UpgradeKey, number> = { atac: 2, def: 2, dodge: 3, crit: 2, hp: 10 };

const UPGRADE_SET: Record<UpgradeKey, Record<string, SQL>> = {
  atac: { attackBonus: sql`${playersTable.attackBonus} + ${UPGRADE_DELTA.atac}`, shopAttackCount: sql`${playersTable.shopAttackCount} + 1` },
  def: { defenseBonus: sql`${playersTable.defenseBonus} + ${UPGRADE_DELTA.def}`, shopDefenseCount: sql`${playersTable.shopDefenseCount} + 1` },
  dodge: { dodgeBonus: sql`${playersTable.dodgeBonus} + ${UPGRADE_DELTA.dodge}`, shopDodgeCount: sql`${playersTable.shopDodgeCount} + 1` },
  crit: { critBonus: sql`${playersTable.critBonus} + ${UPGRADE_DELTA.crit}`, shopCritCount: sql`${playersTable.shopCritCount} + 1` },
  hp: { maxHpBonus: sql`${playersTable.maxHpBonus} + ${UPGRADE_DELTA.hp}`, shopHpCount: sql`${playersTable.shopHpCount} + 1` },
};

const PARTICIPANT_UPGRADE_SET: Record<UpgradeKey, Record<string, SQL>> = {
  atac: { attackBonus: sql`${eventParticipantsTable.attackBonus} + ${UPGRADE_DELTA.atac}` },
  def: { defenseBonus: sql`${eventParticipantsTable.defenseBonus} + ${UPGRADE_DELTA.def}` },
  dodge: { dodgeBonus: sql`${eventParticipantsTable.dodgeBonus} + ${UPGRADE_DELTA.dodge}` },
  crit: { critBonus: sql`${eventParticipantsTable.critBonus} + ${UPGRADE_DELTA.crit}` },
  hp: {
    maxHp: sql`${eventParticipantsTable.maxHp} + ${UPGRADE_DELTA.hp}`,
    currentHp: sql`${eventParticipantsTable.currentHp} + ${UPGRADE_DELTA.hp}`,
  },
};

export async function buyPlayerUpgrade(discordId: string, guildId: string, key: UpgradeKey, cost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ gold: sql`${playersTable.gold} - ${cost}`, ...UPGRADE_SET[key] })
    .where(and(playerWhere(discordId, guildId), gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

export async function applyUpgradeToActiveParticipant(discordId: string, guildId: string, key: UpgradeKey): Promise<void> {
  const activeIds = db
    .select({ id: activeEventsTable.id })
    .from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), gt(activeEventsTable.expiresAt, new Date()), eq(activeEventsTable.guildId, guildId)));
  await db.update(eventParticipantsTable)
    .set(PARTICIPANT_UPGRADE_SET[key])
    .where(and(
      eq(eventParticipantsTable.discordId, discordId),
      eq(eventParticipantsTable.isAlive, true),
      inArray(eventParticipantsTable.eventId, activeIds),
    ));
}

// ─── Event helpers ─────────────────────────────────────────────────────────────

export async function createEvent(guildId: string, type: string, messageId: string, expiresAt: Date) {
  const [ev] = await db.insert(activeEventsTable).values({ guildId, eventType: type, messageId, expiresAt }).returning();
  return ev!;
}

export async function getActiveEvent(id: number, guildId: string) {
  const [ev] = await db.select().from(activeEventsTable)
    .where(and(eq(activeEventsTable.id, id), eq(activeEventsTable.guildId, guildId)));
  return ev ?? null;
}

export async function getLatestActiveEvent(guildId: string) {
  const all = await db.select().from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), eq(activeEventsTable.guildId, guildId)));
  const valid = all.filter((e) => e.expiresAt.getTime() > Date.now());
  return valid.sort((a, b) => b.id - a.id)[0] ?? null;
}

export async function getExpiredActiveEvents(guildId: string) {
  const all = await db.select().from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), eq(activeEventsTable.guildId, guildId)));
  return all.filter((e) => e.expiresAt.getTime() < Date.now());
}

export async function getAllEvents(guildId: string) {
  return db.select().from(activeEventsTable).where(eq(activeEventsTable.guildId, guildId));
}

export async function setEventDecreeMessage(id: number, decreeMessageId: string) {
  await db.update(activeEventsTable).set({ decreeMessageId }).where(eq(activeEventsTable.id, id));
}

export async function deleteEvent(id: number) {
  await db.delete(eventParticipantsTable).where(eq(eventParticipantsTable.eventId, id));
  await db.delete(activeEventsTable).where(eq(activeEventsTable.id, id));
}

export async function deactivateEvent(id: number) {
  await db.update(activeEventsTable).set({ isActive: false }).where(eq(activeEventsTable.id, id));
}

export async function joinEvent(guildId: string, eventId: number, discordId: string, username: string): Promise<EventParticipant | null> {
  const [existing] = await db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.discordId, discordId)));
  if (existing) return existing;
  const player = await getPlayerById(discordId, guildId);
  const clsKey = player?.class && isClassKey(player.class) ? player.class : null;
  const cls = clsKey ? classStats(clsKey, player?.classLevel ?? 1) : null;
  const comp = player?.companion && isCompanionKey(player.companion)
    ? companionStats(player.companion, player.companionLevel ?? 1)
    : null;
  const prestigeLevel = player?.prestigeLevel ?? 0;
  const startLevel = prestigeStartLevel(prestigeLevel);
  const startRarity = rollRarity(startLevel);
  const startMonsterHp = monsterSpawnHp(startLevel, startRarity, player?.bossKills);
  const maxHp = 100 + (player?.maxHpBonus ?? 0) + (player?.prestigeHpBonus ?? 0) + (cls?.hp ?? 0) + (comp?.hp ?? 0);
  try {
    const [p] = await db.insert(eventParticipantsTable).values({
      eventId,
      guildId,
      discordId,
      username,
      maxHp,
      currentHp: maxHp,
      monsterLevel: startLevel,
      monsterCurrentHp: startMonsterHp,
      monsterRarity: startRarity,
      attackBonus: (player?.attackBonus ?? 0) + (player?.prestigeAttackBonus ?? 0) + (cls?.attack ?? 0) + (comp?.attack ?? 0),
      defenseBonus: (player?.defenseBonus ?? 0) + (player?.prestigeDefenseBonus ?? 0) + (comp?.defense ?? 0),
      dodgeBonus: (player?.dodgeBonus ?? 0) + (player?.prestigeDodgeBonus ?? 0) + (cls?.dodge ?? 0),
      critBonus: (player?.critBonus ?? 0) + (player?.prestigeCritBonus ?? 0) + (cls?.crit ?? 0) + (comp?.crit ?? 0),
      empowerLevel: player?.abilityEmpowerLevel ?? 0,
      shieldLevel: player?.abilityShieldLevel ?? 0,
    }).returning();
    return p!;
  } catch { return null; }
}

export async function getParticipant(eventId: number, guildId: string, discordId: string): Promise<EventParticipant | null> {
  const [p] = await db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.guildId, guildId), eq(eventParticipantsTable.discordId, discordId)));
  return p ?? null;
}

export async function updateParticipant(id: number, values: Partial<Omit<EventParticipant, "id" | "eventId" | "discordId" | "joinedAt">>): Promise<EventParticipant> {
  const [u] = await db.update(eventParticipantsTable).set(values).where(eq(eventParticipantsTable.id, id)).returning();
  return u!;
}

export async function getEventParticipants(eventId: number, guildId: string): Promise<EventParticipant[]> {
  return db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.guildId, guildId)));
}

export async function addPlayerReputation(discordId: string, guildId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ reputation: sql`${playersTable.reputation} + ${amount}` })
    .where(playerWhere(discordId, guildId));
}

export async function addPlayerXp(discordId: string, guildId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ xp: sql`${playersTable.xp} + ${amount}` })
    .where(playerWhere(discordId, guildId));
}

export async function deductPlayerXp(discordId: string, guildId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ xp: sql`GREATEST(0, ${playersTable.xp} - ${amount})` })
    .where(playerWhere(discordId, guildId));
}

export const PRESTIGE_BASE_XP = 10_000;
export const PRESTIGE_COST_MULT = 1.5;
export const PRESTIGE_ATK_BONUS = 5;
export const PRESTIGE_DEF_BONUS = 5;
export const PRESTIGE_DODGE_BONUS = 3;
export const PRESTIGE_CRIT_BONUS = 3;
export const PRESTIGE_HP_BONUS = 20;

export function prestigeXpCost(level: number): number {
  return Math.floor(PRESTIGE_BASE_XP * Math.pow(PRESTIGE_COST_MULT, level));
}

/** Prestige levels for a set of players in a guild (missing players → not in map). */
export async function getPrestigeLevels(guildId: string, discordIds: string[]): Promise<Map<string, number>> {
  if (discordIds.length === 0) return new Map();
  const rows = await db.select({ discordId: playersTable.discordId, prestigeLevel: playersTable.prestigeLevel })
    .from(playersTable)
    .where(and(eq(playersTable.guildId, guildId), inArray(playersTable.discordId, discordIds)));
  return new Map(rows.map((r) => [r.discordId, r.prestigeLevel]));
}

export async function buyPrestige(discordId: string, guildId: string, expectedLevel: number, xpCost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      prestigeLevel: sql`${playersTable.prestigeLevel} + 1`,
      prestigeAttackBonus: sql`${playersTable.prestigeAttackBonus} + ${PRESTIGE_ATK_BONUS}`,
      prestigeDefenseBonus: sql`${playersTable.prestigeDefenseBonus} + ${PRESTIGE_DEF_BONUS}`,
      prestigeDodgeBonus: sql`${playersTable.prestigeDodgeBonus} + ${PRESTIGE_DODGE_BONUS}`,
      prestigeCritBonus: sql`${playersTable.prestigeCritBonus} + ${PRESTIGE_CRIT_BONUS}`,
      prestigeHpBonus: sql`${playersTable.prestigeHpBonus} + ${PRESTIGE_HP_BONUS}`,
      xp: sql`${playersTable.xp} - ${xpCost}`,
    })
    .where(and(
      playerWhere(discordId, guildId),
      eq(playersTable.prestigeLevel, expectedLevel),
      gte(playersTable.xp, xpCost),
    ))
    .returning();
  return u ?? null;
}

export async function getTopPlayers(guildId: string): Promise<Player[]> {
  const rows = await db.select().from(playersTable)
    .where(eq(playersTable.guildId, guildId))
    .orderBy(desc(playersTable.reputation), desc(playersTable.maxLevel))
    .limit(10);
  return rows;
}

export async function getGlobalTopPlayers(): Promise<Player[]> {
  const rows = await db.select().from(playersTable)
    .orderBy(desc(playersTable.reputation), desc(playersTable.maxLevel))
    .limit(10);
  return rows;
}

export type ServerRankRow = { guildId: string; totalReputation: number; maxEventLevel: number; playerCount: number };

export async function getServerRanking(): Promise<ServerRankRow[]> {
  const rows = await db.select({
    guildId: playersTable.guildId,
    totalReputation: sql<number>`cast(sum(${playersTable.reputation}) as int)`,
    maxEventLevel: sql<number>`cast(max(${playersTable.maxLevel}) as int)`,
    playerCount: sql<number>`cast(count(*) as int)`,
  })
  .from(playersTable)
  .groupBy(playersTable.guildId)
  .orderBy(desc(sql`sum(${playersTable.reputation})`))
  .limit(15);
  return rows;
}

// ─── Key inventory ─────────────────────────────────────────────────────────────
export type KeyType = "rar" | "epic" | "regal";

export async function getPlayerKeys(discordId: string, guildId: string): Promise<{ rar: number; epic: number; regal: number } | null> {
  const [p] = await db.select({
    keyRar: playersTable.keyRar,
    keyEpic: playersTable.keyEpic,
    keyRegal: playersTable.keyRegal,
  }).from(playersTable).where(playerWhere(discordId, guildId));
  if (!p) return null;
  return { rar: p.keyRar, epic: p.keyEpic, regal: p.keyRegal };
}

export async function addPlayerKey(discordId: string, guildId: string, keyType: KeyType): Promise<void> {
  const setObj =
    keyType === "rar"   ? { keyRar:   sql`${playersTable.keyRar}   + 1` } :
    keyType === "epic"  ? { keyEpic:  sql`${playersTable.keyEpic}  + 1` } :
                          { keyRegal: sql`${playersTable.keyRegal} + 1` };
  await db.update(playersTable).set(setObj).where(playerWhere(discordId, guildId));
}

// Returns true if a key was consumed, false if the player had none.
export async function consumePlayerKey(discordId: string, guildId: string, keyType: KeyType): Promise<boolean> {
  const col =
    keyType === "rar"   ? playersTable.keyRar   :
    keyType === "epic"  ? playersTable.keyEpic  :
                          playersTable.keyRegal;
  const setObj =
    keyType === "rar"   ? { keyRar:   sql`${playersTable.keyRar}   - 1` } :
    keyType === "epic"  ? { keyEpic:  sql`${playersTable.keyEpic}  - 1` } :
                          { keyRegal: sql`${playersTable.keyRegal} - 1` };
  const [u] = await db.update(playersTable)
    .set(setObj)
    .where(and(playerWhere(discordId, guildId), gte(col, 1)))
    .returning();
  return u != null;
}

// ─── Talisman & item helpers ───────────────────────────────────────────────────

export async function equipTalisman(discordId: string, guildId: string, talismanKey: string, level = 1): Promise<void> {
  await db.update(playersTable)
    .set({ talisman: talismanKey, talismanLevel: level })
    .where(playerWhere(discordId, guildId));
}

/**
 * Atomically upgrades talisman_level from `fromLevel` to `toLevel`, but only if
 * the given talisman is still equipped. Returns true if the row was updated
 * (this call won the race). Returns false if the level already changed OR the
 * player switched talismans concurrently (prevents the bump landing on the
 * wrong talisman).
 */
export async function tryUpgradeTalismanLevel(
  discordId: string, guildId: string, talismanKey: string, fromLevel: number, toLevel: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(`
    UPDATE players
    SET talisman_level = $1
    WHERE discord_id   = $2
      AND guild_id     = $3
      AND talisman     = $4
      AND talisman_level = $5
  `, [toLevel, discordId, guildId, talismanKey, fromLevel]);
  return (rowCount ?? 0) > 0;
}

/** All saved talisman levels for a player (rows exist for every talisman ever owned). */
export async function getPlayerTalismans(discordId: string, guildId: string): Promise<PlayerTalisman[]> {
  return db.select().from(playerTalismansTable)
    .where(and(eq(playerTalismansTable.discordId, discordId), eq(playerTalismansTable.guildId, guildId)));
}

/**
 * Persist a talisman's level (upsert). Uses GREATEST so a stale write can
 * never downgrade an already-saved higher level.
 */
export async function saveTalismanLevel(discordId: string, guildId: string, talismanKey: string, level: number): Promise<void> {
  await db.insert(playerTalismansTable)
    .values({ discordId, guildId, talismanKey, level })
    .onConflictDoUpdate({
      target: [playerTalismansTable.discordId, playerTalismansTable.guildId, playerTalismansTable.talismanKey],
      set: { level: sql`GREATEST(${playerTalismansTable.level}, ${level})` },
    });
}

export async function getPlayerItems(discordId: string, guildId: string): Promise<PlayerItem[]> {
  return db.select().from(playerItemsTable)
    .where(and(eq(playerItemsTable.discordId, discordId), eq(playerItemsTable.guildId, guildId)));
}

export async function addPlayerItem(discordId: string, guildId: string, itemKey: string, qty = 1): Promise<void> {
  await db.insert(playerItemsTable)
    .values({ discordId, guildId, itemKey, quantity: qty })
    .onConflictDoUpdate({
      target: [playerItemsTable.discordId, playerItemsTable.guildId, playerItemsTable.itemKey],
      set: { quantity: sql`${playerItemsTable.quantity} + ${qty}` },
    });
}

/**
 * Atomically deduct item costs inside a single DB transaction.
 * Returns false if the player lacks any required items (pre-check or concurrent race).
 * Each UPDATE uses WHERE quantity >= need; if 0 rows are affected the transaction rolls back.
 */
export async function consumePlayerItems(discordId: string, guildId: string, costs: Record<string, number>): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx.select().from(playerItemsTable)
        .where(and(eq(playerItemsTable.discordId, discordId), eq(playerItemsTable.guildId, guildId)));
      const inv = Object.fromEntries(rows.map((r) => [r.itemKey, r.quantity]));

      for (const [key, need] of Object.entries(costs)) {
        if ((inv[key] ?? 0) < need) return false;
      }

      const results = await Promise.all(
        Object.entries(costs).map(([key, need]) =>
          tx.update(playerItemsTable)
            .set({ quantity: sql`${playerItemsTable.quantity} - ${need}` })
            .where(and(
              eq(playerItemsTable.discordId, discordId),
              eq(playerItemsTable.guildId, guildId),
              eq(playerItemsTable.itemKey, key),
              gte(playerItemsTable.quantity, need),
            ))
            .returning({ id: playerItemsTable.discordId })
        )
      );

      // If any UPDATE hit 0 rows a concurrent deduction raced us — abort
      if (results.some((r) => r.length === 0)) return false;

      return true;
    });
  } catch {
    return false;
  }
}

// ─── Daily quest helpers ───────────────────────────────────────────────────────

export type { PlayerDailyQuest };

export function todayDateUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the player's current daily quest row, or null if none exists. */
export async function getDailyQuestProgress(
  discordId: string, guildId: string, questKey: string,
): Promise<PlayerDailyQuest | null> {
  const [row] = await db.select().from(playerDailyQuestsTable)
    .where(and(
      eq(playerDailyQuestsTable.discordId, discordId),
      eq(playerDailyQuestsTable.guildId, guildId),
      eq(playerDailyQuestsTable.questKey, questKey),
    ));
  return row ?? null;
}

/**
 * Atomically increment progress for any daily quest.
 * Resets automatically if the stored date differs from today (UTC).
 * Returns { newProgress, justCompleted }:
 *   justCompleted = true only on the single call that flips reward_given from false to true.
 */
export async function incrementDailyQuest(
  discordId: string, guildId: string, questKey: string, target: number,
): Promise<{ newProgress: number; justCompleted: boolean }> {
  const today = todayDateUTC();

  // Step 1: Atomically upsert progress (handles reset on new day, completed guard)
  const { rows } = await pool.query<{ progress: number; completed: boolean }>(`
    INSERT INTO player_daily_quests
      (discord_id, guild_id, quest_key, quest_date, progress, completed, reward_given)
    VALUES ($1, $2, $5, $3, 1, ($4 <= 1), false)
    ON CONFLICT (discord_id, guild_id, quest_key) DO UPDATE SET
      quest_date   = EXCLUDED.quest_date,
      progress     = CASE
        WHEN player_daily_quests.completed = true  AND player_daily_quests.quest_date = $3 THEN player_daily_quests.progress
        WHEN player_daily_quests.quest_date != $3                                           THEN 1
        ELSE player_daily_quests.progress + 1
      END,
      completed    = CASE
        WHEN player_daily_quests.completed = true  AND player_daily_quests.quest_date = $3 THEN true
        WHEN player_daily_quests.quest_date != $3                                           THEN ($4 <= 1)
        ELSE (player_daily_quests.progress + 1 >= $4)
      END,
      reward_given = CASE
        WHEN player_daily_quests.quest_date != $3 THEN false
        ELSE player_daily_quests.reward_given
      END
    RETURNING progress, completed
  `, [discordId, guildId, today, target, questKey]);

  const row = rows[0]!;
  if (!row.completed) return { newProgress: row.progress, justCompleted: false };

  // Step 2: Atomically claim reward — only the first call to reach completion wins
  const { rowCount } = await pool.query(`
    UPDATE player_daily_quests
    SET reward_given = true
    WHERE discord_id = $1
      AND guild_id   = $2
      AND quest_key  = $4
      AND quest_date = $3
      AND completed  = true
      AND reward_given = false
  `, [discordId, guildId, today, questKey]);

  return { newProgress: row.progress, justCompleted: (rowCount ?? 0) > 0 };
}

/** Back-compat wrapper for the original kill quest. */
export async function incrementDailyQuestKill(
  discordId: string, guildId: string,
): Promise<{ newProgress: number; justCompleted: boolean }> {
  return incrementDailyQuest(discordId, guildId, "kill_10", 10);
}

/** All daily quest rows for a player (any quest key). */
export async function getDailyQuestRows(
  discordId: string, guildId: string,
): Promise<PlayerDailyQuest[]> {
  return db.select().from(playerDailyQuestsTable)
    .where(and(
      eq(playerDailyQuestsTable.discordId, discordId),
      eq(playerDailyQuestsTable.guildId, guildId),
    ));
}

// ─── Active boss persistence ───────────────────────────────────────────────────

export async function createActiveBossesTableIfNotExists(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_bosses (
      event_id   bigint      NOT NULL,
      guild_id   text        NOT NULL DEFAULT '1382035307607883816',
      state_json text        NOT NULL,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (event_id, guild_id)
    )
  `);
}

export async function createBotStateTableIfNotExists(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key        text        PRIMARY KEY,
      value      text        NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

let botStateTableReady: Promise<void> | null = null;
export function ensureBotStateTable(): Promise<void> {
  if (!botStateTableReady) {
    botStateTableReady = createBotStateTableIfNotExists().catch((err) => {
      botStateTableReady = null;
      throw err;
    });
  }
  return botStateTableReady;
}

// Upsert the serialized boss state.
export async function persistActiveBoss(eventId: number, guildId: string, stateJson: string, expiresAt: Date): Promise<void> {
  const now = new Date();
  await db.insert(activeBossesTable)
    .values({ eventId, guildId, stateJson, expiresAt, updatedAt: now })
    .onConflictDoUpdate({
      target: [activeBossesTable.eventId, activeBossesTable.guildId],
      set: { stateJson, expiresAt, updatedAt: now },
    });
}

// Load all persisted boss rows — used on startup to rehydrate activeBossMap.
export async function loadAllActiveBossRows(): Promise<ActiveBossRow[]> {
  return db.select().from(activeBossesTable);
}

// Load boss rows for a single guild — used for per-guild startup rehydration.
export async function loadActiveBossRowsByGuild(guildId: string): Promise<ActiveBossRow[]> {
  return db.select().from(activeBossesTable).where(eq(activeBossesTable.guildId, guildId));
}

// Remove a row once a boss is defeated or flees.
export async function deleteActiveBoss(eventId: number, guildId: string): Promise<void> {
  await db.delete(activeBossesTable).where(and(eq(activeBossesTable.eventId, eventId), eq(activeBossesTable.guildId, guildId)));
}

// ─── Bot state key helpers ─────────────────────────────────────────────────────

/** Prefix a bot_state key with guildId for isolation. */
function guildKey(guildId: string, key: string): string {
  return `${guildId}:${key}`;
}

// ─── Bot instance leadership marker (global — not per-guild) ──────────────────
// Last writer wins: each bot process claims this key once at startup. A running
// instance that later sees a DIFFERENT id in the row knows a newer instance has
// taken over (e.g. after a redeploy) and must shut its bot down to avoid two
// gateway sessions racing to acknowledge the same interactions (40060/10062).
const BOT_INSTANCE_KEY = "bot_instance";

export async function claimBotInstance(instanceId: string): Promise<void> {
  await ensureBotStateTable();
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key: BOT_INSTANCE_KEY, value: instanceId })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: instanceId, updatedAt: now },
    });
}

export async function getBotInstanceHolder(): Promise<string | null> {
  await ensureBotStateTable();
  const [row] = await db
    .select()
    .from(botStateTable)
    .where(eq(botStateTable.key, BOT_INSTANCE_KEY));
  return row?.value ?? null;
}

// ─── Oracle fallback marker (global — not per-guild) ──────────────────────────
const ORACLE_FELLBACK_KEY = "oracle_fellback";

export async function recordOracleFellBack(): Promise<void> {
  await ensureBotStateTable();
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key: ORACLE_FELLBACK_KEY, value: now.toISOString() })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: now.toISOString(), updatedAt: now },
    });
}

export async function consumeOracleFellBack(): Promise<boolean> {
  await ensureBotStateTable();
  const [deleted] = await db
    .delete(botStateTable)
    .where(eq(botStateTable.key, ORACLE_FELLBACK_KEY))
    .returning();
  return deleted != null;
}

// ─── Active chest persistence ──────────────────────────────────────────────────

/** DB key suffixes for each chest variant — combined with guildId prefix. */
export const CHEST_DBKEY     = "active_chest";
export const KEYCHEST_DBKEY  = "active_keychest";
export const LOCKCHEST_DBKEY = "active_lockchest";

export interface ActiveChestRecord {
  messageId: string;
  channelId: string;
  chestId: string;
  gold: number;
  rarityKey: string;
  /** Admin-forced multiplier (×2/×3). Absent for scheduler chests. */
  mult?: 2 | 3;
  /** Expiry epoch ms — when the chest button should be disabled. */
  expiresAt: number;
  /** Chest variant — drives expiry label and embed choice during rehydration. */
  kind?: "chest" | "keychest" | "lockchest";
  /** Key type for key-chest records (e.g. "rar", "epic", "regal"). */
  keyType?: string;
}

// ─── Final-boss veteran kills (per-guild) ─────────────────────────────────────
// Counts how many times the guild has defeated the shared final boss (event or
// standalone). Drives the boss's veteran rank: +20% HP and damage per rank.
const FINAL_BOSS_KILLS_KEY = "final_boss_kills";

export async function getFinalBossKills(guildId: string): Promise<number> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, guildKey(guildId, FINAL_BOSS_KILLS_KEY)));
  const n = row ? parseInt(row.value, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function incrementFinalBossKills(guildId: string): Promise<void> {
  await ensureBotStateTable();
  const key = guildKey(guildId, FINAL_BOSS_KILLS_KEY);
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at) VALUES ($1, '1', now())
     ON CONFLICT (key) DO UPDATE
     SET value = (COALESCE(NULLIF(regexp_replace(bot_state.value, '\\D', '', 'g'), ''), '0')::int + 1)::text,
         updated_at = now()`,
    [key],
  );
}

// ─── Trader message ID persistence ────────────────────────────────────────────
const TRADER_MESSAGE_KEY = "trader_message_id";

export async function saveTraderMessageId(guildId: string, messageId: string): Promise<void> {
  await ensureBotStateTable();
  const key = guildKey(guildId, TRADER_MESSAGE_KEY);
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key, value: messageId })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: messageId, updatedAt: now },
    });
}

export async function loadTraderMessageId(guildId: string): Promise<string | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, guildKey(guildId, TRADER_MESSAGE_KEY)));
  return row?.value ?? null;
}

export async function clearTraderMessageId(guildId: string): Promise<void> {
  await ensureBotStateTable();
  await db.delete(botStateTable).where(eq(botStateTable.key, guildKey(guildId, TRADER_MESSAGE_KEY)));
}

const TRADER_EMBED_SIG_KEY = "trader_embed_sig";

export async function saveTraderEmbedSig(guildId: string, sig: string): Promise<void> {
  await ensureBotStateTable();
  const key = guildKey(guildId, TRADER_EMBED_SIG_KEY);
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key, value: sig })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: sig, updatedAt: now },
    });
}

export async function loadTraderEmbedSig(guildId: string): Promise<string | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, guildKey(guildId, TRADER_EMBED_SIG_KEY)));
  return row?.value ?? null;
}

export async function persistActiveChest(guildId: string, record: ActiveChestRecord, dbKey = CHEST_DBKEY): Promise<void> {
  await ensureBotStateTable();
  const key = guildKey(guildId, dbKey);
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key, value: JSON.stringify(record) })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: JSON.stringify(record), updatedAt: now },
    });
}

export async function loadActiveChest(guildId: string, dbKey = CHEST_DBKEY): Promise<ActiveChestRecord | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, guildKey(guildId, dbKey)));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ActiveChestRecord;
  } catch {
    return null;
  }
}

export async function clearActiveChest(guildId: string, dbKey = CHEST_DBKEY): Promise<void> {
  await ensureBotStateTable();
  await db.delete(botStateTable).where(eq(botStateTable.key, guildKey(guildId, dbKey)));
}

// ─── Channel configuration persistence ────────────────────────────────────────
const CHANNEL_CONFIG_KEY = "channel_config";

export interface ChannelConfig {
  main?: string;
  event?: string;
  boss?: string;
  trader?: string;
  eventTop?: string;
  bossTop?: string;
}

export async function saveChannelConfig(guildId: string, config: ChannelConfig): Promise<void> {
  await ensureBotStateTable();
  const key = guildKey(guildId, CHANNEL_CONFIG_KEY);
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key, value: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: JSON.stringify(config), updatedAt: now },
    });
}

export async function loadChannelConfig(guildId: string): Promise<ChannelConfig | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, guildKey(guildId, CHANNEL_CONFIG_KEY)));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ChannelConfig;
  } catch {
    return null;
  }
}
