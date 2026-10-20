import type { Client, Guild, GuildMember } from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  loadInviteTrackingConfig,
  loadVerificationConfig,
  normalizeInviteRecruitmentConfig,
  type InviteRecruitmentConfig,
} from "./db";
import { normalizeVerificationConfig } from "./verification";

const RECRUITMENT_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS discord_recruitment_invite_creations (
    id bigserial PRIMARY KEY,
    guild_id text NOT NULL,
    recruiter_id text NOT NULL,
    recruiter_display_name text NOT NULL,
    invite_code text,
    channel_id text NOT NULL,
    max_uses integer NOT NULL,
    max_age_seconds integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    status text NOT NULL DEFAULT 'creating'
  );
  CREATE UNIQUE INDEX IF NOT EXISTS discord_recruitment_invite_code_uq
    ON discord_recruitment_invite_creations (guild_id, invite_code)
    WHERE invite_code IS NOT NULL;
  CREATE INDEX IF NOT EXISTS discord_recruitment_invite_created_idx
    ON discord_recruitment_invite_creations (guild_id, recruiter_id, created_at);
  CREATE TABLE IF NOT EXISTS discord_recruitment_referrals (
    guild_id text NOT NULL,
    invitee_id text NOT NULL,
    inviter_id text NOT NULL,
    inviter_display_name text NOT NULL,
    invitee_display_name text NOT NULL,
    invite_code text NOT NULL,
    joined_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verified_at timestamptz,
    points_awarded integer NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, invitee_id)
  );
  CREATE INDEX IF NOT EXISTS discord_recruitment_referrals_inviter_idx
    ON discord_recruitment_referrals (guild_id, inviter_id, status, verified_at);
  CREATE TABLE IF NOT EXISTS discord_recruitment_scores (
    guild_id text NOT NULL,
    recruiter_id text NOT NULL,
    recruiter_display_name text NOT NULL,
    verified_invites integer NOT NULL DEFAULT 0,
    points integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, recruiter_id)
  );
`;

let tablesReady: Promise<void> | null = null;

export async function ensureInviteRecruitmentTables(): Promise<void> {
  tablesReady ??= pool.query(RECRUITMENT_TABLES_SQL).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  await tablesReady;
}

export interface RecruitmentInviteReservation {
  id: number;
}

export class RecruitmentInviteLimitError extends Error {
  constructor() {
    super("Ai atins limita zilnică de invitații noi.");
    this.name = "RecruitmentInviteLimitError";
  }
}

export async function reserveRecruitmentInviteCreation(input: {
  guildId: string;
  recruiterId: string;
  recruiterDisplayName: string;
  channelId: string;
  maxUses: number;
  maxAgeSeconds: number;
  dailyLimit: number;
}): Promise<RecruitmentInviteReservation> {
  await ensureInviteRecruitmentTables();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [input.guildId, input.recruiterId],
    );
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM discord_recruitment_invite_creations
        WHERE guild_id = $1
          AND recruiter_id = $2
          AND created_at > now() - interval '24 hours'
          AND (
            status IN ('created', 'deleted')
            OR (status = 'creating' AND created_at > now() - interval '5 minutes')
          )`,
      [input.guildId, input.recruiterId],
    );
    if (Number(count.rows[0]?.count ?? 0) >= input.dailyLimit) {
      await client.query("ROLLBACK");
      throw new RecruitmentInviteLimitError();
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO discord_recruitment_invite_creations
         (guild_id, recruiter_id, recruiter_display_name, channel_id, max_uses, max_age_seconds)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::text`,
      [
        input.guildId,
        input.recruiterId,
        input.recruiterDisplayName,
        input.channelId,
        input.maxUses,
        input.maxAgeSeconds,
      ],
    );
    await client.query("COMMIT");
    return { id: Number(inserted.rows[0]!.id) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function finishRecruitmentInviteCreation(input: {
  id: number;
  inviteCode: string;
  expiresAt: Date | null;
}): Promise<void> {
  await ensureInviteRecruitmentTables();
  await pool.query(
    `UPDATE discord_recruitment_invite_creations
        SET invite_code = $2,
            expires_at = $3,
            status = 'created'
      WHERE id = $1 AND status = 'creating'`,
    [input.id, input.inviteCode, input.expiresAt],
  );
}

export async function failRecruitmentInviteCreation(id: number): Promise<void> {
  await ensureInviteRecruitmentTables();
  await pool.query(
    `UPDATE discord_recruitment_invite_creations
        SET status = 'failed'
      WHERE id = $1 AND status = 'creating'`,
    [id],
  );
}

export async function markRecruitmentInviteDeleted(guildId: string, inviteCode: string): Promise<void> {
  await ensureInviteRecruitmentTables();
  await pool.query(
    `UPDATE discord_recruitment_invite_creations
        SET status = 'deleted'
      WHERE guild_id = $1 AND invite_code = $2 AND status = 'created'`,
    [guildId, inviteCode],
  );
}

export interface RecruitmentInviteOwner {
  recruiterId: string;
  recruiterDisplayName: string;
}

export async function getRecruitmentInviteOwners(
  guildId: string,
  inviteCodes: string[],
): Promise<Map<string, RecruitmentInviteOwner>> {
  if (inviteCodes.length === 0) return new Map();
  await ensureInviteRecruitmentTables();
  const result = await pool.query<{
    invite_code: string;
    recruiter_id: string;
    recruiter_display_name: string;
  }>(
    `SELECT invite_code, recruiter_id, recruiter_display_name
       FROM discord_recruitment_invite_creations
      WHERE guild_id = $1
        AND invite_code = ANY($2::text[])
        AND status IN ('created', 'deleted')`,
    [guildId, inviteCodes],
  );
  return new Map(result.rows.map((row) => [
    row.invite_code,
    { recruiterId: row.recruiter_id, recruiterDisplayName: row.recruiter_display_name },
  ]));
}

export interface RecruitmentAttributionCandidate {
  inviteeId: string;
  inviteeDisplayName: string;
  inviteCode: string | null;
  joinedAt: Date;
}

export async function recordRecruitmentAttributions(
  guildId: string,
  candidates: RecruitmentAttributionCandidate[],
  verificationHours: number,
): Promise<number> {
  const attributable = candidates.filter((candidate): candidate is RecruitmentAttributionCandidate & { inviteCode: string } =>
    Boolean(candidate.inviteCode),
  );
  if (!attributable.length) return 0;
  const owners = await getRecruitmentInviteOwners(guildId, [...new Set(attributable.map((candidate) => candidate.inviteCode))]);
  const client = await pool.connect();
  let insertedCount = 0;
  try {
    await client.query("BEGIN");
    for (const candidate of attributable) {
      const owner = owners.get(candidate.inviteCode);
      if (!owner || owner.recruiterId === candidate.inviteeId) continue;
      const expiresAt = new Date(candidate.joinedAt.getTime() + verificationHours * 60 * 60 * 1_000);
      const inserted = await client.query(
        `INSERT INTO discord_recruitment_referrals
           (guild_id, invitee_id, inviter_id, inviter_display_name, invitee_display_name,
            invite_code, joined_at, expires_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
          WHERE EXISTS (
            SELECT 1 FROM discord_recruitment_invite_creations
             WHERE guild_id = $1 AND invite_code = $6
               AND status IN ('created', 'deleted')
               AND (expires_at IS NULL OR expires_at > $7)
          )
         ON CONFLICT (guild_id, invitee_id) DO NOTHING`,
        [
          guildId,
          candidate.inviteeId,
          owner.recruiterId,
          owner.recruiterDisplayName,
          candidate.inviteeDisplayName,
          candidate.inviteCode,
          candidate.joinedAt,
          expiresAt,
        ],
      );
      insertedCount += inserted.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return insertedCount;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getRecruitmentVerifiedCount(guildId: string, recruiterId: string): Promise<number> {
  await ensureInviteRecruitmentTables();
  const result = await pool.query<{ verified_invites: number }>(
    `SELECT verified_invites
       FROM discord_recruitment_scores
      WHERE guild_id = $1 AND recruiter_id = $2`,
    [guildId, recruiterId],
  );
  return Number(result.rows[0]?.verified_invites ?? 0);
}

export async function syncRecruiterMilestoneRoles(
  guild: Guild,
  recruiterId: string,
  configValue: InviteRecruitmentConfig,
  verifiedInviteCount?: number,
): Promise<void> {
  const config = normalizeInviteRecruitmentConfig(configValue);
  const count = verifiedInviteCount ?? await getRecruitmentVerifiedCount(guild.id, recruiterId);
  const eligibleRoles = config.milestones
    .filter((milestone) => milestone.roleId && count >= milestone.requiredInvites)
    .map((milestone) => milestone.roleId);
  if (eligibleRoles.length === 0) return;

  try {
    const member = await guild.members.fetch(recruiterId);
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    if (!botMember.permissions.has("ManageRoles")) {
      logger.warn({ guildId: guild.id, recruiterId }, "Recruiter milestone roles skipped: bot lacks Manage Roles");
      return;
    }
    for (const roleId of eligibleRoles) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.managed || role.position >= botMember.roles.highest.position) {
        logger.warn({ guildId: guild.id, recruiterId, roleId }, "Recruiter milestone role is missing or above the bot");
        continue;
      }
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, "Prag de recrutare verificată atins");
      }
    }
  } catch (error) {
    logger.warn({ error, guildId: guild.id, recruiterId }, "Could not synchronize recruiter milestone roles");
  }
}

export async function completeRecruitmentReferral(
  client: Client,
  guildId: string,
  inviteeId: string,
): Promise<{ recruiterId: string; verifiedInvites: number; points: number } | null> {
  const inviteConfig = await loadInviteTrackingConfig(guildId);
  const recruitment = normalizeInviteRecruitmentConfig(inviteConfig.recruitment);
  if (!recruitment.enabled) return null;

  const verification = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  if (!verification.enabled || !verification.roleId) return null;
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch({ guild: guildId, force: true });
  const invitee = await guild.members.fetch(inviteeId);
  if (!invitee.roles.cache.has(verification.roleId)) return null;

  await ensureInviteRecruitmentTables();
  const dbClient = await pool.connect();
  let result: { recruiterId: string; verifiedInvites: number; points: number } | null = null;
  try {
    await dbClient.query("BEGIN");
    const referral = await dbClient.query<{
      inviter_id: string;
      inviter_display_name: string;
    }>(
      `UPDATE discord_recruitment_referrals
          SET status = 'verified',
              verified_at = now(),
              invitee_display_name = $3,
              points_awarded = $4
        WHERE guild_id = $1
          AND invitee_id = $2
          AND status = 'pending'
          AND expires_at > now()
        RETURNING inviter_id, inviter_display_name`,
      [guildId, inviteeId, invitee.displayName, recruitment.rewardPoints],
    );
    const referralRow = referral.rows[0];
    if (!referralRow) {
      await dbClient.query(
        `UPDATE discord_recruitment_referrals
            SET status = 'expired'
          WHERE guild_id = $1 AND invitee_id = $2
            AND status = 'pending' AND expires_at <= now()`,
        [guildId, inviteeId],
      );
      await dbClient.query("COMMIT");
      return null;
    }

    const score = await dbClient.query<{ verified_invites: number; points: number }>(
      `INSERT INTO discord_recruitment_scores
         (guild_id, recruiter_id, recruiter_display_name, verified_invites, points, updated_at)
       VALUES ($1, $2, $3, 1, $4, now())
       ON CONFLICT (guild_id, recruiter_id) DO UPDATE
         SET recruiter_display_name = EXCLUDED.recruiter_display_name,
             verified_invites = discord_recruitment_scores.verified_invites + 1,
             points = discord_recruitment_scores.points + EXCLUDED.points,
             updated_at = now()
       RETURNING verified_invites, points`,
      [guildId, referralRow.inviter_id, referralRow.inviter_display_name, recruitment.rewardPoints],
    );
    const scoreRow = score.rows[0]!;
    result = {
      recruiterId: referralRow.inviter_id,
      verifiedInvites: Number(scoreRow.verified_invites),
      points: Number(scoreRow.points),
    };
    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    dbClient.release();
  }

  if (result) await syncRecruiterMilestoneRoles(guild, result.recruiterId, recruitment, result.verifiedInvites);
  return result;
}

export interface RecruitmentLeaderboardEntry {
  rank: number;
  displayName: string;
  verifiedInviteCount: number;
  points: number;
}

export interface RecruitmentViewer {
  displayName: string;
  createdInviteCount: number;
  verifiedInviteCount: number;
  points: number;
  invitees: Array<{ displayName: string; verifiedAt: string }>;
}

export async function getRecruitmentDashboardData(
  guildId: string,
  viewerId: string,
  viewerDisplayName: string,
): Promise<{ leaderboard: RecruitmentLeaderboardEntry[]; viewer: RecruitmentViewer }> {
  await ensureInviteRecruitmentTables();
  const leaderboardResult = await pool.query<{
    recruiter_display_name: string;
    verified_invites: number;
    points: number;
  }>(
    `SELECT recruiter_display_name, verified_invites, points
       FROM discord_recruitment_scores
      WHERE guild_id = $1 AND verified_invites > 0
      ORDER BY verified_invites DESC, points DESC, lower(recruiter_display_name) ASC
      LIMIT 10`,
    [guildId],
  );
  const leaderboard = leaderboardResult.rows.map((row, index) => ({
    rank: index + 1,
    displayName: row.recruiter_display_name,
    verifiedInviteCount: Number(row.verified_invites),
    points: Number(row.points),
  }));

  const [score, linkCount, invitees] = await Promise.all([
    pool.query<{ verified_invites: number; points: number; recruiter_display_name: string }>(
      `SELECT verified_invites, points, recruiter_display_name
         FROM discord_recruitment_scores
        WHERE guild_id = $1 AND recruiter_id = $2`,
      [guildId, viewerId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM discord_recruitment_invite_creations
        WHERE guild_id = $1 AND recruiter_id = $2 AND status IN ('created', 'deleted')`,
      [guildId, viewerId],
    ),
    pool.query<{ invitee_display_name: string; verified_at: Date }>(
      `SELECT invitee_display_name, verified_at
         FROM discord_recruitment_referrals
        WHERE guild_id = $1 AND inviter_id = $2 AND status = 'verified'
        ORDER BY verified_at DESC`,
      [guildId, viewerId],
    ),
  ]);
  return {
    leaderboard,
    viewer: {
      displayName: score.rows[0]?.recruiter_display_name ?? viewerDisplayName,
      createdInviteCount: Number(linkCount.rows[0]?.count ?? 0),
      verifiedInviteCount: Number(score.rows[0]?.verified_invites ?? 0),
      points: Number(score.rows[0]?.points ?? 0),
      invitees: invitees.rows.map((row) => ({
        displayName: row.invitee_display_name,
        verifiedAt: row.verified_at.toISOString(),
      })),
    },
  };
}
