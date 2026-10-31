/**
 * Logica paginii Verificare, fără React: modulele grupului (Setări, Mesaje,
 * Membri), rolurile primite la verificare (rolul standard și rolurile în plus,
 * de exemplu un rol de categorie), lista membrilor cu rolurile care le lipsesc,
 * rezumatele din meniu și verificările de dinainte de salvare.
 *
 * Ce scrie pagina este ce citește botul: api-server/src/bot/verification.ts
 * (roleId marchează un membru verificat; extraRoleIds se dau împreună cu el, la
 * buton și la verificarea manuală) și rutele de verificare din router.ts.
 */
import { VERIFICATION_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId } from "./model";

export { VERIFICATION_ROUTE, isVerificationRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type VerificationModuleId = keyof typeof VERIFICATION_MODULE_ROUTES;

export type VerificationModuleDef = {
  id: VerificationModuleId;
  route: string;
  short: string;
  title: string;
  description: string;
  configKey?: "verification";
  switchLabel?: string;
  /** What the module edits; a change in any of these marks it unsaved in the menu. */
  paths: readonly string[];
};

const SETTINGS_PATHS = ["verification.enabled", "verification.channelId", "verification.roleId", "verification.extraRoleIds", "verification.panelMessageId"];
const MESSAGE_PATHS = [
  "verification.title", "verification.message", "verification.buttonLabel", "verification.buttonEmoji",
  "verification.imageUrl", "verification.thumbnailUrl", "verification.alreadyVerifiedMessage",
];

export const VERIFICATION_MODULES: readonly VerificationModuleDef[] = [
  {
    id: "settings", route: VERIFICATION_MODULE_ROUTES.settings, short: "Setări", title: "Verificarea membrilor",
    description: "Membrii noi apasă un buton din Discord, își confirmă contul pe site și primesc rolurile alese aici.",
    configKey: "verification", switchLabel: "Activează verificarea", paths: SETTINGS_PATHS,
  },
  {
    id: "messages", route: VERIFICATION_MODULE_ROUTES.messages, short: "Mesaje", title: "Mesajele verificării",
    description: "Ce scrie pe panoul din Discord, ce scrie pe buton și ce află membrul după ce se verifică.",
    paths: MESSAGE_PATHS,
  },
  {
    id: "members", route: VERIFICATION_MODULE_ROUTES.members, short: "Membri", title: "Membrii serverului",
    description: "Cine e verificat, cine nu și cui îi lipsesc roluri. Îi verifici tu: unul câte unul, pe cei bifați sau pe toți din listă.",
    paths: [],
  },
];

export function verificationModuleForRoute(path: string): VerificationModuleDef {
  const clean = cleanPath(path);
  return VERIFICATION_MODULES.find((module) => module.route === clean) ?? VERIFICATION_MODULES[0]!;
}

const changedPath = (saved: any, draft: any) => (path: string) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split(".")));

export function isVerificationModuleChanged(module: VerificationModuleDef, saved: any, draft: any): boolean {
  return module.paths.some(changedPath(saved, draft));
}

/** What the save bar lists as unsaved. */
export function changedVerificationParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  if (!saved || !draft) return [];
  const parts: Array<{ key: string; label: string }> = [];
  if (SETTINGS_PATHS.some(changedPath(saved, draft))) parts.push({ key: "settings", label: "Setările verificării" });
  if (MESSAGE_PATHS.some(changedPath(saved, draft))) parts.push({ key: "messages", label: "Mesajele verificării" });
  return parts;
}

/* ------------------------------------------------------------------ */
/* Textele panoului                                                    */
/* ------------------------------------------------------------------ */

/** The texts of a server that never changed them (bot/verification.ts, DEFAULT_VERIFICATION_CONFIG). */
export const DEFAULT_VERIFICATION_TEXT = {
  title: "Verifică-ți contul",
  message: "Apasă butonul de mai jos pentru a confirma că deții contul Discord și pentru a primi rolul comunității.",
  buttonLabel: "Verifică-mă",
  buttonEmoji: "✅",
  successMessage: "Contul tău a fost verificat. Rolul a fost acordat.",
  alreadyVerifiedMessage: "Contul tău este deja verificat.",
  imageUrl: "",
  thumbnailUrl: "",
} as const;

type TextKey = "title" | "message" | "buttonLabel" | "buttonEmoji" | "alreadyVerifiedMessage";

/** Each text with its name on the page, its limit and whether it may stay empty (as the server checks them). */
export const VERIFICATION_TEXTS: ReadonlyArray<{ key: TextKey; label: string; max: number; optional?: boolean }> = [
  { key: "title", label: "Titlul", max: 256 },
  { key: "message", label: "Textul panoului", max: 4_000 },
  { key: "buttonLabel", label: "Textul butonului", max: 80 },
  { key: "buttonEmoji", label: "Emoji pe buton", max: 100, optional: true },
  { key: "alreadyVerifiedMessage", label: "Mesajul pentru cine e deja verificat", max: 2_000 },
];

/** An image the server accepts: empty, an HTTPS link or a picture uploaded in the panel. */
export function isMessageImageUrl(value: string): boolean {
  return value === "" || /^https:\/\/\S+$/i.test(value) || /^\/api\/storage\/objects\/[a-zA-Z0-9/_-]+$/.test(value);
}

/* ------------------------------------------------------------------ */
/* Rolurile primite                                                    */
/* ------------------------------------------------------------------ */

/** At most this many roles are given in addition to the standard one (MAX_VERIFICATION_EXTRA_ROLES). */
export const MAX_EXTRA_ROLES = 10;

export type VerificationRole = {
  id: string; name: string; position?: number; managed?: boolean;
  color?: string | null; assignable?: boolean; elevated?: boolean;
};

export function extraRoleIdsOf(config: any): string[] {
  const ids = config?.verification?.extraRoleIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** The roles a member receives: the standard one first, then the extra ones. */
export function verificationRoleIds(config: any): string[] {
  const roleId = typeof config?.verification?.roleId === "string" ? config.verification.roleId : "";
  return [...(roleId ? [roleId] : []), ...extraRoleIdsOf(config).filter((id) => id !== roleId)];
}

/**
 * A category role is a separator in the member list and on profiles, such as
 * „━━━ MEMBRI ━━━” or „──── Ranguri ────”: its name starts or ends with a line.
 */
const LINE_CHARACTERS = "━─═▬▭—–\\-_~=•·⋆✦❖◆◇★☆⊱⊰┃│┆┊⸻⎯";
const CATEGORY_NAME = new RegExp(`^\\s*[${LINE_CHARACTERS}]{2,}|[${LINE_CHARACTERS}]{2,}\\s*$`, "u");
export function isCategoryRoleName(name: string): boolean {
  return CATEGORY_NAME.test(name);
}

/** The name of a category role without its lines, for a compact label. */
export function categoryRoleLabel(name: string): string {
  const stripped = name.replace(new RegExp(`[${LINE_CHARACTERS}]+`, "gu"), " ").replace(/\s+/g, " ").trim();
  return stripped || name.trim();
}

export type RoleProblem = { text: string; blocking: boolean };

/**
 * Why the bot cannot give a role (blocking), or why giving it may surprise
 * (not blocking). The server checks the same for the extra roles
 * (extraRoleProblem) and for the standard role (verificationRoleFor).
 */
export function roleProblem(role: VerificationRole | undefined, kind: "standard" | "extra", rolesKnown: boolean): RoleProblem | null {
  if (!role) return rolesKnown ? { text: "Rolul nu mai există pe server.", blocking: true } : null;
  if (role.managed) return { text: "Rolul aparține unei integrări; botul nu îl poate da.", blocking: true };
  if (role.elevated && kind === "extra") return { text: "Rolul are drepturi de staff; nu se dă la verificare.", blocking: true };
  if (role.assignable === false) {
    return { text: "Botul nu poate da rolul: e deasupra rolului botului sau botul nu are Manage Roles. Mută rolul botului mai sus.", blocking: true };
  }
  if (role.elevated) return { text: "Rolul are drepturi de staff: oricine se verifică le primește.", blocking: false };
  return null;
}

/** The roles that may be added as extra roles: neither the standard one, nor integrations, nor staff roles. */
export function extraRoleCandidates(roles: VerificationRole[] | undefined, standardId: string): VerificationRole[] | undefined {
  if (!roles) return undefined;
  return roles
    .filter((role) => role.id !== standardId && !role.managed && !role.elevated)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || a.name.localeCompare(b.name, "ro"));
}

export type ProfileRole = { id: string; name: string; color: string | null; category: boolean; standard: boolean; known: boolean };

/** The roles as they appear on the member's profile: highest first, as Discord orders them. */
export function profileRoles(roles: VerificationRole[] | undefined, standardId: string, extraIds: readonly string[]): ProfileRole[] {
  const byId = new Map((roles ?? []).map((role) => [role.id, role]));
  return [...(standardId ? [standardId] : []), ...extraIds.filter((id) => id !== standardId)]
    .map((id) => {
      const role = byId.get(id);
      return {
        id, name: role?.name ?? `Rol ${id}`, color: role?.color ?? null,
        category: Boolean(role && isCategoryRoleName(role.name)), standard: id === standardId, known: Boolean(role),
        position: role?.position ?? -1,
      };
    })
    .sort((a, b) => b.position - a.position)
    .map(({ position: _position, ...role }) => role);
}

export function rolesSummary(config: any): string {
  const extra = extraRoleIdsOf(config).filter((id) => id !== config?.verification?.roleId).length;
  if (!config?.verification?.roleId) return "Fără rol standard";
  return extra ? `Rolul standard + ${countLabel(extra, "rol", "roluri")} în plus` : "Doar rolul standard";
}

export function settingsSummary(config: any): string {
  if (!config?.verification?.enabled) return "Oprită";
  return config.verification.panelMessageId ? "Pornită · panou publicat" : "Pornită · panou nepublicat";
}

export function messagesSummary(config: any): string {
  const label = String(config?.verification?.buttonLabel ?? "").trim();
  return label ? `Butonul „${label.length > 22 ? `${label.slice(0, 21)}…` : label}”` : "Fără text pe buton";
}

/* ------------------------------------------------------------------ */
/* Membrii                                                             */
/* ------------------------------------------------------------------ */

export type MemberRecord = {
  id: string; displayName: string; username: string; avatarUrl: string; joinedAt: string | Date | null;
  verified: boolean; roleIds?: string[];
};

export type MemberFilter = "all" | "verified" | "unverified" | "missing";

/** The verification roles a member does not have yet (the standard one first). */
export function missingRoleIds(member: MemberRecord, required: readonly string[]): string[] {
  const has = new Set(member.roleIds ?? []);
  return required.filter((id) => !has.has(id));
}

/** Verified members that still miss one of the extra roles. */
export function isMissingExtras(member: MemberRecord, required: readonly string[]): boolean {
  return member.verified && missingRoleIds(member, required).length > 0;
}

export function memberCounts(members: readonly MemberRecord[], required: readonly string[]) {
  let verified = 0;
  let missing = 0;
  for (const member of members) {
    if (member.verified) verified += 1;
    if (isMissingExtras(member, required)) missing += 1;
  }
  return { all: members.length, verified, unverified: members.length - verified, missing };
}

export function filterMembers(members: readonly MemberRecord[], filter: MemberFilter, search: string, required: readonly string[]): MemberRecord[] {
  const query = search.trim().toLocaleLowerCase("ro");
  return members.filter((member) => {
    if (filter === "verified" && !member.verified) return false;
    if (filter === "unverified" && member.verified) return false;
    if (filter === "missing" && !isMissingExtras(member, required)) return false;
    if (!query) return true;
    return [member.displayName, member.username, member.id].some((value) => value.toLocaleLowerCase("ro").includes(query));
  });
}

/**
 * How often the member list reloads by itself while the page is visible. The
 * server reads every member from Discord each time, so big servers reload less often.
 */
export function liveRefreshMs(total: number | undefined): number {
  if (!total || total <= 2_000) return 15_000;
  if (total <= 10_000) return 45_000;
  return 120_000;
}

/** At most this many members go in one request (MAX_MANUAL_VERIFICATION_MEMBERS on the server). */
export const MEMBERS_PER_REQUEST = 25;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export type GrantTotals = { verified: number; updated: number; unchanged: number; failed: number };

/** "2 membri verificați acum · 1 membru a primit rolurile lipsă · la 1 membru nu a mers" */
export function describeGrantTotals(totals: GrantTotals): string {
  const members = (count: number) => countLabel(count, "membru", "membri");
  const parts: string[] = [];
  if (totals.verified) parts.push(`${countLabel(totals.verified, "membru verificat", "membri verificați")} acum`);
  if (totals.updated) parts.push(`${members(totals.updated)} ${totals.updated === 1 ? "a primit" : "au primit"} rolurile lipsă`);
  if (totals.unchanged) parts.push(`${members(totals.unchanged)} ${totals.unchanged === 1 ? "avea" : "aveau"} deja tot`);
  if (totals.failed) parts.push(`la ${members(totals.failed)} nu a mers`);
  return parts.join(" · ") || "Nimic de schimbat.";
}

/** The label of the button that verifies the selected members. */
export function grantButtonLabel(selected: readonly MemberRecord[]): string {
  if (!selected.length) return "Bifează membri";
  const unverified = selected.filter((member) => !member.verified).length;
  if (unverified === selected.length) return `Verifică ${countLabel(selected.length, "membru", "membri")}`;
  if (unverified === 0) return `Dă rolurile lipsă (${countLabel(selected.length, "membru", "membri")})`;
  return `Verifică și dă rolurile (${countLabel(selected.length, "membru", "membri")})`;
}

/* ------------------------------------------------------------------ */
/* Înainte de salvare                                                  */
/* ------------------------------------------------------------------ */

/** The first problem that would make the server refuse the verification, or null. */
export function verificationDraftError(config: any): string | null {
  const verification = config?.verification;
  if (!verification) return null;
  const channelId = String(verification.channelId ?? "");
  const roleId = String(verification.roleId ?? "");
  if (channelId && !isDiscordId(channelId)) return `Setări — Canalul panoului: „${channelId}” nu este un ID Discord.`;
  if (roleId && !isDiscordId(roleId)) return `Setări — Rolul standard: „${roleId}” nu este un ID Discord.`;
  if (verification.enabled && !channelId) return "Setări — Alege canalul în care apare panoul, sau oprește verificarea.";
  if (verification.enabled && !roleId) return "Setări — Alege rolul standard pe care îl primește un membru verificat, sau oprește verificarea.";
  const extras = extraRoleIdsOf(config);
  if (extras.length > MAX_EXTRA_ROLES) return `Setări — Poți da cel mult ${MAX_EXTRA_ROLES} roluri în plus.`;
  const badExtra = extras.find((id) => !isDiscordId(id));
  if (badExtra) return `Setări — Roluri în plus: „${badExtra}” nu este un ID Discord.`;
  for (const text of VERIFICATION_TEXTS) {
    const value = String(verification[text.key] ?? "").trim();
    if (!value && !text.optional) return `Mesaje — ${text.label} nu poate fi gol.`;
    if (value.length > text.max) return `Mesaje — ${text.label} are ${value.length} de caractere; cel mult ${text.max}.`;
  }
  for (const [key, label] of [["imageUrl", "Imaginea mare"], ["thumbnailUrl", "Imaginea mică"]] as const) {
    const value = String(verification[key] ?? "").trim();
    if (!isMessageImageUrl(value)) return `Mesaje — ${label}: folosește un link HTTPS sau încarcă o imagine.`;
  }
  return null;
}
