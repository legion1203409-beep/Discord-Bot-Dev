import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: { query: mocks.dbQuery },
}));

vi.mock("../db", () => ({
  loadVerificationConfig: mocks.loadConfig,
  saveVerificationConfig: mocks.saveConfig,
}));

import {
  extraRoleProblem,
  grantVerificationRoles,
  handleVerificationButton,
  normalizeVerificationConfig,
  verifyMember,
} from "../verification";

const guildId = "123456789";
const roleId = "555555555";
const categoryId = "666666666";
const highId = "777777777";
const staffId = "888888888";

type FakeRole = { id: string; name: string; managed: boolean; position: number; permissions: { any: (bits: unknown, checkAdmin?: boolean) => boolean } };

function role(id: string, position: number, { elevated = false, managed = false } = {}): FakeRole {
  return { id, name: id, managed, position, permissions: { any: () => elevated } };
}

const ROLES = new Map<string, FakeRole>([
  [roleId, role(roleId, 2)],
  [categoryId, role(categoryId, 3)],
  [highId, role(highId, 20)],
  [staffId, role(staffId, 4, { elevated: true })],
]);

function makeGuild(members: Record<string, { roles: string[]; bot?: boolean } | undefined>) {
  const added = new Map<string, string[]>();
  const botMember = {
    permissions: { has: vi.fn(() => true) },
    roles: { highest: { position: 10 } },
  };
  const memberFor = (id: string) => {
    const data = members[id];
    if (!data) throw Object.assign(new Error("Unknown Member"), { code: 10007 });
    return {
      id,
      displayName: `Membru ${id}`,
      user: { bot: data.bot === true },
      roles: {
        cache: new Map(data.roles.map((item) => [item, { id: item }])),
        add: vi.fn(async (given: FakeRole | FakeRole[]) => {
          const ids = (Array.isArray(given) ? given : [given]).map((item) => item.id);
          added.set(id, [...(added.get(id) ?? []), ...ids]);
        }),
      },
    };
  };
  const guild = {
    id: guildId,
    members: {
      fetch: vi.fn(async (id: string) => memberFor(id)),
      me: botMember,
      fetchMe: vi.fn(async () => botMember),
    },
    roles: { fetch: vi.fn(async (id: string) => ROLES.get(id) ?? null) },
  };
  return { client: { guilds: { fetch: vi.fn(async () => guild) } }, guild, botMember, added };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the verification's extra roles", () => {
  it("keeps up to ten distinct Discord IDs besides the verification role", () => {
    const many = Array.from({ length: 14 }, (_, index) => `1000000${index + 10}`);
    const config = normalizeVerificationConfig({ roleId, extraRoleIds: [roleId, categoryId, categoryId, "abc", ...many] } as never);
    expect(config.extraRoleIds[0]).toBe(categoryId);
    expect(config.extraRoleIds).toHaveLength(10);
    expect(config.extraRoleIds).not.toContain(roleId);
    expect(normalizeVerificationConfig({ roleId } as never).extraRoleIds).toEqual([]);
  });

  it("says why a role cannot be given with the verification", () => {
    const guild = { id: guildId };
    const bot = { roles: { highest: { position: 10 } } };
    expect(extraRoleProblem(ROLES.get(categoryId) as never, guild, bot)).toBeNull();
    expect(extraRoleProblem(ROLES.get(highId) as never, guild, bot)).toMatch(/deasupra rolului botului/);
    expect(extraRoleProblem(ROLES.get(staffId) as never, guild, bot)).toMatch(/drepturi de staff/);
    expect(extraRoleProblem(role(guildId, 0) as never, guild, bot)).toMatch(/@everyone/);
    expect(extraRoleProblem(role("999", 1, { managed: true }) as never, guild, bot)).toMatch(/integrări/);
    expect(extraRoleProblem(null, guild, bot)).toMatch(/nu mai există/);
  });

  it("gives the extra roles at the button verification and skips those the bot cannot give", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId, extraRoleIds: [categoryId, highId, staffId] });
    const { client, added } = makeGuild({ "111111111": { roles: [] } });
    await expect(verifyMember(client as never, guildId, "111111111")).resolves.toBe("verified");
    expect(added.get("111111111")).toEqual([roleId, categoryId]);
  });

  it("adds a missing category role to a member who was verified before it existed", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId, extraRoleIds: [categoryId] });
    const { client, added } = makeGuild({ "111111111": { roles: [roleId] } });
    await expect(verifyMember(client as never, guildId, "111111111")).resolves.toBe("already_verified");
    expect(added.get("111111111")).toEqual([categoryId]);
  });

  it("gives the missing extra roles when a verified member presses the button again", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId, extraRoleIds: [categoryId], alreadyVerifiedMessage: "Deja verificat" });
    const { client, guild, added } = makeGuild({ "111111111": { roles: [roleId] } });
    const editReply = vi.fn().mockResolvedValue(undefined);
    await handleVerificationButton({
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply, guildId, guild, client, user: { id: "111111111" },
    } as never, "https://codelinked.app/verificare");
    expect(added.get("111111111")).toEqual([categoryId]);
    expect(editReply).toHaveBeenCalledWith("Deja verificat");
  });
});

describe("manual verification of several members", () => {
  it("verifies the new members, completes the others and reports who failed", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: false, roleId, extraRoleIds: [categoryId] });
    const { client, added } = makeGuild({
      "111111111": { roles: [] },
      "222222222": { roles: [roleId] },
      "333333333": { roles: [roleId, categoryId] },
      "444444444": { roles: [], bot: true },
    });
    const outcome = await grantVerificationRoles(
      client as never, guildId,
      ["111111111", "222222222", "333333333", "444444444", "555000000", "111111111"],
      [categoryId, highId],
    );
    expect(outcome.roleId).toBe(roleId);
    expect(outcome.results.map((item) => [item.userId, item.result, item.added])).toEqual([
      ["111111111", "verified", [roleId, categoryId]],
      ["222222222", "updated", [categoryId]],
      ["333333333", "unchanged", []],
      ["444444444", "failed", []],
      ["555000000", "failed", []],
    ]);
    expect(outcome.results[4]!.error).toBe("Membrul nu mai este pe server.");
    expect(outcome.unavailable).toEqual([{ roleId: highId, reason: "Rolul este deasupra rolului botului." }]);
    expect(added.get("111111111")).toEqual([roleId, categoryId]);
    expect(added.has("333333333")).toBe(false);
  });

  it("works only with a verification role the bot can give", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId: "" });
    const { client } = makeGuild({});
    await expect(grantVerificationRoles(client as never, guildId, ["111111111"], [])).rejects.toThrow(/nu este configurată/);
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId: highId });
    await expect(grantVerificationRoles(client as never, guildId, ["111111111"], [])).rejects.toThrow(/sub rolul botului/);
  });

  it("keeps going when Discord refuses one member", async () => {
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId });
    const { client, guild } = makeGuild({ "111111111": { roles: [] }, "222222222": { roles: [] } });
    const fetchMember = guild.members.fetch.getMockImplementation()!;
    guild.members.fetch.mockImplementation(async (id: string) => {
      const member = await fetchMember(id);
      if (id === "111111111") member.roles.add = vi.fn(async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); });
      return member;
    });
    const outcome = await grantVerificationRoles(client as never, guildId, ["111111111", "222222222"], []);
    expect(outcome.results.map((item) => item.result)).toEqual(["failed", "verified"]);
    expect(outcome.results[0]!.error).toMatch(/nu are voie/);
  });
});
