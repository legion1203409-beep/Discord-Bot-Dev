import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { deliverWarningInGuild } from "../warning-delivery";

describe("guild warning delivery", () => {
  it("posts the warning in the source server channel without opening a DM", async () => {
    const send = vi.fn().mockResolvedValue({});
    const guild = {
      id: "123456789",
      channels: {
        fetch: vi.fn().mockResolvedValue({
          guildId: "123456789",
          isTextBased: () => true,
          isDMBased: () => false,
          send,
        }),
      },
    } as unknown as Guild;

    expect(await deliverWarningInGuild(guild, "987654321", "555555555", "AutoMod: toxicity")).toBe(true);
    expect(guild.channels.fetch).toHaveBeenCalledWith("987654321");
    expect(send).toHaveBeenCalledWith({
      content: "⚠️ <@555555555>, ai primit un avertisment.\nMotiv: AutoMod: toxicity",
      allowedMentions: { users: ["555555555"], parse: [] },
    });
  });

  it("records warning without DM when there is no safe guild channel", async () => {
    const send = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      guildId: "another-guild",
      isTextBased: () => true,
      isDMBased: () => false,
      send,
    });
    const guild = { id: "123456789", channels: { fetch } } as unknown as Guild;

    expect(await deliverWarningInGuild(guild, undefined, "555555555", "test")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await deliverWarningInGuild(guild, "987654321", "555555555", "test")).toBe(false);
    expect(send).not.toHaveBeenCalled();
    fetch.mockResolvedValue({ guildId: "123456789", isTextBased: () => true, isDMBased: () => true, send });
    expect(await deliverWarningInGuild(guild, "987654321", "555555555", "test")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});