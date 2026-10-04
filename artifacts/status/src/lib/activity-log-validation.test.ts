import { describe, expect, it } from "vitest";
import { activityLogDraftError } from "./activity-log-validation";

describe("activity log draft validation", () => {
  it("allows a disabled activity log without roles", () => {
    expect(activityLogDraftError({ enabled: false, categories: { messages: true } })).toBeNull();
  });

  it("allows an enabled activity log with a category and no configured roles", () => {
    expect(activityLogDraftError({ enabled: true, categories: { messages: true } })).toBeNull();
  });

  it("requires a category only when enabled", () => {
    expect(activityLogDraftError({ enabled: true, categories: { messages: false } }))
      .toMatch(/cel puțin o categorie/);
    expect(activityLogDraftError({ enabled: false, categories: { messages: false } })).toBeNull();
  });
});