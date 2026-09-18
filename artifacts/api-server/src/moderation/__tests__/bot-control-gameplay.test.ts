import { describe, expect, it } from "vitest";
import { botControlSchema } from "../router";
import { DEFAULT_GAMEPLAY_CONFIG } from "../../bot/gameplay-config";

const validPayload = () => ({
  channels: {},
  allianceRecruitmentText: "Mesaj",
  gameplayConfig: structuredClone(DEFAULT_GAMEPLAY_CONFIG),
});

describe("owner gameplay configuration limits", () => {
  it.each([
    ["event duration", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.events.eventDurationMinutes = 0; }],
    ["mission target", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.missions.kill_10.target = 10_001; }],
    ["mission reward", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.missions.rare_3.rewardQty = 101; }],
    ["economy multiplier", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.economy.bossGoldMultiplier = 10.1; }],
  ])("rejects %s outside the allowed range", (_label, mutate) => {
    const payload = validPayload();
    mutate(payload);
    expect(() => botControlSchema.parse(payload)).toThrow();
  });

  it("rejects inverted min/max intervals", () => {
    const payload = validPayload();
    payload.gameplayConfig.events.eventCooldownMinMinutes = 20;
    payload.gameplayConfig.events.eventCooldownMaxMinutes = 10;
    expect(() => botControlSchema.parse(payload)).toThrow();
  });

  it("accepts the default profile and preserves all gameplay sections", () => {
    const parsed = botControlSchema.parse(validPayload());
    expect(parsed.gameplayConfig).toEqual(DEFAULT_GAMEPLAY_CONFIG);
  });
});