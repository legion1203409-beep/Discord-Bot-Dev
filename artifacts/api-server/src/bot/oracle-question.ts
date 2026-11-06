/**
 * Întrebarea zilei: o dată pe zi, la ora aleasă din panou, Oracolul pune în
 * canalul ales o întrebare pentru toată comunitatea, din lista lui sau din
 * cea scrisă de server. Ziua ultimei întrebări se ține în baza de date.
 */
import { EmbedBuilder, type Client } from "discord.js";
import { logger } from "../lib/logger";
import { loadDailyQuestionDate, saveDailyQuestionDate } from "./db";
import { isOracleEnabled } from "./oracle";
import { getOracleSettings, localDayAndHour, type OracleSettings } from "./oracle-settings";

const CHECK_EVERY_MS = 60_000;
const postedDay = new Map<string, string>();
const posting = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

export const ORACLE_QUESTIONS: readonly string[] = [
  "Ce monstru ai vrea să nu mai întâlnești niciodată în Regat și de ce?",
  "Dacă ai primi un singur obiect din Fierărie, care ar fi acela?",
  "Care a fost cea mai grea luptă din ultima săptămână?",
  "Ce ai schimba la Regat dacă ai fi rege pentru o zi?",
  "Ce joc ți-a plăcut cel mai mult în ultima vreme și de ce?",
  "Cine din comunitate merită un mulțumesc azi?",
  "Ce ai face cu 1.000 de Oboli primiți dintr-odată?",
  "Care e cel mai bun sfat pe care l-ai primit pe server?",
  "Ce loc din lume ai vrea să vezi construit în joc?",
  "Ce ai vrea să știe un nou-venit despre Regat din prima zi?",
  "Care e povestea ta preferată, din orice carte sau film?",
  "Dacă ai fi o vietate din Regat, care ai fi?",
  "Ce rutină ai înainte să intri pe server?",
  "Ce misiune nouă ți-ar plăcea să apară?",
];

/** The question for a day: the same one all day, different from day to day. */
export function questionForDay(settings: OracleSettings, day: string): string {
  const own = settings.community.dailyQuestion;
  const pool = own.useOwnQuestions && own.ownQuestions.length ? own.ownQuestions : ORACLE_QUESTIONS;
  const seed = [...day].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1_000_003, 7);
  return pool[seed % pool.length]!;
}

export function isDailyQuestionDue(settings: OracleSettings, lastDay: string | null | undefined, now: Date): { due: boolean; day: string } {
  const question = settings.community.dailyQuestion;
  const { day, hour } = localDayAndHour(now, question.timeZone);
  return { due: settings.enabled && question.enabled && Boolean(question.channelId) && hour === question.hour && lastDay !== day, day };
}

async function postDailyQuestion(client: Client, guildId: string, settings: OracleSettings, day: string): Promise<void> {
  const channelId = settings.community.dailyQuestion.channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel) || ("guildId" in channel && channel.guildId !== guildId)) {
    logger.warn({ guildId, channelId }, "Daily question channel is not a text channel of this server");
    postedDay.set(guildId, day);
    return;
  }
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xd8a964).setTitle("❓ Întrebarea zilei").setDescription(questionForDay(settings, day))
      .setFooter({ text: "Răspunde în fir sau în canal." })],
    allowedMentions: { parse: [] },
  });
  postedDay.set(guildId, day);
  await saveDailyQuestionDate(guildId, day);
  logger.info({ guildId, channelId, day }, "Daily question posted");
}

export async function checkDailyQuestions(client: Client, now = new Date()): Promise<void> {
  for (const guildId of client.guilds.cache.keys()) {
    if (posting.has(guildId) || !isOracleEnabled(guildId)) continue;
    const settings = getOracleSettings(guildId);
    if (!isDailyQuestionDue(settings, postedDay.get(guildId), now).due) continue;
    posting.add(guildId);
    try {
      const stored = await loadDailyQuestionDate(guildId);
      const { due, day } = isDailyQuestionDue(settings, stored, now);
      if (!due) {
        if (stored) postedDay.set(guildId, stored);
        continue;
      }
      await postDailyQuestion(client, guildId, settings, day);
    } catch (err) {
      logger.warn({ err, guildId }, "Daily question could not be posted");
    } finally {
      posting.delete(guildId);
    }
  }
}

export function startDailyQuestionScheduler(client: Client): void {
  if (timer) return;
  timer = setInterval(() => { void checkDailyQuestions(client); }, CHECK_EVERY_MS);
  timer.unref?.();
}
