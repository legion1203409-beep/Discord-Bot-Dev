import type { ModerationAction } from "../../moderation/config";
import { shouldDeleteAutoModMessage } from "./automod-policy";

/**
 * What the panel lets an operator tick for a rule, expressed with the fields
 * every configuration already stored (`action`, `deleteMessage`) plus three
 * optional ones that older configurations simply do not have:
 *
 * - `warnMember`: also warn the member, next to a stronger sanction
 * - `alertStaff`: ping the configured staff roles in the module's log channel
 * - `muteMinutes`: how long a "mute" lasts for this rule
 *
 * Keeping this decision in one pure function means the message handlers, the
 * Discord event handlers and the tests all agree on what a combination of ticks
 * actually does.
 */
export type RuleActionSettings = {
  action: ModerationAction;
  deleteMessage?: boolean;
  warnMember?: boolean;
  alertStaff?: boolean;
  muteMinutes?: number;
};

export type RuleActionPlan = {
  /** Remove the message that triggered the rule. */
  deleteMessage: boolean;
  /**
   * The member action to take. "warn" when a warning is the only thing ticked;
   * otherwise the strongest of mute / kick / ban.
   */
  primary: "warn" | "mute" | "kick" | "ban" | null;
  /** A warning posted in addition to a stronger primary action. */
  extraWarning: boolean;
  /** Length of the timeout; only set when `primary` is "mute". */
  muteMinutes: number | null;
  /** Ping the staff roles in the log channel. */
  alertStaff: boolean;
};

/** Discord's own bounds for a member timeout (1 minute to 28 days). */
export const MIN_MUTE_MINUTES = 1;
export const MAX_MUTE_MINUTES = 40_320;
/** What a mute lasted before the duration became configurable. */
export const DEFAULT_MUTE_MINUTES = 10;

export function normalizeMuteMinutes(value: unknown, fallback = DEFAULT_MUTE_MINUTES): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(MIN_MUTE_MINUTES, Math.min(MAX_MUTE_MINUTES, Math.floor(value)));
}

function strongerSanction(action: ModerationAction): "mute" | "kick" | "ban" | null {
  return action === "mute" || action === "kick" || action === "ban" ? action : null;
}

/**
 * Plan for a rule that reacts to a message (AutoMod, anti-spam, anti-flood).
 *
 * `selectedAction` is the action after escalation levels were applied; it
 * defaults to the rule's own action. `alwaysDelete` keeps the anti-scam
 * behaviour of removing the message whatever else was chosen.
 */
export function planRuleActions(
  rule: RuleActionSettings,
  options: { selectedAction?: ModerationAction; alwaysDelete?: boolean } = {},
): RuleActionPlan {
  const selected = options.selectedAction ?? rule.action;
  const stronger = strongerSanction(selected);
  const warn = selected === "warn" || rule.warnMember === true;
  return {
    // A rule saved with the old single "delete" action keeps deleting when an
    // escalation step picks the sanction instead.
    deleteMessage: shouldDeleteAutoModMessage(selected, rule.deleteMessage, options.alwaysDelete === true) || rule.action === "delete",
    primary: stronger ?? (warn ? "warn" : null),
    extraWarning: stronger !== null && warn,
    muteMinutes: stronger === "mute" ? normalizeMuteMinutes(rule.muteMinutes) : null,
    alertStaff: rule.alertStaff === true,
  };
}

/**
 * True when a rule would do anything at all: delete the message, warn or
 * sanction the member, or alert the staff. A rule left on "no action" with
 * nothing ticked only records what happened.
 */
export function ruleHasEffect(rule: RuleActionSettings): boolean {
  const plan = planRuleActions(rule);
  return plan.deleteMessage || plan.primary !== null || plan.alertStaff;
}

/** True when the rule chose its own warning or sanction instead of inheriting one. */
export function hasOwnSanction(rule: RuleActionSettings): boolean {
  return strongerSanction(rule.action) !== null || rule.action === "warn" || rule.warnMember === true;
}

/**
 * Plan for a rule that reacts to a Discord event (raid, suspicious behaviour,
 * edit/delete spam). A rule without a warning or sanction of its own inherits
 * the whole block from `defaults` (the module-level choice), exactly as a rule
 * left on "no action" always did. Staff alerts add up: either level can ask.
 */
export function planEventRuleActions(
  rule: RuleActionSettings,
  defaults?: RuleActionSettings | null,
): RuleActionPlan {
  const source = hasOwnSanction(rule) || !defaults ? rule : defaults;
  const plan = planRuleActions(source);
  return {
    ...plan,
    deleteMessage: rule.action === "delete" || rule.deleteMessage === true,
    alertStaff: rule.alertStaff === true || defaults?.alertStaff === true,
  };
}

const MUTE_LENGTHS: Array<[number, string]> = [[1_440, "zi"], [60, "oră"], [1, "minut"]];

/** "10 minute", "1 oră", "2 zile" … for logs and summaries. */
export function describeMuteLength(minutes: number): string {
  const total = normalizeMuteMinutes(minutes);
  for (const [size, singular] of MUTE_LENGTHS) {
    if (total % size === 0 || size === 1) {
      const count = Math.floor(total / size);
      if (count === 1) return `1 ${singular}`;
      const plural = singular === "zi" ? "zile" : singular === "oră" ? "ore" : "minute";
      return `${count} ${plural}`;
    }
  }
  return `${total} minute`;
}

/** What happens to the member and the staff, as short phrases ("avertisment", "timeout 1 oră", …). */
export function describeMemberActions(plan: RuleActionPlan): string[] {
  const parts: string[] = [];
  if (plan.extraWarning || plan.primary === "warn") parts.push("avertisment");
  if (plan.primary === "mute") parts.push(`timeout ${describeMuteLength(plan.muteMinutes ?? DEFAULT_MUTE_MINUTES)}`);
  if (plan.primary === "kick") parts.push("eliminare");
  if (plan.primary === "ban") parts.push("ban");
  if (plan.alertStaff) parts.push("staff anunțat");
  return parts;
}

/** What a rule is set to do, before it runs ("Acțiune configurată: ștergere mesaj + avertisment"). */
export function describeConfiguredPlan(plan: RuleActionPlan): string {
  const parts = [...(plan.deleteMessage ? ["ștergere mesaj"] : []), ...describeMemberActions(plan)];
  return `Acțiune configurată: ${parts.length ? parts.join(" + ") : "doar înregistrare"}`;
}

/** One line for the module log: everything the rule did or tried to do. */
export function describeRulePlan(
  plan: RuleActionPlan,
  outcome: { deletionSucceeded?: boolean } = {},
): string {
  const parts: string[] = [];
  if (plan.deleteMessage) {
    parts.push(outcome.deletionSucceeded === false ? "Ștergerea mesajului a eșuat" : "Mesaj șters automat");
  }
  parts.push(...describeMemberActions(plan));
  if (!parts.length) return "Acțiune configurată: doar înregistrare";
  // The deletion sentence already reads as a complete statement of what happened.
  return plan.deleteMessage ? parts.join(" + ") : `Acțiune configurată: ${parts.join(" + ")}`;
}
