import { ChannelType, type Guild } from "discord.js";
import type { ChannelConfig, VerificationConfig } from "./db";
import type { ModerationConfig } from "../moderation/config";
import type { TicketConfig, TicketCategoryKind } from "./ticket-config";

export type ProvisionedChannel = {
  key: string;
  id: string;
  name: string;
  type: "text" | "category";
};

export type ChannelProvisionResult = {
  channelConfig: ChannelConfig;
  ticketConfig: TicketConfig;
  moderationConfig: ModerationConfig;
  verification: VerificationConfig;
  created: ProvisionedChannel[];
  reused: ProvisionedChannel[];
};

type ChannelTypeName = "text" | "category";

type ChannelTarget = {
  key: string;
  currentId?: string | null;
  names: string[];
  type: ChannelTypeName;
  category: ProvisioningCategoryKey;
};

type ProvisioningCategoryKey = "gameplay" | "admin" | "filtered" | "links" | "security" | "verification";

type ProvisioningCategoryTarget = {
  key: ProvisioningCategoryKey;
  names: string[];
};

const CATEGORY_TARGETS: ProvisioningCategoryTarget[] = [
  { key: "gameplay", names: ["🎮・JOC ȘI EVENIMENTE", "joc si evenimente", "gameplay", "joc"] },
  { key: "admin", names: ["🛠️・ADMINISTRAȚIE", "administratie", "admin", "operatiuni"] },
  { key: "filtered", names: ["🧹・MESAJE FILTRATE", "mesaje filtrate", "moderare", "anti-spam"] },
  { key: "links", names: ["🔗・LINKURI", "linkuri", "filtrare linkuri", "anti-link"] },
  { key: "security", names: ["🚨・SECURITATE", "securitate", "anti-raid", "alerte securitate"] },
  { key: "verification", names: ["✅・VERIFICARE", "verificare", "verification"] },
];

const GAMEPLAY_TARGETS: Array<Omit<ChannelTarget, "currentId"> & { key: keyof ChannelConfig }> = [
  { key: "main", type: "text", category: "gameplay", names: ["cufere-si-oracol", "cufere", "oracol"] },
  { key: "event", type: "text", category: "gameplay", names: ["ora-umbrelor"] },
  { key: "boss", type: "text", category: "gameplay", names: ["dragonul-stins"] },
  { key: "trader", type: "text", category: "gameplay", names: ["negustorul"] },
  { key: "eventTop", type: "text", category: "gameplay", names: ["top-ora-umbrelor"] },
  { key: "bossTop", type: "text", category: "gameplay", names: ["top-dragonul-stins"] },
  { key: "council", type: "text", category: "admin", names: ["consiliul-umbrelor"] },
  { key: "fratia", type: "text", category: "admin", names: ["chivotul-fratiei", "fratia"] },
];

const TICKET_TARGETS: Array<{ key: TicketCategoryKind; names: string[] }> = [
  { key: "staff", names: ["🎫・TICHETE • STAFF", "tichete-staff", "aplicare-staff", "staff"] },
  { key: "partnership", names: ["🎫・TICHETE • PARTENERIATE", "tichete-parteneriate", "parteneriate", "partnership"] },
  { key: "help_report", names: ["🎫・TICHETE • AJUTOR", "tichete-ajutor-raportare", "ajutor-raportare", "help-report"] },
];

const MODERATION_TARGETS = [
  { key: "antiRaid.alertChannelId", category: "security", names: ["mod-anti-raid", "alerte-raid"] },
  { key: "antiSpam.logChannelId", category: "filtered", names: ["mod-anti-spam", "jurnal-anti-spam"] },
  { key: "suspiciousBehavior.alertChannelId", category: "security", names: ["mod-comportament-suspect", "alerte-comportament"] },
  { key: "ai.logChannelId", category: "filtered", names: ["mod-ai", "jurnal-ai"] },
  { key: "audit.channelId", category: "admin", names: ["mod-audit", "audit"] },
] as const;

const provisionLocks = new Map<string, Promise<ChannelProvisionResult>>();

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ro")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\p{Letter}\p{Number}]+/u, "")
    .replace(/[・|•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isExpectedType(channel: { type: ChannelType }, type: ChannelTypeName): boolean {
  return type === "category"
    ? channel.type === ChannelType.GuildCategory
    : channel.type === ChannelType.GuildText;
}

function setNestedChannelId(config: ModerationConfig, path: string, id: string): void {
  const [section, field] = path.split(".");
  if (section === "antiRaid" && field === "alertChannelId") config.antiRaid.alertChannelId = id;
  if (section === "antiSpam" && field === "logChannelId") config.antiSpam.logChannelId = id;
  if (section === "suspiciousBehavior" && field === "alertChannelId") config.suspiciousBehavior.alertChannelId = id;
  if (section === "ai" && field === "logChannelId") config.ai.logChannelId = id;
  if (section === "audit" && field === "channelId") config.audit.channelId = id;
}

async function moveToCategory(
  channel: { parentId?: string | null; setParent?: (categoryId: string) => Promise<unknown> },
  categoryId: string,
): Promise<void> {
  if (channel.parentId === categoryId) return;
  if (typeof channel.setParent !== "function") {
    throw new Error(`Canalul ${categoryId} nu suportă mutarea într-o categorie.`);
  }
  await channel.setParent(categoryId);
}

/**
 * Resolve all channel destinations from the live guild. A configured valid
 * channel always wins, then a matching existing name is reused, and only
 * after both checks does Discord receive a create request.
 */
async function provisionGuildChannelsUnlocked(
  guild: Guild,
  input: {
    channelConfig: ChannelConfig;
    ticketConfig: TicketConfig;
    moderationConfig: ModerationConfig;
    verification: VerificationConfig;
  },
): Promise<ChannelProvisionResult> {
  const channels = await guild.channels.fetch();
  const created: ProvisionedChannel[] = [];
  const reused: ProvisionedChannel[] = [];
  const categoryIds = new Map<ProvisioningCategoryKey, string>();

  for (const target of CATEGORY_TARGETS) {
    const existing = [...channels.values()].find((channel) =>
      channel !== null &&
      isExpectedType(channel, "category") &&
      target.names.some((name) => normalizeName(channel.name) === normalizeName(name)),
    );
    if (existing) {
      reused.push({ key: `category.${target.key}`, id: existing.id, name: existing.name, type: "category" });
      categoryIds.set(target.key, existing.id);
      continue;
    }

    const createdCategory = await guild.channels.create({
      name: target.names[0],
      type: ChannelType.GuildCategory,
    });
    created.push({ key: `category.${target.key}`, id: createdCategory.id, name: createdCategory.name, type: "category" });
    categoryIds.set(target.key, createdCategory.id);
  }

  const resolve = async (target: ChannelTarget): Promise<string> => {
    const categoryId = categoryIds.get(target.category);
    if (!categoryId) throw new Error(`Categoria ${target.category} nu a putut fi pregătită.`);
    const configured = target.currentId ? channels.get(target.currentId) : null;
    const existing = configured && isExpectedType(configured, target.type)
      ? configured
      : [...channels.values()].find((channel) =>
        channel !== null &&
        isExpectedType(channel, target.type) &&
        target.names.some((name) => normalizeName(channel.name) === normalizeName(name)),
      );

    if (existing) {
      if (target.type === "text") {
        await moveToCategory(existing, categoryId);
      }
      const result = { key: target.key, id: existing.id, name: existing.name, type: target.type };
      reused.push(result);
      return existing.id;
    }

    const createdChannel = await guild.channels.create({
      name: target.names[0],
      type: target.type === "category" ? ChannelType.GuildCategory : ChannelType.GuildText,
      ...(target.type === "text" ? { parent: categoryId } : {}),
    });
    const result = { key: target.key, id: createdChannel.id, name: createdChannel.name, type: target.type };
    created.push(result);
    return createdChannel.id;
  };

  const channelConfig: ChannelConfig = { ...input.channelConfig };
  for (const target of GAMEPLAY_TARGETS) {
    channelConfig[target.key] = await resolve({
      ...target,
      currentId: input.channelConfig[target.key],
    });
  }

  const ticketConfig: TicketConfig = {
    ...input.ticketConfig,
    categories: { ...input.ticketConfig.categories },
  };
  for (const target of TICKET_TARGETS) {
    ticketConfig.categories[target.key] = await resolve({
      key: `tickets.categories.${target.key}`,
      currentId: input.ticketConfig.categories[target.key],
      names: target.names,
      type: "category",
      category: "admin",
    });
  }

  const moderationConfig: ModerationConfig = structuredClone(input.moderationConfig);
  for (const target of MODERATION_TARGETS) {
    const [section, field] = target.key.split(".");
    const currentId = (moderationConfig[section as keyof ModerationConfig] as Record<string, unknown>)[field];
    const id = await resolve({
      key: `moderation.${target.key}`,
      currentId: typeof currentId === "string" ? currentId : null,
      names: [...target.names],
      type: "text",
      category: target.category,
    });
    setNestedChannelId(moderationConfig, target.key, id);
  }

  const verification = { ...input.verification };
  verification.channelId = await resolve({
    key: "verification.channelId",
    currentId: verification.channelId,
    names: ["verificare", "verificare-discord"],
    type: "text",
    category: "verification",
  });

  return { channelConfig, ticketConfig, moderationConfig, verification, created, reused };
}

export function provisionGuildChannels(
  guild: Guild,
  input: {
    channelConfig: ChannelConfig;
    ticketConfig: TicketConfig;
    moderationConfig: ModerationConfig;
    verification: VerificationConfig;
  },
): Promise<ChannelProvisionResult> {
  // A double-click or two owner tabs must not both fetch the same snapshot and
  // then create duplicate channels before either request persists its result.
  const previous = provisionLocks.get(guild.id);
  const next = (previous ?? Promise.resolve()).then(() => provisionGuildChannelsUnlocked(guild, input));
  provisionLocks.set(guild.id, next);
  void next.finally(() => {
    if (provisionLocks.get(guild.id) === next) provisionLocks.delete(guild.id);
  });
  return next;
}