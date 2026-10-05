import { PermissionFlagsBits, type GuildMember, type Role } from "discord.js";
import { pool } from "@workspace/db";
import { ensureBotStateTable } from "./db";
import { logger } from "../lib/logger";
import {
  ACTIVITY_CHAT_XP,
  ACTIVITY_ROLE_MILESTONES,
  ACTIVITY_VOICE_XP,
  DEFAULT_ACTIVITY_RANK_CONFIG,
  getUtcActivityPeriods,
  normalizeActivityRankConfig,
  type ActivityRankConfig,
} from "./activity-ranks-core";

export type { ActivityRankConfig } from "./activity-ranks-core";
export { DEFAULT_ACTIVITY_RANK_CONFIG, normalizeActivityRankConfig } from "./activity-ranks-core";

export interface ActivityRankRecord {
  totalXp: number;
}

export interface ActivityLeaderboardEntry extends ActivityRankRecord {
  discordId: string;
  monthlyXp: number;
}

export interface ActivityXpAward {
  totalXp: number;
  previousXp: number;
}

const ACTIVITY_RANKS_CONFIG_KEY = "activity_ranks_config";
const ACTIVITY_RANK_ROLES_KEY = "activity_ranks_role_ids";
const CONFIG_CACHE_TTL_MS = 15_000;

let activityRanksTableReady: Promise<void> | null = null;
const configCache = new Map<string, { config: ActivityRankConfig; expiresAt: number }>();
const pendingConfigLoads = new Map<string, Promise<ActivityRankConfig>>();

export function ensureActivityRanksTable(): Promise<void> {
  if (!activityRanksTableReady) {
    activityRanksTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_ranks (
          guild_id text NOT NULL,
          discord_id text NOT NULL,
          total_xp integer NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
          daily_key text NOT NULL,
          daily_xp integer NOT NULL DEFAULT 0,
          daily_chat_xp integer NOT NULL DEFAULT 0,
          daily_voice_xp integer NOT NULL DEFAULT 0,
          month_key text NOT NULL,
          monthly_xp integer NOT NULL DEFAULT 0,
          last_chat_award_at timestamptz,
          last_voice_award_at timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (guild_id, discord_id)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS activity_ranks_monthly_idx
        ON activity_ranks (guild_id, month_key, monthly_xp DESC)
      `);
    })().catch((error: unknown) => {
      activityRanksTableReady = null;
      throw error;
    });
  }
  return activityRanksTableReady;
}

function activityConfigKey(guildId: string): string {
  return `${guildId}:${ACTIVITY_RANKS_CONFIG_KEY}`;
}

export async function getActivityRankConfig(guildId: string): Promise<ActivityRankConfig> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.config };

  const pending = pendingConfigLoads.get(guildId);
  if (pending) return pending;

  const load = (async () => {
    await ensureBotStateTable();
    const result = await pool.query<{ value: string }>(
      "SELECT value FROM bot_state WHERE key = $1",
      [activityConfigKey(guildId)],
    );
    let config = DEFAULT_ACTIVITY_RANK_CONFIG;
    try {
      if (result.rows[0]?.value) config = normalizeActivityRankConfig(JSON.parse(result.rows[0].value));
    } catch {
      config = DEFAULT_ACTIVITY_RANK_CONFIG;
    }
    configCache.set(guildId, { config, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return { ...config };
  })();
  pendingConfigLoads.set(guildId, load);
  try {
    return await load;
  } finally {
    if (pendingConfigLoads.get(guildId) === load) pendingConfigLoads.delete(guildId);
  }
}

export async function saveActivityRankConfig(guildId: string, value: unknown): Promise<ActivityRankConfig> {
  const config = normalizeActivityRankConfig(value);
  await ensureBotStateTable();
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [activityConfigKey(guildId), JSON.stringify(config)],
  );
  configCache.set(guildId, { config, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
  return { ...config };
}

export async function awardActivityXp(
  guildId: string,
  discordId: string,
  source: "chat" | "voice",
  now = new Date(),
): Promise<ActivityXpAward | null> {
  await ensureActivityRanksTable();
  const { dayKey, monthKey } = getUtcActivityPeriods(now);
  const xp = source === "chat" ? ACTIVITY_CHAT_XP : ACTIVITY_VOICE_XP;
  const lastAwardColumn = source === "chat" ? "last_chat_award_at" : "last_voice_award_at";
  const cooldown = source === "chat" ? "30 seconds" : "50 seconds";

  const result = await pool.query<{ total_xp: number }>(
    `INSERT INTO activity_ranks (
       guild_id, discord_id, total_xp, daily_key, daily_xp,
       daily_chat_xp, daily_voice_xp, month_key, monthly_xp,
       last_chat_award_at, last_voice_award_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $3,
       CASE WHEN $6 = 'chat' THEN $3 ELSE 0 END,
       CASE WHEN $6 = 'voice' THEN $3 ELSE 0 END,
       $5, $3,
        CASE WHEN $6 = 'chat' THEN $7::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'voice' THEN $7::timestamptz ELSE NULL END,
        $7
     )
     ON CONFLICT (guild_id, discord_id) DO UPDATE
     SET total_xp = activity_ranks.total_xp + $3,
         daily_key = $4,
         daily_xp = CASE
           WHEN activity_ranks.daily_key = $4 THEN activity_ranks.daily_xp + $3
           ELSE $3
         END,
         daily_chat_xp = CASE
           WHEN activity_ranks.daily_key = $4 THEN
             activity_ranks.daily_chat_xp + CASE WHEN $6 = 'chat' THEN $3 ELSE 0 END
           ELSE CASE WHEN $6 = 'chat' THEN $3 ELSE 0 END
         END,
         daily_voice_xp = CASE
           WHEN activity_ranks.daily_key = $4 THEN
             activity_ranks.daily_voice_xp + CASE WHEN $6 = 'voice' THEN $3 ELSE 0 END
           ELSE CASE WHEN $6 = 'voice' THEN $3 ELSE 0 END
         END,
         month_key = $5,
         monthly_xp = CASE
           WHEN activity_ranks.month_key = $5 THEN activity_ranks.monthly_xp + $3
           ELSE $3
         END,
         last_chat_award_at = CASE WHEN $6 = 'chat' THEN $7 ELSE activity_ranks.last_chat_award_at END,
         last_voice_award_at = CASE WHEN $6 = 'voice' THEN $7 ELSE activity_ranks.last_voice_award_at END,
         updated_at = now()
     WHERE (
         activity_ranks.${lastAwardColumn} IS NULL
         OR activity_ranks.${lastAwardColumn} <= $7::timestamptz - interval '${cooldown}'
       )
     RETURNING total_xp`,
    [
      guildId,
      discordId,
      xp,
      dayKey,
      monthKey,
      source,
      now,
    ],
  );
  const totalXp = result.rows[0]?.total_xp;
  if (typeof totalXp !== "number") return null;
  return { totalXp, previousXp: totalXp - xp };
}

export async function getActivityRank(guildId: string, discordId: string): Promise<ActivityRankRecord> {
  await ensureActivityRanksTable();
  const result = await pool.query<{ total_xp: number }>(
    "SELECT total_xp FROM activity_ranks WHERE guild_id = $1 AND discord_id = $2",
    [guildId, discordId],
  );
  return { totalXp: result.rows[0]?.total_xp ?? 0 };
}

export async function getActivityLeaderboard(
  guildId: string,
  monthKey: string,
  limit = 10,
): Promise<ActivityLeaderboardEntry[]> {
  await ensureActivityRanksTable();
  const result = await pool.query<{ discord_id: string; total_xp: number; monthly_xp: number }>(
    `SELECT discord_id, total_xp, monthly_xp
     FROM activity_ranks
     WHERE guild_id = $1 AND month_key = $2 AND monthly_xp > 0
     ORDER BY monthly_xp DESC, total_xp DESC, discord_id ASC
     LIMIT $3`,
    [guildId, monthKey, Math.min(25, Math.max(1, Math.floor(limit)))],
  );
  return result.rows.map((row) => ({
    discordId: row.discord_id,
    totalXp: row.total_xp,
    monthlyXp: row.monthly_xp,
  }));
}

interface StoredActivityRoleIds {
  "5"?: string;
  "10"?: string;
  "20"?: string;
}

function activityRoleKey(guildId: string): string {
  return `${guildId}:${ACTIVITY_RANK_ROLES_KEY}`;
}

async function loadActivityRoleIds(guildId: string): Promise<StoredActivityRoleIds> {
  await ensureBotStateTable();
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM bot_state WHERE key = $1",
    [activityRoleKey(guildId)],
  );
  try {
    const value = JSON.parse(result.rows[0]?.value ?? "{}") as Record<string, unknown>;
    return {
      "5": typeof value["5"] === "string" ? value["5"] : undefined,
      "10": typeof value["10"] === "string" ? value["10"] : undefined,
      "20": typeof value["20"] === "string" ? value["20"] : undefined,
    };
  } catch {
    return {};
  }
}

async function saveActivityRoleIds(guildId: string, roleIds: StoredActivityRoleIds): Promise<void> {
  await ensureBotStateTable();
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [activityRoleKey(guildId), JSON.stringify(roleIds)],
  );
}

export async function syncActivityMilestoneRole(member: GuildMember, level: number): Promise<void> {
  const milestone = [...ACTIVITY_ROLE_MILESTONES].reverse().find((candidate) => level >= candidate);
  if (!milestone) return;

  const botMember = member.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn({ guildId: member.guild.id, userId: member.id }, "Activity milestone role skipped: bot lacks Manage Roles");
    return;
  }

  const roleIds = await loadActivityRoleIds(member.guild.id);
  const roleName = `Oracolul · Rang Activitate ${milestone}`;
  let role: Role | undefined;
  const savedRoleId = roleIds[String(milestone) as keyof StoredActivityRoleIds];
  if (savedRoleId) {
    role = member.guild.roles.cache.get(savedRoleId);
    if (!role) role = (await member.guild.roles.fetch(savedRoleId).catch(() => null)) ?? undefined;
  }

  if (!role) {
    role = member.guild.roles.cache.find((candidate) => candidate.name === roleName);
  }
  if (!role) {
    const colors: Record<number, number> = { 5: 0xb87443, 10: 0x8b5cf6, 20: 0xd6a84f };
    role = await member.guild.roles.create({
      name: roleName,
      color: colors[milestone],
      hoist: false,
      mentionable: false,
      reason: "Rol decorativ pentru pragul de rang de activitate",
    });
  }

  if (role.position >= botMember.roles.highest.position) {
    logger.warn(
      { guildId: member.guild.id, roleId: role.id, userId: member.id },
      "Activity milestone role skipped: role is above the bot's highest role",
    );
    return;
  }

  if (roleIds[String(milestone) as keyof StoredActivityRoleIds] !== role.id) {
    roleIds[String(milestone) as keyof StoredActivityRoleIds] = role.id;
    await saveActivityRoleIds(member.guild.id, roleIds);
  }

  const managedRoleIds = Object.values(roleIds).filter((id): id is string => Boolean(id));
  const oldRoleIds = managedRoleIds.filter((id) => id !== role!.id && member.roles.cache.has(id));
  if (oldRoleIds.length) {
    await member.roles.remove(oldRoleIds, "Rol de rang de activitate înlocuit de un prag superior");
  }
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Prag decorativ de rang de activitate atins");
  }
}
