export interface ActivityRankLayout {
  bar: { x: number; y: number; width: number };
  member: { x: number; y: number; width: number };
}

const DEFAULT_MEMBER_WIDTH = 67.5;
const CUSTOM_MEMBER_WIDTH = 73;

export function activityRankLayoutForBanner(
  layout: ActivityRankLayout | null,
  hasCustomBanner: boolean,
): ActivityRankLayout {
  if (layout) return layout;
  return hasCustomBanner
    ? {
        bar: { x: 15, y: 52.62, width: 70 },
        member: { x: 13.5, y: 65.54, width: CUSTOM_MEMBER_WIDTH },
      }
    : {
        bar: { x: 23, y: 52.62, width: 70 },
        member: { x: 25.5, y: 65.54, width: DEFAULT_MEMBER_WIDTH },
      };
}

export function activityRankBarHeightPercent(width: number): number {
  return width * (800 * 64 / (560 * 534));
}

export function activityRankMemberHeightPercent(width: number, hasCustomBanner: boolean): number {
  const defaultWidth = hasCustomBanner ? CUSTOM_MEMBER_WIDTH : DEFAULT_MEMBER_WIDTH;
  return 15.36 * (width / defaultWidth);
}

export function activityRankBarMaxY(width: number): number {
  return 100 - activityRankBarHeightPercent(width);
}

export function activityRankMemberMaxY(width: number, hasCustomBanner: boolean): number {
  return 100 - activityRankMemberHeightPercent(width, hasCustomBanner);
}

export function activityRankMemberScale(width: number, hasCustomBanner: boolean): number {
  return width / (hasCustomBanner ? CUSTOM_MEMBER_WIDTH : DEFAULT_MEMBER_WIDTH);
}
