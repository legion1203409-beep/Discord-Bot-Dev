import { describe, expect, it, vi } from "vitest";
import { ModerationConfigSchema, type ModerationConfig } from "../../../moderation/config";
import { announceThenRemove, buildSanctionDm, sendSanctionDm, shouldSendSanctionDm } from "../sanction-dm";

const config = (sanctionDm: Record<string, unknown> = {}, embeds: Record<string, unknown> = {}): ModerationConfig =>
  ModerationConfigSchema.parse({ sanctionDm, embeds });

describe("the private message on a sanction", () => {
  it("is off until the server turns it on", () => {
    const defaults = ModerationConfigSchema.parse({});
    expect(defaults.sanctionDm.enabled).toBe(false);
    expect(defaults.sanctionDm.actions).toEqual(["warn", "mute", "kick", "ban"]);
    expect(shouldSendSanctionDm(defaults, "ban", "manual")).toBe(false);
  });

  it("goes only for the chosen sanctions, never for anti-raid, and for automatic ones only when allowed", () => {
    const on = config({ enabled: true, actions: ["mute", "ban"], automatic: false });
    expect(shouldSendSanctionDm(on, "mute", "manual")).toBe(true);
    expect(shouldSendSanctionDm(on, "warn", "manual")).toBe(false);
    expect(shouldSendSanctionDm(on, "ban", "automod")).toBe(false);
    expect(shouldSendSanctionDm(on, "ban", "raid")).toBe(false);
    expect(shouldSendSanctionDm(on, "purge", "manual")).toBe(false);
    expect(shouldSendSanctionDm(config({ enabled: true }), "warn", "automod")).toBe(true);
  });

  it("refuses the same sanction twice and an appeal link that is not public HTTPS", () => {
    expect(() => config({ actions: ["warn", "warn"] })).toThrow();
    expect(() => config({ appealUrl: "http://localhost/apel" })).toThrow();
    expect(config({ appealUrl: "https://forms.example.com/apel" }).sanctionDm.appealUrl).toBe("https://forms.example.com/apel");
  });

  it("says what happened, the case and how to appeal while still on the server", () => {
    const payload = buildSanctionDm(config({ enabled: true }, { color: "#ff6b3d" }), {
      type: "mute", guildName: "Regatul Cenușii", reason: "Spam", durationMinutes: 30, caseId: "1b2c", moderator: "Ana",
      now: new Date("2026-10-30T12:00:00Z"),
    });
    const embed = payload.embeds[0]!;
    expect(embed.title).toBe("🔇 Ai primit timeout");
    expect(embed.description).toContain("Regatul Cenușii");
    expect(embed.color).toBe(0xff6b3d);
    expect(embed.fields.map((field) => field.name)).toEqual(["Motiv", "Durată", "ID-ul cazului", "Contestație"]);
    expect(embed.fields[1]!.value).toContain("30 minute");
    expect(embed.fields[2]!.value).toBe("`1b2c`");
    expect(embed.fields[3]!.value).toContain("tichet de contestație");
    expect(embed.fields[3]!.value).toContain("Regatul Cenușii");
    expect(payload.components).toEqual([]);
  });

  it("after a kick or a ban, uses the other appeal text, can hide the reason and adds the appeal link", () => {
    const payload = buildSanctionDm(config({
      enabled: true, showReason: false, showModerator: true, removedAppealText: "Scrie la {guild}, cazul {case}.", appealUrl: "https://apel.example.com",
    }), { type: "ban", guildName: "Regatul", reason: "Secret", caseId: "c-1", moderator: "Ana" });
    const embed = payload.embeds[0]!;
    expect(embed.title).toBe("⛔ Ai fost banat");
    expect(embed.fields.find((field) => field.name === "Motiv")).toBeUndefined();
    expect(embed.fields.find((field) => field.name === "Dată de")?.value).toBe("Ana");
    expect(embed.fields.at(-1)!.value).toBe("Scrie la Regatul, cazul c-1.");
    expect(payload.components[0]!.components[0]).toMatchObject({ style: 5, label: "Contestă", url: "https://apel.example.com" });
  });

  it("links a ban to the site's appeal page when appeals are on, unless the server set its own link", () => {
    const withAppeals = (sanctionDm: Record<string, unknown> = {}, appeals: Record<string, unknown> = { enabled: true }) =>
      ModerationConfigSchema.parse({ sanctionDm: { enabled: true, ...sanctionDm }, appeals });
    const page = "https://regat.example.com/contestatie?guildId=9";
    const ban = buildSanctionDm(withAppeals(), { type: "ban", guildName: "Regatul", reason: "x", appealPageUrl: page });
    expect(ban.components[0]!.components[0]).toMatchObject({ style: 5, label: "Contestă", url: page });
    expect(ban.embeds[0]!.fields.at(-1)!.value).toContain("contesta banul pe site");
    // Not for a kick, not when appeals are off, not for a link that is not absolute HTTPS.
    expect(buildSanctionDm(withAppeals(), { type: "kick", guildName: "R", reason: "x", appealPageUrl: page }).components).toEqual([]);
    expect(buildSanctionDm(withAppeals({}, { enabled: false }), { type: "ban", guildName: "R", reason: "x", appealPageUrl: page }).components).toEqual([]);
    expect(buildSanctionDm(withAppeals(), { type: "ban", guildName: "R", reason: "x", appealPageUrl: "/contestatie" }).components).toEqual([]);
    const own = buildSanctionDm(withAppeals({ appealUrl: "https://apel.example.com" }), { type: "ban", guildName: "R", reason: "x", appealPageUrl: page });
    expect(own.components[0]!.components[0]).toMatchObject({ url: "https://apel.example.com" });
  });

  it("does not fail the sanction when the member has closed private messages", async () => {
    const payload = buildSanctionDm(config({ enabled: true }), { type: "warn", guildName: "R", reason: "x" });
    const closed = { id: "1", send: vi.fn().mockRejectedValue(new Error("Cannot send messages to this user")) };
    expect(await sendSanctionDm(closed as never, payload, "9")).toBe(false);
    const open = { id: "2", send: vi.fn().mockResolvedValue({}) };
    expect(await sendSanctionDm(open as never, payload, "9")).toBe(true);
    expect(open.send).toHaveBeenCalledWith(payload);
  });

  it("announces a kick or a ban before it, and takes the message back when Discord refuses it", async () => {
    const payload = buildSanctionDm(config({ enabled: true }), { type: "ban", guildName: "Regatul", reason: "x" });
    const calls: string[] = [];
    const user = { id: "1", send: vi.fn(async (message: { content?: string }) => { calls.push(message.content ? "correction" : "dm"); }) };
    expect(await announceThenRemove(user as never, payload, async () => { calls.push("ban"); }, "Regatul", "9")).toBe(true);
    expect(calls).toEqual(["dm", "ban"]);
    calls.length = 0;
    await expect(announceThenRemove(user as never, payload, async () => { calls.push("ban"); throw new Error("Missing Permissions"); }, "Regatul", "9"))
      .rejects.toThrow("Missing Permissions");
    expect(calls).toEqual(["dm", "ban", "correction"]);
    calls.length = 0;
    expect(await announceThenRemove(user as never, null, async () => { calls.push("ban"); }, "Regatul", "9")).toBeUndefined();
    expect(calls).toEqual(["ban"]);
  });
});
