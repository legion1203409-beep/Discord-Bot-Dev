import { createHash } from "node:crypto";
import { ChannelType, PermissionFlagsBits as P, type Guild, type GuildMember, type OverwriteData, type Role } from "discord.js";
import { setupDraftSchema, type SetupDraft } from "./server-setup-schema";
import { createSetupRole, createSetupChannel } from "./server-setup-discord";

type Kind = "role" | "category" | "channel";
type Target = { key: string; name: string; kind: Kind; parentKey?: string };
export type SetupJournalEntry = { id?: string; name: string; kind: Kind; parentKey?: string; attemptedAt?: string };
export type SetupJournal = Record<string, SetupJournalEntry>;
export type SetupItem = Target & { status: "create" | "reuse" | "conflict"; detail: string; id?: string };
export type ApplyItem = Target & { status: "created" | "reused" | "failed"; detail: string };
export type UncertainSetupItem = Target & { attemptedAt?: string };
export type SetupResourceOption = { id: string; name: string; kind: Kind; parentId?: string };
const normalize = (name: string) => name.trim().toLowerCase();
const targets = (draft: SetupDraft): Target[] => [
  ...draft.roles.map(r => ({ ...r, kind: "role" as const })),
  ...draft.categories.flatMap(c => [
    { key: c.key, name: c.name, kind: "category" as const },
    ...c.channels.map(ch => ({ key: ch.key, name: ch.name, parentKey: c.key, kind: "channel" as const })),
  ]),
];

export async function inspectSetup(guild: Guild, input: unknown, journal: SetupJournal = {}) {
  const draft = setupDraftSchema.parse(input);
  const [roles, channels, me] = await Promise.all([
    guild.roles.fetch(undefined, { force: true }),
    guild.channels.fetch(undefined, { force: true }),
    guild.members.fetchMe(),
  ]);
  const issues: string[] = [];
  for (const permission of ["ManageRoles", "ManageChannels", "ViewChannel", "SendMessages", "ReadMessageHistory"] as const)
    if (!me.permissions.has(P[permission])) issues.push(`Botul are nevoie de ${permission}.`);
  if (me.roles.highest.position <= 1) issues.push("Mută rolul botului deasupra rolurilor care vor fi create.");
  const items: SetupItem[] = [];
  for (const target of targets(draft)) {
    const stored = Object.hasOwn(journal, target.key) ? journal[target.key] : undefined;
    const resources = target.kind === "role" ? [...roles.values()] : [...channels.values()].filter(c => c !== null).filter(c =>
      stored?.id || (target.kind === "category" ? c.type === ChannelType.GuildCategory : c.type !== ChannelType.GuildCategory));
    const parent = items.find(i => i.key === target.parentKey);
    const matches = resources.filter(r => stored?.id ? r.id === stored.id : normalize(r.name) === normalize(target.name));
    let status: SetupItem["status"] = matches.length ? "reuse" : "create";
    let detail = status === "reuse" ? "Resursă existentă: permisiunile și poziția rămân neschimbate." : "Resursă nouă cu accesul din draft.";
    const resource = matches[0];
    const conflict = (message: string) => { status = "conflict"; detail = message; };
    if (matches.length > 1) conflict("Mai multe resurse au același nume. Redenumește draftul.");
    const otherUncertain = Object.entries(journal).find(([key, pending]) =>
      key !== target.key && !pending.id && pending.kind === target.kind && normalize(pending.name) === normalize(target.name));
    if (otherUncertain)
      conflict(`Există o creare neconfirmată pentru această resursă sub cheia „${otherUncertain[0]}”. Reconciliaz-o înainte de a continua.`);
    if (stored && (stored.name !== target.name || stored.kind !== target.kind))
      conflict("Această cheie a fost deja folosită pentru altă resursă. Păstrează numele inițial sau folosește o cheie nouă.");
    if (stored && !resource) conflict("Creare anterioară incertă sau resursă eliminată. Verifică în Discord; nu recreăm automat.");
    if (stored && resource && resource.name !== stored.name)
      conflict(`Resursa salvată a fost redenumită în Discord („${resource.name}”). Identitatea nu mai corespunde draftului; aplicarea este blocată.`);
    if (resource && target.kind === "role") {
      const role = roles.get(resource.id)!;
      if (role.id === guild.id || role.managed || role.position >= me.roles.highest.position || role.permissions.has(P.Administrator))
        conflict("Rolul existent este protejat, administrativ sau deasupra botului. Alege alt nume.");
    }
    if (resource && target.kind !== "role") {
      const channel = channels.get(resource.id)!;
      if (channel.type !== (target.kind === "category" ? ChannelType.GuildCategory : ChannelType.GuildText))
        conflict("Există o resursă cu acest nume, dar de alt tip.");
      if (target.kind === "channel" && (!parent?.id || channel.parentId !== parent.id))
        conflict("Canalul există în altă categorie. Nu îl mutăm și nu îl duplicăm.");
    }
    if (parent?.status === "conflict") conflict("Categoria are un conflict.");
    items.push({ ...target, status, detail, ...(resource ? { id: resource.id } : {}) });
  }
  if (roles.size + items.filter(i => i.kind === "role" && i.status === "create").length > 250)
    issues.push("Limita de 250 de roluri ar fi depășită.");
  if (channels.size + items.filter(i => i.kind !== "role" && i.status === "create").length > 500)
    issues.push("Limita de 500 de canale ar fi depășită.");
  for (const category of items.filter(i => i.kind === "category" && i.id)) {
    const existing = [...channels.values()].filter(c => c?.parentId === category.id).length;
    if (existing + items.filter(i => i.parentKey === category.key && i.status === "create").length > 50)
      issues.push(`Categoria ${category.name} ar depăși 50 de canale.`);
  }
  const snapshot = {
    draft, items, issues,
    roles: [...roles.values()].map(r => [r.id, r.name, r.position, r.managed, r.permissions.bitfield.toString()]).sort(),
    channels: [...channels.values()].filter(c => c !== null).map(c => [c.id, c.name, c.type, c.parentId,
      "permissionOverwrites" in c ? [...c.permissionOverwrites.cache.values()].map(o => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort() : []]).sort(),
  };
  return { ready: issues.length === 0 && !items.some(i => i.status === "conflict"), issues, items,
    fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

export function listUncertainSetup(journal: SetupJournal): UncertainSetupItem[] {
  return Object.entries(journal)
    .filter(([, entry]) => !entry.id)
    .map(([key, entry]) => ({
      key,
      name: entry.name,
      kind: entry.kind,
      ...(entry.parentKey ? { parentKey: entry.parentKey } : {}),
      ...(entry.attemptedAt ? { attemptedAt: entry.attemptedAt } : {}),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function isSafeRole(role: Role, guild: Guild, me: GuildMember) {
  return role.id !== guild.id && !role.managed && role.position < me.roles.highest.position && !role.permissions.has(P.Administrator);
}

export async function inspectUncertainSetup(guild: Guild, key: string, journal: SetupJournal) {
  const pending = journal[key];
  if (!pending || pending.id) throw new Error("Această resursă nu mai are o creare neconfirmată.");
  const [roles, channels, me] = await Promise.all([
    guild.roles.fetch(undefined, { force: true }),
    guild.channels.fetch(undefined, { force: true }),
    guild.members.fetchMe(),
  ]);
  const parentId = pending.parentKey ? journal[pending.parentKey]?.id : undefined;
  const roleList = [...roles.values()];
  const channelList = [...channels.values()].filter(c => c !== null);
  const sameName: SetupResourceOption[] = [];
  if (pending.kind === "role") {
    for (const role of roleList) if (normalize(role.name) === normalize(pending.name))
      sameName.push({ id: role.id, name: role.name, kind: "role" });
  } else {
    for (const channel of channelList) {
      const matchingType = pending.kind === "category"
        ? channel.type === ChannelType.GuildCategory
        : channel.type !== ChannelType.GuildCategory;
      if (matchingType && normalize(channel.name) === normalize(pending.name))
        sameName.push({ id: channel.id, name: channel.name, kind: pending.kind === "category" ? "category" : "channel",
          ...(channel.parentId ? { parentId: channel.parentId } : {}) });
    }
  }
  const candidates: SetupResourceOption[] = [];
  for (const match of sameName) {
    if (match.name !== pending.name) continue;
    if (match.kind === "role") {
      const role = roles.get(match.id);
      if (role && isSafeRole(role, guild, me)) candidates.push(match);
      continue;
    }
    const channel = channels.get(match.id);
    if (!channel || channel.type !== (pending.kind === "category" ? ChannelType.GuildCategory : ChannelType.GuildText)) continue;
    if (pending.kind === "channel" && parentId && channel.parentId !== parentId) continue;
    if (pending.kind === "channel" && pending.parentKey && !parentId) continue;
    candidates.push(match);
  }
  const inventory = {
    guildId: guild.id,
    key,
    pending,
    parentId: parentId ?? null,
    roles: roleList.map(r => [r.id, r.name, r.position, r.managed, r.permissions.bitfield.toString()]).sort(),
    channels: channelList.map(c => [c.id, c.name, c.type, c.parentId,
      "permissionOverwrites" in c ? [...c.permissionOverwrites.cache.values()].map(o =>
        [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort() : []]).sort(),
  };
  return {
    key,
    pending: { key, name: pending.name, kind: pending.kind, ...(pending.parentKey ? { parentKey: pending.parentKey } : {}) },
    nameMatches: sameName,
    candidates,
    canConfirmAbsent: sameName.length === 0,
    ...(pending.kind === "channel" && pending.parentKey && !parentId
      ? { blockedReason: "Leagă mai întâi categoria părinte; canalul trebuie să fie în categoria corectă." }
      : {}),
    inventoryFingerprint: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
  };
}

export async function reconcileUncertainSetup(
  guild: Guild,
  input: { key: string; action: "bind"; inventoryFingerprint: string; resourceId: string } |
    { key: string; action: "confirm-absent"; inventoryFingerprint: string },
  journal: SetupJournal,
  saveJournal: (journal: SetupJournal) => Promise<void>,
) {
  const inspected = await inspectUncertainSetup(guild, input.key, journal);
  if (inspected.inventoryFingerprint !== input.inventoryFingerprint)
    throw new Error("Inventarul Discord s-a schimbat. Verifică din nou înainte de reconciliere.");
  const pending = journal[input.key];
  if (input.action === "bind") {
    const resource = inspected.candidates.find(candidate => candidate.id === input.resourceId);
    if (!resource) throw new Error("Resursa aleasă nu mai este validă pentru această încercare. Verifică din nou inventarul.");
    const nextJournal = { ...journal, [input.key]: { ...pending, id: resource.id } };
    await saveJournal(nextJournal);
    Object.assign(journal, nextJournal);
    return { action: "bound" as const, resource, uncertain: listUncertainSetup(journal) };
  }
  if (!inspected.canConfirmAbsent)
    throw new Error("Există deja o resursă cu acest nume în inventarul proaspăt. Leag-o explicit în loc să confirmi absența.");
  const nextJournal = { ...journal };
  delete nextJournal[input.key];
  await saveJournal(nextJournal);
  delete journal[input.key];
  return {
    action: "confirmed-absent" as const,
    pending: inspected.pending,
    uncertain: listUncertainSetup(journal),
  };
}

export async function applySetup(
  guild: Guild, input: unknown, fingerprint: string, journal: SetupJournal,
  saveJournal: (journal: SetupJournal) => Promise<void>,
) {
  const draft = setupDraftSchema.parse(input);
  const preview = await inspectSetup(guild, draft, journal);
  if (!preview.ready || preview.fingerprint !== fingerprint)
    throw new Error("Verificarea nu mai este validă. Rulează din nou previzualizarea înainte de confirmare.");
  const ids = new Map<string, string>([["everyone", guild.id]]);
  const items: ApplyItem[] = [];
  const access = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages];
  for (const target of preview.items) {
    if (target.status === "reuse") {
      ids.set(target.key, target.id!);
      items.push({ ...target, status: "reused" });
      continue;
    }
    try {
      if (target.parentKey && !ids.has(target.parentKey)) throw new Error("Categoria nu a putut fi creată.");
      const channelDraft = draft.categories.flatMap(c => c.channels).find(c => c.key === target.key);
      const overwrites: OverwriteData[] = [
        { id: guild.id, type: 0, deny: access },
        { id: guild.members.me!.id, type: 1, allow: access },
      ];
      if (channelDraft) {
        // Every draft role is explicit so a member role cannot inherit an
        // unintended write grant from @everyone. Administrator still bypasses ACLs.
        for (const roleKey of ["everyone", ...draft.roles.map(r => r.key)]) {
          const id = ids.get(roleKey);
          if (!id) {
            if (channelDraft.readers.includes(roleKey) || channelDraft.writers.includes(roleKey))
              throw new Error("Un rol necesar canalului nu a putut fi creat.");
            continue;
          }
          const allow = [
            ...(channelDraft.readers.includes("everyone") || channelDraft.readers.includes(roleKey) ? [P.ViewChannel, P.ReadMessageHistory] : []),
            ...(channelDraft.writers.includes("everyone") || channelDraft.writers.includes(roleKey) ? [P.SendMessages] : []),
          ];
          const entry = { id, type: 0 as const, allow, deny: access.filter(p => !allow.includes(p)) };
          if (roleKey === "everyone") overwrites[0] = entry;
          else overwrites.push(entry);
        }
      }
      // Persist intent BEFORE Discord: a lost response or crash must not lead
      // to blind recreation on another process or after a restart.
      journal[target.key] = {
        name: target.name,
        kind: target.kind,
        ...(target.parentKey ? { parentKey: target.parentKey } : {}),
        attemptedAt: new Date().toISOString(),
      };
      await saveJournal(journal);
      let resource: { id: string };
      try {
        resource = target.kind === "role"
          ? await createSetupRole(guild, target.name)
          : await createSetupChannel(guild, {
            name: target.name,
            type: target.kind === "category" ? ChannelType.GuildCategory : ChannelType.GuildText,
            ...(target.parentKey ? { parent: ids.get(target.parentKey)! } : {}),
            permissionOverwrites: overwrites,
            reason: "Pornire server: confirmare operator",
          });
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500 && status !== 408) {
          delete journal[target.key]; // Discord explicitly rejected creation.
          await saveJournal(journal);
        }
        throw error;
      }
      journal[target.key].id = resource.id;
      await saveJournal(journal);
      ids.set(target.key, resource.id);
      items.push({ ...target, status: "created", detail: "Creată cu succes." });
    } catch {
      items.push({ ...target, status: "failed", detail: "Crearea nu a fost confirmată. Verifică permisiunile și rulează din nou verificarea; resursele incerte nu sunt recreate automat." });
      // Continue independent resources; dependents require resolved IDs.
    }
  }
  return { complete: items.every(i => i.status !== "failed"), items };
}
