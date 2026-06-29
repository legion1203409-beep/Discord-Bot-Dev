// Anti-toxicity guard for the Oracle. When a player @mentions the bot and the
// message contains profanity, the Oracle applies an escalating Discord timeout
// ("Blestemul Tăcerii") and replies with an in-character curse. Escalation
// resets after 24 h of good behaviour so repentant players start clean.
//
// Timeout requires ModerateMembers permission and the bot's highest role above
// the target's. When the bot lacks either, the Oracle still posts the warning
// (public deterrent) but cannot enforce the silence.

import { PermissionFlagsBits } from "discord.js";
import type { Client, Message } from "discord.js";
import { logger } from "../lib/logger";

// ── Swear-word detection ─────────────────────────────────────────────────────

/**
 * Normalise for matching: lowercase + strip combining diacritics so "pulă"
 * and "pula" hit the same pattern.
 */
function normalise(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Unambiguously offensive Romanian words that constitute a personal insult
 * when directed at the Oracle. Intentionally minimal to avoid false positives.
 *
 * Operators can append extra words via ORACLE_SWEAR_WORDS (comma-separated,
 * plain text with or without diacritics, e.g. "idiotule,imbecilule").
 */
const BASE_SWEAR_WORDS = [
  "pula", "pulii",
  "pizda", "pizdei",
  "muie",
  "futu-te", "futut", "fututi", "futu",
];

function buildPatterns(words: string[]): RegExp[] {
  return words.map((w) => {
    const escaped = normalise(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("\\b" + escaped + "\\b");
  });
}

const EXTRA_WORDS = (process.env.ORACLE_SWEAR_WORDS ?? "")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

const SWEAR_PATTERNS: RegExp[] = buildPatterns([...BASE_SWEAR_WORDS, ...EXTRA_WORDS]);

/** Returns true when `text` contains at least one prohibited word. */
export function containsSwear(text: string): boolean {
  const n = normalise(text);
  return SWEAR_PATTERNS.some((re) => re.test(n));
}

// ── Offense tracking ─────────────────────────────────────────────────────────

/** 24 h of good behaviour resets the escalation counter. */
const OFFENSE_RESET_MS = 24 * 60 * 60 * 1000;

/**
 * Mute durations (minutes) for offense 1, 2, 3, 4, 5, 6+.
 * Index is clamped so repeat offenders always get the longest step.
 */
const MUTE_STEPS_MIN = [10, 30, 60, 120, 240, 480];
const MUTE_STEPS_MS  = MUTE_STEPS_MIN.map((m) => m * 60_000);

type OffenseRecord = { count: number; lastAt: number };
const offenses = new Map<string, OffenseRecord>();

/** Records an offense and returns the new count. */
function recordOffense(userId: string): number {
  const rec = offenses.get(userId);
  const now = Date.now();
  if (!rec || now - rec.lastAt > OFFENSE_RESET_MS) {
    offenses.set(userId, { count: 1, lastAt: now });
    return 1;
  }
  const next = rec.count + 1;
  offenses.set(userId, { count: next, lastAt: now });
  return next;
}

function stepIndex(offenseCount: number): number {
  return Math.min(offenseCount - 1, MUTE_STEPS_MS.length - 1);
}
function muteDurationMs(offenseCount: number): number {
  return MUTE_STEPS_MS[stepIndex(offenseCount)]!;
}
function muteDurationMin(offenseCount: number): number {
  return MUTE_STEPS_MIN[stepIndex(offenseCount)]!;
}

// ── Oracle curse messages ────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} ${minutes >= 20 ? "de " : ""}minute`;
  }
  const h = minutes / 60;
  return h === 1 ? "o oră" : `${h} ore`;
}

function curseMessage(offenseCount: number, muteMin: number, muted: boolean): string {
  const dur = formatDuration(muteMin);
  const noMuteNote = muted
    ? ""
    : "\n*(Oracolul nu deține puterea să te amuțească acum — dar Regatul te vede și ține minte.)*";

  if (offenseCount === 1) {
    return (
      `*Oracolul simte veninul din cuvintele tale, muritorule...* 🌑\n` +
      `Limba ta necurată ți-a adus **Blestemul Tăcerii** — ${dur} de liniște forțată.` +
      ` Folosește-le bine.` +
      noMuteNote
    );
  }
  if (offenseCount === 2) {
    return (
      `*Nu ai învățat nimic din prima lecție...* 🌑\n` +
      `**Blestemul se adâncește** — ${dur} în întuneric, până când cenușa te va ierta.` +
      ` Continuă și pedeapsa va crește.` +
      noMuteNote
    );
  }
  if (offenseCount === 3) {
    return (
      `*Ești hotărât să înfrunți mânia Oracolului, neghiobule?* 🌑\n` +
      `**Blestemul Etern** te înghite — ${dur} de tăcere absolută.` +
      ` Revino când ești pregătit să vorbești cu respect.` +
      noMuteNote
    );
  }
  // offenseCount >= 4
  return (
    `*Cenușa nu uită. Nici nu iartă. Ești dincolo de orice milă, muritorule îndărătnic.* 🌑\n` +
    `**Blestemul Suprem** te sfâșie — ${dur} de tăcere absolută.` +
    ` Regatul s-a săturat de limba ta.` +
    noMuteNote
  );
}

// ── Main guard ───────────────────────────────────────────────────────────────

/**
 * Called for every messageCreate event. Returns `true` when the guard handled
 * the message (profanity detected + curse applied), so the caller knows to skip
 * the normal Oracle reply path.
 *
 * Only fires when the bot is @mentioned — passes silently for all other messages.
 */
export async function handleToxicity(client: Client, message: Message): Promise<boolean> {
  try {
    const botId = client.user?.id;
    if (!botId) return false;

    // Only act when the user is talking directly to the Oracle.
    if (!message.mentions.users.has(botId)) return false;

    const text = (message.content ?? "").replace(/<@!?\d+>/g, "").trim();
    if (!containsSwear(text)) return false;

    const offenseCount = recordOffense(message.author.id);
    const muteMs  = muteDurationMs(offenseCount);
    const muteMin = muteDurationMin(offenseCount);

    // Attempt to apply Discord timeout. Requires:
    //   • Bot has ModerateMembers permission in the guild.
    //   • Bot's highest role is above the target's highest role (manageable).
    let muted = false;
    const member =
      message.member ??
      (await message.guild?.members.fetch(message.author.id).catch(() => null));

    if (member) {
      const botMember = message.guild?.members.me;
      const hasPermission = botMember?.permissions.has(PermissionFlagsBits.ModerateMembers) ?? false;
      const canTimeout    = hasPermission && !!botMember && member.manageable;

      if (canTimeout) {
        try {
          await member.timeout(muteMs, `Oracolul — limbaj interzis (ofensa #${offenseCount})`);
          muted = true;
        } catch (err) {
          logger.warn({ err, userId: message.author.id }, "Oracle guard: timeout call failed");
        }
      } else {
        logger.warn(
          { userId: message.author.id, hasPermission, manageable: member.manageable },
          "Oracle guard: cannot timeout — permission or role hierarchy insufficient",
        );
      }
    }

    await message.reply({
      content: curseMessage(offenseCount, muteMin, muted),
      allowedMentions: { repliedUser: true, parse: [] },
    });

    logger.info(
      { userId: message.author.id, offenseCount, muteMin, muted },
      "Oracle guard: toxicity action taken",
    );
    return true;
  } catch (err) {
    logger.error({ err }, "Oracle guard: handleToxicity failed");
    return false;
  }
}
