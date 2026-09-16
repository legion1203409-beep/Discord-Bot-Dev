import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  type Client,
  type Guild,
} from "discord.js";
import type { ModerationConfig } from "../moderation/config";
import { logger } from "../lib/logger";

const MANAGED_PREFIX = "Regatul Cenușii • AutoMod";
const SPAM_RULE_NAME = `${MANAGED_PREFIX} • spam`;
const MENTION_RULE_NAME = `${MANAGED_PREFIX} • mention spam`;
const KEYWORD_RULE_NAME = `${MANAGED_PREFIX} • cuvinte`;

type NativeRuleOptions = {
  name: string;
  triggerType: AutoModerationRuleTriggerType;
  triggerMetadata?: Record<string, unknown>;
};

async function hasManageGuild(guild: Guild): Promise<boolean> {
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  return Boolean(me?.permissions.has(PermissionFlagsBits.ManageGuild));
}

async function syncRule(
  guild: Guild,
  existingRules: Awaited<ReturnType<Guild["autoModerationRules"]["fetch"]>>,
  desired: NativeRuleOptions | null,
): Promise<void> {
  const existing = existingRules.find((rule) => rule.name === (desired?.name ?? ""));

  if (!desired) return;

  const options = {
    name: desired.name,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: desired.triggerType,
    triggerMetadata: desired.triggerMetadata,
    actions: [{ type: AutoModerationActionType.BlockMessage }],
    enabled: true,
    reason: "Sincronizare AutoMod oficial pentru Regatul Cenușii",
  } as const;

  if (existing) {
    await guild.autoModerationRules.edit(existing, options);
  } else {
    await guild.autoModerationRules.create(options);
  }
}

/**
 * Keeps a small, useful set of native Discord AutoMod rules in place.
 *
 * This deliberately does not delete or rewrite rules created by a server
 * administrator. The managed rules are safe to identify by their exact names.
 */
export async function syncNativeAutoMod(
  client: Client,
  guildId: string,
  config: ModerationConfig,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
  if (!await hasManageGuild(guild)) {
    logger.warn({ guildId }, "Native AutoMod skipped — bot lacks Manage Server");
    return;
  }

  const rules = await guild.autoModerationRules.fetch();
  const words = config.autoMod.enabled && config.autoMod.wordFilter.enabled
    ? config.autoMod.forbiddenWords
      .map((word) => word.trim())
      .filter((word) => word.length > 0 && word.length <= 60)
      .slice(0, 1000)
    : [];

  await syncRule(guild, rules, {
    name: SPAM_RULE_NAME,
    triggerType: AutoModerationRuleTriggerType.Spam,
  });
  await syncRule(guild, rules, {
    name: MENTION_RULE_NAME,
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata: { mentionTotalLimit: 5 },
  });

  if (words.length > 0) {
    await syncRule(guild, rules, {
      name: KEYWORD_RULE_NAME,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: words },
    });
  } else {
    const managedKeywordRule = rules.find((rule) => rule.name === KEYWORD_RULE_NAME);
    if (managedKeywordRule) {
      await guild.autoModerationRules.delete(
        managedKeywordRule,
        "Eliminare regulă AutoMod nativă fără cuvinte configurate",
      );
    }
  }

  logger.info(
    { guildId, nativeRules: words.length > 0 ? 3 : 2 },
    "Native Discord AutoMod synchronized",
  );
}