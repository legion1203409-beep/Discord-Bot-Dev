import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiscordBotInviteUrl } from "../oauth";

afterEach(() => vi.unstubAllEnvs());

describe("bot invitation URL", () => {
  it("lets the operator select a server and requests bot and slash-command scopes", () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "123456789012345678");
    const url = new URL(getDiscordBotInviteUrl()!);
    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("123456789012345678");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(["bot", "applications.commands"]);
    expect(url.searchParams.get("permissions")).toBe("268504064");
    expect(url.searchParams.has("guild_id")).toBe(false);
    expect(url.searchParams.has("disable_guild_select")).toBe(false);
  });

  it("still pins a server when inviting from its verification settings", () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "123456789012345678");
    const url = new URL(getDiscordBotInviteUrl("987654321098765432")!);
    expect(url.searchParams.get("guild_id")).toBe("987654321098765432");
    expect(url.searchParams.get("disable_guild_select")).toBe("true");
  });

  it("does not create a broken link without a configured application ID", () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "");
    expect(getDiscordBotInviteUrl()).toBeNull();
  });
});