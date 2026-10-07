import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { deliverActivityLog } from "../events";

const eventRoutes = [
  ["discord.message_update", "messages"],
  ["discord.member_join", "members"],
  ["discord.channelCreate", "channels"],
  ["discord.guildRoleUpdate", "roles"],
  ["discord.voice_state_update", "voice"],
  ["action.applied", "moderation"],
  ["raid.detected", "security"],
] as const;

function testGuild() {
  const channels = new Map<string, { guildId: string; isTextBased: () => boolean; send: ReturnType<typeof vi.fn> }>();
  const sends = new Map<string, ReturnType<typeof vi.fn>>();
  for (const [, category] of eventRoutes) {
    const send = vi.fn(async () => undefined);
    const channelId = `log-${category}`;
    sends.set(category, send);
    channels.set(channelId, { guildId: "123456789012345678", isTextBased: () => true, send });
  }
  const guild = {
    id: "123456789012345678",
    channels: {
      cache: channels,
      fetch: vi.fn(async (id: string) => channels.get(id) ?? null),
    },
  } as unknown as Guild;
  return { guild, sends, channels };
}

describe("automatic Discord activity-log delivery", () => {
  it("routes every configured event family and does not include message contents", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.roleIds = ["234567890123456789"];
    for (const [, category] of eventRoutes) {
      config.activityLog.categories[category] = true;
      config.activityLog.channelIds[category] = `log-${category}`;
    }
    const { guild, sends } = testGuild();

    for (const [eventType, category] of eventRoutes) {
      const targetType = eventType.startsWith("discord.message_")
        ? "message"
        : eventType.startsWith("discord.member_") ? "member" : "target";
      await deliverActivityLog(guild, config, eventType, targetType, "345678901234567890", {
        actorVerified: false,
        actorId: null,
        channelId: "456789012345678901",
        contentChanged: true,
        messageContent: "private message body",
      });
      expect(sends.get(category)).toHaveBeenCalledTimes(1);
      const payload = sends.get(category)!.mock.calls[0]![0] as {
        embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string }> } }>;
      };
      const fields = payload.embeds[0]!.toJSON().fields;
      if (targetType !== "member") {
        expect(fields.find((field) => field.name === "Actor" || field.name === "Editor")?.value).toBe("Neverificat de Discord");
      }
      if (targetType === "message") {
        expect(fields.find((field) => field.name === "Țintă")).toBeUndefined();
      } else if (targetType === "member") {
        const memberField = fields.find((field) => field.name === "Membru");
        expect(memberField?.value).toBe("Necunoscut");
        expect(memberField?.value).not.toContain("345678901234567890");
      } else {
        expect(fields.find((field) => field.name === "Țintă")?.value).toContain("nume indisponibil");
        expect(fields.find((field) => field.name === "Țintă")?.value).not.toContain("345678901234567890");
      }
      expect(JSON.stringify(payload)).not.toContain("private message body");
    }
  });

  it("shows the saved server name instead of a raw member ID", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.channelIds.members = "log-members";
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.member_join", "member", "345678901234567890", {
      memberDisplayName: "alvin",
      memberUsername: "ioanaaa._",
      serverJoinedAt: "2026-10-05T10:00:00.000Z",
    });

    const payload = sends.get("members")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string }> } }>;
    };
    const memberField = payload.embeds[0]!.toJSON().fields.find((field) => field.name === "Membru");
    expect(memberField?.value).toBe("alvin\nUtilizator: @ioanaaa._");
    expect(memberField?.value).not.toContain("<@");
    expect(memberField?.value).not.toContain("345678901234567890");
  });

  it("shows a safe before-and-after comparison for edited messages", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "log-messages";
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.message_update", "message", "message-id", {
      actorVerified: false,
      actorId: null,
      channelId: "456789012345678901",
      displayMessageAuthorId: "567890123456789012",
      displayBeforeContent: "Textul inițial",
      displayAfterContent: "Text nou @everyone",
      displayContentChanged: true,
    });

    const payload = sends.get("messages")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { description?: string; fields: Array<{ name: string; value: string; inline?: boolean }> } }>;
      allowedMentions: { parse: string[] };
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.description).toContain("comparația este mai jos");
    expect(embed.fields.find((field) => field.name === "Înainte de editare")?.value).toContain("Textul inițial");
    expect(embed.fields.find((field) => field.name === "După editare")?.value).toContain("@\u200beveryone");
    expect(JSON.stringify(payload)).not.toContain("@everyone");
    expect(JSON.stringify(payload)).not.toContain("message-id");
    expect(embed.fields.every((field) => field.inline === false)).toBe(true);
    expect(payload.allowedMentions.parse).toEqual([]);
  });

  it("turns channel update details into readable changes instead of raw event data", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.channels = true;
    config.activityLog.channelIds.channels = "log-channels";
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.channelUpdate", "channel", "345678901234567890", {
      actorVerified: false,
      actorId: null,
      channelId: "345678901234567890",
      entityName: "general",
      changes: { name: { from: "chat", to: "general" }, nsfw: { from: false, to: true } },
    });

    const payload = sends.get("channels")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string; inline?: boolean }> } }>;
    };
    const fields = payload.embeds[0]!.toJSON().fields;
    expect(fields.find((field) => field.name === "Canal")?.value).toBe("<#345678901234567890>");
    expect(fields.find((field) => field.name === "Țintă")).toBeUndefined();
    expect(fields.find((field) => field.name === "Detalii")?.value).toContain("**Nume:** chat → general");
    expect(fields.find((field) => field.name === "Detalii")?.value).toContain("**Conținut sensibil:** Nu → Da");
  });

  it("routes member role changes to the roles channel and redacts unclassified ID arrays", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.categories.roles = true;
    config.activityLog.channelIds.members = "log-members";
    config.activityLog.channelIds.roles = "log-roles";
    const { guild, sends } = testGuild();
    await deliverActivityLog(guild, config, "discord.member_update", "member", "234567890123456789", {
      actorVerified: false,
      actorId: null,
      rolesChanged: true,
      addedRoles: ["LEGION"],
      removedRoles: ["Scout"],
      otherIds: ["987654321098765432"],
    });

    expect(sends.get("roles")).toHaveBeenCalledTimes(1);
    expect(sends.get("members")).not.toHaveBeenCalled();
    const payload = sends.get("roles")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { title: string; fields: Array<{ name: string; value: string }> } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    const details = embed.fields.find((field) => field.name === "Detalii")?.value ?? "";
    expect(embed.title).toBe("Rolurile membrului au fost schimbate");
    expect(details).toContain("**Roluri adăugate:** LEGION");
    expect(details).toContain("**Roluri eliminate:** Scout");
    expect(details).toContain("element Discord");
    expect(details).not.toContain("987654321098765432");
  });

  it("keeps nickname-only member changes in the members channel", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.categories.roles = true;
    config.activityLog.channelIds.members = "log-members";
    config.activityLog.channelIds.roles = "log-roles";
    const { guild, sends } = testGuild();
    await deliverActivityLog(guild, config, "discord.member_update", "member", "234567890123456789", {
      nicknameChanged: true,
      oldNickname: "Old name",
      newNickname: "New name",
      rolesChanged: false,
      addedRoles: [],
      removedRoles: [],
    });

    expect(sends.get("members")).toHaveBeenCalledTimes(1);
    expect(sends.get("roles")).not.toHaveBeenCalled();
  });

  it("only uses profile thumbnails from the official Discord CDN", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.channelIds.members = "log-members";
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.member_join", "member", "234567890123456789", {
      memberAvatarUrl: "https://cdn.discordapp.com.attacker.example/avatar.png",
      serverJoinedAt: "2026-10-05T10:00:00.000Z",
      accountCreatedAt: "2020-01-01T00:00:00.000Z",
    });

    const payload = sends.get("members")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { thumbnail?: { url: string } } }>;
    };
    expect(payload.embeds[0]!.toJSON().thumbnail).toBeUndefined();
  });

  it("renders member templates with names, account age, stay duration, and Discord timestamps", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.channelIds.members = "log-members";
    config.activityLog.memberLeaveTitleTemplate = "{member_name} · {account_age_years} ani";
    config.activityLog.memberLeaveDescriptionTemplate =
      "{member} (@{username}) · cont creat {account_created_at} ({account_created_at_relative}) · vechime {account_age} ({account_age_days} zile) · intrare {server_joined_at} ({server_joined_at_relative}) · ieșire {server_left_at} ({server_left_at_relative}) · ședere {server_duration} · eveniment {timestamp} ({timestamp_relative}) · {unknown_token}";
    const { guild, sends } = testGuild();
    const createdAt = Date.parse("2021-05-06T10:30:00.000Z");
    const joinedAt = Date.parse("2026-09-24T11:00:00.000Z");
    const leftAt = Date.parse("2026-10-05T14:00:00.000Z");

    await deliverActivityLog(guild, config, "discord.member_leave", "member", "345678901234567890", {
      memberDisplayName: "Adina pe server",
      memberUsername: "adina",
      accountCreatedAt: new Date(createdAt).toISOString(),
      serverJoinedAt: new Date(joinedAt).toISOString(),
      serverLeftAt: new Date(leftAt).toISOString(),
    });

    const payload = sends.get("members")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { title: string; description?: string } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.title).toBe("Adina pe server · 5 ani");
    expect(embed.description).toContain("<@345678901234567890> (@adina)");
    expect(embed.description).toContain(`<t:${Math.floor(createdAt / 1_000)}:F> (<t:${Math.floor(createdAt / 1_000)}:R>)`);
    expect(embed.description).toContain("vechime 5 ani, 4 luni, 29 zile");
    expect(embed.description).toContain(`<t:${Math.floor(joinedAt / 1_000)}:F> (<t:${Math.floor(joinedAt / 1_000)}:R>)`);
    expect(embed.description).toContain(`<t:${Math.floor(leftAt / 1_000)}:F> (<t:${Math.floor(leftAt / 1_000)}:R>)`);
    expect(embed.description).toContain("ședere 11 zile, 3 ore");
    expect(embed.description).toContain(`<t:${Math.floor(leftAt / 1_000)}:F> (<t:${Math.floor(leftAt / 1_000)}:R>) · {unknown_token}`);
  });

  it("shows the deleted message, author, and channel without raw message IDs", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "log-messages";
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.message_delete", "message", "message-id", {
      actorVerified: false,
      actorId: null,
      channelId: "456789012345678901",
      messageCount: 1,
      policyExcluded: false,
      displayMessageAuthorId: "567890123456789012",
      displayDeletedMessages: [{
        authorId: "567890123456789012",
        content: "Text șters @everyone",
        attachmentCount: 0,
        imageAttachments: [{
          url: "https://cdn.discordapp.com/attachments/456789012345678901/567890123456789012/fotografie.png?ex=abcdef",
          contentType: "image/png",
        }],
      }],
    });

    const payload = sends.get("messages")!.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { description?: string; image?: { url: string }; fields: Array<{ name: string; value: string; inline?: boolean }> } }>;
      allowedMentions: { parse: string[] };
    };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.description).toContain("Un mesaj a fost șters");
    expect(embed.fields.find((field) => field.name === "Autor mesaj")?.value).toBe("<@567890123456789012>");
    expect(embed.fields.find((field) => field.name === "Canal")?.value).toBe("<#456789012345678901>");
    expect(embed.fields.find((field) => field.name === "Conținut șters")?.value).toContain("Text șters @\u200beveryone");
    expect(embed.image?.url).toBe("https://cdn.discordapp.com/attachments/456789012345678901/567890123456789012/fotografie.png?ex=abcdef");
    expect(embed.fields.find((field) => field.name === "Detalii")?.value).toContain("**Exceptat de la moderare:** Nu");
    expect(JSON.stringify(payload)).not.toContain("@everyone");
    expect(JSON.stringify(payload)).not.toContain("message-id");
    expect(embed.fields.every((field) => field.inline === false)).toBe(true);
    expect(payload.allowedMentions.parse).toEqual([]);
  });

  it("does not send when the global switch or selected category is off", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.channelIds.messages = "log-messages";
    config.activityLog.categories.messages = false;
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});
    config.activityLog.categories.messages = true;
    config.activityLog.enabled = false;
    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});

    expect(sends.get("messages")).not.toHaveBeenCalled();
  });

  it("does not post a guild's log to a channel from another server", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "log-messages";
    const { guild, sends, channels } = testGuild();
    channels.get("log-messages")!.guildId = "another-guild";
    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});
    expect(sends.get("messages")).not.toHaveBeenCalled();
  });
});