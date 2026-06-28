// The Oracle mood engine. Tracks server activity (and, when enabled, toxicity)
// from a messageCreate feed, derives a "mood", and on a balanced cadence
// (~30–60 min, only when the server is active) posts a flavor reaction in the
// main channel — sometimes tagging an active player. It also rewards consistent
// chatters with temporary blessings and penalizes toxic/spam users with curses
// (see status-effects.ts), which feed straight into combat.
//
// All state is in-memory and ephemeral by design (mirrors combat-events.ts):
// activity windows and cooldowns reset on restart, which is fine for a feature
// whose effects last only minutes.
//
// Privacy: message CONTENT is only inspected for keyword toxicity and is NEVER
// logged or echoed. Curses are announced in lore language, never by quoting.

import { Client, TextChannel } from "discord.js";
import { logger } from "../lib/logger";
import {
  MOOD_META,
  MOOD_MESSAGES,
  ACTIVITY_REACTIONS,
  TOXICITY_REACTIONS,
  ACTIVE_PLAYER_REACTIONS,
  PROPHECY_FLAVOR,
  type MoodState,
} from "./oracle-content";
import { grantRandomBlessing, grantRandomCurse, pruneAllEffects } from "./status-effects";

const MIN = 60 * 1000;

// Rolling windows.
const ACTIVITY_WINDOW_MS = 60 * MIN;     // per-user activity considered for blessings
const MOOD_WINDOW_MS = 30 * MIN;         // window the mood/posting cadence reacts to
const TOXICITY_WINDOW_MS = 30 * MIN;     // window toxic hits are counted in
const SPAM_WINDOW_MS = 2 * MIN;          // window a spam burst is measured in
const SILENCE_FOR_TACUT_MS = 2 * 60 * MIN;

// Posting cadence (balanced).
const MIN_TICK_MS = 30 * MIN;
const MAX_TICK_MS = 60 * MIN;
const FIRST_TICK_MS = 12 * MIN;
const MIN_ACTIVITY_TO_POST = 8;          // valid msgs in MOOD_WINDOW before the Oracle bothers

// Behavior-grant thresholds.
const BLESS_COOLDOWN_MS = 4 * 60 * MIN;
const CURSE_COOLDOWN_MS = 2 * 60 * MIN;
const BLESS_MIN_MSGS = 6;                 // messages in ACTIVITY_WINDOW
const BLESS_MIN_SPAN_MS = 10 * MIN;       // spread out (a quick burst doesn't earn a buff)
const CURSE_TOXIC_HITS = 2;               // toxic hits in TOXICITY_WINDOW
const SPAM_BURST = 10;                    // messages in SPAM_WINDOW counts as spam
const MAX_GRANTS_PER_TICK = 2;

const EXTATIC_MS = 15 * MIN;
const TAG_CHANCE = 0.4;
const PROPHECY_CHANCE = 0.3;

const MESSAGE_CONTENT_ENABLED = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";

// ─── In-memory state ──────────────────────────────────────────────────────────
const globalMsgTimes: number[] = [];
const userMsgTimes = new Map<string, number[]>();
const userToxicTimes = new Map<string, number[]>();
const lastBlessAt = new Map<string, number>();
const lastCurseAt = new Map<string, number>();
let lastMessageAt = 0;
let extaticUntil = 0;

// Romanian toxicity keyword stems (substring match on a diacritics-stripped,
// lowercased copy). Kept deliberately small; penalties are tiny and temporary,
// so occasional false positives are acceptable.
const TOXIC_STEMS = [
  "pula", "pizda", "muie", "cacat", "rahat", "dracu", "bou", "vaca",
  "prost", "idiot", "imbecil", "tampit", "cretin", "retard", "handicap",
  "jeg", "gunoi", "scarba", "labagiu", "fraier", "nesimtit",
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isToxic(content: string): boolean {
  if (!content) return false;
  const text = normalize(content);
  return TOXIC_STEMS.some((w) => text.includes(w));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function countInWindow(times: number[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  let drop = 0;
  while (drop < times.length && times[drop]! < cutoff) drop++;
  if (drop > 0) times.splice(0, drop);
  return times.length;
}

function recentCount(times: number[] | undefined, windowMs: number, now: number): number {
  if (!times) return 0;
  const cutoff = now - windowMs;
  let n = 0;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i]! > cutoff) n++;
    else break;
  }
  return n;
}

/** Records a guild message for activity/toxicity tracking. Never logs content. */
export function recordMessage(userId: string, _displayName: string, content: string): void {
  const now = Date.now();
  lastMessageAt = now;

  globalMsgTimes.push(now);
  if (globalMsgTimes.length > 500) globalMsgTimes.splice(0, globalMsgTimes.length - 500);

  const arr = userMsgTimes.get(userId) ?? [];
  arr.push(now);
  if (arr.length > 300) arr.splice(0, arr.length - 300);
  userMsgTimes.set(userId, arr);

  if (MESSAGE_CONTENT_ENABLED && isToxic(content)) {
    const t = userToxicTimes.get(userId) ?? [];
    t.push(now);
    if (t.length > 100) t.splice(0, t.length - 100);
    userToxicTimes.set(userId, t);
  }
}

function totalToxicInWindow(now: number): number {
  let n = 0;
  for (const times of userToxicTimes.values()) n += recentCount(times, TOXICITY_WINDOW_MS, now);
  return n;
}

function anySpamBurst(now: number): boolean {
  for (const times of userMsgTimes.values()) {
    if (recentCount(times, SPAM_WINDOW_MS, now) >= SPAM_BURST) return true;
  }
  return false;
}

export function getCurrentMood(): MoodState {
  const now = Date.now();
  if (lastMessageAt === 0 || now - lastMessageAt > SILENCE_FOR_TACUT_MS) return "tacut";

  const activity = countInWindow(globalMsgTimes, MOOD_WINDOW_MS);
  const toxic = totalToxicInWindow(now);

  if (toxic >= 5) return "furios";
  if (toxic >= 2) return "iritat";
  if (now < extaticUntil) return "extatic";
  if (anySpamBurst(now) && toxic === 0) return "confuz";
  if (activity >= 40) return "agitat";
  if (activity <= 3) return "somnoros";
  return "calm";
}

/** Called by the scheduler on big game events (e.g. a boss spawn) to lift the mood. */
export function setOracleExtatic(): void {
  extaticUntil = Date.now() + EXTATIC_MS;
}

function pruneUserMaps(now: number): void {
  for (const [id, times] of userMsgTimes) {
    const kept = times.filter((t) => t > now - ACTIVITY_WINDOW_MS);
    if (kept.length === 0) userMsgTimes.delete(id);
    else userMsgTimes.set(id, kept);
  }
  for (const [id, times] of userToxicTimes) {
    const kept = times.filter((t) => t > now - TOXICITY_WINDOW_MS);
    if (kept.length === 0) userToxicTimes.delete(id);
    else userToxicTimes.set(id, kept);
  }
  for (const [id, ts] of lastBlessAt) if (now - ts > BLESS_COOLDOWN_MS) lastBlessAt.delete(id);
  for (const [id, ts] of lastCurseAt) if (now - ts > CURSE_COOLDOWN_MS) lastCurseAt.delete(id);
  pruneAllEffects();
}

function pickActivePlayerToTag(now: number): string | null {
  const candidates: string[] = [];
  for (const [id, times] of userMsgTimes) {
    const msgs = recentCount(times, MOOD_WINDOW_MS, now);
    const tox = recentCount(userToxicTimes.get(id), TOXICITY_WINDOW_MS, now);
    if (msgs >= 2 && tox === 0) candidates.push(id);
  }
  return candidates.length ? pick(candidates) : null;
}

function pickUsersToBless(now: number): string[] {
  const eligible: { id: string; count: number }[] = [];
  for (const [id, times] of userMsgTimes) {
    const win = times.filter((t) => t > now - ACTIVITY_WINDOW_MS);
    if (win.length < BLESS_MIN_MSGS) continue;
    if ((win[win.length - 1]! - win[0]!) < BLESS_MIN_SPAN_MS) continue;
    if (now - (lastBlessAt.get(id) ?? 0) < BLESS_COOLDOWN_MS) continue;
    if (recentCount(userToxicTimes.get(id), TOXICITY_WINDOW_MS, now) > 0) continue;
    if (recentCount(times, SPAM_WINDOW_MS, now) >= SPAM_BURST) continue; // no buffs for spam farming
    eligible.push({ id, count: win.length });
  }
  eligible.sort((a, b) => b.count - a.count);
  return eligible.slice(0, MAX_GRANTS_PER_TICK).map((e) => e.id);
}

function pickUsersToCurse(now: number): string[] {
  const eligible: { id: string; score: number }[] = [];
  for (const [id, times] of userMsgTimes) {
    if (now - (lastCurseAt.get(id) ?? 0) < CURSE_COOLDOWN_MS) continue;
    const tox = recentCount(userToxicTimes.get(id), TOXICITY_WINDOW_MS, now);
    const burst = recentCount(times, SPAM_WINDOW_MS, now);
    if (tox >= CURSE_TOXIC_HITS || burst >= SPAM_BURST) {
      eligible.push({ id, score: tox * 100 + burst });
    }
  }
  eligible.sort((a, b) => b.score - a.score);
  return eligible.slice(0, MAX_GRANTS_PER_TICK).map((e) => e.id);
}

async function getMainChannel(client: Client, channelId: string): Promise<TextChannel | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel instanceof TextChannel ? channel : null;
}

async function postMood(channel: TextChannel, mood: MoodState, now: number): Promise<void> {
  const meta = MOOD_META[mood];
  let content = `${meta.emoji} *Oracolul Cenușii* — **${meta.label}**\n${pick(MOOD_MESSAGES[mood])}`;

  if (mood === "iritat" || mood === "furios") content += `\n> ${pick(TOXICITY_REACTIONS)}`;
  else if (mood === "agitat" || mood === "extatic") content += `\n> ${pick(ACTIVITY_REACTIONS)}`;
  else if (Math.random() < PROPHECY_CHANCE) content += `\n> *${pick(PROPHECY_FLAVOR)}*`;

  const users: string[] = [];
  if (mood !== "furios" && mood !== "iritat" && Math.random() < TAG_CHANCE) {
    const tagId = pickActivePlayerToTag(now);
    if (tagId) {
      content += `\n\n<@${tagId}>, ${pick(ACTIVE_PLAYER_REACTIONS)}`;
      users.push(tagId);
    }
  }

  await channel.send({ content, allowedMentions: { users } }).catch((err) => {
    logger.error({ err }, "Oracle failed to post mood message");
  });
}

async function runBehaviorGrants(channel: TextChannel, now: number): Promise<void> {
  for (const id of pickUsersToBless(now)) {
    const def = grantRandomBlessing(id);
    lastBlessAt.set(id, now);
    await channel.send({
      content: `${def.emoji} <@${id}>, Oracolul te **binecuvântează** pentru zelul tău: **${def.label}** — ${def.flavor}.`,
      allowedMentions: { users: [id] },
    }).catch(() => null);
    logger.info({ effect: def.id }, "Oracle granted blessing");
  }
  for (const id of pickUsersToCurse(now)) {
    const def = grantRandomCurse(id);
    lastCurseAt.set(id, now);
    await channel.send({
      content: `${def.emoji} <@${id}>, Oracolul aruncă un **blestem**: **${def.label}** — ${def.flavor}. *(Umbrele nu uită.)*`,
      allowedMentions: { users: [id] },
    }).catch(() => null);
    logger.info({ effect: def.id }, "Oracle granted curse");
  }
}

async function oracleTick(client: Client, channelId: string): Promise<void> {
  try {
    const now = Date.now();
    pruneUserMaps(now);
    const activity = countInWindow(globalMsgTimes, MOOD_WINDOW_MS);
    if (activity < MIN_ACTIVITY_TO_POST) return; // server too quiet — stay silent

    const channel = await getMainChannel(client, channelId);
    if (!channel) return;

    const mood = getCurrentMood();
    await postMood(channel, mood, now);
    await runBehaviorGrants(channel, now);
    logger.info({ mood, activity }, "Oracle tick posted");
  } catch (err) {
    logger.error({ err }, "Oracle tick failed");
  } finally {
    scheduleNextTick(client, channelId);
  }
}

function scheduleNextTick(client: Client, channelId: string): void {
  const delay = MIN_TICK_MS + Math.floor(Math.random() * (MAX_TICK_MS - MIN_TICK_MS + 1));
  const t = setTimeout(() => { void oracleTick(client, channelId); }, delay);
  t.unref?.();
}

export function startOracle(client: Client, channelId: string): void {
  if (!MESSAGE_CONTENT_ENABLED) {
    logger.warn(
      "Oracle toxicity detection is OFF. To enable curses from toxic chat, turn on the 'Message Content Intent' in the Discord Developer Portal and set ORACLE_MESSAGE_CONTENT_ENABLED=true.",
    );
  }
  const t = setTimeout(() => { void oracleTick(client, channelId); }, FIRST_TICK_MS);
  t.unref?.();
  logger.info({ contentIntent: MESSAGE_CONTENT_ENABLED }, "Oracle mood system started");
}
