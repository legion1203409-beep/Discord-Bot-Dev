import { describe, expect, it } from "vitest";
import {
  buildCopilotEmbed,
  fallbackAnalysis,
  guessSubject,
  mergeRisk,
  parseAiAnalysis,
  sanctionRisk,
  summarizeSanctions,
  transcriptForAi,
  type CopilotMessage,
} from "../staff-copilot";

const now = new Date("2026-11-06T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const msg = (over: Partial<CopilotMessage>): CopilotMessage => ({
  authorId: "1", authorName: "Ion", staff: false, bot: false, content: "", createdAt: now, ...over,
});

describe("staff copilot", () => {
  it("counts sanctions and ignores other actions", () => {
    const summary = summarizeSanctions([
      { actionType: "warn", reason: "spam", createdAt: daysAgo(2), status: "closed" },
      { actionType: "mute", reason: null, createdAt: daysAgo(60), status: "closed" },
      { actionType: "purge", reason: null, createdAt: daysAgo(1), status: "closed" },
    ], now);
    expect(summary.total).toBe(2);
    expect(summary.recent).toBe(1);
    expect(summary.counts).toEqual({ warn: 1, mute: 1 });
    expect(summary.lines[0]).toContain("spam");
  });

  it("rates the history: bans are high, one recent warn is medium, nothing is low", () => {
    expect(sanctionRisk(summarizeSanctions([{ actionType: "ban", reason: null, createdAt: daysAgo(300), status: "closed" }], now)).level).toBe("ridicat");
    expect(sanctionRisk(summarizeSanctions([{ actionType: "warn", reason: null, createdAt: daysAgo(3), status: "open" }], now)).level).toBe("mediu");
    expect(sanctionRisk(summarizeSanctions([], now)).level).toBe("scazut");
  });

  it("the history can raise the risk, never lower it", () => {
    const low = { problem: "p", risk: "scazut" as const, riskWhy: "ok.", recommendation: "r", tips: ["t"] };
    expect(mergeRisk(low, { level: "ridicat", why: "are ban" }).risk).toBe("ridicat");
    expect(mergeRisk(low, { level: "ridicat", why: "are ban" }).riskWhy).toContain("are ban");
    const high = { ...low, risk: "ridicat" as const };
    expect(mergeRisk(high, { level: "scazut", why: null })).toBe(high);
  });

  it("without AI it still finds the problem from the words", () => {
    const scam = fallbackAnalysis({ messages: [msg({ content: "mi-a trimis un link de free nitro si mi-a furat contul" })] });
    expect(scam.risk).toBe("ridicat");
    expect(scam.problem).toMatch(/înșelătorie/);
    const plain = fallbackAnalysis({ messages: [msg({ content: "Salut, cum ajung nivel 10?" })], categoryLabel: "Întrebări" });
    expect(plain.risk).toBe("scazut");
    expect(plain.problem).toContain("cum ajung nivel 10");
    expect(plain.tips[0]).toContain("Preia");
  });

  it("only reads the member's words, not staff or bot messages", () => {
    const result = fallbackAnalysis({ messages: [
      msg({ content: "Bun venit! Nu da click pe linkuri de scam.", bot: true }),
      msg({ content: "Am o problemă cu rolul de verificare", authorId: "2" }),
    ] });
    expect(result.risk).toBe("scazut");
  });

  it("accepts only well formed AI answers", () => {
    expect(parseAiAnalysis(JSON.stringify({ problem: "x", risk: "mediu", riskWhy: "y", recommendation: "z", tips: ["a", "b"] }))?.risk).toBe("mediu");
    expect(parseAiAnalysis(JSON.stringify({ problem: "x", risk: "extrem", riskWhy: "y", recommendation: "z", tips: ["a"] }))).toBeNull();
    expect(parseAiAnalysis("nu e json")).toBeNull();
  });

  it("labels who wrote what and keeps the end of a long conversation", () => {
    const text = transcriptForAi([
      msg({ content: "început" }),
      ...Array.from({ length: 40 }, (_, i) => msg({ content: `mesaj ${i} ${"x".repeat(300)}` })),
      msg({ content: "sfârșit", staff: true, authorName: "Adina" }),
    ]);
    expect(text.length).toBeLessThan(7_100);
    expect(text).toContain("[STAFF] Adina: sfârșit");
    expect(text).not.toContain("început");
  });

  it("guesses the member: whoever wrote most and is not staff", () => {
    expect(guessSubject([
      msg({ authorId: "s", staff: true }), msg({ authorId: "s", staff: true }), msg({ authorId: "s", staff: true }),
      msg({ authorId: "a" }), msg({ authorId: "b" }), msg({ authorId: "b" }),
    ])).toBe("b");
    expect(guessSubject([msg({ bot: true })])).toBeNull();
  });

  it("builds the embed with the five parts", () => {
    const sanctions = summarizeSanctions([{ actionType: "warn", reason: "spam", createdAt: daysAgo(1), status: "open" }], now);
    const embed = buildCopilotEmbed({
      analysis: { problem: "Cere rol", risk: "mediu", riskWhy: "un warn recent", recommendation: "Verifică rolurile", tips: ["Fii calm"] },
      sanctions, subject: { id: "42", name: "Ion" }, categoryLabel: "Ajutor", messageCount: 7, usedAi: true,
    }).toJSON();
    expect(embed.fields?.map((field) => field.name)).toEqual([
      "🎯 Problema principală", "⚠️ Risc: 🟡 Mediu", "🛡️ Sancțiuni anterioare", "✅ Recomandare", "💡 Sfaturi pentru staff",
    ]);
    expect(embed.fields?.[2]?.value).toContain("1 ⚠️ avertismente");
    expect(embed.footer?.text).toContain("Analiză AI");
  });
});
