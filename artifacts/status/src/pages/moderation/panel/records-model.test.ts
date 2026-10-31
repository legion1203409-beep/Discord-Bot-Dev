import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  ACTION_KINDS, CASE_ACTION_FILTERS, actionKind, auditDetailLines, auditPeopleIds, caseOutcome, casePeopleIds, caseSource, casesSummary,
  evidenceView, groupAuditByDay, isRecordsRoute, ledgerSummary, messageLink, parseMemberQuery, recordsModuleForRoute, relativeTime,
} from "./records-model";

const GUILD = "100000000000000001";
const MEMBER = "200000000000000002";
const STAFF = "200000000000000003";
const CHANNEL = "300000000000000004";

describe("the cases and audit page", () => {
  it("is one page with two modules", () => {
    expect(recordsModuleForRoute("/cazuri").id).toBe("cases");
    expect(recordsModuleForRoute("/audit/").id).toBe("audit");
    expect(recordsModuleForRoute("/cazuri?caz=abc").id).toBe("cases");
    expect(isRecordsRoute("/audit")).toBe(true);
    expect(isRecordsRoute("/jurnale/audit")).toBe(false);
    expect(panelGroupRoute("/audit")).toBe("/cazuri");
    expect(isWidePanelRoute("/cazuri")).toBe(true);
  });

  it("names every action and keeps unknown ones readable", () => {
    expect(actionKind("ban")).toMatchObject({ label: "Interdicție", tone: "ban", subject: "member" });
    expect(actionKind("lock").subject).toBe("channel");
    expect(actionKind("tempban").label).toBe("Tempban");
    expect(actionKind("").label).toBe("Acțiune");
    expect(CASE_ACTION_FILTERS[0]).toEqual(["all", "Toate acțiunile"]);
    expect(CASE_ACTION_FILTERS).toHaveLength(Object.keys(ACTION_KINDS).length + 1);
  });

  it("tells who gave a sanction and whether Discord applied it", () => {
    expect(caseSource({ metadata: { source: "automod" } })).toEqual({ automatic: true, label: "moderarea automată" });
    expect(caseSource({ metadata: { source: "raid" } }).label).toBe("anti-raid");
    expect(caseSource({ metadata: {} })).toEqual({ automatic: false, label: "staff" });
    expect(caseOutcome({ metadata: { outcome: "failed" } })?.label).toBe("Neaplicată");
    expect(caseOutcome({ metadata: { outcome: "uncertain" } })?.text).toContain("De verificat");
    expect(caseOutcome({ metadata: { outcome: "applied" } })).toBeNull();
    expect(caseOutcome({})).toBeNull();
  });

  it("finds a member from an ID, a mention or a profile link", () => {
    expect(parseMemberQuery("")).toEqual({ id: null, error: null });
    expect(parseMemberQuery(` ${MEMBER} `).id).toBe(MEMBER);
    expect(parseMemberQuery(`<@!${MEMBER}>`).id).toBe(MEMBER);
    expect(parseMemberQuery(`https://discord.com/users/${MEMBER}`).id).toBe(MEMBER);
    expect(parseMemberQuery("Ana").error).toContain("Copiază ID-ul");
  });

  it("links evidence to its message in Discord", () => {
    expect(messageLink(GUILD, CHANNEL, "400000000000000005")).toBe(`https://discord.com/channels/${GUILD}/${CHANNEL}/400000000000000005`);
    expect(messageLink(GUILD, CHANNEL)).toBe(`https://discord.com/channels/${GUILD}/${CHANNEL}`);
    expect(messageLink(GUILD, "general")).toBeNull();
    expect(evidenceView(GUILD, { kind: "edit-spam", description: " 5 editări ", channelId: CHANNEL, messageId: "400000000000000005" })).toEqual({
      kind: "editări repetate", text: "5 editări", link: `https://discord.com/channels/${GUILD}/${CHANNEL}/400000000000000005`,
      linkLabel: "Deschide mesajul în Discord", url: null,
    });
    expect(evidenceView(GUILD, { url: "javascript:alert(1)" }).url).toBeNull();
    expect(evidenceView(GUILD, null)).toMatchObject({ kind: null, text: null, link: null });
  });

  it("asks for the names of members and staff, not of channels", () => {
    expect(casePeopleIds([
      { subjectId: MEMBER, actorId: STAFF, actionType: "warn", closedBy: null },
      { subjectId: CHANNEL, actorId: STAFF, actionType: "lock", closedBy: MEMBER },
      { subjectId: "nu-e-id", actorId: null, actionType: "ban", closedBy: null },
    ])).toEqual([MEMBER, STAFF]);
    expect(auditPeopleIds([
      { actorId: STAFF, targetId: MEMBER, targetType: "member" },
      { actorId: null, targetId: CHANNEL, targetType: "channel" },
    ])).toEqual([STAFF, MEMBER]);
  });

  it("sums up the cases in the menu", () => {
    expect(casesSummary(undefined)).toBe("sancțiunile date");
    expect(casesSummary({ open: 0, closed: 0 })).toBe("niciun caz încă");
    expect(casesSummary({ open: 0, closed: 4 })).toBe("niciunul deschis");
    expect(casesSummary({ open: 3, closed: 4 })).toBe("3 deschise");
    expect(casesSummary({ open: 1, closed: 0 })).toBe("1 deschis");
  });

  it("writes times the short way in lists", () => {
    const now = new Date(2026, 9, 30, 15, 0);
    expect(relativeTime(new Date(2026, 9, 30, 14, 59, 40), now)).toBe("chiar acum");
    expect(relativeTime(new Date(2026, 9, 30, 14, 40), now)).toBe("acum 20 min");
    expect(relativeTime(new Date(2026, 9, 30, 9, 5), now)).toBe("azi, 09:05");
    expect(relativeTime(new Date(2026, 9, 29, 22, 15), now)).toBe("ieri, 22:15");
    expect(relativeTime(new Date(2026, 9, 12, 8, 0), now)).toMatch(/^12 oct/);
    expect(relativeTime(new Date(2025, 11, 1), now)).toMatch(/2025/);
    expect(relativeTime("nu e dată", now)).toBe("");
  });

  it("groups the audit log by day", () => {
    const now = new Date(2026, 9, 30, 15, 0);
    const days = groupAuditByDay([
      { id: "a", createdAt: new Date(2026, 9, 30, 14, 0).toISOString() },
      { id: "b", createdAt: new Date(2026, 9, 30, 8, 0).toISOString() },
      { id: "c", createdAt: new Date(2026, 9, 29, 23, 0).toISOString() },
      { id: "d", createdAt: new Date(2026, 9, 20, 12, 0).toISOString() },
    ], now);
    expect(days.map((day) => [day.label, day.items.map((item) => item.id).join("")])).toEqual([
      ["Azi", "ab"], ["Ieri", "c"], [expect.stringMatching(/^Marți, 20 octombrie$/), "d"],
    ]);
  });

  it("shows an event's details without the internal fields", () => {
    expect(auditDetailLines({ actorVerified: true, reason: "spam", count: 3, empty: "", long: "x".repeat(400) })).toEqual([
      ["reason", "spam"], ["count", "3"], ["long", `${"x".repeat(300)}…`],
    ]);
    expect(auditDetailLines(null)).toEqual([]);
  });

  it("says what an unconfirmed action wanted to do", () => {
    expect(ledgerSummary({
      id: "1", status: "uncertain", actionType: "mute", actorId: STAFF, createdAt: "",
      input: { type: "mute", targetId: MEMBER, durationMinutes: 120, reason: " spam " },
    })).toEqual({ title: "Timeout de 2 ore", reason: "spam", targetId: MEMBER, channelId: null });
    expect(ledgerSummary({ id: "2", status: "pending", actionType: "lock", actorId: STAFF, createdAt: "", input: { channelId: CHANNEL } }))
      .toEqual({ title: "Canal blocat", reason: null, targetId: null, channelId: CHANNEL });
    expect(ledgerSummary({ id: "3", status: "pending", actionType: "mute", actorId: STAFF, createdAt: "", input: { durationMinutes: 2_880 } }).title)
      .toBe("Timeout de 2 zile");
  });
});
