import { describe, expect, it } from "vitest";
import { appealScreen, type AppealView } from "./appeal-model";

const base: AppealView = {
  enabled: true, guild: { id: "1", name: "Regat", iconUrl: null }, banned: true,
  ban: { reason: "spam", caseId: "c1", at: null }, appeal: null, canAppeal: true, nextAllowedAt: null, inviteUrl: null,
};
const appeal = (over: Partial<NonNullable<AppealView["appeal"]>>): AppealView["appeal"] => ({
  id: "a", status: "pending", body: "text", createdAt: "2026-01-01T00:00:00Z", decidedAt: null, decisionNote: null, question: null, ...over,
});

describe("the appeal page", () => {
  it("shows the form to a banned person with no appeal", () => {
    expect(appealScreen(base)).toBe("form");
  });
  it("waits, asks, and shows the result", () => {
    expect(appealScreen({ ...base, canAppeal: false, appeal: appeal({}) })).toBe("pending");
    expect(appealScreen({ ...base, canAppeal: false, appeal: appeal({ question: { id: "q", text: "De ce?" } }) })).toBe("question");
    expect(appealScreen({ ...base, banned: false, canAppeal: false, appeal: appeal({ status: "accepted" }), inviteUrl: "https://discord.gg/x" })).toBe("accepted");
  });
  it("lets a rejected ban be appealed again only after the wait", () => {
    expect(appealScreen({ ...base, canAppeal: false, nextAllowedAt: "2026-02-01T00:00:00Z", appeal: appeal({ status: "rejected" }) })).toBe("rejected-wait");
    expect(appealScreen({ ...base, appeal: appeal({ status: "rejected" }) })).toBe("rejected-open");
  });
  it("tells who has no ban or when appeals are off", () => {
    expect(appealScreen({ ...base, banned: false })).toBe("not-banned");
    expect(appealScreen({ ...base, enabled: false })).toBe("disabled");
  });
});
