import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR,
  HAUNTED_HOUSE_MAX_NARRATIVE_CHARS,
  HAUNTED_HOUSE_MAX_PLAYS,
  buildGhostPrompt,
  claimHauntedDoorChoice,
  generateGhostNarrative,
  getHauntedHouseLeaderboard,
  getHauntedHouseSessionId,
  handleHauntedHouseCommand,
  handleHauntedHouseDoorButton,
  issueHauntedDoorChoice,
  isHauntedHouseActive,
  resetHauntedHouseStateForTests,
  startHauntedHouse,
  stopHauntedHouse,
} from "../haunted-house";

const guildId = "guild-halloween";
const userId = "member-1";

beforeEach(() => {
  resetHauntedHouseStateForTests();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Casa Bântuită", () => {
  it("keeps event scoring and its leaderboard separate per server", () => {
    startHauntedHouse(guildId);
    startHauntedHouse("guild-other");

    const issued = issueHauntedDoorChoice(guildId, userId, "nonce-1", 100_000);
    expect(issued.ok).toBe(true);
    expect(claimHauntedDoorChoice(guildId, userId, "nonce-1", "felinar", 100_000, 0.05)).toMatchObject({
      ok: true,
      outcome: { candies: 8, points: 7 },
    });

    expect(getHauntedHouseLeaderboard(guildId)).toEqual([
      { userId, plays: 1, candies: 8, points: 7 },
    ]);
    expect(getHauntedHouseLeaderboard("guild-other")).toEqual([]);
  });

  it("allows one pending choice at a time and enforces three plays per member", () => {
    startHauntedHouse(guildId);
    const start = 100_000;

    expect(issueHauntedDoorChoice(guildId, userId, "first", start).ok).toBe(true);
    expect(issueHauntedDoorChoice(guildId, userId, "second", start)).toMatchObject({ ok: false, reason: "pending" });
    expect(claimHauntedDoorChoice(guildId, userId, "wrong-nonce", "craniu", start)).toMatchObject({ ok: false, reason: "invalid" });

    for (let play = 1; play <= HAUNTED_HOUSE_MAX_PLAYS; play += 1) {
      const now = start + (play - 1) * 30_001;
      const nonce = play === 1 ? "first" : `play-${play}`;
      if (play > 1) expect(issueHauntedDoorChoice(guildId, userId, nonce, now).ok).toBe(true);
      expect(claimHauntedDoorChoice(guildId, userId, nonce, "paianjen", now, 0.2).ok).toBe(true);
    }

    expect(issueHauntedDoorChoice(guildId, userId, "fourth", start + 4 * 30_001)).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(getHauntedHouseLeaderboard(guildId)[0]).toMatchObject({ plays: 3 });
  });

  it("invalidates every pending button and clears the temporary leaderboard on stop", () => {
    startHauntedHouse(guildId);
    issueHauntedDoorChoice(guildId, userId, "pending-stop", 100_000);

    stopHauntedHouse(guildId);

    expect(isHauntedHouseActive(guildId)).toBe(false);
    expect(claimHauntedDoorChoice(guildId, userId, "pending-stop", "felinar", 100_001)).toEqual({
      ok: false,
      reason: "inactive",
    });
    expect(getHauntedHouseLeaderboard(guildId)).toEqual([]);
    expect(issueHauntedDoorChoice(guildId, userId, "closed", 100_001)).toEqual({
      ok: false,
      reason: "inactive",
    });
  });

  it("does not let a previous session's button act on a freshly restarted event", () => {
    startHauntedHouse(guildId);
    const oldSession = getHauntedHouseSessionId(guildId);
    issueHauntedDoorChoice(guildId, userId, "old-session", 100_000);
    stopHauntedHouse(guildId);
    startHauntedHouse(guildId);

    expect(getHauntedHouseSessionId(guildId)).not.toBe(oldSession);
    expect(claimHauntedDoorChoice(guildId, userId, "old-session", "felinar", 100_001)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(getHauntedHouseLeaderboard(guildId)).toEqual([]);
  });

  it("denies non-admin event controls and keeps a repeated start from resetting scores", async () => {
    const deniedReply = vi.fn();
    const nonAdminInteraction = {
      guildId,
      user: { id: userId },
      options: { getSubcommand: () => "start" },
      memberPermissions: { has: () => false },
      reply: deniedReply,
    } as unknown as ChatInputCommandInteraction;

    await handleHauntedHouseCommand(nonAdminInteraction);
    expect(deniedReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Doar administratorii") }));
    expect(isHauntedHouseActive(guildId)).toBe(false);

    const adminInteraction = (subcommand: string, reply = vi.fn()) => ({
      guildId,
      user: { id: "admin-1" },
      options: { getSubcommand: () => subcommand },
      memberPermissions: { has: () => true },
      reply,
    }) as unknown as ChatInputCommandInteraction;

    await handleHauntedHouseCommand(adminInteraction("start"));
    issueHauntedDoorChoice(guildId, userId, "score-before-repeat", 100_000);
    claimHauntedDoorChoice(guildId, userId, "score-before-repeat", "felinar", 100_000, 0.05);

    const repeatedStartReply = vi.fn();
    await handleHauntedHouseCommand(adminInteraction("start", repeatedStartReply));
    expect(repeatedStartReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("deja deschisă") }));
    expect(getHauntedHouseLeaderboard(guildId)).toHaveLength(1);

    await handleHauntedHouseCommand(adminInteraction("stop"));
    expect(isHauntedHouseActive(guildId)).toBe(false);
  });

  it("rejects a Discord door button after an administrator closes the event", async () => {
    startHauntedHouse(guildId);
    issueHauntedDoorChoice(guildId, userId, "stale-button", 100_000);
    stopHauntedHouse(guildId);

    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId: `hh:${guildId}:${userId}:stale-button:felinar`,
      guildId,
      user: { id: userId },
      deferUpdate,
      editReply,
      reply: vi.fn(),
    } as unknown as ButtonInteraction;

    await expect(handleHauntedHouseDoorButton(interaction)).resolves.toBe(true);
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("nu este deschisă") }));
  });

  it("uses a door-specific fallback without calling AI when no key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const provider = vi.fn().mockResolvedValue("AI reply");

    const narrative = await generateGhostNarrative("craniu", userId, 100_000, provider);

    expect(narrative).toContain("Craniul");
    expect(provider).not.toHaveBeenCalled();
  });

  it("bounds AI text and prevents narration from changing bot-calculated rewards", async () => {
    startHauntedHouse(guildId);
    const choice = issueHauntedDoorChoice(guildId, userId, "ai-narration", 100_000);
    expect(choice.ok).toBe(true);
    const claim = claimHauntedDoorChoice(guildId, userId, "ai-narration", "felinar", 100_000, 0.05);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const provider = vi.fn().mockResolvedValue("Fantoma spune ceva. ".repeat(100));
    const narrative = await generateGhostNarrative("felinar", userId, 100_001, provider);

    expect(narrative.length).toBeLessThanOrEqual(HAUNTED_HOUSE_MAX_NARRATIVE_CHARS);
    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0]?.[0]).toContain("Ușa felinarului");
    expect(provider.mock.calls[0]?.[0]).not.toContain("8 bomboane");
    expect(getHauntedHouseLeaderboard(guildId)[0]).toMatchObject({
      candies: claim.totalCandies,
      points: claim.totalPoints,
    });
  });

  it("falls back after provider errors and enforces both AI call limits", async () => {
    const now = 100_000;
    const failingProvider = vi.fn().mockRejectedValue(new Error("unavailable"));
    const fallback = await generateGhostNarrative("paianjen", "failure-member", now, failingProvider);
    expect(fallback).toContain("Pânza");

    resetHauntedHouseStateForTests();
    const provider = vi.fn().mockResolvedValue("O șoaptă scurtă.");
    expect(await generateGhostNarrative("felinar", "cooldown-member", now, provider)).toBe("O șoaptă scurtă.");
    expect(await generateGhostNarrative("craniu", "cooldown-member", now + 1_000, provider)).toContain("Craniul");
    expect(provider).toHaveBeenCalledOnce();

    for (let index = 1; index < HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR; index += 1) {
      await generateGhostNarrative("felinar", `member-${index}`, now + 60_000, provider);
    }
    const capped = await generateGhostNarrative("craniu", "last-member", now + 60_000, provider);
    expect(capped).toContain("Craniul");
    expect(provider).toHaveBeenCalledTimes(HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR);
  });

  it("asks the ghost only for short Romanian narration and a clue about the selected door", () => {
    const prompt = buildGhostPrompt("paianjen");
    expect(prompt).toContain("exclusiv în română");
    expect(prompt).toContain("cel mult două propoziții");
    expect(prompt).toContain("Ușa pânzei");
    expect(prompt).toContain("Nu inventa și nu anunța bomboane");
  });
});
