import { describe, expect, it } from "vitest";
import { DEFAULT_VERIFICATION_PAGE, verificationPageError, verificationPageOf } from "./verification-page-texts";

describe("textele paginii de verificare", () => {
  it("fills in what is missing with the default texts", () => {
    expect(verificationPageOf(undefined)).toEqual(DEFAULT_VERIFICATION_PAGE);
    const page = verificationPageOf({ title: "Intră în clan", ctaLabel: "  ", runesEnabled: false });
    expect(page.title).toBe("Intră în clan");
    expect(page.ctaLabel).toBe(DEFAULT_VERIFICATION_PAGE.ctaLabel);
    expect(page.runesEnabled).toBe(false);
  });

  it("finds an empty or too long text before the server refuses it", () => {
    expect(verificationPageError(DEFAULT_VERIFICATION_PAGE)).toBeNull();
    expect(verificationPageError({ ...DEFAULT_VERIFICATION_PAGE, title: " " })).toBe("Titlul nu poate fi gol.");
    expect(verificationPageError({ ...DEFAULT_VERIFICATION_PAGE, ctaLabel: "x".repeat(41) })).toMatch(/Butonul de final are 41/);
  });
});
