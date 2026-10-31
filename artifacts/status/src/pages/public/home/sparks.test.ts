import { describe, expect, it } from "vitest";
import { buildAmbience, makeRng } from "./sparks";

describe("makeRng", () => {
  it("dă mereu aceleași numere pentru aceeași sămânță", () => {
    const a = makeRng(1014);
    const b = makeRng(1014);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("rămâne între 0 și 1", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("buildAmbience", () => {
  const amb = buildAmbience();

  it("are câte elemente a desenat designul", () => {
    expect(amb.hero).toHaveLength(38);
    expect(amb.invitation).toHaveLength(16);
    expect(amb.ashes).toHaveLength(22);
    expect(amb.oracle).toHaveLength(12);
  });

  it("e identic la fiecare apel", () => {
    expect(buildAmbience()).toEqual(amb);
  });

  // Valorile de mai jos au fost scoase din codul designului, cu aceeași sămânță.
  it("pune scânteile și cenușa exact unde le-a pus designul", () => {
    expect(amb.hero[0]).toEqual({ cls: "emb ea", left: "15.74%", bottom: "21.7%", size: "5.5px", dur: "16.35s", delay: "-10.54s" });
    expect(amb.hero[37]).toEqual({ cls: "emb eb", left: "39.34%", bottom: "3.6%", size: "5.1px", dur: "12.64s", delay: "-15.75s" });
    expect(amb.invitation[0]).toEqual({ cls: "emb ea", left: "66.77%", bottom: "5.4%", size: "5.7px", dur: "14.91s", delay: "-16.75s" });
    expect(amb.ashes[0]).toEqual({ left: "12.24%", top: "4.9%", size: "3.8px", dur: "16.66s", delay: "-26.25s", sw: "-21px", o: "0.62" });
    expect(amb.ashes[21]).toEqual({ left: "50.13%", top: "60.2%", size: "3.9px", dur: "25.08s", delay: "-27.17s", sw: "-5px", o: "0.71" });
    expect(amb.oracle[0]).toEqual({ cls: "emb ea", left: "58.23%", bottom: "23.9%", size: "3.0px", dur: "16.71s", delay: "-11.15s" });
  });

  it("alternează cele trei feluri de scântei", () => {
    expect(amb.hero.slice(0, 6).map((s) => s.cls)).toEqual(["emb ea", "emb eb", "emb ec", "emb ea", "emb eb", "emb ec"]);
  });
});
