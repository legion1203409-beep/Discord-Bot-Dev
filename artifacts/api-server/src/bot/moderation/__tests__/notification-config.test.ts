import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { automaticLogDestination, notify, sharesActivityLogDestination } from "../engine";

describe("saved moderation notification settings", () => {
  const guildId = "123456789012345678";
  function fixture(destinationGuildId = guildId) {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const channel = { guildId: destinationGuildId, isTextBased: () => true, send };
    const fetch = vi.fn(async () => channel);
    const guild = {
      id: guildId,
      name: "Regatul Cenușii",
      channels: {
        cache: new Map([["345678901234567890", { id: "345678901234567890", name: "general" }]]),
        fetch,
      },
      members: {
        cache: new Map([
          ["123456789012345678", { id: "123456789012345678", displayName: "Adina", user: { username: "adina" } }],
          ["234567890123456789", { id: "234567890123456789", displayName: "Moderator", user: { username: "mod" } }],
        ]),
      },
    } as unknown as Guild;
    return { guild, send, fetch };
  }

  it("routes AutoMod and Anti-Flood rules to their dedicated log destinations", () => {
    const config = structuredClone(defaultModerationConfig);
    config.autoMod.logChannelId = "111111111111111111";
    config.antiFlood.logChannelId = "222222222222222222";

    expect(automaticLogDestination(config, config.autoMod.wordFilter)).toEqual({
      title: "AutoMod",
      channelId: "111111111111111111",
    });
    expect(automaticLogDestination(config, config.antiFlood.longMessage)).toEqual({
      title: "Anti-Flood",
      channelId: "222222222222222222",
    });
  });

  it("detects when an automatic moderation alert would duplicate the activity log in the same channel", () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.moderation = true;
    config.activityLog.channelIds.moderation = "111111111111111111";

    expect(sharesActivityLogDestination(config, "moderation", "111111111111111111")).toBe(true);
    expect(sharesActivityLogDestination(config, "moderation", "222222222222222222")).toBe(false);
    config.activityLog.enabled = false;
    expect(sharesActivityLogDestination(config, "moderation", "111111111111111111")).toBe(false);
  });

  it("uses the configured GIF animation, icon, text templates and color", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.animations = true;
    config.embeds.animationUrl = "https://example.test/animation.gif";
    config.embeds.iconUrl = "https://example.test/icon.png";
    config.embeds.color = "#112233";
    config.embeds.titleTemplate = "{action} / {action}";
    config.embeds.descriptionTemplate = "{reason} — {reason}";
    const { guild, send } = fixture();

    await notify(config, guild, "AI", "Încălcare", "987654321098765432");
    const payload = send.mock.calls[0]?.[0] as unknown as { embeds: Array<{ toJSON(): {
      title: string; description: string; color: number; image?: { url: string }; thumbnail?: { url: string }
    } }> };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed).toMatchObject({
      title: "AI / AI", description: "Încălcare — Încălcare", color: 0x112233,
      image: { url: config.embeds.animationUrl },
      thumbnail: { url: config.embeds.iconUrl },
    });
  });

  it("renders guild and Discord timestamp variables in moderation templates", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.titleTemplate = "{action} · {guild}";
    config.embeds.descriptionTemplate = "{reason}\n{timestamp}\n{timestamp_relative}";
    const { guild, send } = fixture();

    await notify(config, guild, "Avertisment", "Motiv de test", "987654321098765432");

    const payload = send.mock.calls[0]?.[0] as unknown as {
      embeds: Array<{ toJSON(): { title: string; description: string } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.title).toBe("Avertisment · Regatul Cenușii");
    expect(embed.description).toMatch(/^Motiv de test\n<t:\d+:F>\n<t:\d+:R>$/);
  });

  it("renders member, moderator, channel, duration and time variables in moderation templates", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.titleTemplate = "{member} · {moderator}";
    config.embeds.descriptionTemplate =
      "{member_name} (@{username}) · {member_id} · {action}: {reason} · {channel} · #{channel_name} · {duration} · {guild} · {time_relative}";
    const { guild, send } = fixture();

    await notify(config, guild, "Avertisment", "Motiv de test", "987654321098765432", {
      memberId: "123456789012345678",
      moderatorId: "234567890123456789",
      channelId: "345678901234567890",
      durationMinutes: 5,
    });

    const payload = send.mock.calls[0]?.[0] as unknown as {
      embeds: Array<{ toJSON(): { title: string; description: string } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.title).toBe("<@123456789012345678> · <@234567890123456789>");
    expect(embed.description).toMatch(
      /^Adina \(@adina\) · 123456789012345678 · Avertisment: Motiv de test · <#345678901234567890> · #general · 5 minute · Regatul Cenușii · <t:\d+:R>$/,
    );
  });

  it("labels fields that do not apply to a server-wide alert instead of leaving them blank", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.descriptionTemplate =
      "Membru: {member_name} · Moderator: {moderator_name} · Canal: {channel_name} · Durată: {duration}";
    const { guild, send } = fixture();

    await notify(config, guild, "Activitate suspectă", "Alertă la nivel de server", "987654321098765432", {
      memberId: null,
      moderatorId: null,
      channelId: null,
      durationMinutes: null,
    });

    const payload = send.mock.calls[0]?.[0] as unknown as {
      embeds: Array<{ toJSON(): { description: string } }>;
    };
    expect(payload.embeds[0]!.toJSON().description).toBe(
      "Membru: Nu se aplică acestei alerte · Moderator: Neidentificat în jurnal · Canal: La nivel de server · Durată: Nu se aplică",
    );
  });

  it("does not repeat detailed content when the embed description already includes the reason", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.style = "detailed";
    config.embeds.descriptionTemplate = "{action}: {reason}";
    const description = "Un mesaj a fost șters.\n\n**Șters de:**\nNeverificat de Discord";
    const { guild, send } = fixture();

    await notify(config, guild, "Mesaj șters", description, "987654321098765432");

    const payload = send.mock.calls[0]?.[0] as unknown as {
      embeds: Array<{ toJSON(): { description: string; fields?: Array<{ name: string; value: string }> } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.description).toBe(`Mesaj șters: ${description}`);
    expect(embed.description.match(/Șters de:/g)).toHaveLength(1);
    expect(embed.fields ?? []).toHaveLength(0);
  });

  it.each(["plain", "compact", "detailed"] as const)(
    "keeps the event details visible when the %s embed template omits the reason",
    async (style) => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.style = style;
    config.embeds.descriptionTemplate = "{action}";
    const { guild, send } = fixture();

    await notify(config, guild, "Mesaj șters", "Un mesaj a fost șters.", "987654321098765432");

    const payload = send.mock.calls[0]?.[0] as unknown as {
      embeds: Array<{ toJSON(): { fields?: Array<{ name: string; value: string }>; timestamp?: string } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.fields).toEqual([
      { name: "Detalii", value: "Un mesaj a fost șters." },
    ]);
    if (style === "detailed") {
      expect(embed.timestamp).toEqual(expect.any(String));
    } else {
      expect(embed.timestamp).toBeUndefined();
    }
  });

  it("uses the audit channel for an unset module destination only while audit is enabled", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.audit.channelId = "987654321098765432";
    const { guild, fetch, send } = fixture();
    await notify(config, guild, "AI", "Flag", config.ai.logChannelId);
    expect(fetch).not.toHaveBeenCalled();
    config.audit.enabled = true;
    await notify(config, guild, "AI", "Flag", config.ai.logChannelId);
    expect(fetch).toHaveBeenCalledWith(config.audit.channelId);
    expect(send).toHaveBeenCalledTimes(1);
    config.audit.enabled = false;
    await notify(config, guild, "Anti-raid", "Flag", null);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit module alert channel over audit fallback", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.audit.enabled = true;
    config.audit.channelId = "987654321098765432";
    const { guild, fetch } = fixture();
    await notify(config, guild, "AI", "Flag", "876543210987654321");
    expect(fetch).toHaveBeenCalledWith("876543210987654321");
  });

  it("never sends a configured notification into another guild", async () => {
    const config = structuredClone(defaultModerationConfig);
    const { guild, send } = fixture("another-guild");
    await notify(config, guild, "AI", "Flag", "987654321098765432");
    expect(send).not.toHaveBeenCalled();
  });
});