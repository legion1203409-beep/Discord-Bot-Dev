import { describe, expect, it } from "vitest";
import {
  DEFAULT_XP_CONFIG, boldParts, changedXpParts, effortFor, levelForXp, nextRewardLevel, normalizeXpConfig,
  renderRankUpMessage, xpDraftError, xpForLevel, xpForStep,
} from "./xp-model";

const GUILD = "111111111";
const roles = [
  { id: GUILD, name: "@everyone" },
  { id: "400000000000000001", name: "Membru", activityRewardAssignable: true },
  { id: "400000000000000007", name: "Integrare", managed: true },
];

describe("niveluri și XP", () => {
  it("uses the bot's formula: each level needs 100 XP more", () => {
    expect([1, 2, 3, 5, 10, 20, 100].map(xpForLevel)).toEqual([0, 100, 300, 1_000, 4_500, 19_000, 495_000]);
    expect(xpForStep(3)).toBe(200);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(999)).toBe(4);
    expect(levelForXp(1_000)).toBe(5);
    expect(levelForXp(10_000_000)).toBe(100);
  });

  it("turns a level into messages and hours on voice", () => {
    const ten = effortFor(10);
    expect(ten.messages).toBe(450);
    expect(ten.voice).toBe("15 de ore");
    expect(effortFor(2).voice).toBe("20 min");
    expect(effortFor(20).chatTime).toBe("16 de ore");
  });

  it("previews the message with the variables and bold parts", () => {
    const text = renderRankUpMessage(DEFAULT_XP_CONFIG.rankUpMessage, "Regatul");
    expect(text).toContain("Membru a ajuns la rangul de activitate **5** pe serverul **Regatul**");
    expect(boldParts("a **b** c")).toEqual([{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
  });

  it("blocks saving with an empty message, a bad color or unusable roles", () => {
    expect(xpDraftError(DEFAULT_XP_CONFIG, roles, GUILD)).toBe("");
    expect(xpDraftError({ ...DEFAULT_XP_CONFIG, rankUpMessage: " " }, roles, GUILD)).toMatch(/mesajul/);
    expect(xpDraftError({ ...DEFAULT_XP_CONFIG, color: "red" }, roles, GUILD)).toMatch(/culoare/);
    expect(xpDraftError({ ...DEFAULT_XP_CONFIG, roleRewards: [{ level: 5, roleId: "400000000000000007" }] }, roles, GUILD)).toMatch(/nu mai pot fi date/);
    expect(xpDraftError({ ...DEFAULT_XP_CONFIG, roleRewards: [{ level: 5, roleId: "400000000000000001" }] }, roles, GUILD)).toBe("");
    expect(xpDraftError({ ...DEFAULT_XP_CONFIG, roleRewards: [{ level: 5, roleId: "400000000000000001" }] }, undefined, GUILD)).toBe("");
  });

  it("suggests the next free level and names what changed", () => {
    expect(nextRewardLevel([])).toBe(5);
    expect(nextRewardLevel([{ level: 5, roleId: "" }, { level: 10, roleId: "" }])).toBe(20);
    const saved = normalizeXpConfig({ enabled: true });
    expect(changedXpParts(saved, saved)).toEqual([]);
    expect(changedXpParts(saved, { ...saved, barStyle: "sword", roleRewards: [] })).toEqual(["Cardul /rank", "Roluri"]);
    expect(normalizeXpConfig({ roleRewards: undefined }).roleRewards).toBeNull();
  });
});
