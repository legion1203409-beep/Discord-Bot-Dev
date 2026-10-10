import { describe, expect, it, vi } from "vitest";
import { Collection, PermissionFlagsBits as P, PermissionsBitField, type Guild } from "discord.js";
import {
  applySetup, deleteSelectedSetupResources, inspectSetup, inspectSetupResources, inspectUncertainSetup, reconcileUncertainSetup, type SetupJournal,
} from "../server-setup";
import { setupDraftSchema, setupTemplate, type SetupDraft } from "../server-setup-schema";

vi.mock("../server-setup-discord", () => ({
  createSetupRole: (guild: Guild, name: string) => guild.roles.create({ name, permissions: 0n }),
  createSetupChannel: (guild: Guild, options: any) => guild.channels.create(options),
  updateSetupAccess: async (overwrites: any, roleAccess: Map<string, { view: boolean; history: boolean; send: boolean }>, previous: string[], botId: string) => {
    const desired = new Map(roleAccess);
    desired.set(botId, { view: true, history: true, send: true });
    for (const id of new Set([...desired.keys(), ...previous, botId])) {
      const access = desired.get(id);
      await overwrites.edit(id, {
        ViewChannel: access?.view ?? null,
        ReadMessageHistory: access?.history ?? null,
        SendMessages: access?.send ?? null,
      }, {});
    }
  },
  deleteSetupResource: async (guild: Guild, id: string) => {
    const channel = await guild.channels.fetch(id);
    if (!channel) throw new Error("Resursa a dispărut din Discord.");
    await channel.delete();
  },
}));

function fixture() {
  let seq = 10_000;
  const roles = new Collection<string, any>();
  const channels = new Collection<string, any>();
  const me = { id: "bot", permissions: new PermissionsBitField(P.Administrator), roles: { highest: { position: 20 } } };
  const role = (name: string, permissions = 0n) => {
    const value = { id: String(++seq), name, position: 1, managed: false, permissions: new PermissionsBitField(permissions) };
    roles.set(value.id, value); return value;
  };
  const channel = (data: any) => {
    const overwriteCache = new Collection<string, any>((data.permissionOverwrites ?? []).map((o: any) => [o.id, {
        ...o, allow: new PermissionsBitField(o.allow ?? []), deny: new PermissionsBitField(o.deny ?? []),
      }]));
    const permissionOverwrites = {
      cache: overwriteCache,
      edit: vi.fn(async (id: string, access: Record<string, boolean | null>) => {
        const overwrite = overwriteCache.get(id) ?? {
          id, type: "role", allow: new PermissionsBitField(0n), deny: new PermissionsBitField(0n),
        };
        const flags: Record<string, bigint> = {
          ViewChannel: P.ViewChannel,
          ReadMessageHistory: P.ReadMessageHistory,
          SendMessages: P.SendMessages,
        };
        for (const [permission, enabled] of Object.entries(access)) {
          const bit = flags[permission];
          if (enabled === null) {
            overwrite.allow.remove(bit);
            overwrite.deny.remove(bit);
          } else if (enabled) {
            overwrite.allow.add(bit);
            overwrite.deny.remove(bit);
          } else {
            overwrite.allow.remove(bit);
            overwrite.deny.add(bit);
          }
        }
        overwriteCache.set(id, overwrite);
        return value;
      }),
    };
    const value: any = {
      id: String(++seq), parentId: data.parent ?? data.parentId ?? null, ...data,
      client: { user: { id: "99999" } },
      permissionOverwrites,
      delete: vi.fn(async () => { channels.delete(value.id); return value; }),
    };
    channels.set(value.id, value); return value;
  };
  const guild = {
    id: "88888", members: { me, fetchMe: vi.fn(async () => me) },
    roles: { cache: roles, fetch: vi.fn(async () => roles), create: vi.fn(async (r: any) => role(r.name, r.permissions)) },
    channels: {
      cache: channels,
      fetch: vi.fn(async (id?: string) => id ? channels.get(id) ?? null : channels),
      create: vi.fn(async (c: any) => channel(c)),
    },
  };
  const journal: SetupJournal = {};
  const save = vi.fn(async () => {});
  return { guild: guild as unknown as Guild, raw: guild, roles, channels, me, role, channel, journal, save };
}
const smallDraft = (): SetupDraft => setupDraftSchema.parse({
  roles: [{ key: "member", name: "Membru" }],
  categories: [{ key: "community", name: "Comunitate", channels: [
    { key: "general", name: "general", readers: ["everyone"], writers: ["everyone"], explanation: "Public" },
  ] }],
});

describe("server setup validation", () => {
  it("accepts template but rejects capabilities, arbitrary instructions and invalid references", () => {
    expect(setupDraftSchema.safeParse(setupTemplate).success).toBe(true);
    expect(setupDraftSchema.safeParse({ ...smallDraft(), delete: ["123"] }).success).toBe(false);
    expect(setupDraftSchema.safeParse({ ...smallDraft(), roles: [{ key: "admin", name: "Admin", permissions: ["Administrator"] }] }).success).toBe(false);
    const d = smallDraft(); d.categories[0].channels[0].writers = ["missing"];
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
    d.categories[0].channels[0].writers = ["member"];
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
  });
  it("accepts Unicode symbols and emoji in channel names", () => {
    const draft = smallDraft();
    draft.categories[0].channels[0].name = "╭─・👋・bun-venit";
    expect(setupDraftSchema.safeParse(draft).success).toBe(true);
  });
  it("still rejects blank, overlong, and mention-like channel names", () => {
    const draft = smallDraft();
    for (const name of ["   ", "a".repeat(101), "staff @everyone"]) {
      draft.categories[0].channels[0].name = name;
      expect(setupDraftSchema.safeParse(draft).success).toBe(false);
    }
  });
  it("rejects duplicate keys/names and reserved role keys", () => {
    const d = smallDraft(); d.roles.push({ ...d.roles[0] });
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
    d.roles = [{ key: "everyone", name: "Everyone", mode: "new" }];
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
  });
  it("requires unique explicit resource IDs and caps operator-selected deletions", () => {
    const d = smallDraft();
    d.roles[0] = { key: "member", name: "Membru", mode: "existing", discordId: "123456" };
    d.roles.push({ key: "helper", name: "Ajutor", mode: "existing", discordId: "123456" });
    d.categories[0].discordId = "123456";
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
    d.categories[0].discordId = undefined;
    d.deleteTargets = Array.from({ length: 21 }, (_, i) => ({ id: String(100_000 + i), kind: "channel" as const }));
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
    d.deleteTargets = [{ id: "123456", kind: "channel" }, { id: "123456", kind: "channel" }];
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
  });
});

describe("safe Discord setup", () => {
  it("creates with ACLs atomically, grants no global role privileges and retry reuses without edits", async () => {
    const f = fixture(), draft = smallDraft();
    const pre = await inspectSetup(f.guild, draft);
    expect(pre.ready).toBe(true);
    const result = await applySetup(f.guild, draft, pre.fingerprint, f.journal, f.save);
    expect(result.complete).toBe(true);
    const roleId = f.journal.member.id!;
    expect(f.journal.community.managedRoleIds).toEqual([roleId]);
    expect(f.journal.general.managedRoleIds).toEqual([roleId]);
    expect(f.raw.roles.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: 0n }));
    const textCall = f.raw.channels.create.mock.calls[1][0];
    expect(textCall.permissionOverwrites.find((o: any) => o.id === f.raw.id).allow).toContain(P.SendMessages);
    expect(textCall.permissionOverwrites.find((o: any) => o.id !== "guild" && o.type === 0).allow).toContain(P.ViewChannel);
    const second = await inspectSetup(f.guild, draft, f.journal);
    expect(second.items.map(i => i.status)).toEqual(["reuse", "update", "update"]);
    expect((await applySetup(f.guild, draft, second.fingerprint, f.journal, f.save)).items.map(i => i.status)).toEqual(["reused", "updated", "updated"]);
    expect(f.raw.roles.create).toHaveBeenCalledTimes(1);
    expect(f.raw.channels.create).toHaveBeenCalledTimes(2);
  });
  it("cleans channel IDs from legacy managed-role snapshots before retrying access updates", async () => {
    const f = fixture(), draft = smallDraft();
    const firstPreview = await inspectSetup(f.guild, draft);
    await applySetup(f.guild, draft, firstPreview.fingerprint, f.journal, f.save);

    const roleId = f.journal.member.id!;
    const categoryId = f.journal.community.id!;
    const channelId = f.journal.general.id!;
    f.journal.community.managedRoleIds = [roleId, categoryId];
    f.journal.general.managedRoleIds = [roleId, categoryId, channelId];
    const channels = [...f.channels.values()].map(channel => ({
      channel,
      callStart: channel.permissionOverwrites.edit.mock.calls.length,
    }));

    const retryPreview = await inspectSetup(f.guild, draft, f.journal);
    const result = await applySetup(f.guild, draft, retryPreview.fingerprint, f.journal, f.save);

    expect(result.complete).toBe(true);
    for (const { channel, callStart } of channels) {
      const editedIds = channel.permissionOverwrites.edit.mock.calls
        .slice(callStart).map(([id]: [string, unknown]) => id);
      expect(editedIds).not.toContain(categoryId);
      expect(editedIds).not.toContain(channelId);
    }
    expect(f.journal.community.managedRoleIds).toEqual([roleId]);
    expect(f.journal.general.managedRoleIds).toEqual([roleId]);
  });
  it("returns the created resource ID when its access update fails", async () => {
    const f = fixture(), draft = smallDraft();
    f.raw.channels.create
      .mockImplementationOnce(async c => f.channel(c))
      .mockImplementationOnce(async c => {
        const created = f.channel(c);
        created.permissionOverwrites.edit.mockRejectedValueOnce(new Error("Access update failed"));
        return created;
      });

    const preview = await inspectSetup(f.guild, draft);
    const result = await applySetup(f.guild, draft, preview.fingerprint, f.journal, f.save);

    expect(result.complete).toBe(false);
    expect(result.items.find(item => item.key === "general"))
      .toMatchObject({ status: "failed", id: f.journal.general.id });
  });
  it("retries a definite partial Discord rejection without duplicating the successful roles/category", async () => {
    const f = fixture(), draft = smallDraft();
    f.raw.channels.create.mockImplementationOnce(async c => f.channel(c))
      .mockRejectedValueOnce(Object.assign(new Error("Missing permissions"), { status: 403 }));
    const pre = await inspectSetup(f.guild, draft);
    const result = await applySetup(f.guild, draft, pre.fingerprint, f.journal, f.save);
    expect(result.complete).toBe(false);
    expect(f.journal.general).toBeUndefined();
    const next = await inspectSetup(f.guild, draft, f.journal);
    expect((await applySetup(f.guild, draft, next.fingerprint, f.journal, f.save)).complete).toBe(true);
    expect(f.raw.roles.create).toHaveBeenCalledTimes(1);
    expect(f.channels.size).toBe(2);
  });
  it("never recreates an uncertain missing resource, but recovers a lost response from a fresh name match", async () => {
    const f = fixture(), draft = smallDraft();
    f.journal.member = { name: "Membru", kind: "role" };
    expect((await inspectSetup(f.guild, draft, f.journal)).ready).toBe(false);
    f.role("Membru");
    expect((await inspectSetup(f.guild, draft, f.journal)).items[0].status).toBe("reuse");
    expect(f.raw.roles.create).not.toHaveBeenCalled();
  });
  it("does not let a different draft key bypass an uncertain creation", async () => {
    const f = fixture(), draft = smallDraft();
    f.journal.oldMemberKey = { name: "Membru", kind: "role" };
    draft.roles[0].key = "new-member";
    const preview = await inspectSetup(f.guild, draft, f.journal);
    expect(preview.ready).toBe(false);
    expect(preview.items[0]).toMatchObject({ status: "conflict" });
    expect(preview.items[0].detail).toContain("oldMemberKey");
  });
  it("binds only a freshly inventoried same-name resource and leaves it unchanged", async () => {
    const f = fixture(), existing = f.role("Membru");
    f.journal.member = { name: "Membru", kind: "role" };
    const inventory = await inspectUncertainSetup(f.guild, "member", f.journal);
    expect(inventory.candidates).toEqual([{ id: existing.id, name: existing.name, kind: "role" }]);
    const result = await reconcileUncertainSetup(f.guild, {
      key: "member", action: "bind", inventoryFingerprint: inventory.inventoryFingerprint, resourceId: existing.id,
    }, f.journal, f.save);
    expect(result.action).toBe("bound");
    expect(f.journal.member.id).toBe(existing.id);
    expect(f.save).toHaveBeenCalledWith(expect.objectContaining({ member: expect.objectContaining({ id: existing.id }) }));
    expect(f.raw.roles.create).not.toHaveBeenCalled();
    expect((await inspectSetup(f.guild, smallDraft(), f.journal)).items[0].status).toBe("reuse");
  });
  it("rejects stale inventories, invalid resource IDs, and absence claims when the resource exists", async () => {
    const f = fixture();
    f.journal.member = { name: "Membru", kind: "role" };
    const firstInventory = await inspectUncertainSetup(f.guild, "member", f.journal);
    const existing = f.role("Membru");
    const before = JSON.stringify(existing);
    await expect(reconcileUncertainSetup(f.guild, {
      key: "member", action: "confirm-absent", inventoryFingerprint: firstInventory.inventoryFingerprint,
    }, f.journal, f.save)).rejects.toThrow("Inventarul Discord s-a schimbat");
    const freshInventory = await inspectUncertainSetup(f.guild, "member", f.journal);
    await expect(reconcileUncertainSetup(f.guild, {
      key: "member", action: "bind", inventoryFingerprint: freshInventory.inventoryFingerprint, resourceId: "not-in-this-guild",
    }, f.journal, f.save)).rejects.toThrow("nu mai este validă");
    await expect(reconcileUncertainSetup(f.guild, {
      key: "member", action: "confirm-absent", inventoryFingerprint: freshInventory.inventoryFingerprint,
    }, f.journal, f.save)).rejects.toThrow("Leag-o explicit");
    expect(f.journal.member.id).toBeUndefined();
    expect(JSON.stringify(existing)).toBe(before);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("requires an absent fresh inventory before clearing uncertainty", async () => {
    const f = fixture();
    f.journal.member = { name: "Membru", kind: "role", attemptedAt: "2026-10-08T00:00:00.000Z" };
    f.journal.other = { name: "Alt rol", kind: "role", id: "999" };
    const inventory = await inspectUncertainSetup(f.guild, "member", f.journal);
    expect(inventory.canConfirmAbsent).toBe(true);
    const result = await reconcileUncertainSetup(f.guild, {
      key: "member", action: "confirm-absent", inventoryFingerprint: inventory.inventoryFingerprint,
    }, f.journal, f.save);
    expect(result.action).toBe("confirmed-absent");
    expect(f.journal.member).toBeUndefined();
    expect(f.journal.other).toEqual({ name: "Alt rol", kind: "role", id: "999" });
    expect(f.save).toHaveBeenCalledWith(expect.not.objectContaining({ member: expect.anything() }));
    expect(f.raw.roles.create).not.toHaveBeenCalled();
  });
  it("does not offer a channel in the wrong category as a reconciliation candidate", async () => {
    const f = fixture();
    const actualParent = f.channel({ name: "Comunitate", type: 4 });
    const differentParent = f.channel({ name: "Personalizat", type: 4 });
    const wrong = f.channel({ name: "general", type: 0, parent: differentParent.id });
    f.journal.community = { name: "Comunitate", kind: "category", id: actualParent.id };
    f.journal.general = { name: "general", kind: "channel", parentKey: "community" };
    const inventory = await inspectUncertainSetup(f.guild, "general", f.journal);
    expect(inventory.nameMatches).toHaveLength(1);
    expect(inventory.candidates).toEqual([]);
    expect(inventory.canConfirmAbsent).toBe(false);
    expect(inventory.nameMatches[0].id).toBe(wrong.id);
  });
  it("blocks wrong parent/type, ambiguous names, privileged roles and hierarchy conflicts", async () => {
    const f = fixture(), draft = smallDraft();
    f.role("Membru", P.Administrator);
    f.channel({ name: "general", type: 0, parent: "other" });
    const p = await inspectSetup(f.guild, draft);
    expect(p.items.filter(i => i.status === "conflict")).toHaveLength(2);
    f.roles.clear(); f.role("Membru"); f.role("Membru");
    expect((await inspectSetup(f.guild, draft)).items[0].status).toBe("conflict");
    f.roles.clear(); f.role("Membru").position = 21;
    expect((await inspectSetup(f.guild, draft)).items[0].status).toBe("conflict");
  });
  it("does not write after permission loss or a changed draft/snapshot", async () => {
    const f = fixture(), draft = smallDraft();
    const p = await inspectSetup(f.guild, draft);
    draft.roles[0].name = "Changed";
    await expect(applySetup(f.guild, draft, p.fingerprint, f.journal, f.save)).rejects.toThrow("Verificarea");
    f.me.permissions = new PermissionsBitField(0n);
    expect((await inspectSetup(f.guild, draft)).ready).toBe(false);
    expect(f.raw.roles.create).not.toHaveBeenCalled();
  });
  it("does not alter reused resource ACLs and keeps new staff channels private", async () => {
    const f = fixture();
    const cat = f.channel({ name: "Staff category", type: 4, permissionOverwrites: [{ id: "manual", allow: [P.ManageMessages] }] });
    const draft = structuredClone(setupTemplate);
    draft.categories.find(category => category.key === "staff")!.discordId = cat.id;
    const p = await inspectSetup(f.guild, draft);
    expect(p.ready).toBe(true);
    expect((await inspectSetup(f.guild, draft)).fingerprint).toBe(p.fingerprint);
    expect((await applySetup(f.guild, draft, p.fingerprint, f.journal, f.save)).complete).toBe(true);
    const manual = cat.permissionOverwrites.cache.get("manual");
    expect(manual.allow.has(P.ManageMessages)).toBe(true);
    expect(manual.deny.has(P.ViewChannel)).toBe(false);
    const staff = f.raw.channels.create.mock.calls.map(c => c[0]).find(c => c.name === "staff")!;
    expect(staff.permissionOverwrites.find((o: any) => o.id === f.raw.id).deny).toContain(P.ViewChannel);
  });
  it("lets the operator select an existing role without creating or changing it", async () => {
    const f = fixture();
    const existing = f.role("Curator");
    const draft: SetupDraft = {
      roles: [{ key: "curator", name: existing.name, mode: "existing", discordId: existing.id }],
      categories: [],
      deleteTargets: [],
    };
    const inventory = await inspectSetupResources(f.guild);
    expect(inventory.roles).toContainEqual(expect.objectContaining({ id: existing.id, usable: true }));
    const preview = await inspectSetup(f.guild, draft);
    expect(preview.items).toMatchObject([{ key: "curator", id: existing.id, status: "reuse" }]);
    const result = await applySetup(f.guild, draft, preview.fingerprint, f.journal, f.save);
    expect(result.items).toMatchObject([{ id: existing.id, status: "reused" }]);
    expect(f.raw.roles.create).not.toHaveBeenCalled();
    expect(existing.permissions.bitfield).toBe(0n);
  });
  it("previews and applies inherited access to existing children while preserving unmanaged ACLs", async () => {
    const f = fixture();
    const existingRole = f.role("Membru");
    const category = f.channel({ name: "Comunitate", type: 4 });
    const child = f.channel({
      name: "manual-chat",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        { id: existingRole.id, allow: [P.ManageMessages, P.ViewChannel], deny: [P.SendMessages] },
        { id: "77777", allow: [P.ManageMessages], deny: [P.ViewChannel] },
      ],
    });
    const draft: SetupDraft = {
      roles: [{ key: "member", name: existingRole.name, mode: "existing", discordId: existingRole.id }],
      categories: [{
        key: "community", name: category.name, discordId: category.id,
        readers: ["member"], writers: [],
        channels: [],
      }],
      deleteTargets: [],
    };
    const preview = await inspectSetup(f.guild, draft);
    expect(preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `acl-channel-${child.id}`,
        id: child.id,
        inherited: true,
        effectiveAccess: { readers: ["member"], writers: [] },
      }),
    ]));
    const result = await applySetup(f.guild, draft, preview.fingerprint, f.journal, f.save);
    expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: child.id, status: "updated" })]));
    const managed = child.permissionOverwrites.cache.get(existingRole.id);
    const unmanaged = child.permissionOverwrites.cache.get("77777");
    expect(managed.allow.has(P.ViewChannel)).toBe(true);
    expect(managed.allow.has(P.ReadMessageHistory)).toBe(true);
    expect(managed.allow.has(P.ManageMessages)).toBe(true);
    expect(managed.deny.has(P.SendMessages)).toBe(true);
    expect(unmanaged.allow.has(P.ManageMessages)).toBe(true);
    expect(unmanaged.deny.has(P.ViewChannel)).toBe(true);

    draft.roles = [];
    draft.categories[0].readers = [];
    const next = await inspectSetup(f.guild, draft, f.journal);
    await applySetup(f.guild, draft, next.fingerprint, f.journal, f.save);
    expect(managed.allow.has(P.ManageMessages)).toBe(true);
    expect(managed.allow.has(P.ViewChannel)).toBe(false);
    expect(managed.allow.has(P.ReadMessageHistory)).toBe(false);
    expect(managed.deny.has(P.SendMessages)).toBe(false);
    expect(unmanaged.deny.has(P.ViewChannel)).toBe(true);
  });
  it("rejects stale access previews when a selected child's ACL changes", async () => {
    const f = fixture();
    const category = f.channel({ name: "Comunitate", type: 4 });
    f.channel({ name: "manual-chat", type: 0, parent: category.id });
    const draft: SetupDraft = {
      roles: [],
      categories: [{ key: "community", name: category.name, discordId: category.id, readers: [], writers: [], channels: [] }],
      deleteTargets: [],
    };
    const preview = await inspectSetup(f.guild, draft);
    const child = [...f.channels.values()].find(channel => channel.name === "manual-chat")!;
    child.permissionOverwrites.cache.set("77777", {
      id: "77777",
      allow: new PermissionsBitField([P.ManageMessages]),
      deny: new PermissionsBitField([P.ViewChannel]),
    });
    await expect(applySetup(f.guild, draft, preview.fingerprint, f.journal, f.save)).rejects.toThrow("Verificarea");
    expect(child.permissionOverwrites.edit).not.toHaveBeenCalled();
  });
  it("deletes only explicitly confirmed resources and leaves category children intact", async () => {
    const f = fixture();
    const category = f.channel({ name: "Arhivă", type: 4 });
    const child = f.channel({ name: "manual", type: 0, parent: category.id });
    const draft: SetupDraft = {
      roles: [],
      categories: [],
      deleteTargets: [{ id: category.id, kind: "category" }],
    };
    const preview = await inspectSetup(f.guild, draft);
    expect(preview.deletionItems).toMatchObject([{
      id: category.id,
      name: "Arhivă",
      status: "delete",
      children: [{ id: child.id, name: "manual" }],
    }]);
    const result = await deleteSelectedSetupResources(f.guild, draft, preview.fingerprint, f.journal, f.save);
    expect(result.items).toMatchObject([{ id: category.id, status: "deleted" }]);
    expect(category.delete).toHaveBeenCalledTimes(1);
    expect(child.delete).not.toHaveBeenCalled();
    expect(f.channels.has(child.id)).toBe(true);
  });
  it("rejects stale destructive previews and reports partial deletion failures individually", async () => {
    const f = fixture();
    const first = f.channel({ name: "first", type: 0 });
    const second = f.channel({ name: "second", type: 0 });
    const draft: SetupDraft = {
      roles: [],
      categories: [],
      deleteTargets: [{ id: first.id, kind: "channel" }, { id: second.id, kind: "channel" }],
    };
    const stale = await inspectSetup(f.guild, draft);
    first.name = "renamed";
    await expect(deleteSelectedSetupResources(f.guild, draft, stale.fingerprint, f.journal, f.save))
      .rejects.toThrow("Previzualizarea este învechită");
    expect(first.delete).not.toHaveBeenCalled();

    const fresh = await inspectSetup(f.guild, draft);
    second.delete.mockRejectedValueOnce(new Error("Missing permissions"));
    const partial = await deleteSelectedSetupResources(f.guild, draft, fresh.fingerprint, f.journal, f.save);
    expect(partial.complete).toBe(false);
    expect(partial.items.map(item => item.status)).toEqual(["deleted", "failed"]);
    expect(first.delete).toHaveBeenCalledTimes(1);
    expect(second.delete).toHaveBeenCalledTimes(1);
  });
  it("blocks journaled roles renamed before preview and after approval", async () => {
    const f = fixture(), draft = smallDraft();
    const staff = f.role("Membru");
    f.journal.member = { id: staff.id, name: "Membru", kind: "role" };
    const approved = await inspectSetup(f.guild, draft, f.journal);
    expect(approved.ready).toBe(true);
    staff.name = "Public";
    const changed = await inspectSetup(f.guild, draft, f.journal);
    expect(changed.ready).toBe(false);
    expect(changed.items[0].status).toBe("conflict");
    expect(changed.items[0].detail).toContain("redenumită");
    expect(changed.fingerprint).not.toBe(approved.fingerprint);
    await expect(applySetup(f.guild, draft, approved.fingerprint, f.journal, f.save)).rejects.toThrow("Verificarea");
    expect(f.raw.channels.create).not.toHaveBeenCalled();
  });
  it("blocks changed journaled category/channel identities, including moves", async () => {
    const f = fixture(), draft = smallDraft();
    const first = await inspectSetup(f.guild, draft);
    await applySetup(f.guild, draft, first.fingerprint, f.journal, f.save);
    const category = f.channels.get(f.journal.community.id!)!;
    category.name = "Public";
    expect((await inspectSetup(f.guild, draft, f.journal)).items.find(i => i.key === "community")?.status).toBe("conflict");
    category.name = "Comunitate";
    const channel = f.channels.get(f.journal.general.id!)!;
    channel.name = "renamed";
    expect((await inspectSetup(f.guild, draft, f.journal)).items.find(i => i.key === "general")?.status).toBe("conflict");
    channel.name = "general"; channel.parentId = "elsewhere";
    expect((await inspectSetup(f.guild, draft, f.journal)).ready).toBe(false);
  });
  it("includes live names in approval even when name matching remains equivalent", async () => {
    const f = fixture(), draft = smallDraft();
    const role = f.role("Membru");
    draft.roles[0].mode = "existing";
    draft.roles[0].discordId = role.id;
    const before = await inspectSetup(f.guild, draft);
    role.name = "MEMBRU";
    const after = await inspectSetup(f.guild, draft);
    expect(after.ready).toBe(true);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await expect(applySetup(f.guild, draft, before.fingerprint, f.journal, f.save)).rejects.toThrow("Verificarea");
  });
});
