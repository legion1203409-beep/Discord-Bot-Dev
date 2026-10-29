import { describe, expect, it } from "vitest";
import {
  DEFAULT_MUTE_MINUTES,
  MAX_MUTE_MINUTES,
  MIN_MUTE_MINUTES,
  describeMemberActions,
  describeMuteLength,
  describeRulePlan,
  hasOwnSanction,
  normalizeMuteMinutes,
  planEventRuleActions,
  planRuleActions,
  ruleHasEffect,
  describeConfiguredPlan,
} from "../rule-actions";

describe("what the ticked actions of a message rule do", () => {
  it("keeps every single-action configuration saved before the extra ticks existed", () => {
    expect(planRuleActions({ action: "none" })).toEqual({
      deleteMessage: false, primary: null, extraWarning: false, muteMinutes: null, alertStaff: false,
    });
    expect(planRuleActions({ action: "delete" })).toMatchObject({ deleteMessage: true, primary: null });
    expect(planRuleActions({ action: "warn" })).toMatchObject({ deleteMessage: false, primary: "warn", extraWarning: false });
    expect(planRuleActions({ action: "kick" })).toMatchObject({ primary: "kick", extraWarning: false, muteMinutes: null });
    expect(planRuleActions({ action: "ban", deleteMessage: true })).toMatchObject({ deleteMessage: true, primary: "ban" });
  });

  it("mutes for ten minutes unless the rule says otherwise", () => {
    expect(planRuleActions({ action: "mute" })).toMatchObject({ primary: "mute", muteMinutes: DEFAULT_MUTE_MINUTES });
    expect(planRuleActions({ action: "mute", muteMinutes: 90 })).toMatchObject({ primary: "mute", muteMinutes: 90 });
  });

  it("keeps a mute length inside what Discord accepts", () => {
    expect(normalizeMuteMinutes(0)).toBe(MIN_MUTE_MINUTES);
    expect(normalizeMuteMinutes(-5)).toBe(MIN_MUTE_MINUTES);
    expect(normalizeMuteMinutes(1_000_000)).toBe(MAX_MUTE_MINUTES);
    expect(normalizeMuteMinutes(12.9)).toBe(12);
    expect(normalizeMuteMinutes(Number.NaN)).toBe(DEFAULT_MUTE_MINUTES);
    expect(normalizeMuteMinutes("30")).toBe(DEFAULT_MUTE_MINUTES);
    expect(normalizeMuteMinutes(undefined, 5)).toBe(5);
  });

  it("adds a warning next to a mute, kick or ban when the warning is ticked", () => {
    expect(planRuleActions({ action: "mute", warnMember: true, muteMinutes: 60 })).toMatchObject({
      primary: "mute", extraWarning: true, muteMinutes: 60,
    });
    expect(planRuleActions({ action: "kick", warnMember: true })).toMatchObject({ primary: "kick", extraWarning: true });
    expect(planRuleActions({ action: "ban", warnMember: true })).toMatchObject({ primary: "ban", extraWarning: true });
  });

  it("treats a ticked warning on its own as the main action, not as an extra", () => {
    expect(planRuleActions({ action: "none", warnMember: true })).toMatchObject({
      primary: "warn", extraWarning: false, muteMinutes: null,
    });
    expect(planRuleActions({ action: "delete", warnMember: true })).toMatchObject({
      deleteMessage: true, primary: "warn", extraWarning: false,
    });
    // "warn" selected and warnMember ticked is still one warning.
    expect(planRuleActions({ action: "warn", warnMember: true })).toMatchObject({ primary: "warn", extraWarning: false });
  });

  it("lets deletion stand next to any member action", () => {
    expect(planRuleActions({ action: "mute", deleteMessage: true, warnMember: true })).toEqual({
      deleteMessage: true, primary: "mute", extraWarning: true, muteMinutes: DEFAULT_MUTE_MINUTES, alertStaff: false,
    });
  });

  it("asks to alert the staff only when the tick is on", () => {
    expect(planRuleActions({ action: "none", alertStaff: true }).alertStaff).toBe(true);
    expect(planRuleActions({ action: "ban", alertStaff: false }).alertStaff).toBe(false);
    expect(planRuleActions({ action: "ban" }).alertStaff).toBe(false);
  });

  it("follows the action chosen by escalation, not the rule's own one", () => {
    const rule = { action: "warn" as const, warnMember: true, muteMinutes: 45 };
    expect(planRuleActions(rule, { selectedAction: "mute" })).toMatchObject({
      primary: "mute", extraWarning: true, muteMinutes: 45,
    });
    expect(planRuleActions(rule, { selectedAction: "ban" })).toMatchObject({ primary: "ban", muteMinutes: null });
  });

  it("always deletes a scam message, whatever else was ticked", () => {
    expect(planRuleActions({ action: "mute" }, { alwaysDelete: true })).toMatchObject({ deleteMessage: true, primary: "mute" });
    expect(planRuleActions({ action: "none" }, { alwaysDelete: true })).toMatchObject({ deleteMessage: true, primary: null });
  });
});

describe("what the ticked actions of an event rule do", () => {
  it("recognises a rule that chose its own warning or sanction", () => {
    expect(hasOwnSanction({ action: "none" })).toBe(false);
    expect(hasOwnSanction({ action: "delete" })).toBe(false);
    expect(hasOwnSanction({ action: "none", alertStaff: true })).toBe(false);
    expect(hasOwnSanction({ action: "warn" })).toBe(true);
    expect(hasOwnSanction({ action: "mute" })).toBe(true);
    expect(hasOwnSanction({ action: "none", warnMember: true })).toBe(true);
  });

  it("inherits the whole sanction block from the module when the rule has none of its own", () => {
    const module = { action: "mute" as const, warnMember: true, muteMinutes: 120 };
    expect(planEventRuleActions({ action: "none" }, module)).toMatchObject({
      primary: "mute", extraWarning: true, muteMinutes: 120,
    });
    // a rule with its own choice does not mix in the module's one
    expect(planEventRuleActions({ action: "kick" }, module)).toMatchObject({
      primary: "kick", extraWarning: false, muteMinutes: null,
    });
  });

  it("acts like before when there is no module default", () => {
    expect(planEventRuleActions({ action: "none" }).primary).toBeNull();
    expect(planEventRuleActions({ action: "warn" }).primary).toBe("warn");
    expect(planEventRuleActions({ action: "ban" }, null).primary).toBe("ban");
  });

  it("alerts the staff when either the rule or its module asks to", () => {
    expect(planEventRuleActions({ action: "none", alertStaff: true }, { action: "none" }).alertStaff).toBe(true);
    expect(planEventRuleActions({ action: "none" }, { action: "none", alertStaff: true }).alertStaff).toBe(true);
    expect(planEventRuleActions({ action: "none" }, { action: "none" }).alertStaff).toBe(false);
  });

  it("deletes the message only for a rule that asks for it, never through the module", () => {
    expect(planEventRuleActions({ action: "delete" }).deleteMessage).toBe(true);
    expect(planEventRuleActions({ action: "mute", deleteMessage: true }).deleteMessage).toBe(true);
    expect(planEventRuleActions({ action: "none" }, { action: "none", deleteMessage: true }).deleteMessage).toBe(false);
  });
});

describe("how the log words what happened", () => {
  it("describes mute lengths in readable Romanian", () => {
    expect(describeMuteLength(1)).toBe("1 minut");
    expect(describeMuteLength(10)).toBe("10 minute");
    expect(describeMuteLength(60)).toBe("1 oră");
    expect(describeMuteLength(120)).toBe("2 ore");
    expect(describeMuteLength(90)).toBe("90 minute");
    expect(describeMuteLength(1_440)).toBe("1 zi");
    expect(describeMuteLength(40_320)).toBe("28 zile");
  });

  it("lists the member and staff actions", () => {
    expect(describeMemberActions(planRuleActions({ action: "mute", warnMember: true, alertStaff: true, muteMinutes: 60 })))
      .toEqual(["avertisment", "timeout 1 oră", "staff anunțat"]);
    expect(describeMemberActions(planRuleActions({ action: "ban" }))).toEqual(["ban"]);
    expect(describeMemberActions(planRuleActions({ action: "kick" }))).toEqual(["eliminare"]);
    expect(describeMemberActions(planRuleActions({ action: "none" }))).toEqual([]);
  });

  it("writes one line for the module log", () => {
    expect(describeRulePlan(planRuleActions({ action: "none" }))).toBe("Acțiune configurată: doar înregistrare");
    expect(describeRulePlan(planRuleActions({ action: "warn" }))).toBe("Acțiune configurată: avertisment");
    expect(describeRulePlan(planRuleActions({ action: "mute", warnMember: true, muteMinutes: 30 })))
      .toBe("Acțiune configurată: avertisment + timeout 30 minute");
    expect(describeRulePlan(planRuleActions({ action: "delete" }), { deletionSucceeded: true })).toBe("Mesaj șters automat");
    expect(describeRulePlan(planRuleActions({ action: "mute", deleteMessage: true, alertStaff: true }), { deletionSucceeded: true }))
      .toBe("Mesaj șters automat + timeout 10 minute + staff anunțat");
    expect(describeRulePlan(planRuleActions({ action: "delete" }), { deletionSucceeded: false }))
      .toBe("Ștergerea mesajului a eșuat");
  });
});

describe("whether a rule does anything at all", () => {
  it("is false only for a rule with nothing ticked", () => {
    expect(ruleHasEffect({ action: "none" })).toBe(false);
    expect(ruleHasEffect({ action: "none", deleteMessage: false, warnMember: false, alertStaff: false })).toBe(false);
    expect(ruleHasEffect({ action: "none", muteMinutes: 60 })).toBe(false);
  });

  it("is true for a deletion, a warning, a sanction or a staff alert, alone or together", () => {
    expect(ruleHasEffect({ action: "delete" })).toBe(true);
    expect(ruleHasEffect({ action: "none", deleteMessage: true })).toBe(true);
    expect(ruleHasEffect({ action: "none", alertStaff: true })).toBe(true);
    expect(ruleHasEffect({ action: "none", warnMember: true })).toBe(true);
    for (const action of ["warn", "mute", "kick", "ban"] as const) expect(ruleHasEffect({ action })).toBe(true);
  });
});

describe("how a configured reaction is announced before it runs", () => {
  it("lists the deletion and the member actions, or says it only records", () => {
    expect(describeConfiguredPlan(planRuleActions({ action: "none" }))).toBe("Acțiune configurată: doar înregistrare");
    expect(describeConfiguredPlan(planRuleActions({ action: "mute", deleteMessage: true, warnMember: true, muteMinutes: 60, alertStaff: true })))
      .toBe("Acțiune configurată: ștergere mesaj + avertisment + timeout 1 oră + staff anunțat");
    expect(describeConfiguredPlan(planRuleActions({ action: "delete" }))).toBe("Acțiune configurată: ștergere mesaj");
  });
});
