import { beforeEach, describe, expect, it, vi } from "vitest";
import { Collection, type GuildMember, type Role } from "discord.js";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../db", () => ({ ensureBotStateTable: vi.fn() }));
vi.mock("../../lib/logger", () => ({ logger: { warn: vi.fn() } }));
import { syncActivityMilestoneRole } from "../activity-ranks";

let savedRoles: Record<string, string>;
beforeEach(() => {
  savedRoles = {};
  mocks.query.mockImplementation(async (sql: string, values: string[]) => {
    if (sql.includes("SELECT")) return { rows: [{ value: JSON.stringify(savedRoles) }] };
    savedRoles = JSON.parse(values[1]);
    return { rows: [] };
  });
});

function fixture() {
  const cache = new Collection<string, Role>();
  const create = vi.fn(async ({ name }: { name: string }) => {
    await Promise.resolve();
    const role = { id: `role-${cache.size + 1}`, name, position: 1 } as Role;
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
  return { create, member };
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
});
