import { describe, expect, it } from "vitest";
import { renderDailyReportChart, type DailyChartInput } from "../daily-report-chart";

const INPUT: DailyChartInput = {
  guild: "Regatul Cenușii",
  date: "joi, 29 octombrie 2026",
  color: "#7c3aed",
  metrics: [
    { label: "Mesaje", value: 307, delta: 131 },
    { label: "Utilizatori unici", value: 13, delta: -2 },
    { label: "Boost-uri", value: 0, delta: 0 },
    { label: "Intrări", value: 5, delta: 3 },
    { label: "Ieșiri", value: 2, delta: 1, invert: true },
    { label: "Vârf vocal", value: 4, delta: null },
  ],
  activityTitle: "Activitate · ultimele 7 zile",
  activity: [
    { label: "Vi 23", value: null, current: false },
    { label: "Sâ 24", value: 83, current: false },
    { label: "Du 25", value: 61, current: false },
    { label: "Lu 26", value: 119, current: false },
    { label: "Ma 27", value: 94, current: false },
    { label: "Mi 28", value: 176, current: false },
    { label: "Jo 29", value: 307, current: true },
  ],
  average: 140,
  summary: "Bilanț: +3 membri · 1.234 pe server acum",
};

describe("the daily report card", () => {
  it("is drawn as an 800 px wide PNG", async () => {
    const image = await renderDailyReportChart(INPUT);
    expect(image).not.toBeNull();
    expect(image!.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image!.readUInt32BE(16)).toBe(800);
    expect(image!.readUInt32BE(20)).toBe(780);
  }, 20_000);

  it("gives up quietly when the drawing fails, so the report still goes out", async () => {
    const broken = { ...INPUT, metrics: [{ label: "Mesaje", value: "multe" as unknown as number, delta: null }] };
    expect(await renderDailyReportChart(broken)).toBeNull();
  }, 20_000);
});
