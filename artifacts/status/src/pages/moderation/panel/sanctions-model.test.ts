import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  CHANNEL_POLICIES, ROLE_POLICIES, SANCTIONS_MODULES, STAFF_COMMANDS, addEscalationLevel, availableCommandCount, commandGrants,
  commandSummary, commandsSummary, dayTimeline, describeEscalationAction, enabledCommandCount, escalationLadder, escalationSummary,
  formatHourRange, hourInRange, isCommandOn, isModuleChanged, isSanctionsRoute, isValidTimezone, ladderRange, localTime, policyConflicts,
  policySummary, profileAt, removeEscalationLevel, sanctionsDraftError, sanctionsModuleForRoute, scheduleNow, scheduleSummary,
  setCommandGrants, setCommandOn, setEscalationAction, setEscalationMuteMinutes, setEscalationViolations, shadowedEscalationLevels,
  timelineStretches, type EscalationLevel,
} from "./sanctions-model";

const DEFAULT_LEVELS: EscalationLevel[] = [
  { level: 1, violations: 1, action: "warn" },
  { level: 2, violations: 2, action: "mute" },
  { level: 3, violations: 3, action: "kick" },
  { level: 4, violations: 4, action: "ban" },
];

describe("the sanctions group", () => {
  it("opens one module per route and the first one on its overview", () => {
    expect(sanctionsModuleForRoute("/sanctiuni").id).toBe("escalation");
    expect(sanctionsModuleForRoute("/sanctiuni/comenzi").id).toBe("commands");
    expect(sanctionsModuleForRoute("/sanctiuni/roluri-canale/").id).toBe("policies");
    expect(sanctionsModuleForRoute("/sanctiuni/program?x=1").id).toBe("schedule");
    expect(SANCTIONS_MODULES.map((module) => module.route)).toEqual([
      "/sanctiuni/escaladare", "/sanctiuni/comenzi", "/sanctiuni/roluri-canale", "/sanctiuni/program",
    ]);
  });

  it("is one page, like the protection group, and uses the whole width", () => {
    expect(isSanctionsRoute("/sanctiuni")).toBe(true);
    expect(isSanctionsRoute("/sanctiuni/program")).toBe(true);
    expect(isSanctionsRoute("/politici")).toBe(false);
    expect(panelGroupRoute("/sanctiuni/comenzi")).toBe("/sanctiuni");
    expect(panelGroupRoute("/automod")).toBe("/protectie");
    expect(panelGroupRoute("/politici")).toBeNull();
    expect(isWidePanelRoute("/sanctiuni/escaladare")).toBe(true);
    expect(isWidePanelRoute("/ai")).toBe(true);
    expect(isWidePanelRoute("/comenzi")).toBe(false);
  });

  it("marks a module unsaved only for what it edits", () => {
    const saved = { escalation: { enabled: false }, manualTools: { enabled: true }, roles: { specialPermissionRoleIds: [], protectedRoleIds: [] }, channels: {} };
    const commands = SANCTIONS_MODULES.find((module) => module.id === "commands")!;
    const policies = SANCTIONS_MODULES.find((module) => module.id === "policies")!;
    const special = { ...saved, roles: { ...saved.roles, specialPermissionRoleIds: ["123456789012345678"] } };
    expect(isModuleChanged(commands, saved, special)).toBe(true);
    expect(isModuleChanged(policies, saved, special)).toBe(false);
    const protectedRole = { ...saved, roles: { ...saved.roles, protectedRoleIds: ["123456789012345678"] } };
    expect(isModuleChanged(commands, saved, protectedRole)).toBe(false);
    expect(isModuleChanged(policies, saved, protectedRole)).toBe(true);
  });
});

describe("escalation steps", () => {
  it("adds a step one offense later and one sanction stronger, up to four", () => {
    const two = DEFAULT_LEVELS.slice(0, 2);
    expect(addEscalationLevel(two)).toEqual([...two, { level: 3, violations: 3, action: "kick" }]);
    expect(addEscalationLevel([])).toEqual([{ level: 1, violations: 1, action: "warn" }]);
    expect(addEscalationLevel([{ level: 1, violations: 5, action: "ban" }])).toEqual([
      { level: 1, violations: 5, action: "ban" }, { level: 2, violations: 6, action: "ban" },
    ]);
    expect(addEscalationLevel(DEFAULT_LEVELS)).toBe(DEFAULT_LEVELS);
  });

  it("removes a step, renumbers the rest and always keeps one", () => {
    expect(removeEscalationLevel(DEFAULT_LEVELS, 1)).toEqual([
      { level: 1, violations: 1, action: "warn" }, { level: 2, violations: 3, action: "kick" }, { level: 3, violations: 4, action: "ban" },
    ]);
    const one = [DEFAULT_LEVELS[0]!];
    expect(removeEscalationLevel(one, 0)).toBe(one);
  });

  it("keeps a mute length only on a mute step", () => {
    let levels = setEscalationMuteMinutes(DEFAULT_LEVELS, 1, 1_440);
    expect(levels[1]).toEqual({ level: 2, violations: 2, action: "mute", muteMinutes: 1_440 });
    levels = setEscalationAction(levels, 1, "kick");
    expect(levels[1]).toEqual({ level: 2, violations: 2, action: "kick" });
    levels = setEscalationViolations(levels, 0, undefined);
    expect(levels[0]).toEqual({ level: 1, action: "warn" });
    // The list it was given is never changed.
    expect(DEFAULT_LEVELS[1]).toEqual({ level: 2, violations: 2, action: "mute" });
  });

  it("reads the steps the way the bot does, whatever their order in the list", () => {
    const levels: EscalationLevel[] = [
      { level: 1, violations: 5, action: "ban" },
      { level: 2, violations: 2, action: "mute", muteMinutes: 60 },
      { level: 3, violations: 3, action: "kick" },
    ];
    expect(escalationLadder(levels).map((step) => [ladderRange(step), describeEscalationAction(step.level)])).toEqual([
      ["2", "Mute 1 oră"], ["3–4", "Kick"], ["5+", "Ban"],
    ]);
    expect(escalationLadder(DEFAULT_LEVELS).map(ladderRange)).toEqual(["1", "2", "3", "4+"]);
  });

  it("says which step never applies because a later one starts at the same offense", () => {
    const levels: EscalationLevel[] = [
      { level: 1, violations: 2, action: "warn" },
      { level: 2, violations: 2, action: "mute" },
      { level: 3, violations: 4, action: "ban" },
    ];
    expect(escalationLadder(levels).map((step) => step.index)).toEqual([1, 2]);
    expect(shadowedEscalationLevels(levels)).toEqual([0]);
    expect(shadowedEscalationLevels(DEFAULT_LEVELS)).toEqual([]);
  });

  it("names every step, older ones included", () => {
    expect(describeEscalationAction({ action: "mute" })).toBe("Mute, durata regulii");
    expect(describeEscalationAction({ action: "mute", muteMinutes: 10_080 })).toBe("Mute 7 zile");
    expect(describeEscalationAction({ action: "none" })).toBe("Fără sancțiune");
    expect(describeEscalationAction({ action: "delete" })).toBe("Doar ștergerea mesajului");
  });

  it("sums the escalation up in the menu", () => {
    expect(escalationSummary({ escalation: { enabled: false, levels: DEFAULT_LEVELS } })).toBe("Oprită");
    expect(escalationSummary({ escalation: { enabled: true, resetAfterDays: 30, levels: DEFAULT_LEVELS } })).toBe("4 trepte · 30 de zile");
    expect(escalationSummary({ escalation: { enabled: true, resetAfterDays: 7, levels: [DEFAULT_LEVELS[0]] } })).toBe("1 treaptă · 7 zile");
  });
});

describe("staff commands", () => {
  it("lists the eleven commands the bot has", () => {
    expect(STAFF_COMMANDS.map((command) => command.key)).toEqual([
      "warn", "mute", "unmute", "kick", "ban", "nick", "role", "purge", "slowmode", "lock", "unlock",
    ]);
  });

  it("switches one command off for everyone and back, giving back what was saved", () => {
    const saved = { enabled: true, disabledCommands: ["role", "purge"], commandGrants: {} };
    const off = setCommandOn(saved, "warn", false);
    expect(off.disabledCommands).toEqual(["role", "purge", "warn"]);
    expect(isCommandOn({ manualTools: off }, "warn")).toBe(false);
    expect(setCommandOn(off, "warn", true)).toEqual(saved);
    expect(saved.disabledCommands).toEqual(["role", "purge"]);
  });

  it("counts the commands staff can use, none while the commands are off", () => {
    const manualTools = { enabled: true, disabledCommands: ["purge"] };
    expect(enabledCommandCount({ manualTools })).toBe(10);
    expect(availableCommandCount({ manualTools })).toBe(10);
    expect(availableCommandCount({ manualTools: { ...manualTools, enabled: false } })).toBe(0);
    expect(availableCommandCount({ manualTools: { enabled: true } })).toBe(11);
    expect(commandsSummary({ manualTools: { enabled: true } })).toBe("Toate pornite");
    expect(commandsSummary({ manualTools })).toBe("10 din 11 pornite");
    expect(commandsSummary({ manualTools: { enabled: false } })).toBe("Oprite");
  });

  it("keeps the roles of a command and drops an emptied list", () => {
    const manualTools = setCommandGrants({ enabled: true, commandGrants: { ban: ["111111111111111111"] } }, "warn", ["222222222222222222"]);
    expect(manualTools.commandGrants).toEqual({ ban: ["111111111111111111"], warn: ["222222222222222222"] });
    expect(setCommandGrants(manualTools, "ban", []).commandGrants).toEqual({ warn: ["222222222222222222"] });
    expect(commandGrants({ manualTools }, "warn")).toEqual(["222222222222222222"]);
    expect(commandGrants({}, "warn")).toEqual([]);
  });

  it("says who can use a command", () => {
    const ban = STAFF_COMMANDS.find((command) => command.key === "ban")!;
    expect(commandSummary({ manualTools: { enabled: true } }, ban)).toBe("Cu permisiunea Ban Members");
    expect(commandSummary({ manualTools: { commandGrants: { ban: ["1", "2"].map((n) => n.repeat(18)) } } }, ban)).toBe("Ban Members sau 2 roluri alese");
    expect(commandSummary({ manualTools: { disabledCommands: ["ban"] } }, ban)).toBe("Oprită pentru toți");
  });
});

describe("roles and channels", () => {
  it("counts what was chosen", () => {
    expect(policySummary({})).toBe("Nimic ales");
    expect(policySummary({ roles: { protectedRoleIds: ["1".repeat(18)] }, channels: { strictChannelIds: ["2".repeat(18), "3".repeat(18)] } })).toBe("1 rol · 2 canale");
    expect(ROLE_POLICIES.map((def) => def.path[1])).toEqual(["protectedRoleIds", "ignoredAutoModRoleIds", "sanctionableRoleIds"]);
    expect(CHANNEL_POLICIES.filter((def) => def.textOnly).map((def) => def.path[1])).toEqual(["autoSlowmodeChannelIds"]);
  });

  it("explains choices that cancel each other out", () => {
    const name = (kind: "role" | "channel", id: string) => `${kind === "role" ? "@" : "#"}${id.slice(0, 2)}`;
    const config = {
      roles: { protectedRoleIds: ["900000000000000001"], sanctionableRoleIds: ["900000000000000001", "900000000000000002"] },
      channels: {
        strictChannelIds: ["100000000000000001", "100000000000000003"], softChannelIds: ["100000000000000001"],
        ignoredChannelIds: ["100000000000000003"], protectedChannelIds: [], autoSlowmodeChannelIds: [],
      },
    };
    const notes = policyConflicts(config, name);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatch(/^#10 este și printre canalele stricte, și printre cele blânde: contează Strictă\.$/);
    expect(notes[1]).toMatch(/^#10 nu este verificat deloc/);
    expect(notes[2]).toMatch(/^@90 este protejat/);
    expect(policyConflicts({}, name)).toEqual([]);
  });
});

describe("the schedule", () => {
  const profiles = {
    timezone: "Europe/Bucharest",
    strictNight: { enabled: true, startHour: 22, endHour: 7 },
    softDay: { enabled: true, startHour: 8, endHour: 21 },
    weekend: { enabled: true, severity: "hard" },
    majorEvent: { enabled: false, severity: "hard" },
  };

  it("counts whole hours, both ends included, across midnight too", () => {
    expect(hourInRange(22, 22, 7)).toBe(true);
    expect(hourInRange(7, 22, 7)).toBe(true);
    expect(hourInRange(8, 22, 7)).toBe(false);
    expect(hourInRange(12, 8, 21)).toBe(true);
    expect(hourInRange(5, 5, 5)).toBe(true);
    expect(formatHourRange(22, 7)).toBe("22:00 – 07:59");
  });

  it("picks the profile in the bot's order", () => {
    expect(profileAt(profiles, 23, false)).toEqual({ profile: "strictNight", severity: "hard" });
    expect(profileAt(profiles, 9, false)).toEqual({ profile: "softDay", severity: "soft" });
    // The weekend replaces the soft day, but not the strict night.
    expect(profileAt(profiles, 12, true)).toEqual({ profile: "weekend", severity: "hard" });
    expect(profileAt(profiles, 3, true)).toEqual({ profile: "strictNight", severity: "hard" });
    // A major event comes before all of them, at any hour.
    const event = { ...profiles, majorEvent: { enabled: true, severity: "soft" } };
    expect(profileAt(event, 3, false)).toEqual({ profile: "majorEvent", severity: "soft" });
    expect(profileAt({ timezone: "UTC" }, 12, false)).toBeNull();
    // Hours left out are the server's defaults; an hour outside the day never matches.
    expect(profileAt({ strictNight: { enabled: true } }, 23, false)).toEqual({ profile: "strictNight", severity: "hard" });
    expect(profileAt({ strictNight: { enabled: true, startHour: 24, endHour: 7 } }, 3, false)).toBeNull();
  });

  it("draws a day as stretches of hours", () => {
    const weekday = timelineStretches(dayTimeline(profiles, false));
    expect(weekday.map(({ from, to, active }) => [from, to, active?.profile ?? null])).toEqual([
      [0, 7, "strictNight"], [8, 21, "softDay"], [22, 23, "strictNight"],
    ]);
    const weekend = timelineStretches(dayTimeline(profiles, true));
    expect(weekend.map(({ from, to, active }) => [from, to, active?.profile ?? null])).toEqual([
      [0, 7, "strictNight"], [8, 21, "weekend"], [22, 23, "strictNight"],
    ]);
    expect(timelineStretches(dayTimeline({}, false))).toEqual([{ from: 0, to: 23, active: null }]);
  });

  it("reads the time on the server's clock", () => {
    // Wednesday 2026-10-28, 23:30 in Bucharest (UTC+2) and Saturday 2026-10-31, 12:00.
    expect(localTime("Europe/Bucharest", new Date("2026-10-28T21:30:00Z"))).toEqual({ hour: 23, minute: 30, day: "miercuri", weekend: false });
    expect(localTime("Europe/Bucharest", new Date("2026-10-31T10:00:00Z"))).toEqual({ hour: 12, minute: 0, day: "sâmbătă", weekend: true });
    expect(scheduleNow(profiles, new Date("2026-10-28T21:30:00Z"))).toEqual({ time: "23:30", day: "miercuri", active: { profile: "strictNight", severity: "hard" } });
    expect(scheduleNow({ ...profiles, timezone: "Nu/Exista" })).toBeNull();
  });

  it("knows which time zones exist", () => {
    expect(isValidTimezone("Europe/Bucharest")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Europa/București")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("names the profiles that are on", () => {
    expect(scheduleSummary({ timeProfiles: profiles })).toBe("Noapte strictă · Weekend · Zi blândă");
    expect(scheduleSummary({})).toBe("Niciun profil pornit");
  });
});

describe("checks before saving", () => {
  const valid = {
    escalation: { enabled: true, resetAfterDays: 30, levels: DEFAULT_LEVELS },
    manualTools: { enabled: true, commandGrants: { warn: ["123456789012345678"] }, disabledCommands: [] },
    roles: { protectedRoleIds: [], specialPermissionRoleIds: [] },
    channels: { strictChannelIds: [] },
    timeProfiles: { timezone: "Europe/Bucharest", strictNight: { enabled: true, startHour: 22, endHour: 7 } },
  };

  it("accepts valid settings", () => {
    expect(sanctionsDraftError(valid)).toBeNull();
  });

  it("names the escalation value the server would refuse", () => {
    expect(sanctionsDraftError({ escalation: { ...valid.escalation, resetAfterDays: 0 } })).toMatch(/^Escaladare — Abaterile se uită după/);
    expect(sanctionsDraftError({ escalation: { ...valid.escalation, levels: [] } })).toMatch(/între 1 și 4 trepte/);
    expect(sanctionsDraftError({ escalation: { ...valid.escalation, levels: setEscalationViolations(DEFAULT_LEVELS, 2, undefined) } }))
      .toMatch(/^Escaladare — treapta 3, La abaterea/);
    expect(sanctionsDraftError({ escalation: { ...valid.escalation, levels: setEscalationMuteMinutes(DEFAULT_LEVELS, 1, 50_000) } }))
      .toMatch(/^Escaladare — treapta 2, Minute de mute/);
  });

  it("refuses IDs that are not Discord IDs, and too many", () => {
    expect(sanctionsDraftError({ manualTools: { commandGrants: { ban: ["abc"] } } })).toMatch(/^Comenzi — rolurile pentru \/ban: „abc”/);
    expect(sanctionsDraftError({ roles: { protectedRoleIds: Array.from({ length: 101 }, (_, index) => String(100000 + index)) } }))
      .toMatch(/^Roluri protejate: cel mult 100/);
    expect(sanctionsDraftError({ roles: { specialPermissionRoleIds: ["12"] } })).toMatch(/^Roluri cu acces la toate comenzile/);
    expect(sanctionsDraftError({ channels: { autoSlowmodeChannelIds: ["x"] } })).toMatch(/^Slowmode automat/);
  });

  it("refuses an unknown time zone and an hour outside the day", () => {
    expect(sanctionsDraftError({ timeProfiles: { timezone: "Marte/Olympus" } })).toMatch(/^Program — fusul orar „Marte\/Olympus”/);
    expect(sanctionsDraftError({ timeProfiles: { softDay: { startHour: 24 } } })).toMatch(/^Program — Zi blândă/);
  });

  it("checks only the parts about to be saved", () => {
    const broken = { ...valid, escalation: { ...valid.escalation, resetAfterDays: 0 } };
    expect(sanctionsDraftError(broken, ["timeProfiles"])).toBeNull();
    expect(sanctionsDraftError(broken, ["escalation"])).not.toBeNull();
  });
});
