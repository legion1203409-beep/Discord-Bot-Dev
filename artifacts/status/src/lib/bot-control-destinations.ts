import type { BotControlConfig } from "../hooks/use-moderation-api";

export const DESTINATION_CLEAR_CATEGORIES = [
  {
    key: "gameplay",
    label: "Joc și evenimente",
    description: "Cufere, Ora Umbrelor, boss, negustor și clasamente.",
    confirmationDetails: "Rutele de joc și evenimente nu vor mai avea destinații configurate.",
  },
  {
    key: "admin",
    label: "Administrare și tichete",
    description: "Consiliu, Frăție, categorii de tichete și anunțuri de alianță.",
    confirmationDetails: "Destinațiile administrative și de tichete vor rămâne neconfigurate.",
  },
  {
    key: "reports",
    label: "Rapoarte și invitații",
    description: "Statistici zilnice, jurnal și rapoarte despre invitații.",
    confirmationDetails: "Urmărirea invitațiilor și publicarea rapoartelor vor fi dezactivate.",
  },
  {
    key: "memberMessages",
    label: "Mesaje membri",
    description: "Canalul pentru mesajele de bun venit și plecare.",
    confirmationDetails: "Mesajele de bun venit și plecare vor fi dezactivate.",
  },
  {
    key: "verification",
    label: "Verificare",
    description: "Canalul și publicarea panoului de verificare.",
    confirmationDetails: "Verificarea va fi dezactivată.",
  },
] as const;

export type DestinationClearCategory = (typeof DESTINATION_CLEAR_CATEGORIES)[number]["key"];
export type DestinationClearScope = DestinationClearCategory | "all";

const ALL_CHANNEL_KEYS = [
  "main",
  "event",
  "boss",
  "trader",
  "eventTop",
  "bossTop",
  "council",
  "fratia",
] as const;

export function clearBotControlDestinations(
  config: BotControlConfig,
  scope: DestinationClearScope,
): BotControlConfig {
  const includes = (category: DestinationClearCategory) => scope === "all" || scope === category;
  const channelUpdates: Record<string, string> = {};

  if (includes("gameplay")) {
    Object.assign(channelUpdates, {
      main: "",
      event: "",
      boss: "",
      trader: "",
      eventTop: "",
      bossTop: "",
    });
  }
  if (includes("admin")) {
    Object.assign(channelUpdates, { council: "", fratia: "" });
  }

  const channels = scope === "all"
    ? Object.fromEntries(
        Array.from(
          new Set([...ALL_CHANNEL_KEYS, ...Object.keys(config.channels)]),
          (key): [string, string] => [key, ""],
        ),
      )
    : { ...config.channels, ...channelUpdates };

  return {
    ...config,
    channels,
    verification: includes("verification")
      ? { ...config.verification, enabled: false, channelId: "" }
      : config.verification,
    tickets: includes("admin")
      ? {
          ...config.tickets,
          categories: { staff: "", partnership: "", help_report: "" },
          alliancePublicChannelId: "",
        }
      : config.tickets,
    gameplayConfig: includes("memberMessages")
      ? {
          ...config.gameplayConfig,
          memberMessages: {
            ...config.gameplayConfig.memberMessages,
            welcomeEnabled: false,
            leaveEnabled: false,
            channelId: "",
          },
        }
      : config.gameplayConfig,
    dailyStats: includes("reports")
      ? { ...config.dailyStats, channelId: "" }
      : config.dailyStats,
    inviteTracking: includes("reports")
      ? {
          ...config.inviteTracking,
          enabled: false,
          joinLogChannelId: "",
          reportChannelId: "",
          reportEnabled: false,
        }
      : config.inviteTracking,
  };
}