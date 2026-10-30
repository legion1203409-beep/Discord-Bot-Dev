import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  CONTROL_MODULES, accessSummary, changedControlParts, controlDraftError, controlModuleForRoute, controlModuleSummary, defaultPermission,
  inviteReportSummary, isControlRoute, permissionOf, presetRole, ROLE_PRESETS, recruitmentProblem, renderDailyText, roleAccessOf, withRole, withRoleAccess,
} from "./control-model";

const EVERYONE = "100000000";
const recruitment = (change: Record<string, unknown> = {}) => ({
  enabled: false, inviteChannelId: "", maxUses: 1, maxAgeDays: 7, dailyInviteLimit: 3, verificationHours: 24, rewardPoints: 10,
  milestones: [{ requiredInvites: 1, roleId: "" }, { requiredInvites: 5, roleId: "" }, { requiredInvites: 10, roleId: "" }],
  ...change,
});
const config = (change: Record<string, unknown> = {}) => ({
  channels: { main: "500000001" },
  provisioningPermissions: {},
  discordLive: true,
  inviteTracking: {
    enabled: false, joinLogChannelId: "", reportEnabled: false, reportChannelId: "", reportFrequency: "daily", reportTime: "09:00",
    reportWeekday: 1, reportTimeZone: "Europe/Bucharest", reportTopLimit: 5, recruitment: recruitment(),
  },
  dailyStats: {
    channelId: "", title: "📊 {guild}", description: "Ziua {date}", color: "#D94A2B", footer: "Oracolul", activityTitle: "Activitate",
    channelsTitle: "Canale", emptyChannelsText: "Nimic", imageUrl: "", thumbnailUrl: "",
    metricLabels: { messages: "Mesaje", uniqueUsers: "Unici", boosts: "Boost", joins: "Intrări", leaves: "Ieșiri", peakVoice: "Voce" },
  },
  ...change,
});

describe("the bot control group", () => {
  it("is its own page, with five modules", () => {
    expect(CONTROL_MODULES.map((module) => module.route)).toEqual(["/control/invitatii", "/control/recrutare", "/control/raport", "/control/canale", "/control/bot"]);
    expect(controlModuleForRoute("/control").id).toBe("invites");
    expect(controlModuleForRoute("/control/canale/").id).toBe("channels");
    expect(isControlRoute("/control/bot")).toBe(true);
    expect(isControlRoute("/canale")).toBe(false);
    expect(panelGroupRoute("/control/raport")).toBe("/control");
    expect(isWidePanelRoute("/control")).toBe(true);
  });

  it("marks only the changed module", () => {
    const saved = config();
    const draft = structuredClone(saved);
    draft.inviteTracking.recruitment.enabled = true;
    expect(changedControlParts(saved, draft)).toEqual([{ key: "recruitment", label: "Recrutare" }]);
    draft.dailyStats.color = "#000000";
    expect(changedControlParts(saved, draft).map((part) => part.key)).toEqual(["recruitment", "daily"]);
  });

  it("sums up each module in the menu", () => {
    const value = config();
    value.inviteTracking.enabled = true;
    value.inviteTracking.reportEnabled = true;
    value.inviteTracking.reportFrequency = "weekly";
    value.inviteTracking.reportWeekday = 5;
    expect(controlModuleSummary("invites", value)).toBe("urmărite · în fiecare vineri la 09:00");
    expect(inviteReportSummary({ reportEnabled: true, reportFrequency: "daily", reportTime: "21:30" })).toBe("zilnic la 21:30");
    expect(controlModuleSummary("recruitment", value)).toBe("oprit");
    expect(controlModuleSummary("daily", value)).toBe("nu se postează");
    expect(controlModuleSummary("channels", value)).toBe("acces implicit");
    expect(controlModuleSummary("server", { ...value, discordLive: false })).toBe("offline");
  });

  it("keeps the recruitment program's rules", () => {
    expect(recruitmentProblem(recruitment())).toBeNull();
    expect(recruitmentProblem(recruitment({ enabled: true }))).toContain("canalul");
    expect(recruitmentProblem(recruitment({ maxUses: 0 }))).toContain("Utilizări pe invitație");
    expect(recruitmentProblem(recruitment({ milestones: [{ requiredInvites: 5, roleId: "" }, { requiredInvites: 5, roleId: "" }, { requiredInvites: 9, roleId: "" }] })))
      .toContain("crească");
  });

  it("fills the daily report's texts with example values", () => {
    expect(renderDailyText("📊 {guild} · {date} · {messages} · {unknown}")).toBe("📊 Regatul Cenușii · 29 octombrie 2026 · 307 · {unknown}");
  });

  it("gives and takes roles' access to the channels the bot creates", () => {
    expect(defaultPermission("admin", EVERYONE)).toEqual({ roleIds: [], readMessageHistory: true, sendMessages: true });
    expect(defaultPermission("reports", EVERYONE).rolePermissions?.[EVERYONE]).toEqual({ viewChannel: true, readMessageHistory: true, sendMessages: false });
    expect(accessSummary(defaultPermission("admin"), EVERYONE)).toBe("doar botul și administratorii");
    expect(accessSummary(defaultPermission("reports", EVERYONE), EVERYONE)).toBe("toată lumea");
    let permission = withRole(defaultPermission("admin"), "200000001", true);
    expect(roleAccessOf(permission, "200000001")).toEqual({ viewChannel: true, readMessageHistory: true, sendMessages: true });
    permission = withRoleAccess(permission, "200000001", { sendMessages: false });
    expect(roleAccessOf(permission, "200000001").sendMessages).toBe(false);
    expect(accessSummary(permission, EVERYONE)).toBe("1 rol");
    permission = withRole(permission, "200000001", false);
    expect(permission.roleIds).toEqual([]);
    expect(permission.rolePermissions).toEqual({});
    expect(permissionOf({ provisioningPermissions: { admin: permission } }, "admin")).toBe(permission);
  });

  it("finds the roles of the presets by name", () => {
    const roles = [{ id: EVERYONE, name: "@everyone" }, { id: "200000002", name: "Moderator" }, { id: "200000003", name: "Membru Regat" }];
    expect(presetRole(ROLE_PRESETS[0], roles, EVERYONE)?.id).toBe(EVERYONE);
    expect(presetRole(ROLE_PRESETS[1], roles, EVERYONE)?.id).toBe("200000003");
    expect(presetRole(ROLE_PRESETS[3], roles, EVERYONE)).toBeUndefined();
  });

  it("stops a save the server would refuse", () => {
    expect(controlDraftError(config())).toBeNull();
    const report = config();
    report.inviteTracking.reportEnabled = true;
    expect(controlDraftError(report)).toBe("Invitații — Pornește urmărirea invitațiilor ca să trimiți raportul.");
    report.inviteTracking.enabled = true;
    expect(controlDraftError(report)).toBe("Invitații — Alege canalul raportului.");
    const time = config();
    time.inviteTracking.reportTime = "9:5";
    expect(controlDraftError(time)).toContain("HH:MM");
    const daily = config();
    daily.dailyStats.title = "  ";
    expect(controlDraftError(daily)).toBe("Raport zilnic — Titlul nu poate fi gol.");
    const color = config();
    color.dailyStats.color = "rosu";
    expect(controlDraftError(color)).toContain("#RRGGBB");
    expect(controlDraftError(config({ provisioningPermissions: { admin: { roleIds: ["x"], readMessageHistory: true, sendMessages: true } } }))).toContain("Administrație");
  });
});
