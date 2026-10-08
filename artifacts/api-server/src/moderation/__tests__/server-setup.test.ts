import { describe, expect, it, vi } from "vitest";
import { Collection, PermissionFlagsBits as P, PermissionsBitField, type Guild } from "discord.js";
import { applySetup, inspectSetup, type SetupJournal } from "../server-setup";
import { setupDraftSchema, setupTemplate } from "../server-setup-schema";

vi.mock("../server-setup-discord", () => ({
  createSetupRole: (guild: Guild, name: string) => guild.roles.create({ name, permissions: 0n }),
  createSetupChannel: (guild: Guild, options: any) => guild.channels.create(options),
}));

function fixture() {
  let seq = 100;
  const roles = new Collection<string, any>();
  const channels = new Collection<string, any>();
  const me = { id: "bot", permissions: new PermissionsBitField(P.Administrator), roles: { highest: { position: 20 } } };
  const role = (name: string, permissions = 0n) => {
    const value = { id: String(++seq), name, position: 1, managed: false, permissions: new PermissionsBitField(permissions) };
    roles.set(value.id, value); return value;
  };
  const channel = (data: any) => {
    const value = { id: String(++seq), parentId: data.parent ?? null, ...data,
      permissionOverwrites: { cache: new Collection((data.permissionOverwrites ?? []).map((o: any) => [o.id, {
        ...o, allow: new PermissionsBitField(o.allow ?? []), deny: new PermissionsBitField(o.deny ?? []),
      }])) } };
    channels.set(value.id, value); return value;
  };
  const guild = {
    id: "guild", members: { me, fetchMe: vi.fn(async () => me) },
    roles: { fetch: vi.fn(async () => roles), create: vi.fn(async (r: any) => role(r.name, r.permissions)) },
    channels: { fetch: vi.fn(async () => channels), create: vi.fn(async (c: any) => channel(c)) },
  };
  const journal: SetupJournal = {};
  const save = vi.fn(async () => {});
  return { guild: guild as unknown as Guild, raw: guild, roles, channels, me, role, channel, journal, save };
}
const smallDraft = () => ({
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
  it("rejects duplicate keys/names and reserved role keys", () => {
    const d = smallDraft(); d.roles.push({ ...d.roles[0] });
    expect(setupDraftSchema.safeParse(d).success).toBe(false);
    d.roles = [{ key: "everyone", name: "Everyone" }];
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
    expect(f.raw.roles.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: 0n }));
    const textCall = f.raw.channels.create.mock.calls[1][0];
    expect(textCall.permissionOverwrites.find((o: any) => o.id === "guild").allow).toContain(P.SendMessages);
    expect(textCall.permissionOverwrites.find((o: any) => o.id !== "guild" && o.type === 0).allow).toContain(P.ViewChannel);
    const second = await inspectSetup(f.guild, draft, f.journal);
    expect(second.items.every(i => i.status === "reuse")).toBe(true);
    expect((await applySetup(f.guild, draft, second.fingerprint, f.journal, f.save)).items.every(i => i.status === "reused")).toBe(true);
    expect(f.raw.roles.create).toHaveBeenCalledTimes(1);
    expect(f.raw.channels.create).toHaveBeenCalledTimes(2);
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
    const cat = f.channel({ name: "Staff", type: 4, permissionOverwrites: [{ id: "manual", allow: [P.ManageMessages] }] });
    const before = JSON.stringify([...cat.permissionOverwrites.cache.keys()]);
    const p = await inspectSetup(f.guild, setupTemplate);
    expect((await applySetup(f.guild, setupTemplate, p.fingerprint, f.journal, f.save)).complete).toBe(true);
    expect(JSON.stringify([...cat.permissionOverwrites.cache.keys()])).toBe(before);
    const staff = f.raw.channels.create.mock.calls.map(c => c[0]).find(c => c.name === "staff")!;
    expect(staff.permissionOverwrites.find((o: any) => o.id === "guild").deny).toContain(P.ViewChannel);
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
    const before = await inspectSetup(f.guild, draft);
    role.name = "MEMBRU";
    const after = await inspectSetup(f.guild, draft);
    expect(after.ready).toBe(true);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await expect(applySetup(f.guild, draft, before.fingerprint, f.journal, f.save)).rejects.toThrow("Verificarea");
  });
});
