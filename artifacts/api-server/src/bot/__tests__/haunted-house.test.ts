import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, Events, TextChannel, type ButtonInteraction, type ChatInputCommandInteraction, type Interaction } from "discord.js";
import { isGuildGameStopped, guildStates } from "../scheduler";
import {
  HAUNTED_HOUSE_MAX_AI_CALLS_PER_HOUR,
  HAUNTED_HOUSE_MAX_NARRATIVE_CHARS,
  HAUNTED_HOUSE_MAX_PLAYS,
  beginHauntedHouseStop,
  buildHauntedHouseOpenAnnouncement,
  buildGhostPrompt,
  cancelHauntedHouseStop,
  claimHauntedDoorChoice,
  completeHauntedHouseStop,
  dispatchHauntedHouseInteraction,
  formatHauntedHouseLeaderboard,
  generateGhostNarrative,
  getHauntedHouseLeaderboard,
  getHauntedHouseSessionId,
  handleHauntedHouseCommand,
  handleHauntedHouseEnterButton,
  handleHauntedHouseDoorButton,
  hauntedHouseCommand,
  issueHauntedDoorChoice,
  isHauntedHouseActive,
  publishHauntedHouseLeaderboard,
  resetHauntedHouseStateForTests,
  startHauntedHouse,
  stopHauntedHouse,
} from "../haunted-house";
import * as botDb from "../db";

const guildId = "guild-halloween";
const userId = "member-1";

function mockTextChannel(id: string, guildId: string) {
  return Object.assign(Object.create(TextChannel.prototype), {
    id,
    guildId,
    send: vi.fn().mockResolvedValue({ id: "announcement-message" }),
  });
}

beforeEach(() => {
  resetHauntedHouseStateForTests();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Castelul Bântuit", () => {
  it("posts an Enter button and opens private door choices for the clicking player", async () => {
    startHauntedHouse(guildId);
    const announcement = buildHauntedHouseOpenAnnouncement(guildId);
    expect(announcement.content).toContain("Castelul Bântuit");
    expect((announcement.components[0]?.components[0]?.data as { label?: string }).label).toBe("Intră în casă");

    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId: `hh_enter:${guildId}`,
      guildId,
      user: { id: userId },
      isChatInputCommand: () => false,
      isButton: () => true,
      isRepliable: () => true,
      reply,
    } as unknown as Interaction;

    const dispatched: Promise<unknown>[] = [];
    expect(dispatchHauntedHouseInteraction(interaction, (promise) => dispatched.push(promise))).toBe(true);
    await Promise.all(dispatched);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      ephemeral: true,
      content: expect.stringContaining("Trei uși"),
    }));
    expect(reply.mock.calls[0]?.[0].components[0].components[0].data.custom_id).toContain(`:${userId}:`);
  });

  it("rejects an Enter button from a different server", async () => {
    startHauntedHouse(guildId);
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId: "hh_enter:other-server",
      guildId,
      user: { id: userId },
      reply,
    } as unknown as ButtonInteraction;

    await handleHauntedHouseEnterButton(interaction);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      ephemeral: true,
      content: expect.stringContaining("altui server"),
    }));
  });

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

  it("can deduct random candies without allowing a negative balance", () => {
    startHauntedHouse(guildId);
    issueHauntedDoorChoice(guildId, userId, "loss-at-zero");
    const atZero = claimHauntedDoorChoice(guildId, userId, "loss-at-zero", "paianjen", Date.now(), 0.99);
    expect(atZero).toMatchObject({
      ok: true,
      outcome: { candies: 0, detail: expect.stringContaining("zero") },
      totalCandies: 0,
    });

    issueHauntedDoorChoice(guildId, userId, "earn-candy", Date.now() + 30_001);
    const earned = claimHauntedDoorChoice(guildId, userId, "earn-candy", "felinar", Date.now() + 30_001, 0.05);
    expect(earned).toMatchObject({ ok: true, totalCandies: 8 });

    issueHauntedDoorChoice(guildId, userId, "loss-after-earn", Date.now() + 60_002);
    const afterLoss = claimHauntedDoorChoice(guildId, userId, "loss-after-earn", "craniu", Date.now() + 60_002, 0.99);
    expect(afterLoss).toMatchObject({ ok: true, outcome: { candies: -2 }, totalCandies: 6 });
  });

  it("rejects choices once the ten-minute event window has expired", () => {
    startHauntedHouse(guildId, 100_000, 10 * 60_000);
    expect(issueHauntedDoorChoice(guildId, userId, "expired-choice", 710_001)).toMatchObject({
      ok: false,
      reason: "inactive",
    });
  });

  it("allows one pending choice at a time and enforces three plays per member", () => {
    startHauntedHouse(guildId);
    const now = 100_000;

    expect(issueHauntedDoorChoice(guildId, userId, "first", now).ok).toBe(true);
    expect(issueHauntedDoorChoice(guildId, userId, "second", now)).toMatchObject({ ok: false, reason: "pending" });
    expect(claimHauntedDoorChoice(guildId, userId, "wrong-nonce", "craniu", now)).toMatchObject({ ok: false, reason: "invalid" });

    for (let play = 1; play <= HAUNTED_HOUSE_MAX_PLAYS; play += 1) {
      const playedAt = now + (play - 1) * 30_001;
      const nonce = play === 1 ? "first" : `play-${play}`;
      if (play > 1) expect(issueHauntedDoorChoice(guildId, userId, nonce, playedAt).ok).toBe(true);
      expect(claimHauntedDoorChoice(guildId, userId, nonce, "paianjen", playedAt, 0.2).ok).toBe(true);
    }

    expect(issueHauntedDoorChoice(guildId, userId, "fourth", now + 4 * 30_001)).toEqual({
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

  it("reserves a stop once and keeps scores until the final leaderboard is published", () => {
    startHauntedHouse(guildId);
    issueHauntedDoorChoice(guildId, userId, "final-score", 100_000);
    claimHauntedDoorChoice(guildId, userId, "final-score", "felinar", 100_000, 0.05);

    const closing = beginHauntedHouseStop(guildId);
    expect(closing?.leaderboard).toHaveLength(1);
    expect(beginHauntedHouseStop(guildId)).toBeNull();
    expect(issueHauntedDoorChoice(guildId, "member-2", "during-close", 100_001)).toMatchObject({ ok: false, reason: "inactive" });
    expect(getHauntedHouseLeaderboard(guildId)).toHaveLength(1);
    expect(formatHauntedHouseLeaderboard(closing!.leaderboard, true)).toContain("Clasamentul final");

    expect(completeHauntedHouseStop(guildId, closing!.sessionId)).toBe(true);
    expect(completeHauntedHouseStop(guildId, closing!.sessionId)).toBe(false);
    expect(isHauntedHouseActive(guildId)).toBe(false);
    expect(getHauntedHouseLeaderboard(guildId)).toEqual([]);
  });

  it("edits one public leaderboard message as scores change and at event close", async () => {
    startHauntedHouse(guildId);
    const sessionId = getHauntedHouseSessionId(guildId)!;
    let stored: { sessionId: string; channelId: string; messageId: string } | null = null;
    const edit = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ id: "board-message", edit });
    const channel = Object.assign(Object.create(TextChannel.prototype), {
      id: "board-channel",
      guildId,
      permissionsFor: () => ({ has: () => true }),
      messages: { fetch: vi.fn().mockResolvedValue({ id: "board-message", edit }) },
      send,
    });
    const guild = {
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
      members: { me: { id: "bot" }, fetchMe: vi.fn() },
    };
    const client = { guilds: { cache: { get: (id: string) => id === guildId ? guild : undefined } } } as unknown as Client;
    vi.spyOn(botDb, "loadHauntedHouseConfig").mockResolvedValue({
      startChannelId: "start-channel",
      leaderboardChannelId: "board-channel",
      chatChannelId: "chat-channel",
    });
    vi.spyOn(botDb, "loadHauntedHouseLeaderboardMessage").mockImplementation(async () => stored);
    vi.spyOn(botDb, "saveHauntedHouseLeaderboardMessage").mockImplementation(async (_guildId, value) => {
      stored = value;
    });

    await publishHauntedHouseLeaderboard(client, guildId, sessionId);
    issueHauntedDoorChoice(guildId, userId, "live-board", 100_000);
    claimHauntedDoorChoice(guildId, userId, "live-board", "felinar", 100_000, 0.05);
    await publishHauntedHouseLeaderboard(client, guildId, sessionId);

    const closing = beginHauntedHouseStop(guildId)!;
    await publishHauntedHouseLeaderboard(client, guildId, closing.sessionId, true);

    expect(send).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit.mock.calls[0]?.[0].content).toContain("7** puncte");
    expect(edit.mock.calls[1]?.[0].content).toContain("Clasamentul final");
    expect(hauntedHouseCommand.toJSON().options?.map((option) => option.name)).not.toContain("clasament");
  });

  it("allows a stop retry after publishing fails", () => {
    startHauntedHouse(guildId);
    const firstAttempt = beginHauntedHouseStop(guildId)!;
    cancelHauntedHouseStop(guildId, firstAttempt.sessionId);

    expect(beginHauntedHouseStop(guildId)).not.toBeNull();
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

    const startChannel = mockTextChannel("start-channel", guildId);
    const startGuild = { channels: { fetch: vi.fn().mockResolvedValue(startChannel) } };
    vi.spyOn(botDb, "loadHauntedHouseConfig").mockResolvedValue({
      startChannelId: "start-channel",
      leaderboardChannelId: "",
      chatChannelId: "",
    });
    const adminInteraction = (subcommand: string, reply = vi.fn()) => ({
      guildId,
      guild: startGuild,
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
    expect(repeatedStartReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("deja deschis") }));
    expect(getHauntedHouseLeaderboard(guildId)).toHaveLength(1);

    const stopReply = vi.fn();
    await handleHauntedHouseCommand(adminInteraction("stop", stopReply));
    expect(stopReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("Clasamentul final nu a putut fi actualizat"),
    }));
    expect(isHauntedHouseActive(guildId)).toBe(true);
    stopHauntedHouse(guildId);
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
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("nu este deschis acum") }));
  });

  it("routes haunted-house commands and door buttons through InteractionCreate while the RPG is paused", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const client = new Client({ intents: [] });
    const startChannel = mockTextChannel("start-channel", guildId);
    const startGuild = { channels: { fetch: vi.fn().mockResolvedValue(startChannel) } };
    const dispatched: Promise<unknown>[] = [];
    const pauseReplies = vi.fn();
    const pausedBefore = isGuildGameStopped(guildId);
    const rpgSchedulerState = guildStates.get(guildId)!;
    const rpgStateBefore = {
      stopped: rpgSchedulerState.stopped,
      firingEvent: rpgSchedulerState.firingEvent,
      activeBosses: rpgSchedulerState.activeBossMap.size,
    };

    client.on(Events.InteractionCreate, (interaction) => {
      if (dispatchHauntedHouseInteraction(interaction, (promise) => dispatched.push(promise))) return;
      if (interaction.guildId && isGuildGameStopped(interaction.guildId)) {
        pauseReplies();
        if (interaction.isRepliable()) void interaction.reply({ content: "Jocul este oprit." });
      }
    });

    const emit = async (interaction: Interaction) => {
      client.emit(Events.InteractionCreate, interaction);
      await Promise.all(dispatched.splice(0));
    };
    const command = (subcommand: string, id: string) => ({
      id,
      guildId,
      guild: startGuild,
      commandName: "casabantuita",
      createdTimestamp: Date.now(),
      user: { id: userId },
      options: { getSubcommand: () => subcommand },
      memberPermissions: { has: () => true },
      isChatInputCommand: () => true,
      isButton: () => false,
      isRepliable: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
    }) as unknown as Interaction & { reply: ReturnType<typeof vi.fn> };

    try {
      vi.spyOn(botDb, "loadHauntedHouseConfig").mockResolvedValue({
        startChannelId: "start-channel",
        leaderboardChannelId: "",
        chatChannelId: "",
      });
      const start = command("start", "hh-start");
      await emit(start);
      expect(start.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("s-a deschis") }));
      expect(isHauntedHouseActive(guildId)).toBe(true);

      const play = command("joaca", "hh-play");
      await emit(play);
      expect(play.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Trei uși") }));

      const playReply = play.reply.mock.calls[0]?.[0] as {
        components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
        embeds: Array<{ data: { image?: { url?: string } } }>;
      };
      expect(playReply.embeds).toHaveLength(3);
      expect(playReply.embeds.map((embed) => embed.data.image?.url)).toEqual([
        expect.stringMatching(/\/api\/assets\/haunted-door-lantern\.jpg$/),
        expect.stringMatching(/\/api\/assets\/haunted-door-skull\.jpg$/),
        expect.stringMatching(/\/api\/assets\/haunted-door-spider\.jpg$/),
      ]);
      const issuedButtonId = playReply.components[0]?.components[0]?.data.custom_id;
      expect(issuedButtonId).toContain(`hh:${guildId}:${userId}:`);
      const buttonDefer = vi.fn().mockResolvedValue(undefined);
      const buttonEdit = vi.fn().mockResolvedValue(undefined);
      const button = {
        id: "hh-door-valid",
        guildId,
        client,
        customId: issuedButtonId!,
        createdTimestamp: Date.now(),
        user: { id: userId },
        isChatInputCommand: () => false,
        isButton: () => true,
        isRepliable: () => true,
        deferUpdate: buttonDefer,
        editReply: buttonEdit,
        reply: vi.fn(),
      } as unknown as Interaction;
      await emit(button);
      expect(buttonDefer).toHaveBeenCalledOnce();
      expect(buttonEdit).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining("Fantoma șoptește"),
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            image: expect.objectContaining({ url: expect.stringMatching(/\/api\/assets\/haunted-door-lantern\.jpg$/) }),
          }),
        })],
      }));
      expect(getHauntedHouseLeaderboard(guildId)).toHaveLength(1);

      issueHauntedDoorChoice(guildId, "member-with-stale-button", "closed-route", Date.now());
      const stop = command("stop", "hh-stop");
      await emit(stop);
      expect(stop.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining("Clasamentul final nu a putut fi actualizat"),
      }));
      expect(isHauntedHouseActive(guildId)).toBe(true);
      stopHauntedHouse(guildId);

      const staleEdit = vi.fn().mockResolvedValue(undefined);
      const staleButton = {
        id: "hh-door-closed",
        guildId,
        customId: `hh:${guildId}:member-with-stale-button:closed-route:craniu`,
        createdTimestamp: Date.now(),
        user: { id: "member-with-stale-button" },
        isChatInputCommand: () => false,
        isButton: () => true,
        isRepliable: () => true,
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: staleEdit,
        reply: vi.fn(),
      } as unknown as Interaction;
      await emit(staleButton);
      expect(staleEdit).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("nu este deschis acum") }));
      expect(pauseReplies).not.toHaveBeenCalled();
      expect(pausedBefore).toBe(true);
      expect(isGuildGameStopped(guildId)).toBe(pausedBefore);
      expect({
        stopped: rpgSchedulerState.stopped,
        firingEvent: rpgSchedulerState.firingEvent,
        activeBosses: rpgSchedulerState.activeBossMap.size,
      }).toEqual(rpgStateBefore);
    } finally {
      client.destroy();
      guildStates.delete(guildId);
    }
  });

  it("uses a door-specific fallback without calling AI when no key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const provider = vi.fn().mockResolvedValue("O șoaptă scurtă.");

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

    const provider = vi.fn().mockResolvedValue("O șoaptă scurtă.");
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
