export type SetupAccess = { readers: string[]; writers: string[] };
export type SetupChannel = SetupAccess & { key: string; name: string; discordId?: string; inheritsCategory: boolean; explanation: string };
export type SetupCategory = SetupAccess & { key: string; name: string; discordId?: string; channels: SetupChannel[] };
export type SetupRole = { key: string; name: string; mode: "new" | "existing"; discordId?: string };
export type SetupDraft = { roles: SetupRole[]; categories: SetupCategory[]; deleteTargets: { id: string; kind: "category" | "channel" }[] };
export type PreviewItem = { key: string; name: string; kind: "role" | "category" | "channel"; status: "create" | "reuse" | "update" | "conflict"; detail: string; id?: string; inherited?: boolean; effectiveAccess?: SetupAccess };
export type PreviewDeletionItem = { id: string; name: string; kind: "category" | "channel"; status: "delete" | "conflict"; detail: string; children?: { id: string; name: string }[] };
export type PreviewResult = { ready: boolean; issues: string[]; items: PreviewItem[]; deletionItems: PreviewDeletionItem[]; fingerprint: string };
export type ApplyItem = { key: string; name: string; kind: "role" | "category" | "channel"; status: "created" | "updated" | "reused" | "failed" | "deleted"; detail: string; id?: string };
export type ApplyResult = { items: ApplyItem[]; complete: boolean };
export type SetupResources = {
  roles: { id: string; name: string; position: number; usable: boolean; reason?: string }[];
  categories: { id: string; name: string }[];
  channels: { id: string; name: string; parentId?: string; type: number; textBased: boolean }[];
  fingerprint: string;
};

export function normalizeSetupDraft(input: SetupDraft): SetupDraft {
  return {
    roles: (input.roles ?? []).map(role => ({ ...role, mode: role.mode ?? "new" })),
    categories: (input.categories ?? []).map(category => ({
      ...category,
      readers: category.readers ?? [],
      writers: category.writers ?? [],
      channels: (category.channels ?? []).map(channel => ({
        ...channel,
        readers: channel.readers ?? [],
        writers: channel.writers ?? [],
        inheritsCategory: channel.inheritsCategory ?? true,
      })),
    })),
    deleteTargets: input.deleteTargets ?? [],
  };
}

export function newKey(prefix: string, draft: SetupDraft): string {
  const used = allKeys(draft);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function allKeys(d: SetupDraft): Set<string> {
  return new Set([...d.roles.map(r => r.key), ...d.categories.map(c => c.key), ...d.categories.flatMap(c => c.channels.map(ch => ch.key))]);
}

export function slugChannel(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 80);
}

export function toggleReader(ch: SetupChannel, role: string): SetupChannel {
  if (ch.readers.includes(role)) return { ...ch, readers: ch.readers.filter(r => r !== role), writers: ch.writers.filter(r => r !== role) };
  return { ...ch, readers: [...ch.readers, role] };
}
export function toggleWriter(ch: SetupChannel, role: string): SetupChannel {
  if (ch.writers.includes(role)) return { ...ch, writers: ch.writers.filter(r => r !== role) };
  return { ...ch, writers: [...ch.writers, role], readers: ch.readers.includes(role) ? ch.readers : [...ch.readers, role] };
}

export function removeRole(d: SetupDraft, key: string): SetupDraft {
  return {
    roles: d.roles.filter(r => r.key !== key),
    categories: d.categories.map(c => ({
      ...c,
      readers: c.readers.filter(r => r !== key),
      writers: c.writers.filter(r => r !== key),
      channels: c.channels.map(ch => ({ ...ch, readers: ch.readers.filter(r => r !== key), writers: ch.writers.filter(r => r !== key) })),
    })),
    deleteTargets: d.deleteTargets,
  };
}

export function validateDraft(d: SetupDraft): string[] {
  const out: string[] = [];
  const dup = (a: string[]) => new Set(a.map(x => x.trim().toLowerCase())).size !== a.length;
  const bad = (n: string) => !n.trim() || n.length > 100 || n.includes("@");
  if (d.roles.length > 20) out.push("Maximum 20 de roluri.");
  if (d.categories.length > 10) out.push("Maximum 10 categorii.");
  if (d.deleteTargets.length > 20) out.push("Maximum 20 de resurse selectate pentru ștergere.");
  if (d.roles.some(role => role.mode === "existing" && !role.discordId)) out.push("Alege explicit un ID Discord pentru fiecare rol existent.");
  if (d.roles.some(r => bad(r.name)) || d.categories.some(c => bad(c.name))) out.push("Numele nu pot fi goale, peste 100 de caractere sau conține @.");
  if (dup(d.roles.map(r => r.name))) out.push("Numele rolurilor trebuie să fie unice.");
  if (dup(d.categories.map(c => c.name))) out.push("Numele categoriilor trebuie să fie unice.");
  if (dup(d.categories.flatMap(c => c.channels.map(ch => ch.name)))) out.push("Numele canalelor trebuie să fie unice în draft.");
  for (const c of d.categories) {
    if (c.channels.length > 30) out.push(`Categoria ${c.name}: maximum 30 de canale.`);
    if (dup(c.channels.map(ch => ch.name))) out.push(`Categoria ${c.name}: nume de canale duplicate.`);
    for (const ch of c.channels) {
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(ch.name)) out.push(`Canalul „${ch.name || "(gol)"}”: doar litere mici, cifre, - și _.`);
      if (ch.explanation.length > 400) out.push(`Canalul ${ch.name}: explicația depășește 400 de caractere.`);
    }
  }
  return out;
}

export function roleLabel(d: SetupDraft, key: string): string {
  return key === "everyone" ? "@everyone" : d.roles.find(r => r.key === key)?.name ?? key;
}
