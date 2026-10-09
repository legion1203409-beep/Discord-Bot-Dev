import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: mocks.query } }));

import { getSavedSetupDraft, saveSetupDraft, SetupDraftRevisionConflictError } from "../server-setup-drafts";

const draft = { roles: [], categories: [] };
const row = { draft, revision: 2, updated_at: new Date("2026-10-09T12:00:00.000Z") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT draft")) return { rows: [row] };
    if (sql.includes("INSERT INTO discord_server_setup_drafts")) return { rows: [row] };
    return { rows: [] };
  });
});

describe("operator-scoped saved server setup drafts", () => {
  it("looks up a draft by both guild and operator", async () => {
    await expect(getSavedSetupDraft("guild-a", "operator-a")).resolves.toEqual({
      draft, revision: 2, updatedAt: "2026-10-09T12:00:00.000Z",
    });
    const tableSql = mocks.query.mock.calls.find(([sql]: [string]) => sql.includes("CREATE TABLE IF NOT EXISTS"));
    expect(tableSql?.[0]).toContain("PRIMARY KEY (guild_id, user_id)");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE guild_id = $1 AND user_id = $2"),
      ["guild-a", "operator-a"],
    );
  });

  it("creates the first saved revision only when the expected revision is zero", async () => {
    const firstRevision = { ...row, revision: 1 };
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("INSERT INTO discord_server_setup_drafts") ? { rows: [firstRevision] } : { rows: [] });
    await expect(saveSetupDraft("guild-a", "operator-a", { draft, expectedRevision: 0 }))
      .resolves.toMatchObject({ revision: 1 });
    const [sql, parameters] = mocks.query.mock.calls.find(([query]: [string]) =>
      query.includes("INSERT INTO discord_server_setup_drafts"))!;
    expect(sql).toContain("WHERE $4 = 0");
    expect(parameters).toEqual(["guild-a", "operator-a", JSON.stringify(draft), 0]);
  });

  it("writes only when the caller's expected revision still matches", async () => {
    const saved = await saveSetupDraft("guild-a", "operator-a", { draft, expectedRevision: 1 });
    expect(saved).toEqual({ draft, revision: 2, updatedAt: "2026-10-09T12:00:00.000Z" });
    const [sql, parameters] = mocks.query.mock.calls.find(([query]: [string]) =>
      query.includes("INSERT INTO discord_server_setup_drafts"))!;
    expect(sql).toContain("WHERE $4 = 0");
    expect(sql).toContain("WHERE saved.revision = $4");
    expect(parameters).toEqual(["guild-a", "operator-a", JSON.stringify(draft), 1]);
  });

  it("reports a version conflict when the conditional write affects no row", async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("INSERT INTO discord_server_setup_drafts") ? { rows: [] } : { rows: [] });
    await expect(saveSetupDraft("guild-a", "operator-a", { draft, expectedRevision: 4 }))
      .rejects.toBeInstanceOf(SetupDraftRevisionConflictError);
  });
});
