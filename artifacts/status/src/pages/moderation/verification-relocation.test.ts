import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("verification editor ownership", () => {
  it("keeps the editor and Discord preview on the verification page only", () => {
    const app = readSource("../../App.tsx");
    const verification = readSource("./panel/verification.tsx");

    // The old bot control page is gone; its tab address leads to the verification page.
    expect(app).toContain('verification: "/verificare"');
    expect(app).toContain("OLD_BOT_TABS[tab]");

    expect(verification).toContain("Panoul din Discord");
    expect(verification).toContain("Așa apare în Discord");
    expect(verification).toContain('field="imageUrl"');
    expect(verification).toContain("verifyGuildMembers");
  });
});
