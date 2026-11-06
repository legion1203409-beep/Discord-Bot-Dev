import { describe, expect, it } from "vitest";
import { DEFAULT_INVITE_RECRUITMENT_CONFIG } from "../db";
import { DEFAULT_RECRUITMENT_PANEL, RECRUITMENT_PANEL_BUTTON_ID, buildRecruitmentPanel, normalizeRecruitmentPanel, recruitmentRulesLine } from "../recruitment-panel";

describe("the recruitment panel", () => {
  it("keeps the defaults and cleans what the site sends", () => {
    expect(normalizeRecruitmentPanel(null)).toEqual(DEFAULT_RECRUITMENT_PANEL);
    const panel = normalizeRecruitmentPanel({ channelId: " 123456789 ", title: "  Invită  ", buttonLabel: "", color: "red", imageUrl: "http://x", messageId: "abc" });
    expect(panel.channelId).toBe("123456789");
    expect(panel.title).toBe("Invită");
    expect(panel.buttonLabel).toBe(DEFAULT_RECRUITMENT_PANEL.buttonLabel);
    expect(panel.color).toBe(DEFAULT_RECRUITMENT_PANEL.color);
    expect(panel.imageUrl).toBe("");
    expect(panel.messageId).toBe("");
  });

  it("writes the real rules of the invites", () => {
    expect(recruitmentRulesLine({ maxAgeDays: 1, maxUses: 5, dailyInviteLimit: 3, rewardPoints: 10 }))
      .toBe("⏳ ține 1 zi · 👥 până la 5 membri · 🎟️ 3 pe zi · ⭐ 10 puncte pe fiecare verificat");
  });

  it("has the button that makes a personal invite and the recruiter roles", () => {
    const recruitment = {
      ...DEFAULT_INVITE_RECRUITMENT_CONFIG, enabled: true,
      milestones: DEFAULT_INVITE_RECRUITMENT_CONFIG.milestones.map((milestone, index) => ({ ...milestone, roleId: index === 0 ? "555555555" : "" })),
    } as typeof DEFAULT_INVITE_RECRUITMENT_CONFIG;
    const payload = buildRecruitmentPanel(DEFAULT_RECRUITMENT_PANEL, recruitment);
    const embed = payload.embeds[0]!.toJSON();
    expect(embed.title).toBe(DEFAULT_RECRUITMENT_PANEL.title);
    expect(embed.fields?.map((field) => field.name)).toEqual(["Cum merge invitația", "🏅 Roluri de recrutor"]);
    expect(embed.fields?.[1]?.value).toContain("<@&555555555>");
    expect(JSON.stringify(payload.components[0])).toContain(RECRUITMENT_PANEL_BUTTON_ID);
  });
});
