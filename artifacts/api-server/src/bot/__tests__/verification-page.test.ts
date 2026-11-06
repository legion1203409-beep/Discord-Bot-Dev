import { describe, expect, it } from "vitest";
import { DEFAULT_VERIFICATION_PAGE, normalizeVerificationConfig, normalizeVerificationPage } from "../verification";

describe("the verification page texts", () => {
  it("keeps the defaults for a server that never changed them", () => {
    expect(normalizeVerificationPage(undefined)).toEqual(DEFAULT_VERIFICATION_PAGE);
    expect(normalizeVerificationConfig({}).page).toEqual(DEFAULT_VERIFICATION_PAGE);
  });

  it("keeps the texts the server wrote, trimmed and within their limits", () => {
    const page = normalizeVerificationPage({ title: "  Intră în clan  ", lead: "x".repeat(900), ctaLabel: "", runesEnabled: false, successText: 42 });
    expect(page.title).toBe("Intră în clan");
    expect(page.lead).toHaveLength(500);
    expect(page.ctaLabel).toBe(DEFAULT_VERIFICATION_PAGE.ctaLabel);
    expect(page.successText).toBe(DEFAULT_VERIFICATION_PAGE.successText);
    expect(page.runesEnabled).toBe(false);
  });
});
