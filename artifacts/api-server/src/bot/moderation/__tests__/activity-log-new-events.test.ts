import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { deliverActivityLog } from "../events";
import { buildActivityLogPresentation } from "../activity-log-presentation";

const setup = (category: "moderation" | "members" | "channels") => {
  const config = structuredClone(defaultModerationConfig);
  config.activityLog.enabled = true;
  config.activityLog.categories[category] = true;
  config.activityLog.channelIds[category] = "123456";
  const send = vi.fn(async (_payload: unknown) => undefined);
  const guild = { id: "999999", name: "Regatul", iconURL: () => null, channels: { cache: new Map([["123456", { guildId: "999999", isTextBased: () => true, send }]]) } } as unknown as Guild;
  return { config, send, guild };
};
const embedOf = (send: ReturnType<typeof vi.fn>) => (send.mock.calls[0]![0] as any).embeds[0].toJSON();

describe("jurnale pentru evenimentele noi", () => {
  it("banul dat din Discord merge în moderare, în roșu, cu membrul, cine l-a dat și motivul", async () => {
    const { config, send, guild } = setup("moderation");
    await deliverActivityLog(guild, config, "discord.guild_ban_add", "member", "555555", { actorVerified: true, actorId: "777777", memberName: "ion", banReason: "spam" });
    const embed = embedOf(send);
    expect(embed.title).toBe("⛔ Ban dat din Discord");
    expect(embed.color).toBe(0xd95050);
    expect(embed.author.name).toBe("Regatul");
    expect(embed.fields.map((f: any) => f.name)).toEqual(["Membru banat", "Făcut de", "Motiv"]);
    expect(embed.fields[0].value).toContain("<@555555>");
    expect(embed.fields.every((f: any) => f.inline === true)).toBe(true);
  });

  it("invitația creată merge la membri, verde, cu limita și expirarea", async () => {
    const { config, send, guild } = setup("members");
    await deliverActivityLog(guild, config, "discord.invite_create", "invite", "abc123", { actorVerified: false, inviteChannelName: "bun-venit", maxUses: 5, expiresInMinutes: 1440 });
    const embed = embedOf(send);
    expect(embed.title).toBe("🔗 Invitație creată");
    expect(embed.color).toBe(0x36a878);
    expect(embed.fields.map((f: any) => f.value)).toEqual(expect.arrayContaining(["`abc123`", "#bun-venit", "5 folosiri", "1440 min"]));
  });

  it("firele, emoji-urile și serverul merg la canale", async () => {
    for (const [event, title] of [["discord.thread_create", "🧵 Fir creat"], ["discord.emoji_delete", "😀 Emoji șters"], ["discord.guild_update", "🏰 Serverul a fost modificat"]] as const) {
      const { config, send, guild } = setup("channels");
      await deliverActivityLog(guild, config, event, "thread", "444444", { actorVerified: false, threadName: "idei", emojiName: "foc", serverChanges: { name: { from: "A", to: "B" } } });
      expect(embedOf(send).title).toBe(title);
    }
  });

  it("modificările serverului se arată ca „înainte → după”", () => {
    const presentation = buildActivityLogPresentation("discord.guild_update", "guild", "1", { serverChanges: { name: { from: "Vechi", to: "Nou" } } }, "<@7>", "—");
    expect(presentation.fields.find((f) => f.name === "Modificări")?.value).toBe("**Nume:** Vechi → Nou");
  });

  it("o categorie oprită nu postează nimic", async () => {
    const { config, send, guild } = setup("channels");
    config.activityLog.categories.channels = false;
    await deliverActivityLog(guild, config, "discord.emoji_create", "emoji", "1", { emojiName: "x" });
    expect(send).not.toHaveBeenCalled();
  });
});
