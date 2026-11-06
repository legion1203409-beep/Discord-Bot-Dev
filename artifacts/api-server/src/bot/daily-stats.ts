import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getChannel } from "./channel-config";
import {
  DEFAULT_DAILY_STATS_EMBED_CONFIG,
  loadDailyStatsEmbedConfig,
  type DailyStatsEmbedConfig,
} from "./db";
import { publicMessageImageUrl } from "./message-media";
import { chartText, DAILY_CHART_FILE, renderDailyReportChart, type DailyChartInput } from "./daily-report-chart";
import { getTopInviters, inviteTopLines, type InviteTopData } from "./invite-top";

const STATS_TIME_ZONE = process.env.DISCORD_STATS_TIMEZONE || "Europe/Bucharest";
const REPORT_CHECK_INTERVAL_MS = 60 * 1000;
const schedulerTimers = new Map<string, ReturnType<typeof setInterval>>();
const lastReportSkipByGuild = new Map<string, string>();
const correctedUnavailableReports = new Set<string>();
const correctionsInProgress = new Set<string>();
const publishesInProgress = new Set<string>();
const UNAVAILABLE_CORRECTION = "Date indisponibile pentru această zi.";
let schemaReady: Promise<void> | null = null;

function warnDailyStatsReportSkipped(
  guildId: string,
  day: string,
  reason: string,
  context: Record<string, unknown> = {},
): void {
  const warningKey = `${day}:${reason}:${String(context.channelId ?? "")}`;
  if (lastReportSkipByGuild.get(guildId) === warningKey) return;
  lastReportSkipByGuild.set(guildId, warningKey);
  logger.warn({ guildId, day, reason, ...context }, "Daily Discord statistics report skipped");
}

export type DailyStatsMetrics = {
  messages: number;
  uniqueUsers: number;
  boosts: number;
  joins: number;
  leaves: number;
  peakVoice: number;
};

export interface DailyStatsReport {
  guildId: string;
  /** The last day of the report (for a one-day report, the day itself). */
  day: string;
  /** The first day of the report; the same as `day` for a one-day report. */
  startDay?: string;
  /** How many days the report adds up (1–7). */
  days?: number;
  /** Who brought the most members through invites in the period; null when invite tracking never ran. */
  invites?: InviteTopData | null;
  metrics: DailyStatsMetrics;
  /** The period before (the day before, for one day), when the bot recorded something then; the report compares with it. */
  previous?: DailyStatsMetrics | null;
  activity: Array<{ day: string; messages: number }>;
  topChannels: Array<{ channelId: string; channelName: string; messages: number }>;
}

function dayParts(timestamp: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function statsDay(timestamp = Date.now()): string {
  const parts = dayParts(timestamp);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function completedStatsDay(timestamp = Date.now()): string {
  return previousDay(statsDay(timestamp));
}

export function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysEndingAt(day: string, count: number): string[] {
  const result: string[] = [];
  let current = day;
  for (let index = 0; index < count; index += 1) {
    result.unshift(current);
    current = previousDay(current);
  }
  return result;
}

/** Days between two "YYYY-MM-DD" days (b − a). */
function dayDistance(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00.000Z`) - Date.parse(`${a}T12:00:00.000Z`)) / 86_400_000);
}

/** A fixed Sunday the periods are counted from, so a 7-day report always covers Monday to Sunday. */
const PERIOD_ANCHOR = "2024-01-07";

/** Whether a report covering `intervalDays` days ends on this day (every day, for a daily report). */
export function isReportEndDay(day: string, intervalDays = 1): boolean {
  const interval = Math.max(1, Math.min(7, Math.trunc(intervalDays)));
  if (interval === 1) return true;
  return ((dayDistance(PERIOD_ANCHOR, day) % interval) + interval) % interval === 0;
}

/** The next day a report ends on, starting from `fromDay` (included). */
export function nextReportEndDay(fromDay: string, intervalDays = 1): string {
  let day = fromDay;
  for (let step = 0; step < 7 && !isReportEndDay(day, intervalDays); step += 1) day = shiftStatsDay(day, 1);
  return day;
}

export function shiftStatsDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** "29 octombrie – 4 noiembrie 2026", or the day alone. */
export function formatStatsPeriod(startDay: string, endDay: string): string {
  if (startDay === endDay) return formatStatsDay(endDay);
  const [startYear, startMonth] = startDay.split("-");
  const [endYear, endMonth] = endDay.split("-");
  const format = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ro-RO", { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00.000Z`));
  const start = startYear !== endYear
    ? format(startDay, { day: "numeric", month: "long", year: "numeric" })
    : startMonth !== endMonth ? format(startDay, { day: "numeric", month: "long" }) : format(startDay, { day: "numeric" });
  return `${start} – ${format(endDay, { day: "numeric", month: "long", year: "numeric" })}`;
}

export function formatStatsDay(day: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "long",
    timeZone: STATS_TIME_ZONE,
  }).format(new Date(`${day}T12:00:00.000Z`));
}

export function isReportDayBeforeBotJoined(day: string, joinedTimestamp: number | null | undefined): boolean {
  return joinedTimestamp != null
    && Number.isFinite(joinedTimestamp)
    && day < statsDay(joinedTimestamp);
}

export async function ensureDailyStatsTables(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS discord_daily_stats (
        guild_id text NOT NULL,
        day text NOT NULL,
        message_count integer NOT NULL DEFAULT 0,
        joins integer NOT NULL DEFAULT 0,
        leaves integer NOT NULL DEFAULT 0,
        boosts integer NOT NULL DEFAULT 0,
        peak_voice integer NOT NULL DEFAULT 0,
        report_message_id text,
        reported_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, day)
      );
      CREATE TABLE IF NOT EXISTS discord_daily_channels (
        guild_id text NOT NULL,
        day text NOT NULL,
        channel_id text NOT NULL,
        channel_name text NOT NULL,
        message_count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, day, channel_id)
      );
      CREATE TABLE IF NOT EXISTS discord_daily_users (
        guild_id text NOT NULL,
        day text NOT NULL,
        user_id text NOT NULL,
        PRIMARY KEY (guild_id, day, user_id)
      );
      CREATE INDEX IF NOT EXISTS discord_daily_stats_guild_day_idx
        ON discord_daily_stats (guild_id, day);
      CREATE INDEX IF NOT EXISTS discord_daily_channels_guild_day_idx
        ON discord_daily_channels (guild_id, day);
      -- Per member, for the top of the most active members: messages (a row here is still "wrote that day",
      -- which the unique users count reads) and, in their own table, minutes in voice.
      ALTER TABLE discord_daily_users ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS discord_daily_voice (
        guild_id text NOT NULL,
        day text NOT NULL,
        user_id text NOT NULL,
        minutes integer NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, day, user_id)
      );
    `).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function incrementMetric(
  guildId: string,
  day: string,
  metric: "joins" | "leaves" | "boosts",
): Promise<void> {
  await ensureDailyStatsTables();
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, ${metric}, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET ${metric} = discord_daily_stats.${metric} + 1, updated_at = now()`,
    [guildId, day],
  );
}

export async function recordDailyMessage(
  guildId: string,
  userId: string,
  channelId: string,
  channelName: string,
  timestamp = Date.now(),
): Promise<void> {
  await ensureDailyStatsTables();
  const day = statsDay(timestamp);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO discord_daily_stats (guild_id, day, message_count, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (guild_id, day) DO UPDATE
       SET message_count = discord_daily_stats.message_count + 1, updated_at = now()`,
      [guildId, day],
    );
    await client.query(
      `INSERT INTO discord_daily_channels (guild_id, day, channel_id, channel_name, message_count, updated_at)
       VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (guild_id, day, channel_id) DO UPDATE
       SET channel_name = EXCLUDED.channel_name,
           message_count = discord_daily_channels.message_count + 1,
           updated_at = now()`,
      [guildId, day, channelId, channelName],
    );
    await client.query(
      `INSERT INTO discord_daily_users (guild_id, day, user_id, message_count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (guild_id, day, user_id) DO UPDATE
       SET message_count = discord_daily_users.message_count + 1`,
      [guildId, day, userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** One more minute in voice for each of these members (called once a minute by the voice ticker). */
export async function recordDailyVoiceMinutes(guildId: string, userIds: string[], timestamp = Date.now()): Promise<void> {
  const unique = [...new Set(userIds)].filter((id) => /^\d{5,25}$/.test(id));
  if (!unique.length) return;
  await ensureDailyStatsTables();
  await pool.query(
    `INSERT INTO discord_daily_voice (guild_id, day, user_id, minutes)
     SELECT $1, $2, user_id, 1 FROM unnest($3::text[]) AS user_id
     ON CONFLICT (guild_id, day, user_id) DO UPDATE
     SET minutes = discord_daily_voice.minutes + 1`,
    [guildId, statsDay(timestamp), unique],
  );
}

export async function recordDailyJoin(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "joins");
}

export async function recordDailyLeave(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "leaves");
}

export async function recordDailyBoost(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "boosts");
}

export async function recordDailyVoicePeak(
  guildId: string,
  connectedMembers: number,
  timestamp = Date.now(),
): Promise<void> {
  await ensureDailyStatsTables();
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, peak_voice, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET peak_voice = GREATEST(discord_daily_stats.peak_voice, EXCLUDED.peak_voice),
         updated_at = now()`,
    [guildId, statsDay(timestamp), Math.max(0, connectedMembers)],
  );
}

/** The day before's numbers, or null when nothing was recorded that day: an all-zero row proves nothing. */
function previousMetrics(
  row: { message_count: number; joins: number; leaves: number; boosts: number; peak_voice: number } | undefined,
  users: string | undefined,
): DailyStatsMetrics | null {
  if (!row) return null;
  const metrics = {
    messages: Number(row.message_count ?? 0),
    uniqueUsers: Number(users ?? 0),
    boosts: Number(row.boosts ?? 0),
    joins: Number(row.joins ?? 0),
    leaves: Number(row.leaves ?? 0),
    peakVoice: Number(row.peak_voice ?? 0),
  };
  return Object.values(metrics).some((value) => value > 0) ? metrics : null;
}

export async function getDailyStats(guildId: string, day = statsDay(), days = 1): Promise<DailyStatsReport> {
  await ensureDailyStatsTables();
  const span = Math.max(1, Math.min(7, Math.trunc(days)));
  const period = daysEndingAt(day, span);
  const previousPeriod = daysEndingAt(previousDay(period[0]!), span);
  const activityDays = daysEndingAt(day, 7);
  type Totals = { message_count: number; joins: number; leaves: number; boosts: number; peak_voice: number; rows: number };
  const totals = (dayList: string[]) => pool.query<Totals>(
    `SELECT COALESCE(SUM(message_count), 0)::int AS message_count, COALESCE(SUM(joins), 0)::int AS joins,
            COALESCE(SUM(leaves), 0)::int AS leaves, COALESCE(SUM(boosts), 0)::int AS boosts,
            COALESCE(MAX(peak_voice), 0)::int AS peak_voice, COUNT(*)::int AS rows
       FROM discord_daily_stats WHERE guild_id = $1 AND day = ANY($2::text[])`,
    [guildId, dayList],
  );
  const users = (dayList: string[]) => pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id)::text AS count FROM discord_daily_users WHERE guild_id = $1 AND day = ANY($2::text[])`,
    [guildId, dayList],
  );
  const [statsResult, usersResult, channelsResult, activityResult, previousResult, previousUsersResult] = await Promise.all([
    totals(period),
    users(period),
    pool.query<{ channel_id: string; channel_name: string; message_count: number }>(
      `SELECT channel_id, (array_agg(channel_name ORDER BY day DESC))[1] AS channel_name, SUM(message_count)::int AS message_count
       FROM discord_daily_channels
       WHERE guild_id = $1 AND day = ANY($2::text[])
       GROUP BY channel_id
       ORDER BY message_count DESC, channel_name ASC
       LIMIT 5`,
      [guildId, period],
    ),
    pool.query<{ day: string; message_count: number }>(
      `SELECT day, message_count
       FROM discord_daily_stats
       WHERE guild_id = $1 AND day = ANY($2::text[])
       ORDER BY day ASC`,
      [guildId, activityDays],
    ),
    totals(previousPeriod),
    users(previousPeriod),
  ]);
  const row = statsResult.rows[0];
  const previousRow = Number(previousResult.rows[0]?.rows ?? 0) > 0 ? previousResult.rows[0] : undefined;
  const activityByDay = new Map(activityResult.rows.map((item) => [item.day, Number(item.message_count)]));

  return {
    guildId,
    day,
    startDay: period[0]!,
    days: span,
    metrics: {
      messages: Number(row?.message_count ?? 0),
      uniqueUsers: Number(usersResult.rows[0]?.count ?? 0),
      boosts: Number(row?.boosts ?? 0),
      joins: Number(row?.joins ?? 0),
      leaves: Number(row?.leaves ?? 0),
      peakVoice: Number(row?.peak_voice ?? 0),
    },
    previous: previousMetrics(previousRow, previousUsersResult.rows[0]?.count),
    activity: activityDays.map((activityDay) => ({
      day: activityDay,
      messages: activityByDay.get(activityDay) ?? 0,
    })),
    topChannels: channelsResult.rows.map((channel) => ({
      channelId: channel.channel_id,
      channelName: channel.channel_name,
      messages: Number(channel.message_count),
    })),
  };
}

export function hasRecordedStats(report: DailyStatsReport): boolean {
  return Object.values(report.metrics).some((value) => value > 0) || report.topChannels.length > 0;
}

function renderDailyStatsText(
  template: string,
  guildName: string,
  report: DailyStatsReport,
): string {
  const [year = "", month = "", day = ""] = report.day.split("-");
  const reportTimestamp = Date.parse(`${report.day}T12:00:00.000Z`);
  const discordTimestamp = Number.isFinite(reportTimestamp)
    ? `<t:${Math.floor(reportTimestamp / 1_000)}:F>`
    : report.day;
  const discordTimestampRelative = Number.isFinite(reportTimestamp)
    ? `<t:${Math.floor(reportTimestamp / 1_000)}:R>`
    : report.day;
  const values: Record<string, string> = {
    guild: guildName,
    date: formatStatsPeriod(report.startDay ?? report.day, report.day),
    days: String(report.days ?? 1),
    year,
    month,
    day,
    timestamp: discordTimestamp,
    timestamp_relative: discordTimestampRelative,
    messages: report.metrics.messages.toLocaleString("ro-RO"),
    uniqueUsers: report.metrics.uniqueUsers.toLocaleString("ro-RO"),
    boosts: report.metrics.boosts.toLocaleString("ro-RO"),
    joins: report.metrics.joins.toLocaleString("ro-RO"),
    leaves: report.metrics.leaves.toLocaleString("ro-RO"),
    peakVoice: report.metrics.peakVoice.toLocaleString("ro-RO"),
  };
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

export function resolveDailyStatsChannelId(configuredChannelId: string, guildId: string): string | null {
  const reportChannelId = configuredChannelId.trim();
  if (!reportChannelId) return null;
  const chestChannelId = getChannel("main", guildId);
  return reportChannelId === chestChannelId ? null : reportChannelId;
}

const WEEKDAYS = ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"];
const MEDALS = ["🥇", "🥈", "🥉"];
const METRIC_KEYS = ["messages", "uniqueUsers", "boosts", "joins", "leaves", "peakVoice"] as const;

function count(value: number): string {
  return value.toLocaleString("ro-RO");
}

function signed(value: number): string {
  if (value > 0) return `+${count(value)}`;
  if (value < 0) return `−${count(-value)}`;
  return "0";
}

/** "Jo 29": the weekday and the day of the month, as the chart and the list show them. */
export function shortStatsDay(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${day.slice(8, 10)}`;
}

function longStatsDay(day: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00.000Z`));
}

/** What the report says beyond the raw numbers: the change since yesterday, the week's average and the busiest day. */
function reportFacts(report: DailyStatsReport, joinedTimestamp?: number | null) {
  const joinedDay = joinedTimestamp != null && Number.isFinite(joinedTimestamp)
    ? statsDay(joinedTimestamp)
    : null;
  const days = report.days ?? 1;
  const startDay = report.startDay ?? report.day;
  // The period before must be fully watched by the bot: the join day is partial, and earlier days were not recorded.
  const previousStart = shiftStatsDay(startDay, -days);
  const comparable = report.previous != null && (joinedDay === null || previousStart > joinedDay);
  const deltas = Object.fromEntries(METRIC_KEYS.map((key) => [
    key,
    comparable && report.previous ? report.metrics[key] - report.previous[key] : null,
  ])) as Record<(typeof METRIC_KEYS)[number], number | null>;
  const activity = report.activity.map((item) => ({
    day: item.day,
    label: shortStatsDay(item.day),
    value: joinedDay !== null && item.day < joinedDay ? null : item.messages,
    current: item.day >= startDay && item.day <= report.day,
  }));
  const available = activity.filter((item): item is typeof item & { value: number } => item.value !== null);
  const average = available.length >= 2
    ? available.reduce((sum, item) => sum + item.value, 0) / available.length
    : null;
  const busiest = available.length >= 2
    ? available.reduce((best, item) => (item.value > best.value ? item : best))
    : null;
  return {
    days,
    startDay,
    joinedDay,
    comparable,
    deltas,
    activity,
    average,
    busiest: busiest && busiest.value > 0 ? busiest : null,
    net: report.metrics.joins - report.metrics.leaves,
  };
}

function deltaMark(delta: number | null): string {
  if (delta === null) return "";
  if (delta > 0) return ` · ▲ ${signed(delta)}`;
  if (delta < 0) return ` · ▼ ${signed(delta)}`;
  return " · la fel";
}

export type DailyStatsEmbedOptions = {
  /** The day's card goes with the message; the embed shows it instead of the custom image. */
  chartAttached?: boolean;
  /** Members on the server when the report is posted. */
  memberCount?: number | null;
  /** Whether a channel still exists; a deleted one is shown by its name instead of a mention. */
  channelExists?: (channelId: string) => boolean;
};

export function buildDailyStatsEmbed(
  guildName: string,
  report: DailyStatsReport,
  config: DailyStatsEmbedConfig = DEFAULT_DAILY_STATS_EMBED_CONFIG,
  joinedTimestamp?: number | null,
  options: DailyStatsEmbedOptions = {},
): EmbedBuilder {
  const facts = reportFacts(report, joinedTimestamp);
  const hasUnavailableDays = facts.activity.some((item) => item.value === null);

  const metricLines = METRIC_KEYS.map((key) => {
    const label = renderDailyStatsText(config.metricLabels[key], guildName, report).slice(0, 256).replace(/\s+/g, " ").trim();
    return `${label}: **${count(report.metrics[key])}**${deltaMark(facts.deltas[key])}`;
  });
  const community = options.memberCount != null && options.memberCount > 0
    ? `Bilanț: **${signed(facts.net)}** membri · **${count(options.memberCount)}** pe server acum`
    : `Bilanț: **${signed(facts.net)}** membri`;
  const summaryLines = [
    ...metricLines,
    community,
    ...(facts.comparable
      ? [facts.days === 1 ? "*▲ ▼ arată schimbarea față de ziua dinainte.*" : `*▲ ▼ arată schimbarea față de cele ${facts.days} zile dinainte.*`]
      : []),
  ];
  const metricFields: { name: string; value: string; inline: false }[] = [];
  let metricValue = "";
  for (const line of summaryLines) {
    const nextValue = metricValue ? `${metricValue}\n${line}` : line;
    if (metricValue && nextValue.length > 1024) {
      metricFields.push({
        name: metricFields.length === 0 ? "📊 Rezumat" : "📊 Rezumat (continuare)",
        value: metricValue,
        inline: false,
      });
      metricValue = line.slice(0, 1024);
    } else {
      metricValue = nextValue.slice(0, 1024);
    }
  }
  if (metricValue) {
    metricFields.push({
      name: metricFields.length === 0 ? "📊 Rezumat" : "📊 Rezumat (continuare)",
      value: metricValue,
      inline: false,
    });
  }

  const weekLine = [
    facts.average !== null ? `Media: **${count(Math.round(facts.average))}** mesaje/zi` : null,
    facts.busiest
      ? facts.busiest.current && facts.days === 1
        ? "ziua raportului a fost cea mai activă"
        : `cea mai activă: **${facts.busiest.label}** (${count(facts.busiest.value)})`
      : null,
  ].filter((part): part is string => part !== null).join(" · ");
  // With the card attached, the bars are in the picture; the text keeps only what they add up to.
  const dayList = options.chartAttached
    ? ""
    : facts.activity
      .map((item) => {
        const text = `${item.label}: ${item.value === null ? "—" : count(item.value)}`;
        return item.current ? `**${text}**` : text;
      })
      .join(" · ");
  const activityText = [dayList, weekLine].filter(Boolean).join("\n")
    || (options.chartAttached ? "" : "Nicio activitate în ultimele 7 zile.");

  const total = report.metrics.messages;
  const channelText = report.topChannels.length > 0
    ? report.topChannels
      .map((item, index) => {
        const place = MEDALS[index] ?? `${index + 1}.`;
        const name = options.channelExists?.(item.channelId) === false || !/^\d{5,25}$/.test(item.channelId)
          ? `**#${item.channelName}**`
          : `<#${item.channelId}>`;
        const share = total > 0 ? Math.round((item.messages / total) * 100) : null;
        const shareText = share === null ? "" : share < 1 ? " · sub 1%" : ` · ${share}%`;
        return `${place} ${name} · **${count(item.messages)}** mesaje${shareText}`;
      })
      .join("\n")
    : renderDailyStatsText(config.emptyChannelsText, guildName, report);

  const joinedInPeriod = facts.joinedDay !== null && facts.joinedDay >= facts.startDay && facts.joinedDay <= report.day;
  const coverageNotes = [
    joinedInPeriod
      ? facts.days === 1
        ? "Prima zi include doar activitatea observată după instalarea botului."
        : "Perioada include ziua instalării botului; activitatea de dinainte nu e numărată."
      : null,
    hasUnavailableDays ? "„—” marchează zilele dinaintea instalării; nu există date istorice pentru ele." : null,
  ].filter((note): note is string => note !== null);
  // The top inviters of the period, when invite tracking runs on the server and the report shows them.
  const inviteField = config.inviteTop !== false && report.invites
    ? {
      name: facts.days === 1 ? "🎟️ Top invitații" : `🎟️ Top invitații · ${facts.days} zile`,
      value: (report.invites.rows.length
        ? [...inviteTopLines(report.invites.rows, 5), report.invites.unknown > 0 ? `*+${count(report.invites.unknown)} fără invitație știută*` : null]
          .filter((line): line is string => line !== null).join("\n")
        : "Nimeni n-a adus membri noi prin invitații în perioada asta.").slice(0, 1_024),
    }
    : null;
  // The default title says "Zilnice"; a longer report says how many days it adds up instead.
  const title = facts.days > 1 && config.title === DEFAULT_DAILY_STATS_EMBED_CONFIG.title
    ? `📊 Statistici · ultimele ${facts.days} zile · {guild}`
    : config.title;
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.color.slice(1), 16))
    .setAuthor({ name: "ORACOLUL CENUȘII · COMMUNITY INSIGHTS" })
    .setTitle(renderDailyStatsText(title, guildName, report).slice(0, 256))
    .setDescription(renderDailyStatsText(config.description, guildName, report).slice(0, 4_096))
    .addFields(
      ...metricFields,
      ...(activityText
        ? [{ name: renderDailyStatsText(config.activityTitle, guildName, report).slice(0, 256), value: activityText.slice(0, 1_024) }]
        : []),
      { name: renderDailyStatsText(config.channelsTitle, guildName, report).slice(0, 256), value: channelText.slice(0, 1_024) },
      ...(inviteField ? [inviteField] : []),
      ...(coverageNotes.length > 0 ? [{ name: "Acoperirea datelor", value: coverageNotes.join("\n") }] : []),
    )
    .setFooter({ text: renderDailyStatsText(config.footer, guildName, report).slice(0, 2_048) })
    .setTimestamp(new Date(`${report.day}T12:00:00.000Z`));
  const imageUrl = options.chartAttached ? `attachment://${DAILY_CHART_FILE}` : publicMessageImageUrl(config.imageUrl);
  const thumbnailUrl = publicMessageImageUrl(config.thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

/** What the day's card draws: the six numbers with their change, the last 7 days and the members' balance. */
export function dailyChartInput(
  guildName: string,
  report: DailyStatsReport,
  config: DailyStatsEmbedConfig = DEFAULT_DAILY_STATS_EMBED_CONFIG,
  joinedTimestamp?: number | null,
  memberCount?: number | null,
): DailyChartInput {
  const facts = reportFacts(report, joinedTimestamp);
  const label = (key: (typeof METRIC_KEYS)[number]) =>
    chartText(renderDailyStatsText(config.metricLabels[key], guildName, report), 40)
    || chartText(DEFAULT_DAILY_STATS_EMBED_CONFIG.metricLabels[key], 40);
  const community = `Bilanț: ${signed(facts.net)} membri`;
  return {
    guild: chartText(guildName, 80) || "Server",
    date: facts.days === 1 ? longStatsDay(report.day) : formatStatsPeriod(facts.startDay, report.day),
    ...(facts.days > 1 ? { kicker: `RAPORT PE ${facts.days} ZILE`, compare: "perioada dinainte" } : {}),
    color: config.color,
    metrics: METRIC_KEYS.map((key) => ({
      label: label(key),
      value: report.metrics[key],
      delta: facts.deltas[key],
      ...(key === "leaves" ? { invert: true } : {}),
    })),
    activityTitle: chartText(renderDailyStatsText(config.activityTitle, guildName, report), 60) || "Activitate · ultimele 7 zile",
    activity: facts.activity.map(({ label: dayLabel, value, current }) => ({ label: dayLabel, value, current })),
    average: facts.average,
    summary: memberCount != null && memberCount > 0 ? `${community} · ${count(memberCount)} pe server acum` : community,
  };
}

async function publishedReportMessageId(guildId: string, day: string): Promise<string | null> {
  const result = await pool.query<{ report_message_id: string | null }>(
    `SELECT report_message_id FROM discord_daily_stats WHERE guild_id = $1 AND day = $2`,
    [guildId, day],
  );
  return result.rows[0]?.report_message_id ?? null;
}

async function correctUnavailableReport(
  client: Client,
  guildId: string,
  guildName: string,
  day: string,
  messageId: string,
  reason: string,
): Promise<void> {
  const correctionKey = `${guildId}:${day}`;
  if (correctedUnavailableReports.has(correctionKey) || correctionsInProgress.has(correctionKey)) return;
  correctionsInProgress.add(correctionKey);
  try {
    const config = await loadDailyStatsEmbedConfig(guildId);
    const channelId = resolveDailyStatsChannelId(config.channelId, guildId);
    if (!channelId) {
      warnDailyStatsReportSkipped(guildId, day, "correction_channel_not_configured");
      return;
    }
    const channel = await client.channels.fetch(channelId);
    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
      warnDailyStatsReportSkipped(guildId, day, "correction_channel_not_text", { channelId });
      return;
    }
    const message = await channel.messages.fetch(messageId);
    if (message.author.id !== client.user?.id ||
        message.embeds[0]?.author?.name !== "ORACOLUL CENUȘII · COMMUNITY INSIGHTS") {
      warnDailyStatsReportSkipped(guildId, day, "correction_message_not_ours", { channelId });
      return;
    }
    if (!message.embeds[0]?.description?.startsWith(UNAVAILABLE_CORRECTION)) {
      await message.edit({
        embeds: [new EmbedBuilder()
          .setColor(Number.parseInt(config.color.slice(1), 16))
          .setAuthor({ name: "ORACOLUL CENUȘII · COMMUNITY INSIGHTS" })
          .setTitle(`📊 Statistici indisponibile · ${guildName}`)
          .setDescription(`${UNAVAILABLE_CORRECTION} ${reason} Zerourile din raportul inițial nu reprezentau date confirmate pentru ${formatStatsDay(day)}.`)
          .setFooter({ text: config.footer })
          .setTimestamp(new Date(`${day}T12:00:00.000Z`))],
        // The day's card shows the zeros too, so it goes with them.
        attachments: [],
      });
      logger.info({ guildId, day, messageId }, "Corrected unavailable daily statistics report");
    }
    correctedUnavailableReports.add(correctionKey);
  } catch (error) {
    warnDailyStatsReportSkipped(guildId, day, "correction_failed", { error });
  } finally {
    correctionsInProgress.delete(correctionKey);
  }
}

export async function repairRecentUnavailableReports(client: Client, guildId: string): Promise<void> {
  await ensureDailyStatsTables();
  // A report over several days sits on its last day, which may be empty on its own: it is not "unavailable".
  if (((await loadDailyStatsEmbedConfig(guildId))?.intervalDays ?? 1) > 1) return;
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const currentDay = statsDay();
  const firstDay = daysEndingAt(previousDay(currentDay), 7)[0];
  const result = await pool.query<{ day: string; report_message_id: string }>(
    `SELECT day, report_message_id FROM discord_daily_stats
     WHERE guild_id = $1 AND day >= $2 AND day < $3
       AND report_message_id IS NOT NULL
       AND message_count = 0 AND joins = 0 AND leaves = 0 AND boosts = 0 AND peak_voice = 0
     ORDER BY day DESC LIMIT 7`,
    [guildId, firstDay, currentDay],
  );
  for (const row of result.rows) {
    await correctUnavailableReport(
      client, guildId, guild.name, row.day, row.report_message_id,
      isReportDayBeforeBotJoined(row.day, guild.joinedTimestamp)
        ? "Botul nu era încă în server în această zi."
        : "Nu s-au înregistrat evenimente în această zi; nu putem confirma dacă serverul a fost inactiv sau botul nu colecta date.",
    );
  }
}

async function markReportPublished(guildId: string, day: string, messageId: string): Promise<void> {
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, report_message_id, reported_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET report_message_id = EXCLUDED.report_message_id, reported_at = now(), updated_at = now()`,
    [guildId, day, messageId],
  );
}

export async function publishDailyStatsReport(client: Client, guildId: string, day: string): Promise<boolean> {
  // Drawing the card takes a few seconds; the next minute's check must not post the day twice.
  const key = `${guildId}:${day}`;
  if (publishesInProgress.has(key)) return false;
  publishesInProgress.add(key);
  try {
    return await publishDailyStatsReportOnce(client, guildId, day);
  } finally {
    publishesInProgress.delete(key);
  }
}

async function publishDailyStatsReportOnce(client: Client, guildId: string, day: string): Promise<boolean> {
  await ensureDailyStatsTables();
  const config = await loadDailyStatsEmbedConfig(guildId);
  const intervalDays = config?.intervalDays ?? 1;
  // A report every N days goes out only after the last day of its period.
  if (!isReportEndDay(day, intervalDays)) return false;
  const existingMessageId = await publishedReportMessageId(guildId, day);
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    warnDailyStatsReportSkipped(guildId, day, "guild_unavailable");
    return false;
  }
  const beforeBotJoined = isReportDayBeforeBotJoined(day, guild.joinedTimestamp);
  const report = await getDailyStats(guildId, day, intervalDays);
  if (beforeBotJoined || !hasRecordedStats(report)) {
    if (existingMessageId) {
      await correctUnavailableReport(
        client, guildId, guild.name, day, existingMessageId,
        beforeBotJoined
          ? "Botul nu era încă în server în această zi."
          : "Nu s-au înregistrat evenimente în această zi; nu putem confirma dacă serverul a fost inactiv sau botul nu colecta date.",
      );
    } else {
      warnDailyStatsReportSkipped(guildId, day, beforeBotJoined ? "day_before_bot_joined_guild" : "no_observations_for_day");
    }
    return false;
  }
  if (existingMessageId) return false;
  if (config.inviteTop !== false) {
    report.invites = await getTopInviters(guildId, report.startDay ?? day, day, 10);
  }
  const channelId = resolveDailyStatsChannelId(config.channelId, guildId);
  if (!channelId) {
    warnDailyStatsReportSkipped(guildId, day, "target_channel_not_configured");
    return false;
  }

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    warnDailyStatsReportSkipped(guildId, day, "daily_stats_channel_fetch_failed", { channelId, error });
    return false;
  }
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    warnDailyStatsReportSkipped(guildId, day, "daily_stats_channel_not_text", {
      channelId,
      channelType: channel?.type ?? null,
    });
    return false;
  }

  const memberCount = Number.isFinite(guild.memberCount) ? guild.memberCount : null;
  // Without the card (turned off or not drawn), the report goes out as before, with the custom image.
  const chart = config.chart
    ? await renderDailyReportChart(dailyChartInput(guild.name, report, config, guild.joinedTimestamp, memberCount))
    : null;
  const embed = buildDailyStatsEmbed(guild.name, report, config, guild.joinedTimestamp, {
    chartAttached: chart !== null,
    memberCount,
    channelExists: (id) => guild.channels?.cache?.has(id) ?? true,
  });
  const message = await channel.send({
    embeds: [embed],
    ...(chart ? { files: [new AttachmentBuilder(chart, { name: DAILY_CHART_FILE })] } : {}),
  });
  await markReportPublished(guildId, day, message.id);
  lastReportSkipByGuild.delete(guildId);
  logger.info({ guildId, day, channelId, messageId: message.id }, "Published daily Discord statistics report");
  return true;
}

export function startDailyStatsScheduler(client: Client, guildId: string): void {
  if (schedulerTimers.has(guildId)) return;
  logger.info({ guildId }, "Started daily Discord statistics scheduler");
  void repairRecentUnavailableReports(client, guildId).catch((error) =>
    logger.warn({ error, guildId }, "Could not inspect recently published daily statistics reports"),
  );
  const timer = setInterval(() => {
    const currentDay = statsDay();
    const reportDay = previousDay(currentDay);
    void publishDailyStatsReport(client, guildId, reportDay).catch((error) =>
      logger.warn({ error, guildId, reportDay }, "Daily Discord statistics report failed"),
    );
  }, REPORT_CHECK_INTERVAL_MS);
  timer.unref?.();
  schedulerTimers.set(guildId, timer);
}

export function stopDailyStatsScheduler(guildId: string): void {
  const timer = schedulerTimers.get(guildId);
  if (!timer) return;
  clearInterval(timer);
  schedulerTimers.delete(guildId);
}