import { describe, expect, it } from "vitest";
import { eyeGeometry, placeRune } from "./geometry";

describe("placeRune", () => {
  it("desenează o linie dreaptă ca drum SVG, rotită pe cerc", () => {
    // Runa „Isa” (o linie verticală), pusă sus, la 0°.
    expect(placeRune("M20 6V54", 0)).toBe("M0.0 -175.6L0.0 -158.4");
  });

  it("închide conturul la Z", () => {
    expect(placeRune("M8 10V50L32 10V50Z", 0).endsWith("Z")).toBe(true);
  });
});

describe("eyeGeometry", () => {
  const geo = eyeGeometry();

  // Valorile au fost scoase din codul designului.
  it("are runele și razele din design", () => {
    expect(geo.runesD).toHaveLength(1397);
    expect(geo.runesD.startsWith("M-2.5 -175.6L-2.5 -158.4M-2.5 -169.9L3.2 -174.6M-2.5 -165.2L3.2 -169.9")).toBe(true);
    expect(geo.raysA).toHaveLength(258);
    expect(geo.raysA.startsWith("M70.0 0.0L112.0 0.0M60.6 35.0L90.1 52.0M35.0 60.6L56.0 97.0")).toBe(true);
    expect(geo.raysB).toHaveLength(270);
    expect(geo.raysC).toHaveLength(270);
  });

  it("se calculează o singură dată", () => {
    expect(eyeGeometry()).toBe(geo);
  });
});
