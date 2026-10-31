/**
 * Mesajul în privat pentru un membru sancționat: ce sancțiune a primit, pe ce
 * server, motivul (dacă serverul vrea), ID-ul cazului și cum o poate contesta.
 * E oprit implicit; îl pornește proprietarul din panou (Setări bot → Mesaje în
 * privat). Sancțiunile anti-raid nu trimit niciodată mesaj.
 *
 * La avertisment și timeout, mesajul pleacă după ce sancțiunea a fost aplicată.
 * La kick și ban pleacă înainte, pentru că după aceea botul nu mai are un
 * server comun cu membrul și Discord nu mai lasă mesajul să ajungă.
 */
import type { User } from "discord.js";
import { logger } from "../../lib/logger";
import { defaultModerationConfig, type ModerationConfig } from "../../moderation/config";

export type SanctionDmAction = "warn" | "mute" | "kick" | "ban";
export type SanctionDmSource = "manual" | "automod" | "raid" | undefined;

const TITLES: Record<SanctionDmAction, string> = {
  warn: "⚠️ Ai primit un avertisment",
  mute: "🔇 Ai primit timeout",
  kick: "🚪 Ai fost scos de pe server",
  ban: "⛔ Ai fost banat",
};

/** Whether this sanction sends a private message, from the server's settings and where the sanction came from. */
export function shouldSendSanctionDm(config: ModerationConfig, type: string, source: SanctionDmSource): type is SanctionDmAction {
  const settings = config.sanctionDm;
  if (!settings?.enabled) return false;
  if (source === "raid") return false;
  if (source === "automod" && !settings.automatic) return false;
  return (settings.actions as readonly string[]).includes(type);
}

function fill(template: string, values: { guild: string; caseId?: string }): string {
  return template
    .replace(/\{guild\}/gi, values.guild)
    .replace(/\{case\}/gi, values.caseId ?? "—");
}

function colorNumber(hex: string | undefined): number {
  return /^#[0-9a-f]{6}$/i.test(hex ?? "") ? Number.parseInt(hex!.slice(1), 16) : 0x5865f2;
}

export type SanctionDmInput = {
  type: SanctionDmAction;
  guildName: string;
  reason: string;
  durationMinutes?: number;
  caseId?: string;
  /** Who gave it; "the bot" for an automatic sanction. */
  moderator?: string;
  now?: Date;
  /** The ban appeal page on the site; used for a ban when appeals are on and no other link is set. */
  appealPageUrl?: string | null;
};

/** The message as Discord takes it (an embed and, with an appeal link, a link button). */
export function buildSanctionDm(config: ModerationConfig, input: SanctionDmInput) {
  const settings = config.sanctionDm;
  const now = input.now ?? new Date();
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (settings.showReason) fields.push({ name: "Motiv", value: (input.reason || "Fără motiv specificat").slice(0, 1_024) });
  if (input.type === "mute" && input.durationMinutes) {
    const until = Math.floor((now.getTime() + input.durationMinutes * 60_000) / 1_000);
    fields.push({ name: "Durată", value: `${input.durationMinutes} ${input.durationMinutes === 1 ? "minut" : "minute"}, până la <t:${until}:f>`, inline: true });
  }
  if (settings.showModerator && input.moderator) fields.push({ name: "Dată de", value: input.moderator.slice(0, 256), inline: true });
  if (input.caseId) fields.push({ name: "ID-ul cazului", value: `\`${input.caseId}\`` });
  const appeal = fill(input.type === "kick" || input.type === "ban" ? settings.removedAppealText : settings.appealText, {
    guild: input.guildName, caseId: input.caseId,
  }).trim();
  const pageUrl = input.type === "ban" && config.appeals?.enabled && !settings.appealUrl && input.appealPageUrl?.startsWith("https://")
    ? input.appealPageUrl
    : null;
  // The default "write to an administrator" text would contradict the button; a text the server wrote itself stays.
  const defaultText = settings.removedAppealText === defaultModerationConfig.sanctionDm.removedAppealText;
  const appealText = pageUrl && (!appeal || defaultText) ? "Poți contesta banul pe site, cu contul tău Discord." : appeal;
  if (appealText) fields.push({ name: "Contestație", value: appealText.slice(0, 1_024) });
  return {
    embeds: [{
      title: TITLES[input.type],
      description: `Pe serverul **${input.guildName.slice(0, 100)}**.`,
      color: colorNumber(config.embeds?.color),
      fields,
      timestamp: now.toISOString(),
    }],
    components: settings.appealUrl || pageUrl
      ? [{ type: 1, components: [{ type: 2, style: 5, label: "Contestă", url: (settings.appealUrl ?? pageUrl)! }] }]
      : [],
    allowedMentions: { parse: [] as never[] },
  };
}

/** Sends the message; a member with closed DMs simply does not get it. Returns whether it arrived. */
export async function sendSanctionDm(user: Pick<User, "id" | "send">, payload: ReturnType<typeof buildSanctionDm>, guildId: string): Promise<boolean> {
  try {
    await Promise.race([
      user.send(payload as never),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000).unref?.()),
    ]);
    return true;
  } catch (error) {
    logger.info({ guildId, userId: user.id, error: error instanceof Error ? error.message : String(error) }, "Sanction DM could not be delivered");
    return false;
  }
}

/** Sent when a kick or ban announced in private could not be applied after all. */
export function sanctionNotAppliedDm(guildName: string) {
  return {
    content: `ℹ️ Sancțiunea anunțată mai sus pe **${guildName.slice(0, 100)}** nu a putut fi aplicată. Poți ignora mesajul anterior.`,
    allowedMentions: { parse: [] as never[] },
  };
}

/**
 * A kick or a ban: the message goes first, then the member is removed. If
 * Discord refuses the removal, the member is told to ignore the message and
 * the error goes on. Returns whether the message arrived (undefined without one).
 */
export async function announceThenRemove(
  user: Pick<User, "id" | "send">,
  payload: ReturnType<typeof buildSanctionDm> | null,
  remove: () => Promise<unknown>,
  guildName: string,
  guildId: string,
): Promise<boolean | undefined> {
  const delivered = payload ? await sendSanctionDm(user, payload, guildId) : undefined;
  try {
    await remove();
  } catch (error) {
    if (delivered) await user.send(sanctionNotAppliedDm(guildName) as never).catch(() => undefined);
    throw error;
  }
  return delivered;
}
