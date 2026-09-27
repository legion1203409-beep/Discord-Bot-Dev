export const MANUAL_COMMAND_CATALOG = [
  { key: "warn", label: "Avertisment (Warn)", group: "sanctions", target: "user" },
  { key: "mute", label: "Restricționare (Mute)", group: "sanctions", target: "user", extraField: "durationMinutes" },
  { key: "unmute", label: "Ridicare restricție (Unmute)", group: "sanctions", target: "user" },
  { key: "kick", label: "Eliminare (Kick)", group: "sanctions", target: "user" },
  { key: "ban", label: "Blocare (Ban)", group: "sanctions", target: "user" },
  { key: "nick", label: "Schimbă porecla", group: "members", target: "user", extraField: "nickname" },
  { key: "role", label: "Acordă rol", group: "members", target: "user", extraField: "roleId" },
  { key: "purge", label: "Șterge mesaje (Purge)", group: "channels", target: "channel", extraField: "purgeAmount" },
  { key: "slowmode", label: "Setează Slowmode", group: "channels", target: "channel", extraField: "slowmodeAmount" },
  { key: "lock", label: "Închide canal (Lock)", group: "channels", target: "channel" },
  { key: "unlock", label: "Deschide canal (Unlock)", group: "channels", target: "channel" },
] as const;

export const MANUAL_COMMAND_GROUPS = [
  { key: "sanctions", label: "Sancțiuni" },
  { key: "members", label: "Administrare membri" },
  { key: "channels", label: "Canale și mesaje" },
] as const;

export type ManualCommandKey = typeof MANUAL_COMMAND_CATALOG[number]["key"];

export const MANUAL_COMMAND_KEYS = MANUAL_COMMAND_CATALOG.map(({ key }) => key) as [
  ManualCommandKey,
  ...ManualCommandKey[],
];

export const MANUAL_COMMAND_GROUPS_WITH_COMMANDS = MANUAL_COMMAND_GROUPS.map((group) => ({
  ...group,
  commands: MANUAL_COMMAND_CATALOG.filter((command) => command.group === group.key),
}));

export function getManualCommandDefinition(key: ManualCommandKey) {
  return MANUAL_COMMAND_CATALOG.find((command) => command.key === key)!;
}