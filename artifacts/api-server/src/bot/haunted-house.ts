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
  type Interaction,
} from "discord.js";
import { HAUNTED_DOOR_IMG } from "./assets";
import { loadHauntedHouseConfig } from "./db";
const COMMAND_NAME = "casabantuita";
const BUTTON_PREFIX = "hh";
const PENDING_TTL_MS = 3 * 60_000;
const PLAY_COOLDOWN_MS = 30_000;
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
  members: Map<string, HauntedMemberScore>;
  pending: Map<string, PendingChoice>;
  lastPlayedAt: Map<string, number>;
}

const activeEvents = new Map<string, HauntedGuildState>();
const closingEvents = new Set<string>();
const ghostCallTimestamps: number[] = [];
const ghostLastCallByUser = new Map<string, number>();
let openAiClient: OpenAI | null = null;

export const hauntedHouseCommand = new SlashCommandBuilder()
  .setName(COMMAND_NAME)
  .setDescription("🎃 Explorează Casa Bântuită și află ce ascunde fiecare ușă.")
  .addSubcommand((sub) => sub.setName("start").setDescription("[Admin] Pornește un nou eveniment Casa Bântuită."))
  .addSubcommand((sub) => sub.setName("stop").setDescription("[Admin] Oprește și șterge starea temporară a evenimentului."))
  .addSubcommand((sub) => sub.setName("joaca").setDescription("Alege una dintre cele trei uși ale Casei Bântuite."))
  .addSubcommand((sub) => sub.setName("clasament").setDescription("Vezi clasamentul temporar al Casei Bântuite."));

export function startHauntedHouse(guildId: string, now = Date.now()): boolean {
  if (activeEvents.has(guildId)) return false;
  closingEvents.delete(guildId);
  activeEvents.set(guildId, {
    sessionId: randomUUID(),
    startedAt: now,
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

export function isHauntedHouseActive(guildId: string): boolean {
  return activeEvents.has(guildId);
}

export function getHauntedHouseSessionId(guildId: string): string | null {
  return activeEvents.get(guildId)?.sessionId ?? null;
}

export function getHauntedHouseStatus(guildId: string): { active: boolean; startedAt: number | null } {
  const state = activeEvents.get(guildId);
  return { active: Boolean(state), startedAt: state?.startedAt ?? null };
}

export function formatHauntedHouseLeaderboard(
  leaderboard: ReturnType<typeof getHauntedHouseLeaderboard>,
  final = false,
): string {
  const title = final ? "🎃 **Clasamentul final al Casei Bântuite**" : "🎃 **Clasamentul Casei Bântuite**";
  return leaderboard.length
    ? [
        title,
        ...leaderboard.map((entry, index) =>
          `**${index + 1}.** <@${entry.userId}> — **${entry.points}** puncte · 🍬 ${entry.candies} bomboane · ${entry.plays}/${HAUNTED_HOUSE_MAX_PLAYS} încercări`,
        ),
      ].join("\n")
    : `${title}\nEvenimentul s-a încheiat fără participanți.`;
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

export function completeHauntedHouseStop(guildId: string, sessionId: string): boolean {
  if (!closingEvents.has(guildId) || activeEvents.get(guildId)?.sessionId !== sessionId) return false;
  stopHauntedHouse(guildId);
  return true;
}

export function cancelHauntedHouseStop(guildId: string, sessionId: string): void {
  if (activeEvents.get(guildId)?.sessionId === sessionId) closingEvents.delete(guildId);
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
  if (!state || closingEvents.has(guildId)) return { ok: false, reason: "inactive" };

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
    : normalizedRoll < 0.4
      ? [{ title: "Umbra prietenoasă", detail: "O umbră îți lasă câteva bomboane pe prag.", candies: 5, points: 4 }]
      : normalizedRoll < 0.8
        ? [{ title: "Ecoul casei", detail: "Ecoul îți dă curaj, dar nicio bomboană.", candies: 0, points: 2 }]
        : [{ title: "Păianjenul șugubăț", detail: "Un păianjen îți fură o bomboană și fuge râzând.", candies: 0, points: 1 }];

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
  if (!state || closingEvents.has(guildId)) return { ok: false, reason: "inactive" };

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
  const updated = {
    plays: current.plays + 1,
    candies: current.candies + outcome.candies,
    points: current.points + outcome.points,
  };
  state.members.set(userId, updated);
  state.lastPlayedAt.set(userId, now);
  return {
    ok: true,
    outcome,
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
      { role: "system", content: "Generezi exclusiv narațiune ficțională scurtă pentru Casa Bântuită." },
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

function formatIssueError(reason: Exclude<IssueChoiceResult, { ok: true }>["reason"] | "invalid"): string {
  switch (reason) {
    case "inactive": return "👻 Casa Bântuită nu este deschisă acum.";
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

export async function handleHauntedHouseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "start" || subcommand === "stop") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "❌ Doar administratorii pot porni sau opri Casa Bântuită.", ephemeral: true });
      return;
    }
    if (subcommand === "start") {
      if (!startHauntedHouse(guildId)) {
        await interaction.reply({ content: "🎃 Casa Bântuită este deja deschisă pe acest server.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: "🎃 **Casa Bântuită s-a deschis!** Folosește `/casabantuita joaca` pentru a alege o ușă. Fiecare membru are trei încercări.",
        ephemeral: true,
      });
    } else {
      const closing = beginHauntedHouseStop(guildId);
      const finalBoard = closing ? formatHauntedHouseLeaderboard(closing.leaderboard, true) : "";
      let published = false;
      try {
        const config = await loadHauntedHouseConfig(guildId);
        const guild = interaction.guild;
        if (closing && config.leaderboardChannelId && guild) {
          const channel = await guild.channels.fetch(config.leaderboardChannelId);
          if (!(channel instanceof TextChannel)) throw new Error("Canalul clasamentului nu mai este disponibil.");
          const botMember = guild.members.me ?? await guild.members.fetchMe();
          if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages)) {
            throw new Error("Botul nu mai are acces pentru a publica în canalul clasamentului.");
          }
          await channel.send({ content: finalBoard, allowedMentions: { parse: [] } });
          published = true;
        }
      } catch (error) {
        if (closing) cancelHauntedHouseStop(guildId, closing.sessionId);
        await interaction.reply({
          content: `❌ Clasamentul final nu a putut fi publicat; evenimentul rămâne activ. ${error instanceof Error ? error.message : ""}`,
          ephemeral: true,
        });
        return;
      }
      if (closing) completeHauntedHouseStop(guildId, closing.sessionId);
      await interaction.reply({
        content: closing
          ? `${published ? "🕯️ Casa Bântuită s-a închis, iar clasamentul final a fost publicat." : `🕯️ Casa Bântuită s-a închis.\n\n${finalBoard}`}`
          : "🕯️ Casa Bântuită era deja închisă.",
        ephemeral: true,
      });
    }
    return;
  }

  if (subcommand === "joaca") {
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
    return;
  }

  if (!isHauntedHouseActive(guildId)) {
    await interaction.reply({ content: "👻 Casa Bântuită nu este deschisă acum.", ephemeral: true });
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
  await interaction.reply({ content, allowedMentions: { parse: [] }, ephemeral: true });
}

export async function handleHauntedHouseDoorButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:`)) return false;
  const parsed = parseDoorButton(interaction.customId);
  if (!parsed || parsed.guildId !== interaction.guildId || parsed.userId !== interaction.user.id) {
    await interaction.reply({ content: "🚪 Acest prag nu îți aparține sau nu mai este valid.", ephemeral: true });
    return true;
  }

  const sessionId = getHauntedHouseSessionId(parsed.guildId);
  // Acknowledge before any AI/network work; the game state itself is committed synchronously below.
  await interaction.deferUpdate();
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

  const narrative = await generateGhostNarrative(parsed.door, parsed.userId);
  if (!sessionId || getHauntedHouseSessionId(parsed.guildId) !== sessionId) {
    await interaction.editReply({ content: "🕯️ Casa Bântuită s-a închis înainte ca fantoma să-și termine șoapta.", components: [] });
    return true;
  }

  await interaction.editReply({
    content: [
      `👻 **Fantoma șoptește:** ${narrative}`,
      "",
      `🚪 **${HAUNTED_DOORS[parsed.door].label}** — ${result.outcome.detail}`,
      `🍬 Bomboane de eveniment: **+${result.outcome.candies}** · 🎃 Puncte: **+${result.outcome.points}**`,
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
  return false;
}
export function resetHauntedHouseStateForTests(): void {
  activeEvents.clear();
  closingEvents.clear();
  ghostCallTimestamps.length = 0;
  ghostLastCallByUser.clear();
}
