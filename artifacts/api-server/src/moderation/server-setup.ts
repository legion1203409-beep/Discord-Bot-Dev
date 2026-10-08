import { createHash } from "node:crypto";
import { ChannelType, PermissionFlagsBits as P, type Guild, type OverwriteData } from "discord.js";
import { setupDraftSchema, type SetupDraft } from "./server-setup-schema";
import { createSetupRole, createSetupChannel } from "./server-setup-discord";

type Kind = "role" | "category" | "channel";
type Target = { key: string; name: string; kind: Kind; parentKey?: string };
export type SetupJournal = Record<string, { id?: string; name: string; kind: Kind }>;
export type SetupItem = Target & { status: "create" | "reuse" | "conflict"; detail: string; id?: string };
export type ApplyItem = Target & { status: "created" | "reused" | "failed"; detail: string };
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
    guild.roles.fetch(), guild.channels.fetch(), guild.members.fetchMe(),
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
      journal[target.key] = { name: target.name, kind: target.kind };
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
