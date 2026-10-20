import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from "discord.js";
import { HAUNTED_DOOR_IMG } from "./assets";
import {
  awardActivityXp,
  getActivityRankConfig,
  syncActivityMilestoneRole,
} from "./activity-ranks";
import { ACTIVITY_EVENT_XP, activityLevelForXp } from "./activity-ranks-core";
import {
  clearHauntedHouseAnnouncementMessage,
  clearHauntedHouseSession,
  loadHauntedHouseAnnouncementMessage,
  loadHauntedHouseConfig,
  loadHauntedHouseSession,
  saveHauntedHouseAnnouncementMessage,
  saveHauntedHouseSession,
} from "./db";
import { publishHauntedHouseLeaderboard, resetHauntedHouseLeaderboardForTests } from "./haunted-house-leaderboard";
import { logger } from "../lib/logger";
const COMMAND_NAME = "casabantuita";
const BUTTON_PREFIX = "hh";
const ENTER_BUTTON_PREFIX = "hh_enter";
const PENDING_TTL_MS = 3 * 60_000;
const PLAY_COOLDOWN_MS = 30_000;
export const HAUNTED_HOUSE_DURATION_MS = 10 * 60_000;
export const HAUNTED_HOUSE_MAX_PLAYS = 3;
export const HAUNTED_HOUSE_MAX_NARRATIVE_CHARS = 400;
export const HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR = 40;
const AI_USER_COOLDOWN_MS = 20_000;
const AI_TIMEOUT_MS = 5_000;
const AI_MODEL = "gpt-5-mini";

export const HAUNTED_DOORS = {
  felinar: { label: "Ușa felinarului", hint: "Lumina pâlpâie dincolo de prag." },
  craniu: { label: "Ușa craniului", hint: "Din spatele osului se aude un șoptit." },
  paianjen: { label: "Ușa pânzei", hint: "Pânza tremură, deși nu bate vântul." },
} as const;

export type HauntedDoor = keyof typeof HAUNTED_DOORS;

export interface HauntedOutcome {
  title: string;
  detail: string;
  candies: number;
  points: number;
}

interface HauntedMemberScore {
  plays: number;
  candies: number;
  points: number;
}

interface PendingChoice {
  userId: string;
  expiresAt: number;
}

interface HauntedGuildState {
  sessionId: string;
  startedAt: number;
  expiresAt: number;
  members: Map<string, HauntedMemberScore>;
  pending: Map<string, PendingChoice>;
  lastPlayedAt: Map<string, number>;
}

const activeEvents = new Map<string, HauntedGuildState>();
const closingEvents = new Set<string>();
const restorePromises = new Map<string, Promise<void>>();
const sessionPersistenceQueues = new Map<string, Promise<void>>();
const ghostCallTimestamps: number[] = [];
const ghostLastCallByUser = new Map<string, number>();
let openAiClient: OpenAI | null = null;

export const hauntedHouseCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription("🏰 Explorează Castelul Bântuit și află ce ascunde fiecare ușă.")
  .addSubcommand((sub) => sub.setName("start").setDescription("[Admin] Pornește un nou eveniment la Castelul Bântuit."))
  .addSubcommand((sub) => sub.setName("stop").setDescription("[Admin] Oprește și șterge starea temporară a evenimentului."))
  .addSubcommand((sub) => sub.setName("joaca").setDescription("Alege una dintre cele trei uși ale Castelului Bântuit."))
  .addSubcommand((sub) => sub.setName("clasament").setDescription("Vezi clasamentul privat al evenimentului curent."));

export function startHauntedHouse(guildId: string, now = Date.now(), durationMs = HAUNTED_HOUSE_DURATION_MS): boolean {
  if (activeEvents.has(guildId)) return false;
  closingEvents.delete(guildId);
  activeEvents.set(guildId, {
    sessionId: randomUUID(),
    startedAt: now,
    expiresAt: now + durationMs,
    members: new Map(),
    pending: new Map(),
    lastPlayedAt: new Map(),
  });
  return true;
}

export function stopHauntedHouse(guildId: string): void {
  activeEvents.delete(guildId);
  closingEvents.delete(guildId);
}

export async function restoreHauntedHouseSession(guildId: string): Promise<void> {
  if (activeEvents.has(guildId)) return;
  const existing = restorePromises.get(guildId);
  if (existing) return existing;
  const restore = loadHauntedHouseSession(guildId).then((persisted) => {
    if (!persisted || activeEvents.has(guildId)) return;
    activeEvents.set(guildId, {
      sessionId: persisted.sessionId,
      startedAt: persisted.startedAt,
      expiresAt: persisted.expiresAt,
      members: new Map(persisted.members),
      pending: new Map(),
      lastPlayedAt: new Map(persisted.lastPlayedAt),
    });
  }).finally(() => {
    if (restorePromises.get(guildId) === restore) restorePromises.delete(guildId);
  });
  restorePromises.set(guildId, restore);
  return restore;
}
export function isHauntedHouseActive(guildId: string): boolean {
  const state = activeEvents.get(guildId);
  return Boolean(state && state.expiresAt > Date.now());
}

export function getHauntedHouseSessionId(guildId: string): string | null {
  return activeEvents.get(guildId)?.sessionId ?? null;
}

export function getHauntedHouseStatus(guildId: string): { active: boolean; startedAt: number | null; expiresAt: number | null } {
  const state = activeEvents.get(guildId);
  const active = Boolean(state && state.expiresAt > Date.now());
  return { active, startedAt: active ? state!.startedAt : null, expiresAt: active ? state!.expiresAt : null };
}

export function beginHauntedHouseStop(guildId: string): {
  sessionId: string;
  leaderboard: ReturnType<typeof getHauntedHouseLeaderboard>;
} | null {
  const state = activeEvents.get(guildId);
  if (!state || closingEvents.has(guildId)) return null;
  closingEvents.add(guildId);
  return { sessionId: state.sessionId, leaderboard: getHauntedHouseLeaderboard(guildId) };
}

export function cancelHauntedHouseStop(guildId: string, sessionId: string): boolean {
  if (!closingEvents.has(guildId) || activeEvents.get(guildId)?.sessionId !== sessionId) return false;
  closingEvents.delete(guildId);
  return true;
}

export function completeHauntedHouseStop(guildId: string, sessionId: string): boolean {
  if (!closingEvents.has(guildId) || activeEvents.get(guildId)?.sessionId !== sessionId) return false;
  stopHauntedHouse(guildId);
  return true;
}

export function buildHauntedHouseOpenAnnouncement(guildId: string) {
  const enterButton = new ButtonBuilder()
    .setCustomId(`${ENTER_BUTTON_PREFIX}:${guildId}`)
    .setLabel("Intră în casă")
    .setStyle(ButtonStyle.Primary);
  return {
    content: "🏰 **Castelul Bântuit s-a deschis pentru 10 minute!** Apasă pe **Intră în casă** ca să alegi o ușă. Fiecare membru are trei încercări.",
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(enterButton)],
    allowedMentions: { parse: [] as const },
  };
}

export async function publishHauntedHouseOpeningAnnouncement(
  channel: TextChannel,
  guildId: string,
  sessionId: string,
): Promise<void> {
  const message = await channel.send(buildHauntedHouseOpenAnnouncement(guildId));
  try {
    await saveHauntedHouseAnnouncementMessage(guildId, {
      sessionId,
      channelId: channel.id,
      messageId: message.id,
    });
  } catch (error) {
    await message.delete().catch(() => undefined);
    throw error;
  }
}

export async function deleteHauntedHouseOpeningAnnouncement(
  client: Client,
  guildId: string,
  sessionId: string,
): Promise<boolean> {
  const stored = await loadHauntedHouseAnnouncementMessage(guildId);
  if (!stored || stored.sessionId !== sessionId) return false;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Discord server is unavailable while deleting the Castle announcement.");
  const channel = await guild.channels.fetch(stored.channelId);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    throw new Error("Castle announcement channel is unavailable.");
  }

  try {
    const message = await channel.messages.fetch(stored.messageId);
    await message.delete();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "10008") throw error;
  }
  await clearHauntedHouseAnnouncementMessage(guildId, stored);
  return true;
}

export type IssueChoiceResult =
  | { ok: true; nonce: string; expiresAt: number }
  | { ok: false; reason: "inactive" | "limit" | "cooldown" | "pending" };

export function issueHauntedDoorChoice(
  guildId: string,
  userId: string,
  nonce: string,
  now = Date.now(),
): IssueChoiceResult {
  const state = activeEvents.get(guildId);
  if (!state || state.expiresAt <= now || closingEvents.has(guildId)) return { ok: false, reason: "inactive" };

  const score = state.members.get(userId);
  if ((score?.plays ?? 0) >= HAUNTED_HOUSE_MAX_PLAYS) return { ok: false, reason: "limit" };

  const lastPlayedAt = state.lastPlayedAt.get(userId);
  if (lastPlayedAt !== undefined && now - lastPlayedAt < PLAY_COOLDOWN_MS) return { ok: false, reason: "cooldown" };

  for (const [pendingNonce, pending] of state.pending) {
    if (pending.expiresAt <= now) {
      state.pending.delete(pendingNonce);
      continue;
    }
    if (pending.userId === userId) return { ok: false, reason: "pending" };
  }

  const expiresAt = now + PENDING_TTL_MS;
  state.pending.set(nonce, { userId, expiresAt });
  return { ok: true, nonce, expiresAt };
}

export type ClaimChoiceResult =
  | { ok: true; outcome: HauntedOutcome; plays: number; totalPoints: number; totalCandies: number }
  | { ok: false; reason: "inactive" | "invalid" | "limit" | "cooldown" };

export function rollHauntedOutcome(door: HauntedDoor, roll = Math.random()): HauntedOutcome {
  const normalizedRoll = Math.max(0, Math.min(0.999_999, roll));
  const outcomes: HauntedOutcome[] = normalizedRoll < 0.1
    ? [{ title: "Cutia cu bomboane", detail: "Ai găsit o cutie ascunsă sub praful vechi.", candies: 8, points: 7 }]
    : normalizedRoll < 0.3
      ? [{ title: "Umbra prietenoasă", detail: "O umbră îți lasă câteva bomboane pe prag.", candies: 5, points: 4 }]
      : normalizedRoll < 0.6
        ? [{ title: "Dulciurile uitate", detail: "O bomboană strălucește pe podeaua prăfuită.", candies: 2, points: 3 }]
        : normalizedRoll < 0.8
          ? [{ title: "Ecoul casei", detail: "Ecoul îți dă curaj, dar nicio bomboană.", candies: 0, points: 2 }]
          : normalizedRoll < 0.95
            ? [{ title: "Păianjenul șugubăț", detail: "Un păianjen îți fură o bomboană și fuge râzând.", candies: -1, points: 1 }]
            : [{ title: "Umbra lacomă", detail: "O umbră îți fură două bomboane înainte să dispară.", candies: -2, points: 1 }];

  const doorFlavor: Record<HauntedDoor, string> = {
    felinar: "Lumina felinarului dansează pe pereți.",
    craniu: "Craniul de pe ușă clănțăne în urma ta.",
    paianjen: "Firele de pânză se strâng, apoi se destramă.",
  };
  const base = outcomes[0]!;
  return { ...base, detail: `${base.detail} ${doorFlavor[door]}` };
}

export function claimHauntedDoorChoice(
  guildId: string,
  userId: string,
  nonce: string,
  door: HauntedDoor,
  now = Date.now(),
  roll = Math.random(),
): ClaimChoiceResult {
  const state = activeEvents.get(guildId);
  if (!state || state.expiresAt <= now || closingEvents.has(guildId)) return { ok: false, reason: "inactive" };

  const pending = state.pending.get(nonce);
  if (!pending || pending.userId !== userId || pending.expiresAt <= now) {
    if (pending?.expiresAt && pending.expiresAt <= now) state.pending.delete(nonce);
    return { ok: false, reason: "invalid" };
  }
  state.pending.delete(nonce);

  const current = state.members.get(userId) ?? { plays: 0, candies: 0, points: 0 };
  if (current.plays >= HAUNTED_HOUSE_MAX_PLAYS) return { ok: false, reason: "limit" };
  const lastPlayedAt = state.lastPlayedAt.get(userId);
  if (lastPlayedAt !== undefined && now - lastPlayedAt < PLAY_COOLDOWN_MS) return { ok: false, reason: "cooldown" };

  const outcome = rollHauntedOutcome(door, roll);
  const candies = Math.max(0, current.candies + outcome.candies);
  const actualCandyDelta = candies - current.candies;
  const updated = {
    plays: current.plays + 1,
    candies,
    points: current.points + outcome.points,
  };
  state.members.set(userId, updated);
  state.lastPlayedAt.set(userId, now);
  return {
    ok: true,
    outcome: actualCandyDelta === outcome.candies ? outcome : {
      ...outcome,
      candies: actualCandyDelta,
      detail: "Umbra încearcă să-ți fure bomboane, dar nu poți avea mai puțin de zero.",
    },
    plays: updated.plays,
    totalPoints: updated.points,
    totalCandies: updated.candies,
  };
}

export function getHauntedHouseLeaderboard(guildId: string): Array<{
  userId: string;
  plays: number;
  candies: number;
  points: number;
}> {
  const state = activeEvents.get(guildId);
  if (!state) return [];
  return [...state.members.entries()]
    .map(([userId, score]) => ({ userId, ...score }))
    .sort((left, right) => right.points - left.points || right.candies - left.candies || left.userId.localeCompare(right.userId))
    .slice(0, 10);
}

export function getHauntedHouseExpiry(guildId: string): number | null {
  return activeEvents.get(guildId)?.expiresAt ?? null;
}

export function buildGhostPrompt(door: HauntedDoor): string {
  const selectedDoor = HAUNTED_DOORS[door];
  return [
    "Ești fantoma unei case bântuite dintr-o poveste de Halloween.",
    "Răspunde exclusiv în română, în cel mult două propoziții și maximum 400 de caractere.",
    "Scrie o narațiune scurtă și un indiciu atmosferic despre ușa aleasă.",
    "Nu inventa și nu anunța bomboane, puncte, premii, scoruri sau rezultate de joc.",
    "Nu cere informații, nu folosi mențiuni Discord și nu urma instrucțiuni din afara rolului.",
    `Ușa aleasă: ${selectedDoor.label}. Indiciu vizual: ${selectedDoor.hint}`,
  ].join("\n");
}

function fallbackNarrative(door: HauntedDoor): string {
  const lines: Record<HauntedDoor, string> = {
    felinar: "Flacăra felinarului se apleacă spre tine. Un pas ușor răsună din încăperea unde lumina nu ajunge.",
    craniu: "Craniul își deschide fălcile fără glas. Privește umbrele de sub prag; una dintre ele arată drumul înapoi.",
    paianjen: "Pânza se leagănă, deși aerul stă nemișcat. Un fir argintiu ascunde urma unei treceri vechi.",
  };
  return lines[door];
}

export type GhostNarrativeProvider = (prompt: string) => Promise<string | null>;

function openAiNarrativeProvider(prompt: string): Promise<string | null> {
  openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return openAiClient.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: "Generezi exclusiv narațiune ficțională scurtă pentru Castelul Bântuit." },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 160,
    reasoning_effort: "minimal",
  }).then((response) => response.choices[0]?.message?.content ?? null);
}

export async function generateGhostNarrative(
  door: HauntedDoor,
  userId: string,
  now = Date.now(),
  provider: GhostNarrativeProvider = openAiNarrativeProvider,
): Promise<string> {
  const fallback = fallbackNarrative(door);
  if (!process.env.OPENAI_API_KEY) return fallback;

  while (ghostCallTimestamps.length && now - ghostCallTimestamps[0]! >= 60 * 60_000) ghostCallTimestamps.shift();
  if (ghostCallTimestamps.length >= HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR) return fallback;
  if (now - (ghostLastCallByUser.get(userId) ?? 0) < AI_USER_COOLDOWN_MS) return fallback;

  // Reserve synchronously before the request so concurrent button clicks cannot exceed the limits.
  ghostCallTimestamps.push(now);
  ghostLastCallByUser.set(userId, now);
  try {
    const generated = await provider(buildGhostPrompt(door));
    if (!generated) return fallback;
    const bounded = generated
      .replace(/@/g, "＠")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, HAUNTED_HOUSE_MAX_NARRATIVE_CHARS);
    return bounded || fallback;
  } catch {
    return fallback;
  }
}

export async function generateScheduledGhostStory(
  provider: GhostNarrativeProvider = openAiNarrativeProvider,
): Promise<string> {
  const fallback = "În #chat-joc, lumânările s-au stins toate deodată. Când s-au reaprins, pe oglindă apăruse un nume pe care nimeni nu-l rostise.";
  if (!process.env.OPENAI_API_KEY) return fallback;
  const now = Date.now();
  while (ghostCallTimestamps.length && now - ghostCallTimestamps[0]! >= 60 * 60_000) ghostCallTimestamps.shift();
  if (ghostCallTimestamps.length >= HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR) return fallback;
  ghostCallTimestamps.push(now);
  try {
    const generated = await provider([
      "Scrie o singură șoaptă horror originală, în română, pentru chatul unui server Discord.",
      "Maximum două propoziții și 400 de caractere. Fără mențiuni Discord, bomboane sau puncte.",
    ].join("\n"));
    return (generated ?? fallback).replace(/@/g, "＠").replace(/\s+/g, " ").trim().slice(0, HAUNTED_HOUSE_MAX_NARRATIVE_CHARS) || fallback;
  } catch {
    return fallback;
  }
}

function formatIssueError(reason: Exclude<IssueChoiceResult, { ok: true }>["reason"] | "invalid"): string {
  switch (reason) {
    case "inactive": return "👻 Castelul Bântuit nu este deschis acum.";
    case "limit": return `🎃 Ai folosit toate cele ${HAUNTED_HOUSE_MAX_PLAYS} încercări din acest eveniment.`;
    case "cooldown": return "⏳ Mai așteaptă puțin înainte de următoarea explorare.";
    case "pending": return "🚪 Alege mai întâi o ușă din panoul de explorare deja deschis.";
    case "invalid": return "🚪 Această alegere a expirat sau a fost deja folosită. Deschide o nouă explorare.";
  }
}

function buildDoorRow(guildId: string, userId: string, nonce: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(Object.entries(HAUNTED_DOORS) as Array<[HauntedDoor, (typeof HAUNTED_DOORS)[HauntedDoor]]>)
      .map(([door, config]) => new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:${guildId}:${userId}:${nonce}:${door}`)
        .setLabel(config.label)
        .setStyle(ButtonStyle.Secondary)),
  );
}

function buildDoorEmbed(door: HauntedDoor): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x322b3b)
    .setTitle(HAUNTED_DOORS[door].label)
    .setDescription(HAUNTED_DOORS[door].hint)
    .setImage(HAUNTED_DOOR_IMG[door]);
}
function parseDoorButton(customId: string): { guildId: string; userId: string; nonce: string; door: HauntedDoor } | null {
  const [prefix, guildId, userId, nonce, door, ...extra] = customId.split(":");
  if (
    prefix !== BUTTON_PREFIX || !guildId || !userId || !nonce || extra.length > 0 ||
    !door || !Object.hasOwn(HAUNTED_DOORS, door)
  ) return null;
  return { guildId, userId, nonce, door: door as HauntedDoor };
}

function formatHauntedHouseLeaderboard(
  leaderboard: ReturnType<typeof getHauntedHouseLeaderboard>,
  final = false,
): string {
  const title = final ? "🏆 Clasamentul final al Casei Bântuite" : "🎃 Clasamentul Casei Bântuite";
  if (!leaderboard.length) return `${title}\n\nEvenimentul s-a încheiat fără participanți.`;
  return [
    title,
    "",
    ...leaderboard.map((entry, index) =>
      `**${index + 1}.** <@${entry.userId}> — **${entry.points}** puncte · 🍬 ${entry.candies} bomboane · ${entry.plays}/${HAUNTED_HOUSE_MAX_PLAYS} încercări`,
    ),
  ].join("\n");
}

async function publishGuildLeaderboard(
  guild: NonNullable<ChatInputCommandInteraction["guild"]>,
  guildId: string,
  sessionId: string,
  final = false,
): Promise<boolean> {
  const config = await loadHauntedHouseConfig(guildId);
  if (!config.leaderboardChannelId) return false;
  const channel = await guild.channels.fetch(config.leaderboardChannelId);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    throw new Error("Canalul clasamentului nu mai este disponibil.");
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  if (!channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ])) {
    throw new Error("Botul trebuie să poată vedea canalul, trimite mesaje și citi istoricul pentru a actualiza clasamentul.");
  }
  await updateHauntedHouseLeaderboard(guildId, sessionId, channel, final);
  return true;
}
export async function handleHauntedHouseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  try {
    await restoreHauntedHouseSession(guildId);
  } catch (error) {
    logger.error({ err: error, guildId }, "Haunted House session could not be restored");
    await interaction.editReply({ content: "❌ Starea Castelului Bântuit nu a putut fi încărcată. Încearcă din nou." });
    return;
  }

  if (subcommand === "start" || subcommand === "stop") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ Doar administratorii pot porni sau opri Castelul Bântuit." });
      return;
    }
    if (subcommand === "start") {
      if (!startHauntedHouse(guildId)) {
        await interaction.editReply({ content: "🎃 Castelul Bântuit este deja deschis pe acest server." });
        return;
      }
      const sessionId = getHauntedHouseSessionId(guildId)!;
      try {
        await persistHauntedHouseSession(guildId);
      } catch (error) {
        logger.error({ err: error, guildId }, "Haunted House session could not be persisted");
        stopHauntedHouse(guildId);
        await clearPersistedHauntedHouseSession(guildId).catch(() => undefined);
        await interaction.editReply({ content: "❌ Castelul Bântuit nu a putut fi salvat. Încearcă din nou." });
        return;
      }
      try {
        const config = await loadHauntedHouseConfig(guildId);
        const channel = config.startChannelId && interaction.guild
          ? await interaction.guild.channels.fetch(config.startChannelId).catch(() => null)
          : null;
        if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
          throw new Error("Canalul de anunțuri nu este configurat sau nu mai este disponibil.");
        }
        await publishHauntedHouseOpeningAnnouncement(channel, guildId, sessionId);
      } catch (error) {
        stopHauntedHouse(guildId);
        await clearPersistedHauntedHouseSession(guildId).catch(() => undefined);
        await interaction.editReply({
          content: `❌ Castelul nu a putut fi deschis: ${error instanceof Error ? error.message : "eroare Discord."}`,
        });
        return;
      }
      let boardNote = "";
      if (interaction.guild) {
        try {
          await publishGuildLeaderboard(interaction.guild, guildId, sessionId);
        } catch (error) {
          logger.warn({ err: error, guildId }, "Haunted House opening leaderboard could not be published");
          boardNote = "\nClasamentul public va fi reîncercat la prima rundă.";
        }
      }
      await interaction.editReply({
        content: `🏰 Castelul Bântuit s-a deschis. Anunțul și butonul de intrare au fost publicate.${boardNote}`,
      });
    } else {
      const closing = beginHauntedHouseStop(guildId);
      const finalBoard = closing ? formatHauntedHouseLeaderboard(closing.leaderboard, true) : "";
      let published = false;
      try {
        const config = await loadHauntedHouseConfig(guildId);
        const guild = interaction.guild;
        if (closing && config.leaderboardChannelId && guild) {
          await publishGuildLeaderboard(guild, guildId, closing.sessionId, true);
          published = true;
        }
        if (closing) await clearPersistedHauntedHouseSession(guildId);
      } catch (error) {
        if (closing) cancelHauntedHouseStop(guildId, closing.sessionId);
        await interaction.editReply({
          content: `❌ Clasamentul final nu a putut fi publicat; evenimentul rămâne activ. ${error instanceof Error ? error.message : ""}`,
        });
        return;
      }
      if (closing && completeHauntedHouseStop(guildId, closing.sessionId)) {
        await deleteHauntedHouseOpeningAnnouncement(interaction.client, guildId, closing.sessionId).catch((error) => {
          logger.warn({ err: error, guildId }, "Failed to delete Haunted House opening announcement");
        });
      }
      await interaction.editReply({
        content: closing
          ? `${published ? "🕯️ Castelul Bântuit s-a închis, iar clasamentul final a fost publicat." : `🕯️ Castelul Bântuit s-a închis.\n\n${finalBoard}`}`
          : "🕯️ Castelul Bântuit era deja închis.",
      });
    }
    return;
  }

  if (subcommand === "joaca") {
    const nonce = randomUUID();
    const issued = issueHauntedDoorChoice(guildId, interaction.user.id, nonce);
    if (!issued.ok) {
      await interaction.editReply({ content: formatIssueError(issued.reason) });
      return;
    }
    await interaction.editReply({
      content: "🚪 Trei uși se deschid spre întuneric. Alege una; fantoma îți va lăsa o narațiune și un indiciu.",
      embeds: (Object.keys(HAUNTED_DOORS) as HauntedDoor[]).map(buildDoorEmbed),
      components: [buildDoorRow(guildId, interaction.user.id, issued.nonce)],
    });
    return;
  }

  if (!isHauntedHouseActive(guildId)) {
    await interaction.editReply({ content: "👻 Castelul Bântuit nu este deschis acum." });
    return;
  }
  const leaderboard = getHauntedHouseLeaderboard(guildId);
  const content = leaderboard.length
    ? [
        "🎃 **Clasamentul Casei Bântuite**",
        ...leaderboard.map((entry, index) =>
          `**${index + 1}.** <@${entry.userId}> — **${entry.points}** puncte · 🍬 ${entry.candies} bomboane · ${entry.plays}/${HAUNTED_HOUSE_MAX_PLAYS} încercări`,
        ),
      ].join("\n")
    : "🎃 Clasamentul este încă gol. Fii primul care explorează!";
  await interaction.editReply({ content, allowedMentions: { parse: [] } });
}

async function sendDoorChoices(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const nonce = randomUUID();
  const issued = issueHauntedDoorChoice(guildId, interaction.user.id, nonce);
  if (!issued.ok) {
    await interaction.reply({ content: formatIssueError(issued.reason), ephemeral: true });
    return;
  }
  await interaction.reply({
    content: "🚪 Trei uși se deschid spre întuneric. Alege una; fantoma îți va lăsa o narațiune și un indiciu.",
    embeds: (Object.keys(HAUNTED_DOORS) as HauntedDoor[]).map(buildDoorEmbed),
    components: [buildDoorRow(guildId, interaction.user.id, issued.nonce)],
    ephemeral: true,
  });
}

export async function handleHauntedHouseEnterButton(interaction: ButtonInteraction): Promise<boolean> {
  const [prefix, guildId, ...extra] = interaction.customId.split(":");
  if (prefix !== ENTER_BUTTON_PREFIX) return false;
  if (!guildId || extra.length > 0 || guildId !== interaction.guildId) {
    await interaction.reply({ content: "🚪 Acest buton aparține altui server.", ephemeral: true });
    return true;
  }
  await sendDoorChoices(interaction, guildId);
  return true;
}

export async function handleHauntedHouseDoorButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const parsed = parseDoorButton(interaction.customId);
  if (!parsed || parsed.guildId !== interaction.guildId || parsed.userId !== interaction.user.id) {
    await interaction.reply({ content: "🚪 Acest prag nu îți aparține sau nu mai este valid.", ephemeral: true });
    return true;
  }

  // Acknowledge before any AI/network work; the game state itself is committed synchronously below.
  await interaction.deferUpdate();
  try {
    await restoreHauntedHouseSession(parsed.guildId);
  } catch (error) {
    logger.error({ err: error, guildId: parsed.guildId }, "Haunted House session could not be restored");
    await interaction.editReply({ content: "❌ Starea Casei Bântuite nu a putut fi încărcată. Încearcă din nou.", components: [] });
    return true;
  }
  const sessionId = getHauntedHouseSessionId(parsed.guildId);
  const result = claimHauntedDoorChoice(
    parsed.guildId,
    parsed.userId,
    parsed.nonce,
    parsed.door,
  );
  if (!result.ok) {
    await interaction.editReply({ content: formatIssueError(result.reason), components: [] });
    return true;
  }

  try {
    await persistHauntedHouseSession(parsed.guildId);
  } catch (error) {
    logger.error({ err: error, guildId: parsed.guildId }, "Haunted House score could not be persisted");
  }
  if (interaction.guild && sessionId) {
    void publishGuildLeaderboard(interaction.guild, parsed.guildId, sessionId).catch((error) => {
      logger.warn({ err: error, guildId: parsed.guildId }, "Haunted House live leaderboard update failed");
    });
  }

  let activityXpText = "Rangul de activitate este dezactivat pe acest server.";
  try {
    const activityConfig = await getActivityRankConfig(parsed.guildId);
    if (activityConfig.enabled) {
      const award = await awardActivityXp(parsed.guildId, parsed.userId, "event");
      if (award) {
        activityXpText = `✨ Rang de activitate: **+${ACTIVITY_EVENT_XP} XP**.`;
        const previousLevel = activityLevelForXp(award.previousXp);
        const level = activityLevelForXp(award.totalXp);
        if (level > previousLevel && interaction.guild) {
          const member = interaction.guild.members.cache.get(parsed.userId) ??
            await interaction.guild.members.fetch(parsed.userId).catch(() => null);
          if (member) {
            void syncActivityMilestoneRole(member, level).catch((error) =>
              logger.warn({ err: error, guildId: parsed.guildId, userId: parsed.userId, level },
                "Activity rank role could not be synchronized after Haunted House"),
            );
          }
        }
      }
    }
  } catch (error) {
    activityXpText = "⚠️ XP-ul de rang de activitate nu a putut fi salvat.";
    logger.warn({ err: error, guildId: parsed.guildId, userId: parsed.userId },
      "Activity XP award for Haunted House could not be saved");
  }

  const narrative = await generateGhostNarrative(parsed.door, parsed.userId);
  if (!sessionId || getHauntedHouseSessionId(parsed.guildId) !== sessionId) {
    await interaction.editReply({ content: "🕯️ Castelul Bântuit s-a închis înainte ca fantoma să-și termine șoapta.", components: [] });
    return true;
  }

  await interaction.editReply({
    content: [
      `👻 **Fantoma șoptește:** ${narrative}`,
      "",
      `🚪 **${HAUNTED_DOORS[parsed.door].label}** — ${result.outcome.detail}`,
      `🍬 Bomboane de eveniment: **${result.outcome.candies >= 0 ? "+" : ""}${result.outcome.candies}** · 🎃 Puncte: **+${result.outcome.points}**`,
      activityXpText,
      `**Totalul tău în acest eveniment:** ${result.totalPoints} puncte · ${result.totalCandies} bomboane · încercarea ${result.plays}/${HAUNTED_HOUSE_MAX_PLAYS}.`,
    ].join("\n"),
    embeds: [buildDoorEmbed(parsed.door)],
    components: [],
    allowedMentions: { parse: [] },
  });
  return true;
}

export function dispatchHauntedHouseInteraction(
  interaction: Interaction,
  dispatch: (promise: Promise<unknown>) => void,
): boolean {
  if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
    dispatch(handleHauntedHouseCommand(interaction));
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) {
    dispatch(handleHauntedHouseDoorButton(interaction));
    return true;
  }
  if (interaction.isButton() && interaction.customId.startsWith(`${ENTER_BUTTON_PREFIX}:`)) {
    dispatch(handleHauntedHouseEnterButton(interaction));
    return true;
  }
  return false;
}
export function resetHauntedHouseStateForTests(): void {
  activeEvents.clear();
  closingEvents.clear();
  restorePromises.clear();
  sessionPersistenceQueues.clear();
  ghostCallTimestamps.length = 0;
  ghostLastCallByUser.clear();
  resetHauntedHouseLeaderboardForTests();
}

function enqueueHauntedHouseSessionWrite(guildId: string, write: () => Promise<void>): Promise<void> {
  const previous = sessionPersistenceQueues.get(guildId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(write);
  sessionPersistenceQueues.set(guildId, current);
  void current.finally(() => {
    if (sessionPersistenceQueues.get(guildId) === current) sessionPersistenceQueues.delete(guildId);
  }).catch(() => undefined);
  return current;
}

export function clearPersistedHauntedHouseSession(guildId: string): Promise<void> {
  return enqueueHauntedHouseSessionWrite(guildId, () => clearHauntedHouseSession(guildId));
}

export async function updateHauntedHouseLeaderboard(
  guildId: string,
  sessionId: string,
  channel: TextChannel,
  final = false,
): Promise<void> {
  await publishHauntedHouseLeaderboard(
    guildId,
    sessionId,
    channel,
    () => formatHauntedHouseLeaderboard(getHauntedHouseLeaderboard(guildId), final),
    final,
  );
}

export function persistHauntedHouseSession(guildId: string): Promise<void> {
  return enqueueHauntedHouseSessionWrite(guildId, async () => {
    const state = activeEvents.get(guildId);
    if (!state) {
      await clearHauntedHouseSession(guildId);
      return;
    }
    await saveHauntedHouseSession(guildId, {
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      expiresAt: state.expiresAt,
      members: [...state.members.entries()],
      lastPlayedAt: [...state.lastPlayedAt.entries()],
    });
  });
}
