// Translate only settings with the same meaning in the real bot API.
// The original document remains the UI; defaults are never operational data.
export type PanelModuleState = {
  on: boolean;
  f: Record<string, unknown>;
  s?: Record<string, { on: boolean; f: Record<string, unknown> }>;
};
export type PanelModules = Record<string, PanelModuleState>;
export type PanelChange = { m: string; s: string; k: string; value: unknown };
export type PanelSnapshot = {
  modules: PanelModules;
  supported: string[];
  readable: string[];
  notes: Record<string, string>;
  log: Array<{ t: number; m: string; x: string }>;
  logError?: string;
};
type RecordValue = Record<string, any>;
export type PanelMetadata = {
  channels?: Array<{ id: string; name: string }>;
  roles?: Array<{ id: string; name: string }>;
};
type Binding = {
  id: string;
  read: (config: RecordValue, metadata: PanelMetadata) => unknown;
  write?: (config: RecordValue, value: unknown, metadata: PanelMetadata) => void;
  note?: string;
};
const bindings: Binding[] = [];
const pathId = (m: string, s: string, k: string) => `${m}/${s}/${k}`;
const clone = <T,>(value: T): T => structuredClone(value);
function get(config: RecordValue, path: string): any {
  return path.split(".").reduce((value, key) => value?.[key], config);
}
function put(config: RecordValue, path: string, value: unknown) {
  const parts = path.split(".");
  let target = config;
  for (const key of parts.slice(0, -1)) target = target[key] ??= {};
  target[parts.at(-1)!] = value;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw new Error("Valoarea trebuie să fie pornit/oprit.");
  return value;
}
function integer(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Introdu un număr întreg valid.");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Valoarea trebuie să fie text.");
  return value;
}
function texts(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error("Lista trebuie să conțină numai texte.");
  return value as string[];
}
function choice(map: Record<string, string>, value: unknown) {
  const result = map[text(value)];
  if (result === undefined) throw new Error("Opțiunea nu este acceptată de configurația botului.");
  return result;
}
function direct(m: string, s: string, k: string, path: string, validate: (v: unknown) => unknown = clone, note?: string) {
  bindings.push({ id: pathId(m, s, k), read: (c) => get(c, path), write: (c, v) => put(c, path, validate(v)), note });
}
function threshold(m: string, s: string, k: string, rule: string, canonical: string, aliases: string[] = []) {
  bindings.push({
    id: pathId(m, s, k),
    read: (c) => {
      const values = get(c, `${rule}.thresholds`);
      return [canonical, ...aliases].map((key) => values?.[key]).find((value) => value !== undefined);
    },
    write: (c, v) => {
      const value = integer(v);
      const values = get(c, `${rule}.thresholds`);
      values[canonical] = value;
      for (const alias of aliases) if (alias in values) values[alias] = value;
    },
  });
}
function reference(m: string, s: string, k: string, path: string, kind: "channels" | "roles", many = false) {
  const display = (id: string, meta: PanelMetadata) => meta[kind]?.find((entry) => entry.id === id)?.name ?? id;
  const resolve = (raw: string, meta: PanelMetadata) => {
    const value = raw.trim().replace(/^[#@]/, "");
    if (!value) return null;
    const matches = meta[kind]?.filter((entry) => entry.id === value || entry.name === value) ?? [];
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) throw new Error("Numele este ambiguu. Introdu ID-ul Discord.");
    if (!meta[kind] && /^\d{5,25}$/.test(value)) return value;
    throw new Error("Canalul sau rolul nu există în serverul selectat. Folosește ID-ul Discord corect.");
  };
  bindings.push({
    id: pathId(m, s, k),
    read: (c, meta) => {
      const value = get(c, path);
      if (value === undefined) return undefined;
      return many ? value.map((id: string) => display(id, meta)) : value ? display(value, meta) : "";
    },
    write: (c, value, meta) => put(c, path, many
      ? [...new Set(texts(value).map((v) => resolve(v, meta)).filter(Boolean))]
      : resolve(text(value), meta)),
    note: "Poți folosi numele exact sau ID-ul Discord din acest server.",
  });
}
const actionNames: Record<string, string> = { avert: "warn", mute: "mute", kick: "kick", ban: "ban" };
const reverseAction: Record<string, string> = { warn: "avert", mute: "mute", kick: "kick", ban: "ban" };
function readActions(rule: RecordValue): string[] {
  return [
    ...(rule.deleteMessage ?? rule.action === "delete" ? ["sterge"] : []),
    ...(reverseAction[rule.action] ? [reverseAction[rule.action]!] : []),
  ];
}
function writeActions(rule: RecordValue, value: unknown) {
  const values = texts(value);
  if (new Set(values).size !== values.length || values.some((v) => !["sterge", ...Object.keys(actionNames)].includes(v))) {
    throw new Error("Alerta staff nu este o sancțiune separată în API. Configurează canalul de jurnal.");
  }
  const sanctions = values.filter((v) => v !== "sterge");
  if (sanctions.length > 1) throw new Error("Botul acceptă o singură sancțiune, combinată opțional cu ștergerea mesajului.");
  rule.action = sanctions.length ? actionNames[sanctions[0]!] : values.includes("sterge") ? "delete" : "none";
  rule.deleteMessage = values.includes("sterge");
}
function actions(m: string, s: string, paths: string[]) {
  bindings.push({
    id: pathId(m, s, "acts"),
    read: (c) => {
      const rules = paths.map((p) => get(c, p));
      if (rules.some((r) => !r)) return undefined;
      if (paths.includes("suspiciousBehavior") && rules.some((r) => ["delete", "warn"].includes(r.action))) return undefined;
      const values = rules.map(readActions);
      return values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : undefined;
    },
    write: (c, v) => paths.forEach((p) => {
      if (p === "suspiciousBehavior") {
        const values = texts(v);
        if (values.length > 1 || values.some((value) => !["mute", "kick", "ban"].includes(value))) {
          throw new Error("Monitorizarea suspectă acceptă mute, kick sau ban. Alerta este trimisă separat în canalul configurat.");
        }
        get(c, p).action = values.length ? actionNames[values[0]!] : "none";
      } else writeActions(get(c, p), v);
    }),
    note: "API-ul acceptă ștergere plus o singură sancțiune. Alerta se trimite prin canalul de jurnal; durata mute-ului nu este configurabilă aici.",
  });
}
function groupedBoolean(m: string, s: string, k: string, paths: string[]) {
  bindings.push({
    id: pathId(m, s, k),
    read: (c) => {
      const values = paths.map((p) => get(c, p));
      return values.every((v) => typeof v === "boolean" && v === values[0]) ? values[0] : undefined;
    },
    write: (c, v) => paths.forEach((p) => put(c, p, bool(v))),
  });
}
const modulePaths: Record<string, string> = {
  automod: "autoMod", antispam: "antiSpam", antiflood: "antiSpam",
  antiraid: "antiRaid", suspect: "suspiciousBehavior", judecator: "ai",
  escaladare: "escalation", comenzi: "manualTools", dosare: "cases",
  audit: "audit", jurnale: "activityLog",
};
for (const [m, p] of Object.entries(modulePaths)) direct(m, "", "@on", `${p}.enabled`, bool,
  ["antispam", "antiflood"].includes(m)
    ? "Aceste două grupe din HTML folosesc aceeași activare Anti-Spam a botului; pragurile rămân separate."
    : undefined);
direct("automod", "words", "@on", "autoMod.wordFilter.enabled", bool);
direct("automod", "words", "list", "autoMod.forbiddenWords", texts);
actions("automod", "words", ["autoMod.wordFilter"]);
direct("automod", "links", "@on", "autoMod.linkBlock.enabled", bool);
direct("automod", "links", "domains", "autoMod.forbiddenLinks", texts);
actions("automod", "links", ["autoMod.linkBlock"]);
const linkCategories: Record<string, string> = { invitatii: "discordInvite", social: "social", video: "video", scurte: "shortener", toate: "all" };
bindings.push({
  id: "automod/links/cats",
  read: (c) => c.autoMod?.forbiddenLinkCategories && Object.entries(linkCategories).filter(([, p]) => c.autoMod.forbiddenLinkCategories[p]).map(([k]) => k),
  write: (c, v) => {
    const selected = texts(v);
    if (selected.some((key) => !linkCategories[key])) throw new Error("Categorie de link necunoscută.");
    for (const [key, path] of Object.entries(linkCategories)) c.autoMod.forbiddenLinkCategories[path] = selected.includes(key);
  },
});
direct("automod", "scam", "@on", "autoMod.scamFilter.enabled", bool);
direct("automod", "scam", "phrases", "autoMod.scamPhrases", texts);
bindings.push({
  id: "automod/scam/acts",
  read: (c) => c.autoMod?.scamFilter && readActions(c.autoMod.scamFilter),
  write: (c, v) => {
    const selected = texts(v);
    const allowed: Record<string, string> = { sterge: "delete", mute: "mute", kick: "kick" };
    if (selected.length !== 1 || !allowed[selected[0]!]) throw new Error("Filtrul de scam acceptă exact una: ștergere, mute sau kick.");
    c.autoMod.scamFilter.action = allowed[selected[0]!];
  },
  note: "Filtrul de scam acceptă exact una dintre acțiunile ștergere, mute și kick.",
});
groupedBoolean("automod", "format", "@on", ["autoMod.emojiLimit.enabled", "autoMod.capsLimit.enabled", "autoMod.repeatBlock.enabled"]);
threshold("automod", "format", "emoji", "autoMod.emojiLimit", "emoji", ["limit", "max"]);
threshold("automod", "format", "caps", "autoMod.capsLimit", "capsPercent", ["percent", "limit"]);
threshold("automod", "format", "repeat", "autoMod.repeatBlock", "repeat", ["limit", "max"]);
actions("automod", "format", ["autoMod.emojiLimit", "autoMod.capsLimit", "autoMod.repeatBlock"]);
reference("automod", "", "log", "autoMod.logChannelId", "channels");
for (const [s, p, k, threshold] of [
  ["mentions", "mention", "count", "mentions"], ["emoji", "emoji", "count", "emoji"],
] as const) {
  direct("antispam", s, "@on", `antiSpam.${p}.enabled`, bool);
  bindings.push({
    id: pathId("antispam", s, k),
    read: (c) => [threshold, "limit", "max"].map((key) => get(c, `antiSpam.${p}.thresholds.${key}`)).find((value) => value !== undefined),
    write: (c, v) => {
      const values = get(c, `antiSpam.${p}.thresholds`);
      values[threshold] = integer(v);
      for (const alias of ["limit", "max"]) if (alias in values) values[alias] = integer(v);
    },
  });
}
actions("antispam", "", ["antiSpam.mention", "antiSpam.emoji"]);
reference("antispam", "", "log", "antiSpam.logChannelId", "channels");
for (const [s, p, key] of [["msgs", "message", "messages"], ["edits", "edit", "limit"], ["deletes", "delete", "limit"]] as const) {
  direct("antiflood", s, "@on", `antiSpam.${p}.enabled`, bool);
  threshold("antiflood", s, "count", `antiSpam.${p}`, key, p === "message" ? ["limit", "max"] : [p === "edit" ? "edits" : "deletes", "max"]);
  threshold("antiflood", s, "secs", `antiSpam.${p}`, "windowMs", ["window", "seconds"]);
}
actions("antiflood", "", ["antiSpam.message", "antiSpam.edit", "antiSpam.delete"]);
reference("antiflood", "", "log", "antiSpam.logChannelId", "channels");
direct("antiraid", "", "joins", "antiRaid.joinsPerMinute", integer, "Pragul botului este pe minut; fereastra regulii se configurează separat.");
threshold("antiraid", "", "window", "antiRaid.rule", "windowSeconds");
direct("antiraid", "", "minAge", "antiRaid.accountAgeDays", integer);
direct("antiraid", "", "lock", "antiRaid.lockdown", bool);
reference("antiraid", "", "alert", "antiRaid.alertChannelId", "channels");
direct("antiraid", "rule", "@on", "antiRaid.rule.enabled", bool);
threshold("antiraid", "rule", "count", "antiRaid.rule", "joins", ["limit"]);
actions("antiraid", "rule", ["antiRaid.rule"]);
reference("suspect", "", "alert", "suspiciousBehavior.alertChannelId", "channels");
const sensitivity: Record<string, string> = { scazuta: "low", medie: "medium", ridicata: "high" };
bindings.push({
  id: "suspect//sens",
  read: (c) => Object.entries(sensitivity).find(([, v]) => v === c.suspiciousBehavior?.sensitivity)?.[0],
  write: (c, v) => { c.suspiciousBehavior.sensitivity = choice(sensitivity, v); },
});
const watchKeys: Record<string, string[]> = {
  nick: ["nicknameChanges"], roles: ["roleChanges"], mass: ["massEdits", "massDeletes"],
  waves: ["joinLeaveFlood"], other: ["unusualActivity"],
};
bindings.push({
  id: "suspect//watch",
  read: (c) => c.suspiciousBehavior && Object.entries(watchKeys).filter(([, keys]) => keys.every((key) => c.suspiciousBehavior[key]?.enabled)).map(([key]) => key),
  write: (c, v) => {
    const selected = texts(v);
    if (selected.some((key) => !watchKeys[key])) throw new Error("Categorie de activitate necunoscută.");
    for (const [key, paths] of Object.entries(watchKeys)) for (const path of paths) c.suspiciousBehavior[path].enabled = selected.includes(key);
  },
});
actions("suspect", "", ["suspiciousBehavior"]);
direct("judecator", "", "tone", "ai.tone", (v) => choice({ bland: "calm", neutru: "serious", ferm: "strict" }, v));
bindings[bindings.length - 1]!.read = (c) => ({ calm: "bland", serious: "neutru", strict: "ferm" } as Record<string, string>)[c.ai?.tone];
reference("judecator", "", "exChans", "ai.excludedChannelIds", "channels", true);
reference("judecator", "", "exRoles", "ai.excludedRoleIds", "roles", true);
actions("judecator", "", ["ai"]);
function aiSensitivity(m: string, s: string, paths: string[]) {
  bindings.push({
    id: pathId(m, s, "sens"),
    read: (c) => {
      const values = paths.map((path) => get(c, path) ?? c.ai?.sensitivity);
      return values.every((v) => v === values[0]) ? ({ low: 1, medium: 3, high: 5 } as Record<string, number>)[values[0]] : undefined;
    },
    write: (c, value) => {
      const v = integer(value);
      if (v < 1 || v > 5) throw new Error("Sensibilitatea trebuie să fie între 1 și 5.");
      paths.forEach((path) => put(c, path, v < 3 ? "low" : v === 3 ? "medium" : "high"));
    },
    note: "Botul are trei niveluri reale: 1–2 blând, 3 echilibrat, 4–5 strict. După salvare se afișează nivelul canonic 1/3/5.",
  });
}
aiSensitivity("judecator", "", ["ai.sensitivity"]);
for (const [s, categories] of Object.entries({
  tox: ["toxicity", "profanity"], bully: ["attacks", "bullying"], troll: ["intelligentSpam", "trolling"],
  scam: ["scams"], threat: ["threats"], deceit: ["deceptiveLinks"],
})) {
  groupedBoolean("judecator", s, "@on", categories.map((key) => `ai.categories.${key}`));
  bindings.push({
    id: pathId("judecator", s, "own"),
    read: (c) => c.ai && categories.every((key) => Boolean(c.ai.categorySettings[key] && Object.keys(c.ai.categorySettings[key]).length)),
    write: (c, v) => {
      for (const key of categories) {
        if (bool(v)) c.ai.categorySettings[key] ??= { sensitivity: c.ai.sensitivity, action: c.ai.action, deleteMessage: c.ai.deleteMessage ?? c.ai.action === "delete" };
        else delete c.ai.categorySettings[key];
      }
    },
  });
  aiSensitivity("judecator", s, categories.map((key) => `ai.categorySettings.${key}.sensitivity`));
  bindings.push({
    id: pathId("judecator", s, "acts"),
    read: (c) => {
      if (!c.ai) return undefined;
      const values = categories.map((key) => readActions({ ...c.ai, ...c.ai.categorySettings[key] }));
      return values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : undefined;
    },
    write: (c, v) => categories.forEach((key) => writeActions(c.ai.categorySettings[key] ??= {}, v)),
    note: "Ștergere plus o singură sancțiune, conform configurației reale AI.",
  });
}
direct("escaladare", "", "reset", "escalation.resetAfterDays", integer);
direct("dosare", "", "csv", "cases.allowStaffExport", bool);
bindings.push({
  id: "dosare//keep", read: (c) => c.cases && String(c.cases.retentionDays),
  write: (c, v) => {
    const days = Number(text(v));
    if (!Number.isInteger(days) || days < 1) throw new Error("API-ul nu acceptă păstrarea nelimitată. Alege un număr de zile.");
    c.cases.retentionDays = days;
  },
});
bindings.push({
  id: "audit//level",
  read: (c) => c.audit?.detailLevel === "verbose" ? "extins" : c.audit?.detailLevel,
  write: (c, v) => { c.audit.detailLevel = choice({ minimal: "minimal", standard: "standard", extins: "verbose" }, v); },
});
direct("comenzi", "", "cases", "cases.enabled", bool);
const logCategories: Record<string, string> = { mesaje: "messages", membri: "members", canale: "channels", roluri: "roles", voce: "voice", moderare: "moderation", securitate: "security" };
for (const [s, p] of Object.entries(logCategories)) {
  direct("jurnale", s, "@on", `activityLog.categories.${p}`, bool);
  reference("jurnale", s, "chan", `activityLog.channelIds.${p}`, "channels");
}
for (const [k, p] of [["automod", "autoMod.logChannelId"], ["ai", "ai.logChannelId"], ["spam", "antiSpam.logChannelId"]]) reference("jurnale", "", k!, p!, "channels");
direct("general", "", "tz", "timeProfiles.timezone", text);
direct("general", "", "color", "embeds.color", text);
direct("general", "", "embeds", "embeds.enabled", bool);
reference("general", "", "mods", "permissions.staffRoleIds", "roles", true);

const byId = new Map(bindings.map((binding) => [binding.id, binding]));
function putSource(modules: PanelModules, id: string, value: unknown): boolean {
  const [m, s, k] = id.split("/") as [string, string, string];
  const state = s ? modules[m]?.s?.[s] : modules[m];
  if (!state) return false;
  if (k === "@on") {
    if (typeof value !== "boolean") return false;
    state.on = value;
  } else {
    const template = state.f[k];
    if (template !== undefined && (typeof template !== typeof value || Array.isArray(template) !== Array.isArray(value))) return false;
    state.f[k] = clone(value);
  }
  return true;
}
export function mapPanelSnapshot(defaults: PanelModules, config: RecordValue, metadata: PanelMetadata = {}, bot?: RecordValue): PanelSnapshot {
  const snapshot: PanelSnapshot = { modules: clone(defaults), supported: [], readable: [], notes: {}, log: [] };
  for (const binding of bindings) {
    const value = binding.read(config, metadata);
    if (value === undefined) continue;
    if (!putSource(snapshot.modules, binding.id, value)) continue;
    snapshot.readable.push(binding.id);
    if (binding.write) snapshot.supported.push(binding.id);
    if (binding.note) snapshot.notes[binding.id] = binding.note;
  }
  // A broad Control Bot PUT can publish panels. Show its actual values here,
  // but never trigger those side effects through an autosaving text field.
  const readonly = (m: string, k: string, value: unknown) => {
    if (value === undefined) return;
    const id = pathId(m, "", k);
    if (!putSource(snapshot.modules, id, value)) return;
    snapshot.readable.push(id);
    snapshot.notes[id] = "Valoare reală. Modificarea/publicarea se face în editorul operațional dedicat, nu prin autosalvare.";
  };
  if (bot?.verification) {
    for (const [k, p] of Object.entries({ "@on": "enabled", chan: "channelId", role: "roleId", title: "title", text: "message", button: "buttonLabel", emoji: "buttonEmoji", image: "imageUrl" })) readonly("verificare", k, bot.verification[p]);
  }
  if (bot?.tickets) for (const [m, key] of Object.entries({ aplicatii: "staff", parteneriate: "partnership", ajutor: "help_report", contestatii: "appeal" })) {
    const flow = bot.tickets.flows?.[key];
    if (!flow) continue;
    readonly(m, "chan", bot.tickets.categories?.[key]);
    readonly(m, "image", flow.panelImageUrl ?? "");
    readonly(m, "qs", flow.questions?.map((q: RecordValue) => q.label));
    readonly(m, "notifyRole", bot.tickets.staffReviewRoleId);
    readonly(m, "end", ({ lock: "blocheaza", keep_open: "deschis" } as Record<string, string>)[flow.completionAction]);
    readonly(m, "texts", { panelTitle: flow.title, panelText: flow.panelDescription, button: flow.startButtonLabel, intro: flow.requirementsText, done: flow.completionMessage, staff: flow.staffNotificationMessage });
  }
  snapshot.notes["mesaje//dm"] = "Botul nu trimite mesaje private membrilor; avertismentele rămân în server, conform regulii proiectului.";
  return snapshot;
}
export function applyPanelChanges(config: RecordValue, changes: PanelChange[], metadata: PanelMetadata = {}): RecordValue {
  if (!Array.isArray(changes) || changes.length > 1000) throw new Error("Lista de modificări nu este validă.");
  const next = clone(config);
  for (const change of changes) {
    if (!change || typeof change.m !== "string" || typeof change.s !== "string" || typeof change.k !== "string") throw new Error("Modificare invalidă.");
    const binding = byId.get(pathId(change.m, change.s, change.k));
    if (!binding?.write || binding.read(config, metadata) === undefined) {
      throw new Error("Câmpul nu este conectat la API-ul botului. Nu s-a trimis nicio modificare.");
    }
    binding.write(next, change.value, metadata);
  }
  return next;
}
