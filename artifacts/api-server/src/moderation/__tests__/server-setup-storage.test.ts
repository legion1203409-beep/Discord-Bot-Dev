import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { connect: mocks.connect } }));
import { withSetupJournal } from "../server-setup-storage";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }]
      : sql.startsWith("SELECT journal") ? [{ journal: { member: { name: "Membru", kind: "role", id: "123" } } }] : [],
  }));
});
describe("durable guild setup coordination", () => {
  it("loads saved IDs and persists every intent without waiting for a transaction commit", async () => {
    await withSetupJournal("guild-a", async (journal, save) => {
      expect(journal.member.id).toBe("123");
      await save({ ...journal, category: { name: "Staff", kind: "category" } });
    });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO discord_server_setup"))).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("rejects a concurrent worker before invoking any Discord work", async () => {
    mocks.query.mockResolvedValue({ rows: [{ locked: false }] });
    const work = vi.fn();
    await expect(withSetupJournal("guild-a", work)).rejects.toThrow("deja în curs");
    expect(work).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("releases the lock on failures without masking the original error", async () => {
    await expect(withSetupJournal("guild-a", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
