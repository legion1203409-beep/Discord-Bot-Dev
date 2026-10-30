import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  ACTIVITY_CATEGORIES, LOGS_MODULES, activitySummary, auditSummary, casesSummary, categoriesWithoutChannel, describeRetention,
  enabledCategoryCount, isLogsModuleChanged, isLogsRoute, logsDraftError, logsModuleForRoute, moduleLogDestinations, retentionShrinks,
  staffRight,
} from "./logs-model";

describe("the cases and logs group", () => {
  it("opens one module per route and the cases on its overview", () => {
    expect(logsModuleForRoute("/jurnale").id).toBe("cases");
    expect(logsModuleForRoute("/jurnale/audit").id).toBe("audit");
    expect(logsModuleForRoute("/jurnale/activitate/").id).toBe("activity");
    expect(LOGS_MODULES.map((module) => module.route)).toEqual(["/jurnale/cazuri", "/jurnale/audit", "/jurnale/activitate"]);
  });

  it("is one page with one draft and uses the whole width", () => {
    expect(isLogsRoute("/jurnale/cazuri")).toBe(true);
    expect(isLogsRoute("/cazuri")).toBe(false);
    expect(panelGroupRoute("/jurnale/activitate")).toBe("/jurnale");
    expect(isWidePanelRoute("/jurnale")).toBe(true);
  });

  it("marks only the module whose part changed", () => {
    const saved = { cases: { retentionDays: 365 }, audit: { enabled: false }, activityLog: { enabled: false } };
    const draft = { ...saved, audit: { enabled: true } };
    expect(LOGS_MODULES.map((module) => isLogsModuleChanged(module, saved, draft))).toEqual([false, true, false]);
  });
});

describe("cases", () => {
  it("words the retention", () => {
    expect(describeRetention(365)).toBe("Un an");
    expect(describeRetention(180)).toBe("6 luni");
    expect(describeRetention(45)).toBe("45 de zile");
    expect(describeRetention(1)).toBe("1 zi");
    expect(casesSummary({ cases: { retentionDays: 3_650 } })).toBe("Păstrate 10 ani");
    expect(casesSummary({})).toBe("Păstrate un an");
  });

  it("warns only when a shorter retention would delete older cases", () => {
    expect(retentionShrinks({ cases: { retentionDays: 365 } }, { cases: { retentionDays: 90 } })).toBe(90);
    expect(retentionShrinks({ cases: { retentionDays: 90 } }, { cases: { retentionDays: 365 } })).toBeNull();
    expect(retentionShrinks({ cases: { retentionDays: 90 } }, { cases: { retentionDays: 90 } })).toBeNull();
    expect(retentionShrinks({ cases: { retentionDays: 90 } }, { cases: {} })).toBeNull();
    expect(retentionShrinks({ cases: { retentionDays: 90 } }, { cases: { retentionDays: 0 } })).toBeNull();
  });

  it("reads what staff may do, with the server's defaults", () => {
    expect(staffRight({}, "allowStaffClose")).toBe(true);
    expect(staffRight({}, "allowStaffNotes")).toBe(true);
    expect(staffRight({}, "allowStaffExport")).toBe(false);
    expect(staffRight({ cases: { allowStaffClose: false } }, "allowStaffClose")).toBe(false);
  });
});

describe("audit", () => {
  it("sums the audit up", () => {
    expect(auditSummary({ audit: { enabled: false } })).toBe("Oprit");
    expect(auditSummary({ audit: { enabled: true, detailLevel: "verbose", channelId: "123456789" } })).toBe("Detaliat · cu canal");
    expect(auditSummary({ audit: { enabled: true, detailLevel: "minimal", channelId: null } })).toBe("Minimal · fără canal");
  });

  it("says where each module writes, falling back to the audit channel only while the audit is on", () => {
    const config = {
      autoMod: { logChannelId: "100000000000000001" },
      antiSpam: { logChannelId: null },
      audit: { enabled: true, channelId: "900000000000000009" },
    };
    const destinations = moduleLogDestinations(config);
    expect(destinations.map((item) => [item.name, item.via, item.channelId])).toEqual([
      ["AutoMod", "own", "100000000000000001"],
      ["Anti-spam", "audit", "900000000000000009"],
      ["Anti-flood", "audit", "900000000000000009"],
      ["Anti-raid", "audit", "900000000000000009"],
      ["Comportament suspect", "audit", "900000000000000009"],
      ["Judecătorul AI", "audit", "900000000000000009"],
    ]);
    const off = moduleLogDestinations({ ...config, audit: { enabled: false, channelId: "900000000000000009" } });
    expect(off.map((item) => item.via)).toEqual(["own", "none", "none", "none", "none", "none"]);
  });
});

describe("activity logs", () => {
  it("lists the seven categories of the bot", () => {
    expect(ACTIVITY_CATEGORIES.map((category) => category.key)).toEqual(["messages", "members", "channels", "roles", "voice", "moderation", "security"]);
  });

  it("counts the categories that are on and those still without a channel", () => {
    const config = {
      activityLog: {
        enabled: true,
        categories: { messages: true, members: false, channels: false, roles: false, voice: true, moderation: false, security: false },
        channelIds: { messages: "100000000000000001", voice: null },
      },
    };
    expect(enabledCategoryCount(config)).toBe(2);
    expect(categoriesWithoutChannel(config)).toEqual(["voice"]);
    expect(activitySummary(config)).toBe("2 din 7 categorii");
    expect(activitySummary({ activityLog: { enabled: false } })).toBe("Oprite");
    // Categories left out are on, as on the server.
    expect(enabledCategoryCount({ activityLog: {} })).toBe(7);
  });
});

describe("checks before saving", () => {
  it("accepts valid settings", () => {
    expect(logsDraftError({ cases: { retentionDays: 90 }, audit: { channelId: "123456789012345678" }, activityLog: { enabled: false } })).toBeNull();
  });

  it("refuses a retention outside one day to ten years", () => {
    expect(logsDraftError({ cases: { retentionDays: 0 } })).toMatch(/^Cazuri — Păstrează cazurile/);
    expect(logsDraftError({ cases: { retentionDays: 4_000 } })).toMatch(/între 1 și 3650/);
    expect(logsDraftError({ cases: { retentionDays: undefined } })).toMatch(/^Cazuri/);
  });

  it("refuses logs switched on without any category, like the server", () => {
    const off = Object.fromEntries(ACTIVITY_CATEGORIES.map(({ key }) => [key, false]));
    expect(logsDraftError({ activityLog: { enabled: true, categories: off } })).toMatch(/cel puțin o categorie/);
    expect(logsDraftError({ activityLog: { enabled: false, categories: off } })).toBeNull();
  });

  it("refuses channel IDs that are not Discord IDs, and checks only what is saved", () => {
    expect(logsDraftError({ audit: { channelId: "abc" } })).toMatch(/^Audit — Canalul de audit: „abc”/);
    expect(logsDraftError({ activityLog: { channelIds: { voice: "12" } } })).toMatch(/^Jurnale de activitate — Voce/);
    expect(logsDraftError({ audit: { channelId: "abc" } }, ["cases"])).toBeNull();
  });
});
