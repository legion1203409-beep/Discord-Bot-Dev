import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig } from "../gameplay-config";
import { expeditionLoot } from "../expeditions";

describe("expedition loot", () => {
  const settings = { goldPerHour: 100 };
  it("grows with the hours and the companion's level", () => {
    const mid = () => 0.5;
    expect(expeditionLoot(1, 1, settings, mid).gold).toBe(100);
    expect(expeditionLoot(8, 1, settings, mid).gold).toBe(800);
    expect(expeditionLoot(4, 6, settings, mid).gold).toBe(600);
  });
  it("rolls one material per hour, two from companion level 5", () => {
    const count = (items: Record<string, number | undefined>) => Object.values(items).reduce<number>((sum, qty) => sum + (qty ?? 0), 0);
    expect(count(expeditionLoot(4, 1, settings).items)).toBe(4);
    expect(count(expeditionLoot(4, 5, settings).items)).toBe(8);
    expect(Object.keys(expeditionLoot(8, 1, settings, () => 0).items)).toEqual(["fragment_cenusa"]);
  });
  it("keeps only valid settings", () => {
    expect(normalizeGameplayConfig({ expeditions: { speed: 9, goldPerHour: 50 } }).expeditions).toEqual({ enabled: true, goldPerHour: 50, speed: 1 });
  });
});
