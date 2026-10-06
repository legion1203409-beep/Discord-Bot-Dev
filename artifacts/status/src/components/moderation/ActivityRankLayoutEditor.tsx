import { RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import {
  activityRankBarMaxY,
  activityRankLayoutForBanner,
  activityRankMemberMaxY,
  type ActivityRankLayout,
} from "../../lib/activity-rank-layout";

interface Props {
  value: ActivityRankLayout | null;
  hasCustomBanner: boolean;
  onChange: (value: ActivityRankLayout | null) => void;
  disabled?: boolean;
}

interface RangeControlProps {
  label: string;
  value: number;
  max?: number;
  testId: string;
  disabled: boolean;
  onChange: (value: number) => void;
}

function RangeControl({ label, value, max = 100, testId, disabled, onChange }: RangeControlProps) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(1)}%</span>
      </span>
      <Slider
        aria-label={label}
        value={[value]}
        min={0}
        max={max}
        step={0.5}
        disabled={disabled}
        data-testid={testId}
        onValueChange={(values) => {
          const next = values[0];
          if (typeof next === "number") onChange(next);
        }}
      />
    </label>
  );
}

export function ActivityRankLayoutEditor({
  value,
  hasCustomBanner,
  onChange,
  disabled = false,
}: Props) {
  const layout = activityRankLayoutForBanner(value, hasCustomBanner);

  const updateBar = (patch: Partial<ActivityRankLayout["bar"]>) => {
    const bar = { ...layout.bar, ...patch };
    bar.x = Math.min(bar.x, 100 - bar.width);
    bar.y = Math.min(bar.y, activityRankBarMaxY(bar.width));
    onChange({ ...layout, bar });
  };

  const updateMember = (patch: Partial<ActivityRankLayout["member"]>) => {
    const member = { ...layout.member, ...patch };
    member.x = Math.min(member.x, 100 - member.width);
    member.y = Math.min(member.y, activityRankMemberMaxY(member.width, hasCustomBanner));
    onChange({ ...layout, member });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/40 p-4" data-testid="editor-activity-rank-layout">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-medium">Poziția și dimensiunea elementelor /rank</h3>
          <p className="text-xs text-muted-foreground">
            Reglează bara XP și cardul membrului pe banner. Valorile sunt procente; dimensiunea păstrează proporțiile.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={disabled || value === null}
          data-testid="button-layout-reset"
          onClick={() => onChange(null)}
        >
          <RotateCcw className="h-4 w-4" />
          Poziție automată
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-border/70 p-3">
          <h4 className="text-sm font-semibold">Bara XP</h4>
          <RangeControl
            label="De la stânga"
            value={layout.bar.x}
            max={100 - layout.bar.width}
            testId="slider-layout-bar-x"
            disabled={disabled}
            onChange={(x) => updateBar({ x })}
          />
          <RangeControl
            label="De sus"
            value={layout.bar.y}
            max={activityRankBarMaxY(layout.bar.width)}
            testId="slider-layout-bar-y"
            disabled={disabled}
            onChange={(y) => updateBar({ y })}
          />
          <RangeControl
            label="Lățime și mărime"
            value={layout.bar.width}
            max={100}
            testId="slider-layout-bar-width"
            disabled={disabled}
            onChange={(width) => updateBar({ width })}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-border/70 p-3">
          <h4 className="text-sm font-semibold">Avatar, nume și nivel</h4>
          <RangeControl
            label="De la stânga"
            value={layout.member.x}
            max={100 - layout.member.width}
            testId="slider-layout-member-x"
            disabled={disabled}
            onChange={(x) => updateMember({ x })}
          />
          <RangeControl
            label="De sus"
            value={layout.member.y}
            max={activityRankMemberMaxY(layout.member.width, hasCustomBanner)}
            testId="slider-layout-member-y"
            disabled={disabled}
            onChange={(y) => updateMember({ y })}
          />
          <RangeControl
            label="Lățime și mărime"
            value={layout.member.width}
            max={100}
            testId="slider-layout-member-width"
            disabled={disabled}
            onChange={(width) => updateMember({ width })}
          />
        </div>
      </div>
    </section>
  );
}
