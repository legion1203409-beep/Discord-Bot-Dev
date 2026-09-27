export type Threshold = {
  key: string;
  label: string;
  help: string;
  min: number;
  max: number;
  groupKeys: string[];
};

const threshold = (
  key: string,
  label: string,
  help: string,
  min: number,
  max: number,
  groupKeys: string[] = [key],
): Threshold => ({ key, label, help, min, max, groupKeys });

const WINDOW_KEYS = ["windowMs", "window", "seconds"];

export const EMOJI_LIMIT = [
  threshold("emoji", "Emoji", "Număr maxim de emoji.", 1, 200, ["emoji", "limit", "max"]),
  threshold("limit", "Limită emoji (alias)", "Alias compatibil pentru limită.", 1, 200, ["emoji", "limit", "max"]),
  threshold("max", "Maxim emoji (alias)", "Alias compatibil pentru limită.", 1, 200, ["emoji", "limit", "max"]),
];

export const MESSAGE_SPAM = [
  threshold("messages", "Mesaje", "Mesaje până la declanșare.", 1, 1000, ["messages", "limit", "max"]),
  threshold("limit", "Limită mesaje (alias)", "Alias compatibil pentru numărul de mesaje.", 1, 1000, ["messages", "limit", "max"]),
  threshold("max", "Maxim mesaje (alias)", "Alias compatibil pentru numărul de mesaje.", 1, 1000, ["messages", "limit", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
  threshold("seconds", "Secunde (alias)", "Alias compatibil pentru interval.", 1, 3600, WINDOW_KEYS),
];

export const EDIT_SPAM = [
  threshold("edits", "Editări", "Editări până la declanșare.", 1, 1000, ["limit", "edits", "max"]),
  threshold("limit", "Limită editări (alias)", "Alias compatibil pentru numărul de editări.", 1, 1000, ["limit", "edits", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
];

export const DELETE_SPAM = [
  threshold("deletes", "Ștergeri", "Ștergeri până la declanșare.", 1, 1000, ["limit", "deletes", "max"]),
  threshold("limit", "Limită ștergeri (alias)", "Alias compatibil pentru numărul de ștergeri.", 1, 1000, ["limit", "deletes", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
];

export const MENTION_LIMIT = [
  threshold("mentions", "Mențiuni", "Mențiuni într-un mesaj până la declanșare.", 1, 100, ["mentions", "limit", "max"]),
  threshold("limit", "Limită mențiuni (alias)", "Alias compatibil pentru numărul de mențiuni.", 1, 100, ["mentions", "limit", "max"]),
  threshold("max", "Maxim mențiuni (alias)", "Alias compatibil pentru numărul de mențiuni.", 1, 100, ["mentions", "limit", "max"]),
];

export function groupThresholdFields(thresholds: Threshold[]) {
  return thresholds.map((field) => ({
    ...field,
    groupKeys: field.groupKeys.length > 1
      ? field.groupKeys
      : thresholds
        .filter((candidate) => candidate.min === field.min && candidate.max === field.max)
        .map((candidate) => candidate.key),
  })).filter((field, index, fields) =>
    fields.findIndex((candidate) => candidate.groupKeys.join("|") === field.groupKeys.join("|")) === index,
  );
}

export function getAntiSpamThresholdError(config: Record<string, any>): string | null {
  const rules = [
    { name: "Spam de mesaje", rule: config.antiSpam?.message, thresholds: MESSAGE_SPAM },
    { name: "Spam de editări", rule: config.antiSpam?.edit, thresholds: EDIT_SPAM },
    { name: "Spam de ștergeri", rule: config.antiSpam?.delete, thresholds: DELETE_SPAM },
    { name: "Spam de mențiuni", rule: config.antiSpam?.mention, thresholds: MENTION_LIMIT },
    { name: "Spam de emoji", rule: config.antiSpam?.emoji, thresholds: EMOJI_LIMIT },
  ];

  for (const rule of rules) {
    for (const field of groupThresholdFields(rule.thresholds)) {
      const values = field.groupKeys
        .map((key) => rule.rule?.thresholds?.[key])
        .filter((value) => value !== undefined);
      for (const value of values) {
        if (!Number.isFinite(value) || !Number.isInteger(value) || value < field.min || value > field.max) {
          return `${rule.name} — ${field.label}: introdu un număr întreg între ${field.min} și ${field.max}.`;
        }
      }
    }
  }

  return null;
}