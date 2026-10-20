import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

const io = vi.hoisted(() => ({
  query: vi.fn(() => { throw new Error("Unexpected database query"); }),
  connect: vi.fn(() => { throw new Error("Unexpected database connection"); }),
  fetch: vi.fn(() => { throw new Error("Unexpected live fetch"); }),
  discord: vi.fn(() => { throw new Error("Unexpected Discord client"); }),
}));

// Keep real schema/Discord payload builders, but never create a live connection.
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  pool: { query: io.query, connect: io.connect },
  db: new Proxy({}, {
    get() { throw new Error("Unexpected ORM access"); },
  }),
}));
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return {
    ...actual,
    Client: class { constructor() { io.discord(); } },
    REST: class { constructor() { io.discord(); } },
  };
});
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../activity-ranks");
vi.mock("../activity-rank-card", () => ({
  fetchActivityRankBanner: vi.fn(),
  renderActivityRankBanner: vi.fn(),
}));

import { handleActivityRank } from "../index";
import {
  awardActivityXp,
  getActivityRank,
  getActivityRankConfig,
  syncActivityMilestoneRole,
} from "../activity-ranks";
import { DEFAULT_ACTIVITY_RANK_CONFIG } from "../activity-ranks-core";
import { fetchActivityRankBanner, renderActivityRankBanner } from "../activity-rank-card";
import { logger } from "../../lib/logger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", io.fetch);
  vi.mocked(syncActivityMilestoneRole).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/rank final reply when rendering rejects", () => {
  it.each([
    { selected: false, bannerImageUrl: "" },
    { selected: true, bannerImageUrl: "https://cdn.discordapp.com/banner.png" },
  ])("keeps numeric progress without an attachment ($selected, $bannerImageUrl)", async ({
    selected, bannerImageUrl,
  }) => {
    const avatarUrl = "https://cdn.discordapp.com/avatar.png";
    const caller = { id: "caller", username: "Caller", displayAvatarURL: vi.fn(() => avatarUrl) };
    const other = { id: "selected-member", username: "Selected", displayAvatarURL: vi.fn(() => avatarUrl) };
    const target = selected ? other : caller;
    const record = {
      totalXp: 1_240, monthlyXp: 200, monthKey: "2026-10",
      dayKey: "2026-10-20", dailyXp: 30,
    };
    vi.mocked(getActivityRank).mockResolvedValue(record);
    vi.mocked(getActivityRankConfig).mockResolvedValue({
      ...DEFAULT_ACTIVITY_RANK_CONFIG, bannerImageUrl,
    });
    const imageBytes = Buffer.from("mock image bytes");
    vi.mocked(fetchActivityRankBanner).mockResolvedValue(imageBytes);
    const rendering = deferred<Buffer>();
    vi.mocked(renderActivityRankBanner).mockReturnValue(rendering.promise);

    const acknowledgement = deferred<void>();
    const deferReply = vi.fn(() => acknowledgement.promise);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn();
    const getUser = vi.fn(() => selected ? other : null);
    const interaction = {
      guildId: "guild-local",
      guild: { members: { cache: new Map([[target.id, { displayName: "Nume pe server" }]]) } },
      user: caller,
      options: { getUser },
      deferReply, editReply, reply,
    } as unknown as ChatInputCommandInteraction;

    const handling = handleActivityRank(interaction);
    expect(deferReply).toHaveBeenCalledExactlyOnceWith();
    expect(getActivityRank).not.toHaveBeenCalled();
    expect(getActivityRankConfig).not.toHaveBeenCalled();
    expect(renderActivityRankBanner).not.toHaveBeenCalled();
    acknowledgement.resolve();

    await vi.waitFor(() => expect(renderActivityRankBanner).toHaveBeenCalledOnce());
    expect(getUser).toHaveBeenCalledExactlyOnceWith("utilizator");
    expect(getActivityRank).toHaveBeenCalledExactlyOnceWith("guild-local", target.id);
    expect(getActivityRankConfig).toHaveBeenCalledExactlyOnceWith("guild-local");
    expect(fetchActivityRankBanner).toHaveBeenCalledWith(avatarUrl);
    expect(fetchActivityRankBanner).toHaveBeenCalledTimes(bannerImageUrl ? 2 : 1);
    if (bannerImageUrl) expect(fetchActivityRankBanner).toHaveBeenCalledWith(bannerImageUrl);
    expect(renderActivityRankBanner).toHaveBeenCalledExactlyOnceWith(
      bannerImageUrl ? imageBytes : null, 48, "#a34b2b", "discord",
      { displayName: "Nume pe server", level: 5, avatar: imageBytes }, null,
    );
    expect(editReply).not.toHaveBeenCalled();

    const failure = new Error("simulated renderer failure");
    rendering.reject(failure);
    await expect(handling).resolves.toBeUndefined();

    expect(editReply).toHaveBeenCalledOnce();
    const payload = editReply.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["embeds"]);
    expect(payload).not.toHaveProperty("files");
    expect(payload).not.toHaveProperty("attachments");
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]).toBeInstanceOf(EmbedBuilder);
    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toBe("✨ Rang de activitate 5");
    expect(embed.description).toBe(
      "**Nume pe server**\n\n" +
      "**XP permanent:** 1.240\n" +
      "**Progres:** 240 / 500 XP până la rangul 6\n" +
      "▰▰▰▰▱▱▱▱▱▱ 48%\n\n" +
      "*Animația barei nu a putut fi generată. Progresul numeric este disponibil mai sus.*",
    );
    expect(embed.thumbnail?.url).toBe(avatarUrl);
    expect(embed.image?.url).toBe(bannerImageUrl || undefined);
    expect(JSON.stringify(payload)).not.toContain("attachment://");
    expect(reply).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: failure, guildId: "guild-local", userId: target.id },
      "Activity rank banner animation could not be rendered",
    );
    expect(syncActivityMilestoneRole).toHaveBeenCalledOnce();
    expect(awardActivityXp).not.toHaveBeenCalled();
    expect(record.totalXp).toBe(1_240);
    expect(io.query).not.toHaveBeenCalled();
    expect(io.connect).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
    expect(io.discord).not.toHaveBeenCalled();
  });
});
