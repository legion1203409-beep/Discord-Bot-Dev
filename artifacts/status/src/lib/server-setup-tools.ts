import type { SetupDraft } from "./server-setup";

export type SetupPresetKey = "community" | "gaming" | "support";

export const setupPresets: {
  key: SetupPresetKey;
  name: string;
  description: string;
  draft: SetupDraft;
}[] = [
  {
    key: "community",
    name: "Comunitate",
    description: "Reguli, discuții publice și un spațiu privat pentru staff.",
    draft: {
      roles: [
        { key: "membru", name: "Membru", mode: "new" },
        { key: "moderator", name: "Moderator", mode: "new" },
      ],
      categories: [
        {
          key: "inceput",
          name: "Start aici",
          readers: ["everyone", "moderator"],
          writers: ["moderator"],
          channels: [{
            key: "reguli",
            name: "reguli",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Regulile sunt vizibile tuturor; doar stafful poate scrie.",
          }],
        },
        {
          key: "comunitate",
          name: "Comunitate",
          readers: ["everyone"],
          writers: ["everyone"],
          channels: [{
            key: "general",
            name: "general",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Discuții deschise comunității.",
          }],
        },
        {
          key: "staff",
          name: "Staff",
          readers: ["moderator"],
          writers: ["moderator"],
          channels: [{
            key: "chat-staff",
            name: "staff",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Canal privat pentru echipa de moderare.",
          }],
        },
      ],
      deleteTargets: [],
    },
  },
  {
    key: "gaming",
    name: "Comunitate de joc",
    description: "Canale pentru joc, evenimente, ajutor și staff.",
    draft: {
      roles: [
        { key: "jucator", name: "Jucător", mode: "new" },
        { key: "moderator", name: "Moderator", mode: "new" },
      ],
      categories: [
        {
          key: "inceput",
          name: "Start aici",
          readers: ["everyone", "moderator"],
          writers: ["moderator"],
          channels: [{
            key: "reguli",
            name: "reguli",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Reguli vizibile tuturor; publicarea este rezervată staffului.",
          }],
        },
        {
          key: "aventura",
          name: "Joc",
          readers: ["jucator", "moderator"],
          writers: ["jucator", "moderator"],
          channels: [
            { key: "joc-chat", name: "discutii-joc", readers: [], writers: [], inheritsCategory: true, explanation: "Discuții despre joc." },
            { key: "evenimente", name: "evenimente", readers: [], writers: [], inheritsCategory: true, explanation: "Anunțuri și evenimente pentru jucători." },
          ],
        },
        {
          key: "staff",
          name: "Staff",
          readers: ["moderator"],
          writers: ["moderator"],
          channels: [{
            key: "chat-staff",
            name: "staff",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Coordonare privată pentru staff.",
          }],
        },
      ],
      deleteTargets: [],
    },
  },
  {
    key: "support",
    name: "Ajutor și suport",
    description: "Întrebări vizibile comunității și discuții interne de suport.",
    draft: {
      roles: [
        { key: "membru", name: "Membru", mode: "new" },
        { key: "suport", name: "Echipa suport", mode: "new" },
      ],
      categories: [
        {
          key: "ajutor",
          name: "Ajutor",
          readers: ["everyone"],
          writers: ["everyone"],
          channels: [{
            key: "intrebari",
            name: "intrebari",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Membrii pot cere și oferi ajutor.",
          }],
        },
        {
          key: "intern",
          name: "Suport intern",
          readers: ["suport"],
          writers: ["suport"],
          channels: [{
            key: "coordonare",
            name: "coordonare-suport",
            readers: [],
            writers: [],
            inheritsCategory: true,
            explanation: "Discuție privată pentru echipa de suport.",
          }],
        },
      ],
      deleteTargets: [],
    },
  },
];

export function getSetupPreset(key: SetupPresetKey): SetupDraft {
  const preset = setupPresets.find(item => item.key === key);
  if (!preset) throw new Error("Șablon de server necunoscut.");
  return structuredClone(preset.draft);
}
