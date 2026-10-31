import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  DEFAULT_ALLIANCE, allianceDraftError, allianceTemplateOf, changedAllianceParts, customLogCount, insertVariable, logTemplate,
  logVariables, messageCatalog, messagesDraftError, messagesModuleForRoute, previewAlliance, previewLog, withLogTemplate,
} from "./messages-model";

describe("the messages page", () => {
  it("opens one module per route and is one wide page", () => {
    expect(messagesModuleForRoute("/config/mesaje").id).toBe("catalog");
    expect(messagesModuleForRoute("/config/mesaje/jurnale/").id).toBe("logs");
    expect(messagesModuleForRoute("/config/mesaje/alianta").id).toBe("alliance");
    expect(panelGroupRoute("/config/mesaje/jurnale")).toBe("/config/mesaje");
    expect(isWidePanelRoute("/config/mesaje")).toBe(true);
  });

  it("lists every message with where it is edited and whether it is on", () => {
    const catalog = messageCatalog({ embeds: { enabled: true }, sanctionDm: { enabled: false }, activityLog: { enabled: true } }, { dailyStats: { enabled: true }, gameplayConfig: { memberMessages: { welcomeEnabled: true } } });
    const byId = Object.fromEntries(catalog.map((entry) => [entry.id, entry]));
    expect(byId.notices).toMatchObject({ on: true, href: "/setari/notificari" });
    expect(byId.dm!.on).toBe(false);
    expect(byId.welcome!.on).toBe(true);
    expect(byId.daily).toMatchObject({ on: true, href: "/control/raport" });
    expect(byId.logs!.href).toBe("/config/mesaje/jurnale");
    expect(messageCatalog({}, null).find((entry) => entry.id === "welcome")!.on).toBeNull();
  });
});

describe("activity log texts", () => {
  it("reads a saved text, and the older join and leave fields when there is none", () => {
    expect(logTemplate({ activityLog: { templates: { channel_create: { title: "Nou", description: "#{name}" } } } }, "channel_create")).toEqual({ title: "Nou", description: "#{name}" });
    expect(logTemplate({ activityLog: { memberJoinTitleTemplate: "Salut", memberJoinDescriptionTemplate: "{member}" } }, "member_join")).toEqual({ title: "Salut", description: "{member}" });
    expect(logTemplate({}, "channel_create")).toEqual({ title: "", description: "" });
  });

  it("writes the text, keeping the others and updating the older join fields", () => {
    const next = withLogTemplate({ enabled: true, templates: { channel_delete: { title: "x", description: "" } } }, "member_join", { title: "Bun venit", description: "{member}" });
    expect(next).toMatchObject({ enabled: true, memberJoinTitleTemplate: "Bun venit", memberJoinDescriptionTemplate: "{member}" });
    expect(Object.keys(next.templates)).toEqual(["channel_delete", "member_join"]);
    expect(withLogTemplate({}, "channel_create", { title: "a", description: "" }).memberJoinTitleTemplate).toBeUndefined();
    expect(customLogCount({ activityLog: next })).toBe(2);
  });

  it("offers the variables of the log's kind and previews with example values or the defaults", () => {
    expect(logVariables({ key: "message_update", group: "messages" })).toEqual(expect.arrayContaining(["before", "after", "details"]));
    expect(logVariables({ key: "member_leave", group: "members" })).toContain("server_duration");
    const entry = { key: "channel_create", event: "discord.channel_create", group: "channels" as const, title: "Canal creat" };
    expect(previewLog(entry, { title: "", description: "" })).toEqual({ title: "Canal creat", description: "Detaliile primite de la Discord." });
    expect(previewLog(entry, { title: "Nou: #{name}", description: "de {moderator}" })).toEqual({ title: "Nou: #comunitate", description: "de @Moderator" });
  });

  it("refuses texts longer than Discord takes", () => {
    expect(messagesDraftError({ activityLog: { templates: { channel_create: { title: "x".repeat(257), description: "" } } } })).toContain("titlul");
    expect(messagesDraftError({ activityLog: { templates: { channel_create: { title: "", description: "x".repeat(2001) } } } })).toContain("descrierea");
    expect(messagesDraftError({ activityLog: {} })).toBeNull();
  });
});

describe("the alliance announcement", () => {
  it("falls back to the standard text and previews with an example partnership", () => {
    expect(allianceTemplateOf({ tickets: {} })).toBe(DEFAULT_ALLIANCE);
    expect(allianceTemplateOf({ tickets: { allianceAnnouncementTemplate: "Pact cu {server_name}" } })).toBe("Pact cu {server_name}");
    expect(previewAlliance("Pact cu {server_name}, {unknown}")).toBe("Pact cu Taverna Dragonului, {unknown}");
  });
  it("marks only a changed text as unsaved and refuses a too long one", () => {
    expect(changedAllianceParts({ tickets: { allianceAnnouncementTemplate: "a" } }, { tickets: { allianceAnnouncementTemplate: "a" } })).toEqual([]);
    expect(changedAllianceParts({ tickets: { allianceAnnouncementTemplate: "a" } }, { tickets: { allianceAnnouncementTemplate: "b" } })).toHaveLength(1);
    // Empty means the standard text, as the bot reads it.
    expect(allianceDraftError({ tickets: { allianceAnnouncementTemplate: "" } })).toBeNull();
    expect(allianceDraftError({ tickets: { allianceAnnouncementTemplate: "x".repeat(2001) } })).toContain("2000");
    expect(allianceDraftError({ tickets: { allianceAnnouncementTemplate: "ok" } })).toBeNull();
  });
});

describe("inserting a variable", () => {
  it("puts it at the cursor, at the end without one, and never past the limit", () => {
    expect(insertVariable("Salut !", "member", 6, 100)).toEqual({ text: "Salut {member}!", cursor: 14 });
    expect(insertVariable("Salut", "member", null, 100).text).toBe("Salut{member}");
    expect(insertVariable("abc", "member", 1, 5)).toEqual({ text: "abc", cursor: 1 });
  });
});

describe("saving the log texts", () => {
  it("has one section per log, so only the changed texts are sent", async () => {
    const { MESSAGES_SECTIONS } = await import("./messages-model");
    const { changedSectionsOf } = await import("./model");
    const saved = { activityLog: { enabled: true, channelIds: { messages: "1" }, templates: {} } };
    const draft = { activityLog: withLogTemplate(saved.activityLog, "channel_create", { title: "Nou", description: "" }) };
    expect(changedSectionsOf(MESSAGES_SECTIONS, saved, draft).map((section) => section.key)).toEqual(["activityLog.templates.channel_create"]);
    const joined = { activityLog: withLogTemplate(saved.activityLog, "member_join", { title: "Hei", description: "" }) };
    expect(changedSectionsOf(MESSAGES_SECTIONS, saved, joined).map((section) => section.key))
      .toEqual(["activityLog.templates.member_join", "activityLog.memberJoinTitleTemplate", "activityLog.memberJoinDescriptionTemplate"]);
  });
});
