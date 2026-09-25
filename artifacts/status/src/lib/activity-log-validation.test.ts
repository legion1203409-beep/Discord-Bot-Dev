import { describe, expect, it } from "vitest";
import { activityLogDraftError } from "./activity-log-validation";

describe("activity log draft validation", () => {
  it("allows a disabled activity log without roles", () => {
    expect(activityLogDraftError({ enabled: false, roleIds: [], categories: { messages: true } })).toBeNull();
  });

  it("explains why an enabled activity log cannot be saved without roles", () => {
    expect(activityLogDraftError({ enabled: true, roleIds: [], categories: { messages: true } }))
      .toMatch(/cel puțin un rol/);
  });

  it("requires a category only when enabled", () => {
    expect(activityLogDraftError({ enabled: true, roleIds: ["123456789"], categories: { messages: false } }))
      .toMatch(/cel puțin o categorie/);
    expect(activityLogDraftError({ enabled: false, roleIds: [], categories: { messages: false } })).toBeNull();
  });

  it("accepts an enabled log with a category and a private access role", () => {
    expect(activityLogDraftError({ enabled: true, roleIds: ["123456789"], categories: { messages: true } })).toBeNull();
  });
});