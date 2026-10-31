import { describe, expect, it } from "vitest";
import { GREETING, SUGGESTIONS, THINKING, answer, normalize, prophecy, type OracleFacts } from "./archive";

const facts: OracleFacts = {
  members: 1014,
  online: 85,
  inviteLabel: "discord.gg/regatulcenusii",
  report: {
    dayLabel: "21 octombrie 2026",
    messages: 395,
    uniqueUsers: 13,
    joins: 3,
    leaves: 6,
    boosts: 0,
    peakVoice: 2,
    topChannels: [
      { name: "hanul-general", messages: 391 },
      { name: "turnul-numerelor", messages: 3 },
    ],
  },
  recruitment: "inactive",
};

const none: OracleFacts = { members: null, online: null, inviteLabel: "discord.gg/regatulcenusii", report: null, recruitment: "unknown" };
const first = () => 0;
const last = () => 0.999;

describe("normalize", () => {
  it("scoate diacriticele și literele mari", () => {
    expect(normalize("Profeție, ȘI Țară")).toBe("profetie, si tara");
  });
});

describe("prophecy", () => {
  it("alege o profeție după numărul tras", () => {
    expect(prophecy(first)).toMatch(/^\*\*Profeția ta:\*\* Jarul de sub cenușă/);
    expect(prophecy(last)).toMatch(/Drumul spre regat e luminat/);
  });
});

describe("answer", () => {
  it("știe întrebările din sugestii", () => {
    for (const q of SUGGESTIONS) expect(answer(q, facts, first).length).toBeGreaterThan(20);
    expect(answer(SUGGESTIONS[0], facts)).toMatch(/Oracolul Cenușii/);
    expect(answer(SUGGESTIONS[4], facts, first)).toMatch(/Profeția ta/);
  });

  it("ține seamă de profeție și fără diacritice", () => {
    expect(answer("PROFETIE", facts, first)).toMatch(/Profeția ta/);
    expect(answer("spune-mi viitorul", facts, first)).toMatch(/Profeția ta/);
  });

  it("explică jocul RPG", () => {
    const a = answer("cum merge jocul?", facts);
    expect(a).toMatch(/joc RPG/);
    expect(a).toMatch(/Oboli/);
  });

  it("listează comenzile de moderare ca pe niște comenzi staff", () => {
    expect(answer("ce comenzi există?", facts)).toMatch(/`\/warn`/);
  });

  it("trimite la staff pentru tichete, verificare și moderare", () => {
    expect(answer("cum deschid un tichet?", facts)).toMatch(/tichete/);
    expect(answer("ce spam filtrați?", facts)).toMatch(/AutoMod/);
  });

  it("completează activitatea cu cifrele reale", () => {
    const a = answer("cât de activ e serverul?", facts);
    expect(a).toContain("**1.014 membri**");
    expect(a).toContain("**85 online**");
    expect(a).toContain("21 octombrie 2026");
    expect(a).toContain("**395 de mesaje**");
    expect(a).toContain("#hanul-general");
    expect(a).toContain("13 membri");
  });

  it("nu inventează cifre când nu le are", () => {
    const a = answer("cât de activ e serverul?", none);
    expect(a).toMatch(/Numărul de membri nu mi-e la îndemână/);
    expect(a).toMatch(/Raportul zilnic nu e disponibil/);
    expect(a).not.toMatch(/\d/);
  });

  it("spune dacă programul de recrutare e activ, inactiv sau necunoscut", () => {
    expect(answer("există recrutare?", { ...facts, recruitment: "active" })).toMatch(/e activ acum/);
    expect(answer("există recrutare?", facts)).toMatch(/nu e activ acum/);
    expect(answer("există recrutare?", none)).toMatch(/Nu pot vedea/);
  });

  it("o întrebare despre recrutare nu se confundă cu una despre activitate", () => {
    expect(answer("e activ programul de recrutare?", facts)).toMatch(/recrutare/);
  });

  it("trimite spre invitația reală și spre canalul cel mai viu", () => {
    const a = answer("cum intru în comunitate?", facts);
    expect(a).toContain("**discord.gg/regatulcenusii**");
    expect(a).toContain("#hanul-general");
    expect(answer("cum intru?", none)).toMatch(/începe cu un salut, comunitatea te primește/);
  });

  it("răspunde la salut și la „cine ești”", () => {
    expect(answer("salut", facts)).toMatch(/Bine te-am găsit/);
    expect(answer("cine ești?", facts)).toMatch(/Sunt \*\*Oracolul Cenușii\*\*/);
  });

  it("recunoaște când nu știe", () => {
    expect(answer("ce preț are un cartof?", facts)).toMatch(/Arhiva mea nu are încă un răspuns/);
    expect(answer("", facts)).toMatch(/Arhiva mea nu are încă un răspuns/);
  });
});

describe("texte fixe", () => {
  it("are salutul și frazele de gândire", () => {
    expect(GREETING).toMatch(/Regatul Cenușii/);
    expect(THINKING).toHaveLength(4);
    expect(SUGGESTIONS).toHaveLength(5);
  });
});
