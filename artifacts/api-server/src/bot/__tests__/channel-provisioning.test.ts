import { ChannelType, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { defaultModerationConfig } from "../../moderation/config";
import { DEFAULT_VERIFICATION_CONFIG } from "../verification";
import { DEFAULT_TICKET_CONFIG } from "../ticket-config";
import { provisionGuildChannels } from "../channel-provisioning";

function channel(id: string, name: string, type: ChannelType) {
  const value = {
    id,
    name,
    type,
    parentId: null as string | null,
    setParent: vi.fn(async (parentId: string) => {
      value.parentId = parentId;
      return value;
    }),
  };
  return value;
}

describe("guild channel provisioning", () => {
  it("reuses configured and named channels, creates only missing destinations, and is repeatable", async () => {
    const channels = new Map<string, ReturnType<typeof channel>>([
      ["configured-main", channel("configured-main", "unrelated-name", ChannelType.GuildText)],
      ["event-existing", channel("event-existing", "ora-umbrelor", ChannelType.GuildText)],
      ["mod-raid", channel("mod-raid", "mod-anti-raid", ChannelType.GuildText)],
      ["mod-spam", channel("mod-spam", "mod-anti-spam", ChannelType.GuildText)],
      ["mod-suspect", channel("mod-suspect", "mod-comportament-suspect", ChannelType.GuildText)],
      ["mod-ai", channel("mod-ai", "mod-ai", ChannelType.GuildText)],
      ["verify", channel("verify", "verificare", ChannelType.GuildText)],
      ["cat-staff", channel("cat-staff", "aplicare-staff", ChannelType.GuildCategory)],
      ["cat-partnership", channel("cat-partnership", "parteneriate", ChannelType.GuildCategory)],
      ["cat-help", channel("cat-help", "ajutor-raportare", ChannelType.GuildCategory)],
    ]);
    const create = vi.fn(async ({ name, type }: { name: string; type: ChannelType }) => {
      const created = channel(`created-${channels.size}`, name, type);
      channels.set(created.id, created);
      return created;
    });
    const guild = {
      id: "guild-for-provisioning",
      channels: { fetch: vi.fn(async () => channels), create },
    } as unknown as Guild;

    const first = await provisionGuildChannels(guild, {
      channelConfig: { main: "configured-main", event: "event-existing" },
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: structuredClone(DEFAULT_VERIFICATION_CONFIG),
    });

    expect(first.reused.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "configured-main",
      "event-existing",
      "cat-staff",
      "cat-partnership",
      "cat-help",
      "mod-raid",
      "mod-spam",
      "mod-suspect",
      "mod-ai",
      "verify",
    ]));
    expect(first.created.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      "eventTop",
      "bossTop",
      "council",
      "fratia",
      "moderation.audit.channelId",
    ]));
    expect(create).toHaveBeenCalledTimes(first.created.length);
    expect(channels.get(first.channelConfig.event!)?.parentId).toBe(
      first.created.find((entry) => entry.key === "category.gameplay")?.id,
    );
    expect(channels.get(first.verification.channelId)?.parentId).toBe(
      first.created.find((entry) => entry.key === "category.verification")?.id,
    );

    const second = await provisionGuildChannels(guild, {
      channelConfig: first.channelConfig,
      ticketConfig: first.ticketConfig,
      moderationConfig: first.moderationConfig,
      verification: first.verification,
    });
    expect(second.created).toEqual([]);
    expect(create).toHaveBeenCalledTimes(first.created.length);
  });
});