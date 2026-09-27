import { ActivityType } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  buildServerActivityPresence,
  buildServerInfoEmbed,
  normalizeDiscordInviteUrl,
  SERVER_ACTIVITY_NAME,
} from "../server-info";

describe("server activity presence", () => {
  it("uses the Regatul Cenușii game activity without unsupported rich-presence fields", () => {
    const presence = buildServerActivityPresence();

    expect(presence.status).toBe("online");
    expect(presence.activities).toEqual([
      { name: "Regatul Cenușii", type: ActivityType.Playing },
    ]);
    expect(presence.activities?.[0]).not.toHaveProperty("timestamps");
    expect(SERVER_ACTIVITY_NAME).toBe("Regatul Cenușii");
  });
});

describe("server information embed", () => {
  it("shows the server logo, a clickable invitation and a relative session start", () => {
    const embed = buildServerInfoEmbed({
      serverName: "Regatul Cenușii",
      serverIconUrl: "https://cdn.discordapp.com/icons/123/icon.png",
      inviteUrl: "https://discord.gg/regatulcenusii",
      sessionStartedAt: new Date(1_700_000_000_000),
    }).toJSON();

    expect(embed.title).toBe("🏰 Regatul Cenușii");
    expect(embed.thumbnail?.url).toBe("https://cdn.discordapp.com/icons/123/icon.png");
    expect(embed.description).toContain("[Intră pe server](<https://discord.gg/regatulcenusii>)");
    expect(embed.fields?.[0]?.value).toBe("<t:1700000000:R>");
  });

  it("explains when an invite link is missing or invalid", () => {
    const missingInvite = buildServerInfoEmbed({
      serverName: "Regatul Cenușii",
      serverIconUrl: null,
      inviteUrl: null,
      sessionStartedAt: null,
    }).toJSON();

    const invalidInvite = normalizeDiscordInviteUrl("https://example.com/invite");

    expect(missingInvite.description).toContain("nu este configurat");
    expect(missingInvite.thumbnail).toBeUndefined();
    expect(missingInvite.fields?.[0]?.value).toContain("nu este disponibil");
    expect(invalidInvite).toBeNull();
  });

  it("accepts standard Discord invite URL forms only", () => {
    expect(normalizeDiscordInviteUrl(" https://discord.com/invite/abc123 ")).toBe(
      "https://discord.com/invite/abc123",
    );
    expect(normalizeDiscordInviteUrl("http://discord.gg/abc123")).toBeNull();
    expect(normalizeDiscordInviteUrl("https://discord.gg/abc123/extra")).toBeNull();
  });
});