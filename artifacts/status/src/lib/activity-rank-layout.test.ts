import { describe, expect, it } from "vitest";
import {
  activityRankBarHeightPercent,
  activityRankBarMaxY,
  activityRankLayoutForBanner,
  activityRankMemberHeightPercent,
  activityRankMemberMaxY,
  activityRankMemberScale,
} from "./activity-rank-layout";

describe("activity rank card layout", () => {
  it("preserves the existing automatic placements for default and custom banners", () => {
    expect(activityRankLayoutForBanner(null, false)).toEqual({
      bar: { x: 23, y: 52.62, width: 70 },
      member: { x: 25.5, y: 65.54, width: 67.5 },
    });
    expect(activityRankLayoutForBanner(null, true)).toEqual({
      bar: { x: 15, y: 52.62, width: 70 },
      member: { x: 13.5, y: 65.54, width: 73 },
    });
  });

  it("keeps resized elements proportional and calculates safe bottom bounds", () => {
    expect(activityRankBarHeightPercent(70)).toBeCloseTo(11.99, 1);
    expect(activityRankBarMaxY(70) + activityRankBarHeightPercent(70)).toBeCloseTo(100);
    expect(activityRankMemberHeightPercent(67.5, false)).toBeCloseTo(15.36);
    expect(activityRankMemberMaxY(73, true) + activityRankMemberHeightPercent(73, true)).toBeCloseTo(100);
    expect(activityRankMemberScale(36.5, false)).toBeCloseTo(36.5 / 67.5);
  });
});
