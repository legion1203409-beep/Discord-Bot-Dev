import { loadTicketConfig } from "./db";

export type TicketCategoryKind = "staff" | "partnership" | "help_report";

export interface TicketConfig {
  categories: Record<TicketCategoryKind, string>;
  staffReviewRoleId: string;
  alliancePublicChannelId: string;
  allianceOwnerGuildId: string;
  incompleteTimeoutMinutes: number;
  firstWarningMinutes: number;
  secondWarningMinutes: number;
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  categories: {
    staff: envString("ORACLE_STAFF_TICKET_CATEGORY_ID", "1545688369332228167"),
    partnership: envString("ORACLE_PARTNERSHIP_TICKET_CATEGORY_ID", "1545688531144413194"),
    help_report: envString("ORACLE_HELP_REPORT_TICKET_CATEGORY_ID", "1545688638438772796"),
  },
  staffReviewRoleId: envString("ORACLE_STAFF_REVIEW_ROLE_ID", "1472526137308745909"),
  alliancePublicChannelId: envString("ORACLE_ALLIANCE_PUBLIC_CHANNEL_ID", "1472997077373157602"),
  allianceOwnerGuildId: envString("ORACLE_ALLIANCE_OWNER_GUILD_ID", "1382035307607883816"),
  incompleteTimeoutMinutes: 60,
  firstWarningMinutes: 20,
  secondWarningMinutes: 50,
};

function validSnowflake(value: unknown): value is string {
  return typeof value === "string" && /^\d{5,25}$/.test(value);
}

export function normalizeTicketConfig(value: unknown): TicketConfig {
  const raw = value && typeof value === "object" ? value as Partial<TicketConfig> : {};
  const categories = raw.categories && typeof raw.categories === "object"
    ? raw.categories as Partial<Record<TicketCategoryKind, unknown>>
    : {};
  const numberOrDefault = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate >= min && candidate <= max
      ? candidate
      : fallback;

  return {
    categories: {
      staff: validSnowflake(categories.staff) ? categories.staff : DEFAULT_TICKET_CONFIG.categories.staff,
      partnership: validSnowflake(categories.partnership) ? categories.partnership : DEFAULT_TICKET_CONFIG.categories.partnership,
      help_report: validSnowflake(categories.help_report) ? categories.help_report : DEFAULT_TICKET_CONFIG.categories.help_report,
    },
    staffReviewRoleId: validSnowflake(raw.staffReviewRoleId) ? raw.staffReviewRoleId : DEFAULT_TICKET_CONFIG.staffReviewRoleId,
    alliancePublicChannelId: validSnowflake(raw.alliancePublicChannelId) ? raw.alliancePublicChannelId : DEFAULT_TICKET_CONFIG.alliancePublicChannelId,
    allianceOwnerGuildId: validSnowflake(raw.allianceOwnerGuildId) ? raw.allianceOwnerGuildId : DEFAULT_TICKET_CONFIG.allianceOwnerGuildId,
    incompleteTimeoutMinutes: numberOrDefault(raw.incompleteTimeoutMinutes, DEFAULT_TICKET_CONFIG.incompleteTimeoutMinutes, 10, 240),
    firstWarningMinutes: numberOrDefault(raw.firstWarningMinutes, DEFAULT_TICKET_CONFIG.firstWarningMinutes, 1, 180),
    secondWarningMinutes: numberOrDefault(raw.secondWarningMinutes, DEFAULT_TICKET_CONFIG.secondWarningMinutes, 2, 239),
  };
}

const cachedByGuild = new Map<string, TicketConfig>();

export async function initTicketConfig(guildId: string): Promise<void> {
  cachedByGuild.set(guildId, normalizeTicketConfig(await loadTicketConfig(guildId)));
}

export function getTicketConfig(guildId: string | null | undefined): TicketConfig {
  return guildId ? (cachedByGuild.get(guildId) ?? DEFAULT_TICKET_CONFIG) : DEFAULT_TICKET_CONFIG;
}

export function setTicketConfig(guildId: string, value: unknown): TicketConfig {
  const normalized = normalizeTicketConfig(value);
  cachedByGuild.set(guildId, normalized);
  return normalized;
}
