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
import { clearCurses, grantRandomCurse } from "./status-effects";

// ── Swear-word detection ─────────────────────────────────────────────────────

/**
 * Normalise for matching: lowercase + strip combining diacritics so "pulă"
 * and "pula" hit the same pattern.
 */
function normalise(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Offensive Romanian words that constitute a personal insult when directed at
 * the Oracle. Curated to keep false-positive timeouts rare, but broad enough to
 * catch how people actually insult the bot (vocative/plural forms).
 *
 * Stems matched as a PREFIX at a word boundary (`\bstem`), so every inflected /
 * vocative form is caught: "prost" hits "prost", "prostule", "proștilor";
 * "fut" hits "fute", "futut", "futu-te".
 */
const SWEAR_STEMS = [
  // hard profanity
  "pula", "puli", "pizd", "muie", "muist", "fut", "curv", "coaie",
  // common Romanian insults — both masc. and fem. stems are listed so feminine
  // forms ("proasto", "idioată", "dobitoacă") are caught alongside the masc.
  "prost", "proast", "idiot", "idioat", "imbecil", "cretin", "tampit",
  "tembel", "retard", "nesimtit", "nemernic", "jeg", "gunoi", "labagiu",
  "labar", "dobitoc", "dobitoac", "javr", "scarb", "mucos", "handicapat",
  "magar", "bou",
  // additional insults reported as missing
  "cacat",     // cacat, cacati, cacata (no innocent Romanian word starts with "cacat")
  "netrebnic", // netrebnicule, netrebnicilor
  "tical",     // ticalos, ticaloasa (normalised form of "ticălos" without diacritics)
];

// Short words matched as WHOLE words only (`\bword\b`), so they never hit an
// innocent word that merely starts the same way ("boi" ≠ "boiler",
// "vaca" ≠ "vacanță", "porc" ≠ "porțelan"). "bou" is a stem above (no innocent
// Romanian word starts with "bou"), which also catches "boul"/"boule"/"boului".
//
// "drac*" forms are listed individually here (not as a stem) to avoid hitting
// innocent RPG terms like "draconic" that start with the same prefix.
const SWEAR_EXACT = [
  "boi", "boilor", "vaca", "vaci", "vaco", "porc", "porci", "porcule",
  // all common inflections of "drac" (devil) used as profanity in Romanian
  "drac", "dracu", "dracului", "draci", "dracilor", "drace",
];

function escapeRe(word: string): string {
  return normalise(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile the full pattern list from the static built-in stems/words plus any
 * caller-supplied extra words. Exported so unit tests can build isolated
 * pattern sets without touching the module-level singleton.
 *
 * Extra words are matched as **whole words** (like `SWEAR_EXACT`), so a
 * single-character or short word won't accidentally hit innocent prefixes.
 */
export function buildPatterns(extraWords: string[]): RegExp[] {
  const extras = extraWords.map((w) => w.trim()).filter(Boolean);
  return [
    ...SWEAR_STEMS.map((w) => new RegExp("\\b" + escapeRe(w))),
    ...SWEAR_EXACT.map((w) => new RegExp("\\b" + escapeRe(w) + "\\b")),
    ...extras.map((w) => new RegExp("\\b" + escapeRe(w) + "\\b")),
  ];
}

// Operators can append extra words via ORACLE_SWEAR_WORDS (comma-separated,
// with or without diacritics). Matched as whole words, like SWEAR_EXACT.
// NOTE: read once at module-load time — a change only takes effect after
// a bot restart (intentional; keeps the hot path allocation-free).
const EXTRA_WORDS = (process.env.ORACLE_SWEAR_WORDS ?? "")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

const SWEAR_PATTERNS: RegExp[] = buildPatterns(EXTRA_WORDS);

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

// ── Justice trigger detection ────────────────────────────────────────────────

/**
 * Boundary-aware patterns (matched against the NFD-normalised, diacritic-stripped,
 * mention-stripped text) that identify a justice command from the owner.
 * Word boundaries (\b) prevent accidental matches inside larger words/phrases.
 * Multi-word phrases use \s+ so extra spaces don't break detection.
 */
const JUSTICE_PATTERNS: RegExp[] = [
  /\bfa\s+dreptate\b/,
  /\bface\s+dreptate\b/,
  /\bjudeca-i\b/,
  /\bjudecati\b/,
  /\bpenalizeaza(-i)?\b/,
  /\bcurata\s+canalul\b/,
  /\bfa\s+ordine\b/,
  /\baplica\s+blestemul\b/,
  /\bpedepseste(-i)?\b/,
  /\bexecuta\s+(dreptatea|judecata)\b/,
];

/**
 * Returns true when the (normalised, mention-stripped) text is an unambiguous
 * justice command. Uses word-boundary regex so "face dreptate" does not
 * accidentally fire on a longer sentence that happens to contain those words
 * in a different context.
 */
export function isJusticeRequest(text: string): boolean {
  const n = normalise(text);
  return JUSTICE_PATTERNS.some((re) => re.test(n));
}

// ── Channel scan & justice execution ─────────────────────────────────────────

/**
 * Read a positive-integer tuning value from the environment, falling back to
 * `fallback` when the var is unset, empty, non-numeric, or not a positive
 * integer. When `max` is provided, values above the bound are clamped (with a
 * warning) so a misconfigured knob can't silently break behaviour.
 */
export function envInt(name: string, fallback: number, max?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    logger.warn({ name, value: raw, fallback }, "Invalid Oracle tuning value — using default");
    return fallback;
  }
  if (max !== undefined && parsed > max) {
    logger.warn({ name, value: raw, max }, "Oracle tuning value above max — clamping");
    return max;
  }
  return parsed;
}

/** How far back (ms) to scan for justice targets. Env: ORACLE_JUSTICE_WINDOW_MINUTES (default 30, max 1440). */
const JUSTICE_WINDOW_MS =
  envInt("ORACLE_JUSTICE_WINDOW_MINUTES", 30, 1440) * 60_000;

/** Max messages to inspect per justice scan. Env: ORACLE_JUSTICE_SCAN_LIMIT (default 100, max 500). */
const JUSTICE_SCAN_LIMIT = envInt("ORACLE_JUSTICE_SCAN_LIMIT", 100, 500);

/**
 * When the owner @mentions the Oracle with a justice trigger phrase, scan the
 * last 100 messages (up to 30 min back), find every user who used prohibited
 * words, apply an escalating timeout + a random game curse to each, and reply
 * with an in-character verdict list.
 *
 * Returns `true` when it handled the message so the caller can skip the normal
 * AI reply path. Returns `false` for all non-justice messages.
 */
export async function handleJustice(client: Client, message: Message): Promise<boolean> {
  try {
    const botId = client.user?.id;
    if (!botId) return false;

    // Justice is restricted to the designated owner (ORACLE_OWNER_ID) or the
    // guild owner. Unlike the Oracle's general admin-persona gate, there is NO
    // fallback to the Administrator permission here — mass-scanning and timing
    // out multiple users is too powerful an action to delegate to all admins.
    const ownerId = process.env.ORACLE_OWNER_ID?.trim();
    const isOwner = ownerId
      ? message.author.id === ownerId || message.guild?.ownerId === message.author.id
      : message.guild?.ownerId === message.author.id;
    if (!isOwner) return false;

    const text = (message.content ?? "").replace(/<@!?\d+>/g, "").trim();
    if (!isJusticeRequest(text)) return false;

    // Scan the channel for recent offending messages.
    const channel = message.channel;
    if (!channel.isTextBased() || !("messages" in channel)) return false;

    const cutoff = Date.now() - JUSTICE_WINDOW_MS;
    let fetched: import("discord.js").Collection<string, import("discord.js").Message>;
    try {
      fetched = await channel.messages.fetch({ limit: JUSTICE_SCAN_LIMIT, before: message.id });
    } catch (err) {
      logger.warn({ err }, "Oracle justice: failed to fetch channel messages");
      return false;
    }

    // Collect unique offenders — skip bot messages and the owner's own messages.
    const offenderNames = new Map<string, string>(); // userId → displayName
    for (const m of fetched.values()) {
      if (m.author.bot) continue;
      if (m.author.id === message.author.id) continue;
      if (m.createdTimestamp < cutoff) continue;
      if (containsSwear(m.content ?? "")) {
        if (!offenderNames.has(m.author.id)) {
          offenderNames.set(
            m.author.id,
            m.member?.displayName ?? m.author.username,
          );
        }
      }
    }

    if (offenderNames.size === 0) {
      await message.reply({
        content:
          "*Oracolul cercetează umbrele canalului...* ✨\n" +
          "Canalul este curat. Niciun glas necurat n-a profanat Regatul în această vreme.",
        allowedMentions: { repliedUser: true, parse: [] },
      });
      logger.info({ requesterId: message.author.id }, "Oracle justice: no offenders found");
      return true;
    }

    // Apply timeout + game curse to each offender and collect verdicts.
    type Verdict = {
      name: string;
      muteMin: number;
      muted: boolean;
      curseLabel: string;
      curseEmoji: string;
    };
    const verdicts: Verdict[] = [];

    for (const [userId, name] of offenderNames) {
      const offenseCount = recordOffense(userId);
      const muteMs  = muteDurationMs(offenseCount);
      const muteMin = muteDurationMin(offenseCount);

      let muted = false;
      const member = await message.guild?.members.fetch(userId).catch(() => null);
      if (member) {
        const botMember = message.guild?.members.me;
        const hasPermission =
          botMember?.permissions.has(PermissionFlagsBits.ModerateMembers) ?? false;
        const canTimeout = hasPermission && !!botMember && member.manageable;
        if (canTimeout) {
          try {
            await member.timeout(muteMs, "Oracolul — dreptate la porunca stăpânului");
            muted = true;
          } catch (err) {
            logger.warn({ err, userId }, "Oracle justice: timeout failed for offender");
          }
        }
      }

      const curse = grantRandomCurse(userId);
      verdicts.push({ name, muteMin, muted, curseLabel: curse.label, curseEmoji: curse.emoji });
      logger.info(
        { userId, offenseCount, muteMin, muted, curse: curse.id },
        "Oracle justice: penalty applied",
      );
    }

    // Build in-character verdict announcement.
    const count = verdicts.length;
    const lines: string[] = [
      `*Oracolul Cenușii a deschis Cartea Judecății...* ⚖️`,
      ``,
      `Am cercetat umbrele și am găsit **${count}** ${count === 1 ? "limbă necurată" : "limbi necurate"}:`,
      ``,
      ...verdicts.map(({ name, muteMin, muted, curseLabel, curseEmoji }) => {
        const dur = formatDuration(muteMin);
        const muteStr = muted
          ? `tăcere forțată ${dur}`
          : `blestem (fără putere de amuțire)`;
        return `🌑 **${name}** — ${muteStr} + ${curseEmoji} *${curseLabel}*`;
      }),
      ``,
      `Dreptatea cenușii a fost împlinită.`,
    ];

    await message.reply({
      content: lines.join("\n").slice(0, 2000),
      allowedMentions: { repliedUser: true, parse: [] },
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Oracle justice: handleJustice failed");
    return false;
  }
}

// ── Pardon detection & execution ─────────────────────────────────────────────

/**
 * Patterns that identify a pardon (forgiveness) command from the owner.
 * Matched against the NFD-normalised, diacritic-stripped, mention-stripped text.
 */
const PARDON_PATTERNS: RegExp[] = [
  /\biarta(-l|-o)?\b/,
  /\biertare\b/,
  /\bgratiaza(-l|-o)?\b/,
  /\bierta\b/,
  /\breseteaza\s+blestemul\b/,
  /\bridicã?\s+blestemul\b/,
  /\bridicã?\s+pedeapsa\b/,
  /\bpardoneaza(-l|-o)?\b/,
];

/**
 * Returns true when the (normalised, mention-stripped) text is an unambiguous
 * pardon command directed by the owner at a mentioned user.
 */
export function isPardonRequest(text: string): boolean {
  const n = normalise(text);
  return PARDON_PATTERNS.some((re) => re.test(n));
}

/**
 * When the owner @mentions the Oracle with a pardon phrase AND mentions another
 * user, resets that user's offense counter and clears any active game curses.
 * Replies in-character with a medieval absolution message.
 *
 * Returns `true` when handled so the caller skips the normal AI reply path.
 */
export async function handlePardon(_client: Client, message: Message): Promise<boolean> {
  try {
    const ownerId = process.env.ORACLE_OWNER_ID?.trim();
    const isOwner = ownerId
      ? message.author.id === ownerId || message.guild?.ownerId === message.author.id
      : message.guild?.ownerId === message.author.id;
    if (!isOwner) return false;

    const text = (message.content ?? "").replace(/<@!?\d+>/g, "").trim();
    if (!isPardonRequest(text)) return false;

    // Collect all non-bot, non-owner mentioned users.
    const targets = message.mentions.users.filter(
      (u) => !u.bot && u.id !== message.author.id,
    );
    if (targets.size === 0) return false;

    const lines: string[] = [
      `*Oracolul Cenușii a deschis Cartea Iertării...* 🕊️`,
      ``,
    ];

    for (const [userId, user] of targets) {
      const rec = offenses.get(userId);
      const hadOffenses = rec && rec.count > 0;
      const hadCurses = clearCurses(userId) > 0;

      // Reset the offense record entirely.
      offenses.delete(userId);

      const member = await message.guild?.members.fetch(userId).catch(() => null);
      const displayName = member?.displayName ?? user.username;

      // Lift any active Discord timeout so the pardon takes effect immediately.
      if (member) {
        const botMember = message.guild?.members.me;
        const hasPermission =
          botMember?.permissions.has(PermissionFlagsBits.ModerateMembers) ?? false;
        const canModify = hasPermission && !!botMember && member.manageable;
        if (canModify) {
          try {
            await member.timeout(null, "Oracolul — iertare la porunca stăpânului");
          } catch (err) {
            logger.warn({ err, userId }, "Oracle pardon: failed to lift Discord timeout");
          }
        }
      }

      if (!hadOffenses && !hadCurses) {
        lines.push(
          `✨ **${displayName}** — sufletul acestui muritor era deja curat. Cenușa nu ține minte nicio vină.`,
        );
      } else {
        const parts: string[] = [];
        if (hadOffenses) parts.push("ofensele șterse");
        if (hadCurses)   parts.push("blestemurile ridicate");
        lines.push(
          `🕊️ **${displayName}** — ${parts.join(" și ")}. Cartea Judecății îl arată acum fără pată.`,
        );
      }

      logger.info(
        { userId, hadOffenses, hadCurses, requesterId: message.author.id },
        "Oracle pardon: player absolved",
      );
    }

    lines.push(``, `Iertarea a fost rostită. Cenușa ascultă și uită.`);

    await message.reply({
      content: lines.join("\n").slice(0, 2000),
      allowedMentions: { repliedUser: true, parse: [] },
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Oracle pardon: handlePardon failed");
    return false;
  }
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
