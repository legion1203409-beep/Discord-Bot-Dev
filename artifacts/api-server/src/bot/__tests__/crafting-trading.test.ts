import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig } from "../gameplay-config";
import { ITEMS } from "../survival";
import { RECIPES, craftableTimes, recipeLabel } from "../crafting";
import { TRADEABLE, afterTax, isEmptySide } from "../trading";

describe("crafting", () => {
  it("has recipes made only of real items, each ending rarer than it starts", () => {
    for (const recipe of RECIPES) {
      expect(ITEMS[recipe.result]).toBeDefined();
      for (const item of Object.keys(recipe.inputs)) expect(ITEMS[item as keyof typeof ITEMS]).toBeDefined();
    }
    expect(new Set(RECIPES.map((recipe) => recipe.key)).size).toBe(RECIPES.length);
  });
  it("counts how many times a recipe fits the bag and the purse", () => {
    const blade = RECIPES.find((recipe) => recipe.key === "fragment_arma")!;
    expect(craftableTimes(blade, { fragment_cenusa: 9, sange_monstru: 5 }, 0)).toBe(2);
    expect(craftableTimes(blade, { fragment_cenusa: 3, sange_monstru: 5 }, 0)).toBe(0);
    const titan = RECIPES.find((recipe) => recipe.key === "sange_titan")!;
    expect(craftableTimes(titan, { cristal_abis: 9, inima_abisului: 3 }, 600)).toBe(1);
    expect(recipeLabel(titan)).toContain("500 Oboli");
  });
});

describe("trading", () => {
  it("never trades levelled equipment", () => {
    expect(TRADEABLE).toContain("fragment_arma");
    expect(TRADEABLE).not.toContain("sabia_regelui");
    expect(TRADEABLE.length).toBeLessThanOrEqual(25);
  });
  it("taxes only Oboli and knows an empty side", () => {
    expect(afterTax(1_000, 5)).toBe(950);
    expect(isEmptySide({ item: null, qty: 1, gold: 0 })).toBe(true);
    expect(isEmptySide({ item: "fragment_cenusa", qty: 2, gold: 0 })).toBe(false);
  });
  it("keeps only valid settings", () => {
    expect(normalizeGameplayConfig({ crafting: { taxPercent: 99, tradeEnabled: false } }).crafting).toEqual({ enabled: true, tradeEnabled: false, taxPercent: 5 });
  });
});
