import { describe, expect, it, vi } from "vitest";
import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { buildDossierEmbed, canOpenDossier, dossierStanding, type DossierInput } from "../dossier";

vi.mock("../../../moderation/store", () => ({
  moderationStore: {
    getConfig: vi.fn(async () => ({ config: { permissions: { staffRoleIds: ["staff-role"] } } })),
    listCases: vi.fn(), getMemberJoinAt: vi.fn(), writeAudit: vi.fn(),
  },
}));

const NOW = new Date("2026-11-05T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const item = (id: string, actionType: string, days: number, extra: Record<string, unknown> = {}) => ({
  id, actionType, reason: "spam", status: "closed" as const, createdAt: daysAgo(days), actorId: "777777777", appealStatus: null, ...extra,
});
const base = (cases: DossierInput["cases"], over: Partial<DossierInput> = {}): DossierInput => ({
  user: { id: "555555555", username: "ion", displayName: "Ion", avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png", bot: false, createdAt: daysAgo(400) },
  member: { joinedAt: daysAgo(90), roleCount: 3, timeoutUntil: null, nickname: null },
  banned: null, cases, now: NOW, ...over,
});

describe("starea membrului", () => {
  it("fără sancțiuni e curat", () => expect(dossierStanding([], false, NOW).level).toBe("clean"));
  it("sancțiuni doar vechi rămân curate, cu mențiune", () => {
    const standing = dossierStanding([item("a", "warn", 200)], false, NOW);
    expect(standing.level).toBe("clean");
    expect(standing.why).toContain("vechi");
  });
  it("o sancțiune recentă înseamnă de urmărit", () => expect(dossierStanding([item("a", "warn", 3)], false, NOW).level).toBe("watch"));
  it("trei sancțiuni într-o lună înseamnă risc ridicat", () =>
    expect(dossierStanding([item("a", "warn", 3), item("b", "warn", 9), item("c", "mute", 20)], false, NOW).level).toBe("risk"));
  it("un kick sau un ban vechi tot pune riscul ridicat; banul activ la fel", () => {
    expect(dossierStanding([item("a", "kick", 300)], false, NOW).level).toBe("risk");
    expect(dossierStanding([], true, NOW).level).toBe("risk");
  });
  it("acțiunile care nu sunt sancțiuni (poreclă, rol) nu contează", () =>
    expect(dossierStanding([item("a", "nick", 1), item("b", "role", 1), item("c", "purge", 1)], false, NOW).level).toBe("clean"));
});

describe("dosarul", () => {
  it("arată contul, sancțiunile pe fel și ultimele cazuri", () => {
    const embed = buildDossierEmbed(base([item("abcdef123456", "warn", 3), item("zzzzzz999999", "ban", 100, { appealStatus: "rejected", status: "open" })])).toJSON();
    const text = JSON.stringify(embed);
    expect(embed.title).toBe("🔴 Risc ridicat");
    expect(embed.fields?.map((f) => f.name)).toEqual(["👤 Despre cont", "🛡️ Sancțiuni", "📨 Contestații", "🗂️ Ultimele cazuri"]);
    expect(text).toContain("Avertismente: **1**");
    expect(text).toContain("Banuri: **1**");
    expect(text).toContain("Cazuri deschise: **1** din 2");
    expect(text).toContain("contestație respinsă");
    expect(text).toContain("`abcdef12`");
    expect(text).toContain("400 zile");
  });
  it("un membru curat are un dosar scurt, fără secțiuni goale", () => {
    const embed = buildDossierEmbed(base([])).toJSON();
    expect(embed.title).toBe("🟢 Curat");
    expect(embed.fields?.map((f) => f.name)).toEqual(["👤 Despre cont", "🛡️ Sancțiuni"]);
    expect(embed.fields?.[1]?.value).toBe("Nicio sancțiune înregistrată.");
  });
  it("cine a plecat de pe server și cine are ban activ se vede", () => {
    const embed = buildDossierEmbed(base([], { member: null, banned: { reason: "reclame" } })).toJSON();
    const text = JSON.stringify(embed);
    expect(text).toContain("nu e acum pe server");
    expect(text).toContain("Ban activ:** reclame");
    expect(embed.title).toBe("🔴 Risc ridicat");
  });
  it("timeout-ul activ apare, cel expirat nu", () => {
    const active = JSON.stringify(buildDossierEmbed(base([], { member: { joinedAt: daysAgo(5), roleCount: 0, timeoutUntil: new Date(NOW.getTime() + 3_600_000), nickname: null } })).toJSON());
    const expired = JSON.stringify(buildDossierEmbed(base([], { member: { joinedAt: daysAgo(5), roleCount: 0, timeoutUntil: daysAgo(1), nickname: null } })).toJSON());
    expect(active).toContain("Timeout activ");
    expect(expired).not.toContain("Timeout activ");
  });
  it("rămâne în limitele Discord chiar cu cazuri lungi", () => {
    const long = Array.from({ length: 100 }, (_, i) => item(`id${i}xxxxxxxx`, "warn", i % 60, { reason: "x".repeat(500) }));
    const embed = buildDossierEmbed(base(long)).toJSON();
    for (const field of embed.fields ?? []) expect(field.value.length).toBeLessThanOrEqual(1_024);
    expect(JSON.stringify(embed).length).toBeLessThan(6_000);
  });
});

describe("cine poate deschide dosarul", () => {
  const interaction = (permissions: bigint | null, roleIds: string[] = []) => ({
    guildId: "1", memberPermissions: permissions === null ? null : { has: (flag: bigint) => (permissions & flag) === flag },
    member: { roles: { cache: new Map(roleIds.map((id) => [id, {}])) } },
  }) as unknown as ChatInputCommandInteraction;
  it("cine are Moderate Members sau e administrator", async () => {
    expect(await canOpenDossier(interaction(PermissionFlagsBits.ModerateMembers))).toBe(true);
    expect(await canOpenDossier(interaction(PermissionFlagsBits.Administrator))).toBe(true);
  });
  it("cine are un rol de staff ales în panou", async () => expect(await canOpenDossier(interaction(0n, ["staff-role"]))).toBe(true));
  it("ceilalți nu", async () => expect(await canOpenDossier(interaction(0n, ["alt-rol"]))).toBe(false));
});
