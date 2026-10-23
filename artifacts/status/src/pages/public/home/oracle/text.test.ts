import { describe, expect, it } from "vitest";
import { toBlocks, trimDangling } from "./text";

describe("toBlocks", () => {
  it("împarte textul în paragrafe și ignoră rândurile goale", () => {
    const blocks = toBlocks("Primul.\n\n  \nAl doilea.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ list: false, runs: [{ text: "Primul.", kind: "plain" }] });
  });

  it("recunoaște punctele de listă", () => {
    const blocks = toBlocks("- unu\n* doi\n• trei");
    expect(blocks.map((b) => b.list)).toEqual([true, true, true]);
    expect(blocks.map((b) => b.runs[0].text)).toEqual(["unu", "doi", "trei"]);
  });

  it("scoate **bold** și `cod` din text", () => {
    expect(toBlocks("Bun venit în **Regatul** cu `/warn`.")[0].runs).toEqual([
      { text: "Bun venit în ", kind: "plain" },
      { text: "Regatul", kind: "bold" },
      { text: " cu ", kind: "plain" },
      { text: "/warn", kind: "code" },
      { text: ".", kind: "plain" },
    ]);
  });

  it("scoate semnul de titlu și accentele simple", () => {
    expect(toBlocks("## Titlu")[0].runs[0].text).toBe("Titlu");
    expect(toBlocks("un *accent* simplu")[0].runs[0].text).toBe("un accent simplu");
  });

  it("nu produce niciodată HTML: marcajul rămâne text", () => {
    expect(toBlocks("<b>x</b>")[0].runs[0]).toEqual({ text: "<b>x</b>", kind: "plain" });
  });

  it("dă un bloc gol pentru text gol", () => {
    expect(toBlocks("")).toEqual([{ list: false, runs: [{ text: "", kind: "plain" }] }]);
    expect(toBlocks("  \n ")).toHaveLength(1);
  });
});

describe("trimDangling", () => {
  it("lasă textul întreg neatins", () => {
    expect(trimDangling("**bold** și `cod`")).toBe("**bold** și `cod`");
  });

  it("taie un **bold** rămas deschis", () => {
    expect(trimDangling("Bun venit în **Regat")).toBe("Bun venit în ");
  });

  it("taie un `cod` rămas deschis", () => {
    expect(trimDangling("Folosește `/mod")).toBe("Folosește ");
  });
});
