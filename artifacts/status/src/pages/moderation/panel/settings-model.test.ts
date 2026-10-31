import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  DEFAULT_DM, DEFAULT_EMBEDS, SETTINGS_MODULES, changedWelcomeParts, dmOf, dmPreview, embedsOf, isSettingsModuleChanged, isSettingsModuleOn,
  isSettingsRoute, memberMessagesOf, permissionsOf, renderTemplate, settingsDraftError, settingsModuleForRoute, settingsModuleSummary, welcomeDraftError,
} from "./settings-model";

const moderation = (change: Record<string, unknown> = {}) => ({
  permissions: { staffRoleIds: ["200000001"], allowManageGuild: true, allowAdminsSettings: false },
  embeds: { ...DEFAULT_EMBEDS },
  sanctionDm: { ...DEFAULT_DM },
  ...change,
});
const bot = (memberMessages: Record<string, unknown> = {}) => ({
  gameplayConfig: { memberMessages: { welcomeEnabled: false, leaveEnabled: false, channelId: "", style: "normal", customStyle: "", ...memberMessages } },
});

describe("the bot settings group", () => {
  it("is its own page, with four modules", () => {
    expect(SETTINGS_MODULES.map((module) => module.route)).toEqual(["/setari/acces", "/setari/notificari", "/setari/privat", "/setari/bun-venit"]);
    expect(settingsModuleForRoute("/setari").id).toBe("access");
    expect(settingsModuleForRoute("/setari/privat/").id).toBe("dm");
    expect(isSettingsRoute("/setari/bun-venit")).toBe(true);
    expect(isSettingsRoute("/config")).toBe(false);
    expect(panelGroupRoute("/setari/notificari")).toBe("/setari");
    expect(isWidePanelRoute("/setari")).toBe(true);
  });

  it("reads older settings with the defaults; the private message is off", () => {
    expect(dmOf({})).toEqual(DEFAULT_DM);
    expect(DEFAULT_DM.enabled).toBe(false);
    expect(embedsOf({ embeds: { color: "#FF6B3D" } })).toMatchObject({ color: "#FF6B3D", style: "plain", enabled: false });
    expect(permissionsOf({})).toEqual({ staffRoleIds: [], allowManageGuild: true });
    expect(memberMessagesOf(null)).toMatchObject({ welcomeEnabled: false, style: "normal" });
  });

  it("marks only the changed module, in either draft", () => {
    const saved = moderation();
    const draft = moderation({ sanctionDm: { ...DEFAULT_DM, enabled: true } });
    expect(SETTINGS_MODULES.filter((module) => module.source === "config" && isSettingsModuleChanged(module, saved, draft)).map((module) => module.id)).toEqual(["dm"]);
    expect(changedWelcomeParts(bot(), bot({ welcomeEnabled: true }))).toEqual([{ key: "welcome", label: "Bun venit și plecare" }]);
    expect(changedWelcomeParts(bot(), bot())).toEqual([]);
  });

  it("sums up each module in the menu", () => {
    const config = moderation({ embeds: { ...DEFAULT_EMBEDS, enabled: true, style: "detailed" }, sanctionDm: { ...DEFAULT_DM, enabled: true, actions: ["kick", "ban"], automatic: false } });
    expect(settingsModuleSummary("access", config, null)).toBe("1 rol staff · Manage Server");
    expect(settingsModuleSummary("notices", config, null)).toBe("embed · detaliat");
    expect(settingsModuleSummary("notices", moderation(), null)).toBe("text simplu");
    expect(settingsModuleSummary("dm", config, null)).toBe("2 sancțiuni");
    expect(settingsModuleSummary("dm", moderation(), null)).toBe("oprite");
    expect(settingsModuleSummary("welcome", config, null)).toBe("se încarcă…");
    expect(settingsModuleSummary("welcome", config, bot({ welcomeEnabled: true, channelId: "300000001" }))).toBe("doar la intrare");
    expect(isSettingsModuleOn("dm", config, null)).toBe(true);
    expect(isSettingsModuleOn("welcome", config, bot())).toBe(false);
  });

  it("fills a notification as the bot does", () => {
    expect(renderTemplate("🛡️ {action}: {reason} ({unknown})")).toBe("🛡️ Timeout aplicat: Spam: 6 mesaje în 5 secunde ({unknown})");
  });

  it("shows the private message with the right appeal text for each sanction", () => {
    const config = moderation({ sanctionDm: { ...DEFAULT_DM, enabled: true, showReason: false, appealUrl: "https://apel.example.com" } });
    const mute = dmPreview(config, "mute", "Regatul");
    expect(mute.title).toBe("🔇 Ai primit timeout");
    expect(mute.fields.map((field) => field.name)).toEqual(["Durată", "ID-ul cazului", "Contestație"]);
    expect(mute.fields.at(-1)!.value).toContain("deschide pe Regatul un tichet de contestație");
    const ban = dmPreview(config, "ban", "Regatul");
    expect(ban.fields.at(-1)!.value).toContain("administrator al serverului Regatul");
    expect(ban.appealUrl).toBe("https://apel.example.com");
  });

  it("stops a save the server would refuse", () => {
    expect(settingsDraftError(moderation())).toBeNull();
    expect(settingsDraftError(moderation({ embeds: { ...DEFAULT_EMBEDS, color: "rosu" } }))).toContain("Culoarea");
    expect(settingsDraftError(moderation({ embeds: { ...DEFAULT_EMBEDS, animations: true } }))).toContain(".gif");
    expect(settingsDraftError(moderation({ embeds: { ...DEFAULT_EMBEDS, iconUrl: "http://localhost/a.png" } }))).toContain("HTTPS");
    expect(settingsDraftError(moderation({ sanctionDm: { ...DEFAULT_DM, enabled: true, actions: [] } }))).toContain("cel puțin o sancțiune");
    expect(settingsDraftError(moderation({ sanctionDm: { ...DEFAULT_DM, appealUrl: "ftp://x" } }))).toContain("HTTPS");
    // Only the sections about to be sent are checked.
    expect(settingsDraftError(moderation({ embeds: { ...DEFAULT_EMBEDS, color: "rosu" } }), ["sanctionDm"])).toBeNull();
    expect(settingsDraftError(moderation({ permissions: { staffRoleIds: ["abc"] } }))).toContain("„abc”");
    expect(welcomeDraftError(bot({ welcomeEnabled: true }))).toBe("Bun venit și plecare — Alege canalul mesajelor.");
    expect(welcomeDraftError(bot({ leaveEnabled: true, channelId: "300000001" }))).toBeNull();
  });
});
