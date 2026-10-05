import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { ACTIVITY_LOG_TEMPLATES, activityLogTemplateKey } from "../../../moderation/activity-log-template-definitions";
import { defaultModerationConfig, ModerationConfigSchema } from "../../../moderation/config";
import { deliverActivityLog } from "../events";
import { renderActivityLogTemplate } from "../activity-log-templates";

describe("individual activity log templates", () => {
  it("loads old configs and validates individual templates", () => {
    expect(ModerationConfigSchema.parse({}).activityLog.templates).toEqual({});
    const templates = Object.fromEntries(ACTIVITY_LOG_TEMPLATES.map((entry) => [entry.key, { title: "Titlu {guild}", description: "{details}" }]));
    expect(ModerationConfigSchema.parse({ activityLog: { templates } }).activityLog.templates).toEqual(templates);
    expect(ModerationConfigSchema.safeParse({ activityLog: { templates: { unsupported: { title: "x" } } } }).success).toBe(false);
    expect(ModerationConfigSchema.safeParse({ activityLog: { templates: { message_update: { title: "x".repeat(257) } } } }).success).toBe(false);
    expect(ModerationConfigSchema.safeParse({ activityLog: { templates: { message_update: { description: "x".repeat(2001) } } } }).success).toBe(false);
  });

  it("distinguishes role changes from other member updates and normalizes gateway names", () => {
    expect(activityLogTemplateKey("discord.memberUpdate", {})).toBe("member_update");
    expect(activityLogTemplateKey("discord.member_update", { addedRoles: ["Membru"] })).toBe("member_roles");
    expect(activityLogTemplateKey("unrelated.event", {})).toBeNull();
  });

  for (const entry of ACTIVITY_LOG_TEMPLATES) {
    it(`renders and resets ${entry.key}, keeping its destination and details`, async () => {
      const config = structuredClone(defaultModerationConfig);
      config.activityLog.enabled = true;
      config.activityLog.categories[entry.group] = true;
      config.activityLog.channelIds[entry.group] = "123456";
      config.activityLog.templates[entry.key] = { title: "Personalizat {guild}: {event}", description: "{member} · {moderator} · {channel} · {reason}" };
      const send = vi.fn(async (_payload: unknown) => undefined);
      const guild = { id: "999999", name: "Test guild", channels: { cache: new Map([["123456", { guildId: "999999", isTextBased: () => true, send }]]) } } as unknown as Guild;
      const detail = { actorVerified: true, actorId: "777777", channelId: "888888", displayMessageAuthorId: "555555", reason: "Motiv test", rolesChanged: entry.key === "member_roles" };
      await deliverActivityLog(guild, config, entry.event, "member", "555555", detail);
      expect(send).toHaveBeenCalledTimes(1);
      const embed = (send.mock.calls[0][0] as any).embeds[0].toJSON();
      expect(embed.title).toBe(`Personalizat Test guild: ${entry.event}`);
      expect(embed.description).toBe("<@555555> · <@777777> · <#888888> · Motiv test");
      expect(embed.fields).toEqual([]);
      expect((send.mock.calls[0][0] as any).allowedMentions).toEqual({ parse: [] });
      config.activityLog.templates[entry.key] = { title: "", description: "" };
      await deliverActivityLog(guild, config, entry.event, "member", "555555", detail);
      expect((send.mock.calls[1][0] as any).embeds[0].toJSON().title).toBe(entry.title);
      config.activityLog.enabled = false;
      await deliverActivityLog(guild, config, entry.event, "member", "555555", detail);
      expect(send).toHaveBeenCalledTimes(2);
    });
  }

  it("includes event details in the custom description only when {details} is requested", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "123456";
    config.activityLog.templates.message_update = { title: "Editare", description: "Detalii:\n{details}" };
    const send = vi.fn(async (_payload: unknown) => undefined);
    const guild = { id: "999999", name: "Test guild", channels: { cache: new Map([["123456", { guildId: "999999", isTextBased: () => true, send }]]) } } as unknown as Guild;

    await deliverActivityLog(guild, config, "discord.message_update", "message", "message-id", {
      actorVerified: true, actorId: "777777", channelId: "888888",
      displayBeforeContent: "Text inițial", displayAfterContent: "Text nou", displayContentChanged: true,
    });

    const embed = (send.mock.calls[0][0] as any).embeds[0].toJSON();
    expect(embed.description).toContain("Textul inițial");
    expect(embed.description).toContain("Text nou");
    expect(embed.fields).toEqual([]);
  });

  it("keeps the standard event details when only the title is customized", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "123456";
    config.activityLog.templates.message_update = { title: "Titlu nou", description: "" };
    const send = vi.fn(async (_payload: unknown) => undefined);
    const guild = { id: "999999", name: "Test guild", channels: { cache: new Map([["123456", { guildId: "999999", isTextBased: () => true, send }]]) } } as unknown as Guild;

    await deliverActivityLog(guild, config, "discord.message_update", "message", "message-id", {
      actorVerified: true, actorId: "777777", channelId: "888888",
      displayBeforeContent: "Text inițial", displayAfterContent: "Text nou", displayContentChanged: true,
    });

    const embed = (send.mock.calls[0][0] as any).embeds[0].toJSON();
    expect(embed.title).toBe("Titlu nou");
    expect(embed.fields.length).toBeGreaterThan(0);
  });

  it("never presents an unverified actor as the moderator and does not recursively expand content", () => {
    const output = renderActivityLogTemplate("{moderator} | {after} | {timestamp_relative} | {unknown}", {
      guildName: "Test", category: "messages", eventType: "discord.message_update", defaultTitle: "Mesaj editat",
      targetType: "message", targetId: "123456", detail: { actorId: "777777", actorVerified: false, displayAfterContent: "{moderator} @everyone" },
      presentation: { description: null, fields: [] }, now: 100_000,
    });
    expect(output).toBe("Neverificat de Discord | {moderator} @\u200beveryone | <t:100:R> | {unknown}");
  });
});
