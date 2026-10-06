import { describe, expect, it } from "vitest";
import { activityRoleRewardsError } from "./activity-role-rewards";

describe("activity role reward validation", () => {
  it("allows legacy mode, an empty custom list, and inclusive levels 1 and 100", () => {
    expect(activityRoleRewardsError(null)).toBe("");
    expect(activityRoleRewardsError([])).toBe("");
    expect(activityRoleRewardsError([{ level: 1, roleId: "111111" }, { level: 100, roleId: "222222" }])).toBe("");
  });
  it.each([0, 101, 1.5, NaN])("rejects invalid level %s", (level) => {
    expect(activityRoleRewardsError([{ level, roleId: "111111" }])).not.toBe("");
  });
  it("rejects incomplete rows and duplicate levels or roles", () => {
    expect(activityRoleRewardsError([{ level: 5, roleId: "" }])).not.toBe("");
    expect(activityRoleRewardsError([{ level: 5, roleId: "111111" }, { level: 5, roleId: "222222" }])).not.toBe("");
    expect(activityRoleRewardsError([{ level: 5, roleId: "111111" }, { level: 10, roleId: "111111" }])).not.toBe("");
  });
});
