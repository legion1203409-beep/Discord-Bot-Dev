import { describe, expect, it } from "vitest";
import { isWidePanelRoute } from "./model";
import { PROTECTION_CARDS, activeCards, attentionItems, cardEnabled, cardState, pageMap, withToggle } from "./overview-model";

const config = (change: Record<string, unknown> = {}) => ({
  protection: { enabled: true },
  autoMod: { enabled: true, wordFilter: { enabled: true }, linkBlock: { enabled: false } },
  antiRaid: { enabled: true }, antiSpam: { enabled: false }, antiFlood: { enabled: false }, suspiciousBehavior: { enabled: false }, ai: { enabled: false },
  manualTools: { enabled: true }, audit: { enabled: true },
  ...change,
});

describe("the overview", () => {
  it("is a wide page", () => {
    expect(isWidePanelRoute("/")).toBe(true);
    expect(PROTECTION_CARDS.map((card) => card.key)).toEqual(["autoMod", "wordFilter", "linkBlock", "antiRaid", "antiSpam", "antiFlood", "suspiciousBehavior", "ai"]);
  });

  it("says what each protection module does right now", () => {
    const word = PROTECTION_CARDS.find((card) => card.key === "wordFilter")!;
    expect(cardState(config(), word)).toEqual({ tone: "on", text: "Activ" });
    expect(cardState(config({ protection: { enabled: false } }), word).text).toBe("Configurat · protecția globală oprită");
    expect(cardState(config({ autoMod: { enabled: false, wordFilter: { enabled: true } } }), word).text).toBe("Configurat · AutoMod oprit");
    expect(cardState(config(), PROTECTION_CARDS.find((card) => card.key === "linkBlock")!)).toEqual({ tone: "off", text: "Oprit" });
    expect(activeCards(config())).toBe(3);
    expect(activeCards(config({ protection: { enabled: false } }))).toBe(0);
  });

  it("shows a switch's change before the server answers, without touching the rest", () => {
    const before = config();
    const after = withToggle(before, "linkBlock", true);
    expect(cardEnabled(after, PROTECTION_CARDS.find((card) => card.key === "linkBlock")!)).toBe(true);
    expect(after.autoMod.wordFilter).toEqual({ enabled: true });
    expect(before.autoMod.linkBlock.enabled).toBe(false);
    expect(withToggle(before, "protection", false).protection.enabled).toBe(false);
    expect(withToggle({}, "ai", true)).toEqual({ ai: { enabled: true } });
    expect(withToggle(null, "ai", true)).toBeNull();
  });

  it("lists what needs a look, the most urgent first", () => {
    expect(attentionItems({ config: config(), bot: { dailyStats: { channelId: "1" } }, capabilities: { online: true }, openCases: 0, unconfirmed: 0 })).toEqual([]);
    const items = attentionItems({
      config: config({ protection: { enabled: false }, audit: { enabled: false }, manualTools: { enabled: false } }),
      bot: { dailyStats: { channelId: "" }, verification: { enabled: true, channelId: "" } },
      capabilities: { online: true, canBanMembers: false, messageContent: false },
      openCases: 3, unconfirmed: 2,
    });
    expect(items.map((item) => item.key)).toEqual(["ledger", "protection", "permissions", "cases", "audit", "commands", "daily", "verification"]);
    expect(items[0]).toMatchObject({ tone: "bad", href: "/audit" });
    expect(items[2]!.text).toBe("Botului îi lipsesc Message Content, Ban Members.");
    expect(items[3]!.text).toBe("3 cazuri deschise așteaptă să fie închise.");
    const offline = attentionItems({ config: config(), capabilities: { online: false, canBanMembers: false } });
    expect(offline.map((item) => item.key)).toEqual(["offline"]);
  });

  it("maps every page with what is on", () => {
    const map = pageMap(config(), { verification: { enabled: true }, dailyStats: { channelId: "" }, oracle: { enabled: true }, inviteTracking: { enabled: false } });
    const link = (title: string) => map.flatMap((group) => group.links).find((item) => item.title === title)!;
    expect(map.map((group) => group.key)).toEqual(["moderation", "members", "bot", "setup"]);
    expect(link("Comenzi")).toMatchObject({ state: "Pornite", tone: "on" });
    expect(link("Verificare")).toMatchObject({ state: "Pornit", tone: "on" });
    expect(link("Raport zilnic")).toMatchObject({ state: "Fără canal", tone: "off" });
    expect(pageMap(null, null).flatMap((group) => group.links).find((item) => item.title === "Verificare")).toMatchObject({ state: "Setări", tone: "info" });
  });
});
