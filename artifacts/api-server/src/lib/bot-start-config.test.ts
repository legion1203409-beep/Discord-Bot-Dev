import { describe, expect, it } from "vitest";
import { shouldStartBot } from "./bot-start-config";

describe("shouldStartBot", () => {
  it("starts automatically in production", () => {
    expect(shouldStartBot("production", undefined)).toBe(true);
  });

  it("stays disabled in development unless explicitly enabled", () => {
    expect(shouldStartBot("development", undefined)).toBe(false);
    expect(shouldStartBot("development", "false")).toBe(false);
    expect(shouldStartBot("development", "true")).toBe(true);
  });
});
