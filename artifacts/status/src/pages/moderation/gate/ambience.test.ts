import { describe, expect, it } from "vitest";
import { buildGateAmbience } from "./ambience";

describe("buildGateAmbience", () => {
  const amb = buildGateAmbience();

  it("are câte elemente a desenat designul", () => {
    expect(amb.embers).toHaveLength(26);
    expect(amb.ashes).toHaveLength(20);
    expect(amb.foreground).toHaveLength(7);
  });

  it("e identic la fiecare apel", () => {
    expect(buildGateAmbience()).toEqual(amb);
  });

  // Valorile de mai jos au fost scoase din codul designului, cu aceeași sămânță.
  it("pune scânteile și cenușa exact unde le-a pus designul", () => {
    expect(amb.embers[0]).toEqual({ cls: "emb ea", left: "45.54%", bottom: "1.3%", size: "4.6px", dur: "13.57s", delay: "-2.59s" });
    expect(amb.embers[25]).toEqual({ cls: "emb eb", left: "91.31%", bottom: "17.1%", size: "4.6px", dur: "14.74s", delay: "-6.18s" });
    expect(amb.ashes[0]).toEqual({ left: "24.91%", top: "41.5%", size: "2.0px", dur: "16.99s", delay: "-3.11s", sw: "42px", o: "0.42" });
    expect(amb.ashes[19]).toEqual({ left: "68.11%", top: "80.3%", size: "3.4px", dur: "20.19s", delay: "-15.49s", sw: "-43px", o: "0.60" });
    expect(amb.foreground[0]).toEqual({ cls: "emb ea", left: "3.84%", bottom: "16.4%", size: "7.2px", dur: "10.16s", delay: "-8.63s" });
    expect(amb.foreground[1]).toEqual({ cls: "emb eb", left: "97.33%", bottom: "2.6%", size: "6.7px", dur: "11.83s", delay: "-15.90s" });
    expect(amb.foreground[6]).toEqual({ cls: "emb ea", left: "10.30%", bottom: "7.1%", size: "8.5px", dur: "11.09s", delay: "-6.53s" });
  });

  it("alternează cele trei feluri de scântei", () => {
    expect(amb.embers.slice(0, 6).map((s) => s.cls)).toEqual(["emb ea", "emb eb", "emb ec", "emb ea", "emb eb", "emb ec"]);
  });

  it("ține scânteile din prim-plan pe margini, ca să nu treacă peste carduri", () => {
    for (const s of amb.foreground) {
      const left = parseFloat(s.left);
      expect(left <= 16 || left >= 84).toBe(true);
    }
  });
});
