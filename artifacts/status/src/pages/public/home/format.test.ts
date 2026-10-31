import { describe, expect, it } from "vitest";
import { countLabel, fmt, formatReportDay, formatTimestamp, odometerColumns } from "./format";

describe("fmt", () => {
  it("pune punct la mii", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(85)).toBe("85");
    expect(fmt(999)).toBe("999");
    expect(fmt(1014)).toBe("1.014");
    expect(fmt(25000)).toBe("25.000");
    expect(fmt(1234567)).toBe("1.234.567");
  });
});

describe("countLabel", () => {
  it("folosește „de” doar după numerale de la 20 în sus", () => {
    expect(countLabel(1, "mesaj", "mesaje")).toBe("1 mesaj");
    expect(countLabel(2, "mesaj", "mesaje")).toBe("2 mesaje");
    expect(countLabel(13, "membru", "membri")).toBe("13 membri");
    expect(countLabel(19, "membru", "membri")).toBe("19 membri");
    expect(countLabel(20, "membru", "membri")).toBe("20 de membri");
    expect(countLabel(395, "mesaj", "mesaje")).toBe("395 de mesaje");
    expect(countLabel(1014, "membru", "membri")).toBe("1.014 membri");
    expect(countLabel(1020, "membru", "membri")).toBe("1.020 de membri");
    expect(countLabel(100, "mesaj", "mesaje")).toBe("100 de mesaje");
    expect(countLabel(101, "mesaj", "mesaje")).toBe("101 mesaje");
    expect(countLabel(119, "mesaj", "mesaje")).toBe("119 mesaje");
    expect(countLabel(120, "mesaj", "mesaje")).toBe("120 de mesaje");
    expect(countLabel(1000, "membru", "membri")).toBe("1.000 de membri");
    expect(countLabel(1000000, "membru", "membri")).toBe("1.000.000 de membri");
  });

  it("zero nu primește „de”", () => {
    expect(countLabel(0, "mesaj", "mesaje")).toBe("0 mesaje");
  });
});

describe("formatReportDay", () => {
  it("scrie ziua în română, fără să depindă de fusul orar al browserului", () => {
    expect(formatReportDay("2026-10-21")).toBe("21 octombrie 2026");
    expect(formatReportDay("2026-01-01")).toBe("1 ianuarie 2026");
  });

  it("lasă neschimbată o zi care nu se poate citi", () => {
    expect(formatReportDay("ieri")).toBe("ieri");
  });
});

describe("formatTimestamp", () => {
  it("scrie data pe scurt și lasă neschimbat ce nu se poate citi", () => {
    expect(formatTimestamp("2026-10-21T12:00:00.000Z")).toMatch(/2026/);
    expect(formatTimestamp("nu e dată")).toBe("nu e dată");
  });
});

describe("odometerColumns", () => {
  it("numără cifrele, iar punctul de la mii rămâne separator", () => {
    expect(odometerColumns("1.014")).toEqual([
      { kind: "digit", digit: 1, index: 0 },
      { kind: "separator", text: "." },
      { kind: "digit", digit: 0, index: 1 },
      { kind: "digit", digit: 1, index: 2 },
      { kind: "digit", digit: 4, index: 3 },
    ]);
  });

  it("merge și pentru un singur caracter și pentru text gol", () => {
    expect(odometerColumns("7")).toEqual([{ kind: "digit", digit: 7, index: 0 }]);
    expect(odometerColumns("")).toEqual([]);
  });
});
