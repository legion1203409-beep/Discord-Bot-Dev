import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awardActivityXp,
  ensureActivityRanksTable,
  getActivityLeaderboard,
  getActivityRank,
} from "../activity-ranks";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@workspace/db", () => ({ pool: { query: queryMock } }));
vi.mock("../db", () => ({ ensureBotStateTable: vi.fn() }));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Real PostgreSQL concurrency, isolated from application data. Every query gets
// a transaction-local search_path containing ONLY our random fixture schema.
const schema = `test_activity_xp_${randomUUID().replaceAll("-", "")}`;
let realPool: typeof import("@workspace/db").pool;
let schemaCreated = false;
const now = new Date("2026-10-06T12:00:00.000Z");
const at = (milliseconds: number) => new Date(now.getTime() + milliseconds);

beforeAll(async () => {
  realPool = (await vi.importActual<typeof import("@workspace/db")>("@workspace/db")).pool;
  await realPool.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
    const client = await realPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const result = await client.query(sql, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  await ensureActivityRanksTable();
}, 15_000);

beforeEach(async () => {
  await queryMock("TRUNCATE activity_ranks");
});

afterAll(async () => {
  if (schemaCreated) await realPool.query(`DROP SCHEMA "${schema}" CASCADE`);
  if (realPool) await realPool.end();
});

async function seed(day = "2026-10-06", month = "2026-10", total = 2_000) {
  await queryMock(
    `INSERT INTO activity_ranks (
       guild_id, discord_id, total_xp, daily_key, daily_xp,
       daily_chat_xp, daily_voice_xp, month_key, monthly_xp,
       last_chat_award_at, last_voice_award_at
     ) VALUES ($1, $2, $3, $4, 440, 200, 240, $5, 700, $6, $6)`,
    ["guild-a", "member-a", total, day, month, at(-60_000)],
  );
}

async function stored() {
  return (await queryMock(
    "SELECT * FROM activity_ranks WHERE guild_id = $1 AND discord_id = $2",
    ["guild-a", "member-a"],
  )).rows[0];
}

describe("uncapped activity XP in isolated PostgreSQL fixtures", () => {
  it("keeps 10 XP per chat award and 5 XP per voice award", async () => {
    expect(await awardActivityXp("guild-a", "member-a", "chat", now))
      .toEqual({ previousXp: 0, totalXp: 10 });
    expect(await awardActivityXp("guild-a", "member-a", "voice", now))
      .toEqual({ previousXp: 10, totalXp: 15 });
  });

  it("rejects chat before 30 seconds and accepts the exact boundary without moving rejected timestamps", async () => {
    await awardActivityXp("guild-a", "member-a", "chat", now);
    expect(await awardActivityXp("guild-a", "member-a", "chat", at(29_999))).toBeNull();
    expect(await awardActivityXp("guild-a", "member-a", "chat", at(30_000)))
      .toEqual({ previousXp: 10, totalXp: 20 });
    expect(await awardActivityXp("guild-a", "member-a", "chat", at(30_000))).toBeNull();
    expect(await awardActivityXp("guild-a", "member-a", "chat", at(60_000)))
      .toEqual({ previousXp: 20, totalXp: 30 });
  });

  it("preserves the independent voice duplicate-award guard", async () => {
    await awardActivityXp("guild-a", "member-a", "voice", now);
    expect(await awardActivityXp("guild-a", "member-a", "voice", at(49_999))).toBeNull();
    expect(await awardActivityXp("guild-a", "member-a", "voice", at(50_000)))
      .toEqual({ previousXp: 5, totalXp: 10 });
  });

  it("awards beyond both old source caps and the combined daily cap", async () => {
    await seed();
    expect(await awardActivityXp("guild-a", "member-a", "chat", now))
      .toEqual({ previousXp: 2_000, totalXp: 2_010 });
    expect(await awardActivityXp("guild-a", "member-a", "voice", now))
      .toEqual({ previousXp: 2_010, totalXp: 2_015 });
    expect(await stored()).toMatchObject({
      daily_chat_xp: 210, daily_voice_xp: 245, daily_xp: 455,
      monthly_xp: 715, total_xp: 2_015,
    });
    await queryMock(
      "UPDATE activity_ranks SET daily_chat_xp = 5000, daily_voice_xp = 5000, daily_xp = 10000",
    );
    expect(await awardActivityXp("guild-a", "member-a", "chat", at(30_000)))
      .toEqual({ previousXp: 2_015, totalXp: 2_025 });
  });

  it("permits only one reward for simultaneous chat requests on separate connections", async () => {
    const awards = await Promise.all(Array.from({ length: 8 }, () =>
      awardActivityXp("guild-a", "member-a", "chat", now),
    ));
    expect(awards.filter(Boolean)).toEqual([{ previousXp: 0, totalXp: 10 }]);
    expect(await stored()).toMatchObject({ total_xp: 10, daily_xp: 10, monthly_xp: 10 });
  });

  it("serializes mixed chat and voice awards without losing XP or sharing cooldowns", async () => {
    const awards = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      awardActivityXp("guild-a", "member-a", index % 2 ? "chat" : "voice", now),
    ));
    const applied = awards.filter((award) => award !== null).sort((a, b) => a.previousXp - b.previousXp);
    expect(applied).toHaveLength(2);
    expect(applied[0].previousXp).toBe(0);
    expect(applied[1].previousXp).toBe(applied[0].totalXp);
    expect(applied[1].totalXp).toBe(15);
    expect(await stored()).toMatchObject({
      total_xp: 15, daily_chat_xp: 10, daily_voice_xp: 5, monthly_xp: 15,
    });
  });

  it("isolates members and servers", async () => {
    for (const [guild, member] of [["guild-a", "member-a"], ["guild-b", "member-a"], ["guild-a", "member-b"]]) {
      expect(await awardActivityXp(guild, member, "chat", now))
        .toEqual({ previousXp: 0, totalXp: 10 });
    }
    expect(await getActivityRank("guild-a", "member-a")).toEqual({ totalXp: 10 });
    expect(await getActivityLeaderboard("guild-b", "2026-10"))
      .toEqual([{ discordId: "member-a", totalXp: 10, monthlyXp: 10 }]);
  });

  it("resets daily counters without erasing permanent or same-month progress", async () => {
    await seed("2026-10-05");
    await awardActivityXp("guild-a", "member-a", "chat", now);
    expect(await stored()).toMatchObject({
      daily_key: "2026-10-06", daily_xp: 10, daily_chat_xp: 10, daily_voice_xp: 0,
      total_xp: 2_010, monthly_xp: 710,
    });
  });

  it("starts a new monthly leaderboard while retaining permanent XP", async () => {
    await seed("2026-09-30", "2026-09");
    await awardActivityXp("guild-a", "member-a", "chat", now);
    expect(await stored()).toMatchObject({
      month_key: "2026-10", monthly_xp: 10, total_xp: 2_010,
    });
    expect(await getActivityLeaderboard("guild-a", "2026-10"))
      .toEqual([{ discordId: "member-a", totalXp: 2_010, monthlyXp: 10 }]);
    expect(await getActivityLeaderboard("guild-a", "2026-09")).toEqual([]);
  });
});
