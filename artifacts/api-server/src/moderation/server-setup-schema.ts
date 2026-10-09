import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const name = z.string().trim().min(1).max(100).refine(n => !n.includes("@"), "Mențiunile nu sunt permise.");
export const setupDraftSchema = z.object({
  roles: z.array(z.object({ key, name }).strict()).max(20),
  categories: z.array(z.object({
    key, name,
    channels: z.array(z.object({
      key,
      name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
      readers: z.array(key).max(21),
      writers: z.array(key).max(21),
      explanation: z.string().max(400),
    }).strict()).max(30),
  }).strict()).max(10),
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
  const roles = new Set(["everyone", ...draft.roles.map(r => r.key)]);
  for (const ch of draft.categories.flatMap(c => c.channels)) {
    if ([...ch.readers, ...ch.writers].some(r => !roles.has(r)) ||
        ch.writers.some(r => !ch.readers.includes(r)))
      ctx.addIssue({ code: "custom", message: "Scrierea necesită citire, iar rolurile trebuie să existe în draft." });
  }
});
export type SetupDraft = z.infer<typeof setupDraftSchema>;
export const setupDraftSaveSchema = z.object({
  draft: setupDraftSchema,
  expectedRevision: z.number().int().min(0),
}).strict();
export type SetupDraftSaveInput = z.infer<typeof setupDraftSaveSchema>;
export type SavedSetupDraft = {
  draft: SetupDraft;
  revision: number;
  updatedAt: string;
};
export const setupTemplate: SetupDraft = {
  roles: [
    { key: "admin", name: "Administrator" }, { key: "mod", name: "Moderator" },
    { key: "member", name: "Membru" }, { key: "new", name: "Nou venit" },
  ],
  categories: [
    { key: "start", name: "Start aici", channels: [
      { key: "rules", name: "reguli", readers: ["everyone", "admin", "mod"], writers: ["admin", "mod"], explanation: "Toți pot citi; doar stafful poate scrie." },
    ] },
    { key: "community", name: "Comunitate", channels: [
      { key: "general", name: "general", readers: ["everyone"], writers: ["everyone"], explanation: "Discuții deschise comunității." },
    ] },
    { key: "game", name: "Joc", channels: [
      { key: "gaming", name: "discutii-joc", readers: ["member", "admin", "mod"], writers: ["member", "admin", "mod"], explanation: "Acces pentru membri și staff." },
    ] },
    { key: "staff", name: "Staff", channels: [
      { key: "staffchat", name: "staff", readers: ["admin", "mod"], writers: ["admin", "mod"], explanation: "Canal privat pentru staff." },
    ] },
  ],
};
