import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig } from "../gameplay-config";
import { cleanBrotherhoodName, cleanTag } from "../brotherhoods";

describe("brotherhood names", () => {
  it("keep letters, digits and a few signs, 3–24 characters, and a key without case or accents", () => {
    expect(cleanBrotherhoodName("  Frăția   Cenușii! ")).toEqual({ name: "Frăția Cenușii", key: "fratia cenusii" });
    expect(cleanBrotherhoodName("Lupii-d'Argint")?.name).toBe("Lupii-d'Argint");
    expect(cleanBrotherhoodName("ab")).toBeNull();
    expect(cleanBrotherhoodName("x".repeat(25))).toBeNull();
    // A mention cannot sneak into the name.
    expect(cleanBrotherhoodName("<@123>")?.name).toBe("123");
  });
  it("get a tag of 2–4 characters, from the name when none is given", () => {
    expect(cleanTag("fc!", "Frăția Cenușii")).toBe("FC");
    expect(cleanTag(null, "Frăția Cenușii")).toBe("FC");
    expect(cleanTag("", "Umbra")).toBe("UX");
    expect(cleanTag("abcdef", "x")).toBe("ABCD");
  });
  it("keep only valid settings", () => {
    expect(normalizeGameplayConfig({ guilds: { maxMembers: 1, createCost: 100 } }).guilds).toEqual({ enabled: true, createCost: 100, maxMembers: 20 });
  });
});
