import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const snowflake = z.string().regex(/^\d{5,25}$/);
const name = z.string().trim().min(1).max(100).refine(n => !n.includes("@"), "Mențiunile nu sunt permise.");
export const setupDraftSchema = z.object({
  roles: z.array(z.object({
    key,
    name,
    mode: z.enum(["new", "existing"]).default("new"),
    discordId: snowflake.optional(),
  }).strict().superRefine((role, ctx) => {
    if ((role.mode === "existing") !== Boolean(role.discordId))
      ctx.addIssue({ code: "custom", message: "Rolurile existente trebuie legate prin ID; rolurile noi nu pot avea ID Discord." });
  })).max(20),
  categories: z.array(z.object({
    key, name,
    discordId: snowflake.optional(),
    readers: z.array(key).max(21).default([]),
    writers: z.array(key).max(21).default([]),
    channels: z.array(z.object({
      key,
      name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
      readers: z.array(key).max(21),
      writers: z.array(key).max(21),
      inheritsCategory: z.boolean().default(false),
      discordId: snowflake.optional(),
      explanation: z.string().max(400),
    }).strict()).max(30),
  }).strict()).max(10),
  deleteTargets: z.array(z.object({
    id: snowflake,
    kind: z.enum(["category", "channel"]),
  }).strict()).max(20).default([]),
}).strict().superRefine((draft, ctx) => {
  const keys = new Set<string>();
  const unique = (values: string[]) => new Set(values.map(v => v.toLowerCase())).size === values.length;
  for (const item of [...draft.roles, ...draft.categories, ...draft.categories.flatMap(c => c.channels)]) {
    if (keys.has(item.key) || item.key === "everyone") ctx.addIssue({ code: "custom", message: "Cheile trebuie să fie unice; everyone este rezervat." });
    keys.add(item.key);
  }
  if (!unique(draft.roles.map(r => r.name)) || !unique(draft.categories.map(c => c.name)) ||
      !unique(draft.categories.flatMap(c => c.channels.map(ch => ch.name))))
    ctx.addIssue({ code: "custom", message: "Numele resurselor din același grup trebuie să fie unice." });
  if (new Set(draft.roles.filter(r => r.mode === "existing").map(r => r.discordId)).size !== draft.roles.filter(r => r.mode === "existing").length)
    ctx.addIssue({ code: "custom", message: "Un rol Discord poate fi selectat o singură dată." });
  if (new Set(draft.categories.filter(c => c.discordId).map(c => c.discordId)).size !== draft.categories.filter(c => c.discordId).length)
    ctx.addIssue({ code: "custom", message: "O categorie Discord poate fi selectată o singură dată." });
  const channelIds = draft.categories.flatMap(c => c.channels.filter(ch => ch.discordId).map(ch => ch.discordId));
  if (new Set(channelIds).size !== channelIds.length)
    ctx.addIssue({ code: "custom", message: "Un canal Discord poate fi selectat o singură dată." });
  if (new Set(draft.deleteTargets.map(t => t.id)).size !== draft.deleteTargets.length)
    ctx.addIssue({ code: "custom", message: "O resursă nu poate fi selectată de două ori pentru ștergere." });
  const roles = new Set(["everyone", ...draft.roles.map(r => r.key)]);
  for (const category of draft.categories) {
    const categoryRules = { readers: category.readers, writers: category.writers };
    for (const rules of [categoryRules, ...category.channels.filter(ch => !ch.inheritsCategory)]) {
      if ([...rules.readers, ...rules.writers].some(r => !roles.has(r)) ||
          rules.writers.some(r => !rules.readers.includes(r)))
        ctx.addIssue({ code: "custom", message: "Scrierea necesită citire, iar rolurile trebuie să existe în draft." });
    }
  }
});
export type SetupDraft = z.infer<typeof setupDraftSchema>;
export const setupDraftSaveSchema = z.object({
  draft: setupDraftSchema,
  expectedRevision: z.number().int().min(0),
}).strict();
export type SetupDraftSaveInput = z.input<typeof setupDraftSaveSchema>;
export type SavedSetupDraft = {
  draft: SetupDraft;
  revision: number;
  updatedAt: string;
};
export const setupTemplate: SetupDraft = {
  roles: [
    { key: "admin", name: "Administrator", mode: "new" }, { key: "mod", name: "Moderator", mode: "new" },
    { key: "member", name: "Membru", mode: "new" }, { key: "new", name: "Nou venit", mode: "new" },
  ],
  categories: [
    { key: "start", name: "Start aici", readers: ["everyone", "admin", "mod"], writers: ["admin", "mod"], channels: [
      { key: "rules", name: "reguli", readers: [], writers: [], inheritsCategory: true, explanation: "Toți pot citi; doar stafful poate scrie." },
    ] },
    { key: "community", name: "Comunitate", readers: ["everyone"], writers: ["everyone"], channels: [
      { key: "general", name: "general", readers: [], writers: [], inheritsCategory: true, explanation: "Discuții deschise comunității." },
    ] },
    { key: "game", name: "Joc", readers: ["member", "admin", "mod"], writers: ["member", "admin", "mod"], channels: [
      { key: "gaming", name: "discutii-joc", readers: [], writers: [], inheritsCategory: true, explanation: "Acces pentru membri și staff." },
    ] },
    { key: "staff", name: "Staff", readers: ["admin", "mod"], writers: ["admin", "mod"], channels: [
      { key: "staffchat", name: "staff", readers: [], writers: [], inheritsCategory: true, explanation: "Canal privat pentru staff." },
    ] },
  ],
  deleteTargets: [],
};
