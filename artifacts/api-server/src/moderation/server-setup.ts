import { createHash } from "node:crypto";
import { ChannelType, PermissionFlagsBits as P, type Guild, type GuildBasedChannel, type GuildChannel, type GuildMember, type Role } from "discord.js";
import { setupDraftSchema, type SetupDraft } from "./server-setup-schema";
import { createSetupRole, createSetupChannel, deleteSetupResource, updateSetupAccess } from "./server-setup-discord";

type Kind = "role" | "category" | "channel";
type Target = { key: string; name: string; kind: Kind; parentKey?: string; discordId?: string; inherited?: boolean };
export type SetupJournalEntry = { id?: string; name: string; kind: Kind; parentKey?: string; attemptedAt?: string; managedRoleIds?: string[] };
export type SetupJournal = Record<string, SetupJournalEntry>;
export type SetupAccess = { readers: string[]; writers: string[] };
export type SetupItem = Target & {
  status: "create" | "reuse" | "update" | "conflict";
  detail: string;
  id?: string;
  effectiveAccess?: SetupAccess;
};
export type SetupDeleteItem = { id: string; name: string; kind: "category" | "channel"; status: "delete" | "conflict"; detail: string; children?: { id: string; name: string }[] };
export type ApplyItem = Target & { status: "created" | "updated" | "reused" | "deleted" | "failed"; detail: string; id?: string };
export type UncertainSetupItem = Target & { attemptedAt?: string };
export type SetupResourceOption = { id: string; name: string; kind: Kind; parentId?: string };
export type SetupInventory = {
  roles: { id: string; name: string; position: number; usable: boolean; reason?: string }[];
  categories: { id: string; name: string }[];
  channels: { id: string; name: string; parentId?: string; type: number; textBased: boolean }[];
  fingerprint: string;
};
const normalize = (name: string) => name.trim().toLowerCase();
const targets = (draft: SetupDraft): Target[] => [
  ...draft.roles.map(r => ({ ...r, kind: "role" as const, ...(r.discordId ? { discordId: r.discordId } : {}) })),
  ...draft.categories.flatMap(c => [
    { key: c.key, name: c.name, kind: "category" as const, ...(c.discordId ? { discordId: c.discordId } : {}) },
    ...c.channels.map(ch => ({ key: ch.key, name: ch.name, parentKey: c.key, kind: "channel" as const, ...(ch.discordId ? { discordId: ch.discordId } : {}) })),
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
  if (draft.roles.some(role => role.mode === "new") && me.roles.highest.position <= 1)
    issues.push("Mută rolul botului deasupra rolurilor care vor fi create.");
  const items: SetupItem[] = [];
  for (const target of targets(draft)) {
    const stored = Object.hasOwn(journal, target.key) ? journal[target.key] : undefined;
    const resources = target.kind === "role" ? [...roles.values()] : [...channels.values()].filter(c => c !== null);
    const parent = items.find(i => i.key === target.parentKey);
    const explicitId = target.discordId;
    const journalId = stored?.id;
    const matches = resources.filter(r => explicitId ? r.id === explicitId : journalId ? r.id === journalId : normalize(r.name) === normalize(target.name));
    let status: SetupItem["status"] = matches.length
      ? target.kind === "role" ? "reuse" : "update"
      : "create";
    let detail = status === "reuse"
      ? "Rol existent selectat; permisiunile globale și poziția rămân neschimbate."
      : status === "update"
        ? "Resursa existentă selectată; se actualizează doar permisiunile gestionate de panou."
        : "Resursă nouă; va primi accesul configurat mai jos.";
    const resource = matches[0];
    const conflict = (message: string) => { status = "conflict"; detail = message; };
    if (matches.length > 1) conflict("Mai multe resurse au același nume. Redenumește draftul.");
    if (!explicitId && !journalId && !stored && matches.length)
      conflict("Există deja o resursă cu acest nume. Selecteaz-o explicit din inventarul Discord sau schimbă numele.");
    const otherUncertain = Object.entries(journal).find(([key, pending]) =>
      key !== target.key && !pending.id && pending.kind === target.kind && normalize(pending.name) === normalize(target.name));
    if (otherUncertain)
      conflict(`Există o creare neconfirmată pentru această resursă sub cheia „${otherUncertain[0]}”. Reconciliaz-o înainte de a continua.`);
    if (stored && (stored.name !== target.name || stored.kind !== target.kind) && !explicitId)
      conflict("Această cheie a fost deja folosită pentru altă resursă. Păstrează numele inițial sau folosește o cheie nouă.");
    if (stored && !resource) conflict("Creare anterioară incertă sau resursă eliminată. Verifică în Discord; nu recreăm automat.");
    if (stored && resource && resource.name !== stored.name && !explicitId)
      conflict(`Resursa salvată a fost redenumită în Discord („${resource.name}”). Identitatea nu mai corespunde draftului; aplicarea este blocată.`);
    if (explicitId && !resource)
      conflict("Resursa selectată nu mai există. Reîncarcă inventarul și alege din nou.");
    if (resource && target.kind === "role") {
      const role = roles.get(resource.id)!;
      const roleDraft = draft.roles.find(r => r.key === target.key)!;
      if (roleDraft.mode === "new" && !journalId && !stored)
        conflict("Un rol existent cu acest nume nu va fi reutilizat automat. Selectează-l explicit sau schimbă numele.");
      if (!isSafeRole(role, guild, me))
        conflict("Rolul existent este protejat, administrativ sau deasupra botului. Alege alt nume.");
    }
    if (resource && target.kind !== "role") {
      const channel = channels.get(resource.id)!;
      if (target.kind === "category" && channel.type !== ChannelType.GuildCategory)
        conflict("Resursa selectată nu este o categorie Discord.");
      if (target.kind === "channel" && !target.inherited && channel.type !== ChannelType.GuildText)
        conflict("Accesul poate fi configurat doar pe canale text.");
      if (target.kind === "channel" && (!parent?.id || channel.parentId !== parent.id))
        conflict("Canalul selectat nu se află în categoria aleasă. Nu îl mutăm.");
    }
    if (parent?.status === "conflict") conflict("Categoria are un conflict.");
    const categoryDraft = target.kind === "category" ? draft.categories.find(c => c.key === target.key) : undefined;
    const channelDraft = target.kind === "channel"
      ? draft.categories.flatMap(c => c.channels).find(ch => ch.key === target.key)
      : undefined;
    const effectiveAccess = categoryDraft
      ? { readers: categoryDraft.readers, writers: categoryDraft.writers }
      : channelDraft
        ? channelDraft.inheritsCategory
          ? (() => {
            const parentDraft = draft.categories.find(c => c.key === target.parentKey)!;
            return { readers: parentDraft.readers, writers: parentDraft.writers };
          })()
          : { readers: channelDraft.readers, writers: channelDraft.writers }
        : undefined;
    items.push({
      ...target,
      name: resource && target.discordId ? resource.name : target.name,
      status,
      detail,
      ...(resource ? { id: resource.id } : {}),
      ...(effectiveAccess ? { effectiveAccess } : {}),
    });
  }
  for (const category of draft.categories) {
    const categoryItem = items.find(item => item.key === category.key && item.kind === "category");
    if (!categoryItem?.id || categoryItem.status === "conflict") continue;
    for (const child of channels.values()) {
      if (!child || child.parentId !== categoryItem.id || !("permissionOverwrites" in child)) continue;
      const explicitlyConfigured = category.channels.some(channel =>
        channel.discordId === child.id || journal[channel.key]?.id === child.id);
      if (explicitlyConfigured) continue;
      const key = `acl-channel-${child.id}`;
      items.push({
        key,
        name: child.name,
        kind: "channel",
        parentKey: category.key,
        discordId: child.id,
        inherited: true,
        status: "update",
        detail: `Accesul acestei resurse existente va fi sincronizat cu categoria „${category.name}”; overwrites neadministrate sunt păstrate.`,
        id: child.id,
        effectiveAccess: { readers: category.readers, writers: category.writers },
      });
      if (journal[key] && journal[key].kind !== "channel")
        items[items.length - 1].status = "conflict";
    }
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
  const deletionItems: SetupDeleteItem[] = draft.deleteTargets.map(target => {
    const resource = channels.get(target.id);
    if (!resource) return { ...target, name: "Resursă dispărută", status: "conflict", detail: "Resursa nu mai există. Reîncarcă inventarul înainte de confirmare." };
    if (target.kind === "category" && resource.type !== ChannelType.GuildCategory)
      return { ...target, name: resource.name, status: "conflict", detail: "ID-ul selectat nu mai aparține unei categorii." };
    if (target.kind === "channel" && resource.type === ChannelType.GuildCategory)
      return { ...target, name: resource.name, status: "conflict", detail: "ID-ul selectat nu mai aparține unui canal." };
    const children = target.kind === "category"
      ? [...channels.values()].filter(c => c?.parentId === target.id).map(c => ({ id: c!.id, name: c!.name }))
      : undefined;
    return {
      ...target,
      name: resource.name,
      status: "delete",
      detail: target.kind === "category"
        ? "Se șterge numai categoria; canalele copil rămân în server, fără categorie."
        : "Se șterge numai canalul selectat.",
      ...(children ? { children } : {}),
    };
  });
  const selectedForSetup = new Set(items.flatMap(item => item.id ? [item.id] : []));
  for (const deletion of deletionItems) {
    if (selectedForSetup.has(deletion.id)) {
      deletion.status = "conflict";
      deletion.detail = "Aceeași resursă este configurată și selectată pentru ștergere. Alege o singură operație.";
    }
  }
  const snapshot = {
    guildId: guild.id,
    draft, items, deletionItems, issues,
    journal,
    roles: [...roles.values()].map(r => [r.id, r.name, r.position, r.managed, r.permissions.bitfield.toString()]).sort(),
    channels: [...channels.values()].filter(c => c !== null).map(c => [c.id, c.name, c.type, c.parentId,
      "permissionOverwrites" in c ? [...c.permissionOverwrites.cache.values()].map(o => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort() : []]).sort(),
  };
  return { ready: issues.length === 0 && !items.some(i => i.status === "conflict") && !deletionItems.some(i => i.status === "conflict"), issues, items, deletionItems,
    fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

export async function inspectSetupResources(guild: Guild): Promise<SetupInventory> {
  const [roles, channels, me] = await Promise.all([
    guild.roles.fetch(undefined, { force: true }),
    guild.channels.fetch(undefined, { force: true }),
    guild.members.fetchMe(),
  ]);
  const channelList = [...channels.values()].filter(c => c !== null);
  const roleList = [...roles.values()];
  const rolesView = roleList
    .filter(role => role.id !== guild.id)
    .map(role => ({
      id: role.id,
      name: role.name,
      position: role.position,
      usable: isSafeRole(role, guild, me),
      ...(!isSafeRole(role, guild, me) ? { reason: role.managed ? "Rol gestionat de o integrare." : role.permissions.has(P.Administrator) ? "Rolul are Administrator." : "Rolul nu poate fi gestionat de bot." } : {}),
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
  const categories = channelList
    .filter(channel => channel.type === ChannelType.GuildCategory)
    .map(channel => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const channelView = channelList
    .filter(channel => channel.type !== ChannelType.GuildCategory)
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      ...(channel.parentId ? { parentId: channel.parentId } : {}),
      type: channel.type,
      textBased: channel.type === ChannelType.GuildText,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const fingerprint = createHash("sha256").update(JSON.stringify({
    guildId: guild.id,
    roles: roleList.map(r => [r.id, r.name, r.position, r.managed, r.permissions.bitfield.toString()]).sort(),
    channels: channelList.map(c => [c.id, c.name, c.type, c.parentId,
      "permissionOverwrites" in c ? [...c.permissionOverwrites.cache.values()].map(o =>
        [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort() : []]).sort(),
  })).digest("hex");
  return { roles: rolesView, categories, channels: channelView, fingerprint };
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

function accessMap(
  rule: SetupAccess,
  draft: SetupDraft,
  ids: Map<string, string>,
): Map<string, { view: boolean; history: boolean; send: boolean }> {
  const result = new Map<string, { view: boolean; history: boolean; send: boolean }>();
  for (const roleKey of ["everyone", ...draft.roles.map(role => role.key)]) {
    const id = roleKey === "everyone" ? ids.get("everyone") : ids.get(roleKey);
    const view = rule.readers.includes(roleKey);
    const send = rule.writers.includes(roleKey);
    if (!id) {
      if (view || send) throw new Error("Un rol necesar regulii de acces nu a putut fi rezolvat.");
      continue;
    }
    result.set(id, { view, history: view, send });
  }
  return result;
}

function createOverwrites(
  guildId: string,
  botUserId: string,
  rule: SetupAccess,
  draft: SetupDraft,
  ids: Map<string, string>,
) {
  const managed = accessMap(rule, draft, ids);
  const accessBits = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages];
  const overwrites = [...managed].map(([id, access]) => {
    const allow = [
      ...(access.view ? [P.ViewChannel, P.ReadMessageHistory] : []),
      ...(access.send ? [P.SendMessages] : []),
    ];
    return {
      id,
      type: 0 as const,
      allow,
      deny: accessBits.filter(permission => !allow.includes(permission)),
    };
  });
  return [
    ...overwrites,
    { id: botUserId, type: 1 as const, allow: accessBits, deny: [] },
  ];
}

function managedRoleIds(ids: Map<string, string>, draft: SetupDraft) {
  const roleKeys = new Set(draft.roles.map(role => role.key));
  return [...ids.entries()].filter(([key]) => roleKeys.has(key)).map(([, id]) => id);
}

async function persistAndApplyAccess(
  guild: Guild,
  channel: GuildBasedChannel,
  rule: SetupAccess,
  draft: SetupDraft,
  ids: Map<string, string>,
  journalKey: string,
  journal: SetupJournal,
  saveJournal: (journal: SetupJournal) => Promise<void>,
  name: string,
  kind: "category" | "channel",
  parentKey?: string,
) {
  if (!("permissionOverwrites" in channel)) throw new Error("Resursa nu acceptă permisiuni de canal.");
  const manageableChannel = channel as GuildChannel;
  const wantedRoleIds = managedRoleIds(ids, draft);
  // Older journal entries could contain category/channel IDs, because these
  // resources share the same `ids` map as roles. Keep only IDs still known as
  // guild roles before asking Discord to edit their channel overwrites.
  const previousRoleIds = (journal[journalKey]?.managedRoleIds ?? [])
    .filter(id => guild.roles.cache.has(id));
  const duringUpdate = [...new Set([...previousRoleIds, ...wantedRoleIds])];
  journal[journalKey] = {
    ...journal[journalKey],
    id: manageableChannel.id,
    name,
    kind,
    ...(parentKey ? { parentKey } : {}),
    managedRoleIds: duringUpdate,
  };
  await saveJournal(journal);
  await updateSetupAccess(
    manageableChannel.permissionOverwrites,
    accessMap(rule, draft, ids),
    previousRoleIds,
    manageableChannel.client.user!.id,
    "Pornire server: permisiuni selectate de operator",
  );
  journal[journalKey].managedRoleIds = wantedRoleIds;
  await saveJournal(journal);
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
  const bot = await guild.members.fetchMe();
  for (const target of preview.items) {
    if (target.kind === "role") {
      if (target.status === "reuse") {
        ids.set(target.key, target.id!);
        items.push({ ...target, status: "reused", detail: "Rol existent reutilizat; permisiunile globale au rămas neschimbate." });
        continue;
      }
      try {
        journal[target.key] = { name: target.name, kind: "role", attemptedAt: new Date().toISOString() };
        await saveJournal(journal);
        let created: { id: string };
        try {
          created = await createSetupRole(guild, target.name);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status && status >= 400 && status < 500 && status !== 408) {
            delete journal[target.key];
            await saveJournal(journal);
          }
          throw error;
        }
        journal[target.key].id = created.id;
        await saveJournal(journal);
        ids.set(target.key, created.id);
        items.push({ ...target, id: created.id, status: "created", detail: "Rol creat fără permisiuni globale." });
      } catch (error) {
        items.push({ ...target, status: "failed", detail: error instanceof Error ? error.message : "Crearea rolului nu a fost confirmată." });
      }
      continue;
    }

    const categoryDraft = target.kind === "category"
      ? draft.categories.find(c => c.key === target.key)!
      : target.inherited
        ? draft.categories.find(c => c.key === target.parentKey)!
        : undefined;
    const channelDraft = target.kind === "channel" && !target.inherited
      ? draft.categories.flatMap(c => c.channels).find(c => c.key === target.key)!
      : undefined;
    const rule = categoryDraft
      ? { readers: categoryDraft.readers, writers: categoryDraft.writers }
      : channelDraft!.inheritsCategory
        ? (() => {
          const parent = draft.categories.find(c => c.key === target.parentKey)!;
          return { readers: parent.readers, writers: parent.writers };
        })()
        : { readers: channelDraft!.readers, writers: channelDraft!.writers };
    const key = target.key;
    let resourceId = target.id;
    try {
      if (target.parentKey && !ids.has(target.parentKey)) throw new Error("Categoria nu a putut fi creată sau reutilizată.");
      const parentId = target.parentKey ? ids.get(target.parentKey)! : undefined;
      if (target.status === "create") {
        journal[key] = {
          name: target.name,
          kind: target.kind,
          ...(target.parentKey ? { parentKey: target.parentKey } : {}),
          managedRoleIds: managedRoleIds(ids, draft),
          attemptedAt: new Date().toISOString(),
        };
        await saveJournal(journal);
        let created: { id: string };
        try {
          created = await createSetupChannel(guild, {
            name: target.name,
            type: target.kind === "category" ? ChannelType.GuildCategory : ChannelType.GuildText,
            ...(parentId ? { parent: parentId } : {}),
            permissionOverwrites: createOverwrites(guild.id, bot.id, rule, draft, ids),
            reason: "Pornire server: confirmare operator",
          });
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status && status >= 400 && status < 500 && status !== 408) {
            delete journal[key];
            await saveJournal(journal);
          }
          throw error;
        }
        resourceId = created.id;
        journal[key].id = created.id;
        await saveJournal(journal);
      }
      if (!resourceId) throw new Error("ID-ul resursei nu a fost rezolvat.");
      ids.set(key, resourceId);
      const channel = await guild.channels.fetch(resourceId, { force: true });
      if (!channel) throw new Error("Resursa a dispărut înainte de actualizarea accesului.");
      await persistAndApplyAccess(guild, channel, rule, draft, ids, key, journal, saveJournal, target.name, target.kind, target.parentKey);
      items.push({
        ...target,
        id: resourceId,
        status: target.status === "create" ? "created" : "updated",
        detail: target.status === "create" ? "Creată cu accesul propus." : "Acces actualizat; permisiunile din afara panoului au fost păstrate.",
      });
    } catch (error) {
      items.push({
        ...target,
        ...(resourceId ? { id: resourceId } : {}),
        status: "failed",
        detail: error instanceof Error ? error.message : "Operația Discord nu a fost confirmată. Verifică inventarul înainte de reîncercare.",
      });
    }
  }
  return { complete: items.every(item => item.status !== "failed"), items };
}

export async function deleteSelectedSetupResources(
  guild: Guild,
  input: unknown,
  fingerprint: string,
  journal: SetupJournal,
  saveJournal: (journal: SetupJournal) => Promise<void>,
) {
  const draft = setupDraftSchema.parse(input);
  if (!draft.deleteTargets.length) throw new Error("Selectează explicit resursele de șters.");
  const preview = await inspectSetup(guild, draft, journal);
  if (!preview.ready || preview.fingerprint !== fingerprint)
    throw new Error("Previzualizarea este învechită. Verifică din nou înainte de ștergere.");
  const items: ApplyItem[] = [];
  for (const target of preview.deletionItems) {
    try {
      if (target.status !== "delete") throw new Error("Resursa nu mai este validă pentru ștergere.");
      await deleteSetupResource(guild, target.id, "Pornire server: ștergere selectată și confirmată de operator");
      for (const [key, entry] of Object.entries(journal)) {
        if (entry.id === target.id) delete journal[key];
      }
      await saveJournal(journal);
      items.push({
        key: `delete-${target.id}`,
        id: target.id,
        name: target.name,
        kind: target.kind,
        status: "deleted",
        detail: target.detail,
      });
    } catch (error) {
      items.push({
        key: `delete-${target.id}`,
        id: target.id,
        name: target.name,
        kind: target.kind,
        status: "failed",
        detail: error instanceof Error ? error.message : "Ștergerea nu a fost confirmată.",
      });
    }
  }
  return { complete: items.every(item => item.status === "deleted"), items };
}
