import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("verification editor ownership", () => {
  it("keeps the editor and Discord preview on the verification page only", () => {
    const botControl = readSource("./BotControl.tsx");
    const verification = readSource("./panel/verification.tsx");

    expect(botControl).not.toContain('TabsContent value="verification"');
    expect(botControl).not.toContain("PREVIZUALIZARE DISCORD");
    // The old tab address leads to the verification page.
    expect(botControl).toContain('verification: "/verificare"');
    expect(botControl).toContain("setLocation(requestedTab && MOVED_TABS[requestedTab]");

    expect(verification).toContain("Panoul din Discord");
    expect(verification).toContain("Așa apare în Discord");
    expect(verification).toContain('field="imageUrl"');
    expect(verification).toContain("verifyGuildMembers");
  });
});
