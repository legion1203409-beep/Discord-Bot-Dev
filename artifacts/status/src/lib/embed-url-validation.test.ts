import { describe, expect, it } from "vitest";
import { embedUrlDraftError, isPublicGifUrl } from "./embed-url-validation";

describe("embed URL draft validation", () => {
  it("rejects numeric Discord IDs and missing URLs when animations are enabled", () => {
    expect(embedUrlDraftError({ animations: true, iconUrl: null, animationUrl: "12345678912345678" }))
      .toMatch(/nu un ID Discord/);
    expect(embedUrlDraftError({ animations: true, iconUrl: null, animationUrl: null }))
      .toMatch(/adaugă un URL/);
  });

  it("accepts public HTTPS GIF links, including a query string", () => {
    expect(isPublicGifUrl("https://images.example.com/moderation.GIF?version=1")).toBe(true);
    expect(embedUrlDraftError({
      animations: true,
      iconUrl: "https://images.example.com/icon.png",
      animationUrl: "https://images.example.com/moderation.gif?version=1",
    })).toBeNull();
  });

  it("rejects non-GIF, insecure and private links even if animations are off", () => {
    for (const animationUrl of ["https://example.com/image.png", "http://example.com/image.gif", "https://127.0.0.1/image.gif"]) {
      expect(embedUrlDraftError({ animations: false, iconUrl: null, animationUrl })).not.toBeNull();
    }
    expect(embedUrlDraftError({ animations: false, iconUrl: "12345678", animationUrl: null }))
      .toMatch(/iconului/);
    expect(embedUrlDraftError({ animations: false, iconUrl: null, animationUrl: null })).toBeNull();
  });
});