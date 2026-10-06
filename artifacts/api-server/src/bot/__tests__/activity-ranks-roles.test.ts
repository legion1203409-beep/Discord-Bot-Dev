import { beforeEach, describe, expect, it, vi } from "vitest";
import { Collection, type GuildMember, type Role } from "discord.js";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../db", () => ({ ensureBotStateTable: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn() } }));
import { saveActivityRankConfig, syncActivityMilestoneRole } from "../activity-ranks";
import { DEFAULT_ACTIVITY_RANK_CONFIG } from "../activity-ranks-core";

let savedRoles: Record<string, string>;
let savedConfig: unknown;
beforeEach(async () => {
  savedRoles = {};
  savedConfig = DEFAULT_ACTIVITY_RANK_CONFIG;
  mocks.query.mockImplementation(async (sql: string, values: string[]) => {
    const isConfig = values[0]?.endsWith("activity_ranks_config");
    if (sql.includes("SELECT")) return { rows: [{ value: JSON.stringify(isConfig ? savedConfig : savedRoles) }] };
    if (isConfig) savedConfig = JSON.parse(values[1]);
    else savedRoles = JSON.parse(values[1]);
    return { rows: [] };
  });
  await saveActivityRankConfig("roles-fixture-guild", DEFAULT_ACTIVITY_RANK_CONFIG);
});

function fixture() {
  const cache = new Collection<string, Role>();
  const create = vi.fn(async ({ name }: { name: string }) => {
    await Promise.resolve();
    const role = { id: `role-${cache.size + 1}`, name, position: 1, managed: false, permissions: { has: () => false } } as unknown as Role;
    cache.set(role.id, role);
    return role;
  });
  const guild = {
    id: "roles-fixture-guild",
    members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } } },
    roles: { cache, create, fetch: vi.fn(async (id: string) => cache.get(id) ?? null) },
  };
  const member = (id: string) => {
    const memberCache = new Collection<string, Role>();
    return {
      id, guild,
      roles: {
        cache: memberCache,
        add: vi.fn(async (role: Role) => { memberCache.set(role.id, role); }),
        remove: vi.fn(async (ids: string[]) => { ids.forEach((roleId) => memberCache.delete(roleId)); }),
      },
    } as unknown as GuildMember;
  };
  return { create, member, cache, guild };
}

describe("serialized activity milestone roles", () => {
  it("creates one final role and assigns it to both simultaneous level-100 members", async () => {
    const { create, member } = fixture();
    const first = member("first"), second = member("second");
    await Promise.all([syncActivityMilestoneRole(first, 100), syncActivityMilestoneRole(second, 100)]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(first.roles.add).toHaveBeenCalledTimes(1);
    expect(second.roles.add).toHaveBeenCalledTimes(1);
    expect([...first.roles.cache.keys()]).toEqual([...second.roles.cache.keys()]);
    expect(savedRoles["100"]).toBeTruthy();
  });

  it("preserves IDs for different concurrent milestones and never downgrades a queued member", async () => {
    const { member } = fixture();
    const first = member("first"), second = member("second");
    await Promise.all([syncActivityMilestoneRole(first, 5), syncActivityMilestoneRole(second, 20)]);
    expect(savedRoles["5"]).toBeTruthy();
    expect(savedRoles["20"]).toBeTruthy();
    await syncActivityMilestoneRole(second, 5);
    expect(second.roles.add).toHaveBeenCalledTimes(1);
    expect(second.roles.remove).not.toHaveBeenCalled();
  });

  it("uses custom levels, promotes to the highest earned role, and retains unrelated roles", async () => {
    const { create, member, cache } = fixture();
    const firstRole = { id: "111111", name: "Novice", position: 1, permissions: { has: () => false } } as unknown as Role;
    const finalRole = { id: "222222", name: "Veteran", position: 2, permissions: { has: () => false } } as unknown as Role;
    cache.set(firstRole.id, firstRole);
    cache.set(finalRole.id, finalRole);
    await saveActivityRankConfig("roles-fixture-guild", {
      ...DEFAULT_ACTIVITY_RANK_CONFIG, roleRewards: [{ level: 1, roleId: firstRole.id }, { level: 37, roleId: finalRole.id }],
    });
    const target = member("first");
    const unrelated = { id: "unrelated" } as Role;
    target.roles.cache.set(unrelated.id, unrelated);
    await syncActivityMilestoneRole(target, 1);
    expect(target.roles.cache.has(firstRole.id)).toBe(true);
    await syncActivityMilestoneRole(target, 100);
    expect(target.roles.cache.has(finalRole.id)).toBe(true);
    expect(target.roles.cache.has(firstRole.id)).toBe(false);
    expect(target.roles.cache.has(unrelated.id)).toBe(true);
    await syncActivityMilestoneRole(target, 1);
    expect(target.roles.add).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["missing", "managed", "privileged", "higher"])("does not grant or replace an invalid %s custom role", async (kind) => {
    const { create, member, cache } = fixture();
    const role = { id: "111111", name: "Reward", position: kind === "higher" ? 20 : 1,
      managed: kind === "managed", permissions: { has: () => kind === "privileged" } } as unknown as Role;
    if (kind !== "missing") cache.set(role.id, role);
    await saveActivityRankConfig("roles-fixture-guild", {
      ...DEFAULT_ACTIVITY_RANK_CONFIG, roleRewards: [{ level: 7, roleId: role.id }],
    });
    const target = member("first");
    await syncActivityMilestoneRole(target, 7);
    expect(target.roles.add).not.toHaveBeenCalled();
    expect(target.roles.remove).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not create legacy roles for an explicitly empty reward list", async () => {
    const { create, member } = fixture();
    await saveActivityRankConfig("roles-fixture-guild", { ...DEFAULT_ACTIVITY_RANK_CONFIG, roleRewards: [] });
    const target = member("first");
    await syncActivityMilestoneRole(target, 100);
    expect(create).not.toHaveBeenCalled();
    expect(target.roles.add).not.toHaveBeenCalled();
  });

  it("keeps the old reward if adding the replacement fails", async () => {
    const { member, cache } = fixture();
    const role = { id: "111111", position: 1, permissions: { has: () => false } } as unknown as Role;
    const old = { id: "222222", position: 1, permissions: { has: () => false } } as unknown as Role;
    cache.set(role.id, role); cache.set(old.id, old);
    savedRoles["5"] = old.id;
    await saveActivityRankConfig("roles-fixture-guild", { ...DEFAULT_ACTIVITY_RANK_CONFIG, roleRewards: [{ level: 7, roleId: role.id }] });
    const target = member("first");
    target.roles.cache.set(old.id, old);
    vi.mocked(target.roles.add).mockRejectedValueOnce(new Error("Discord unavailable"));
    await expect(syncActivityMilestoneRole(target, 7)).rejects.toThrow("Discord unavailable");
    expect(target.roles.cache.has(old.id)).toBe(true);
    expect(target.roles.remove).not.toHaveBeenCalled();
  });

  it("retains the previous mapping so editing a reward also reconciles later inactive members", async () => {
    const { member, cache } = fixture();
    const previous = { id: "111111", position: 1, permissions: { has: () => false } } as unknown as Role;
    const replacement = { id: "222222", position: 1, permissions: { has: () => false } } as unknown as Role;
    cache.set(previous.id, previous); cache.set(replacement.id, replacement);
    savedRoles["5"] = previous.id;
    await saveActivityRankConfig("roles-fixture-guild", {
      ...DEFAULT_ACTIVITY_RANK_CONFIG, roleRewards: [{ level: 5, roleId: replacement.id }],
    });
    const first = member("first"), later = member("later");
    first.roles.cache.set(previous.id, previous);
    later.roles.cache.set(previous.id, previous);
    await syncActivityMilestoneRole(first, 5);
    await syncActivityMilestoneRole(later, 5);
    for (const target of [first, later]) {
      expect(target.roles.cache.has(replacement.id)).toBe(true);
      expect(target.roles.cache.has(previous.id)).toBe(false);
    }
  });
});
