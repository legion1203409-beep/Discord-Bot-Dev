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
  it("allows only one reconciliation callback at a time for a guild", async () => {
    let lockAttempt = 0;
    let signalEntered!: () => void;
    let releaseFirst!: () => void;
    const entered = new Promise<void>(resolve => { signalEntered = resolve; });
    const hold = new Promise<void>(resolve => { releaseFirst = resolve; });
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("pg_try_advisory_lock") ? [{ locked: ++lockAttempt === 1 }]
        : sql.startsWith("SELECT journal") ? [{ journal: {} }] : [],
    }));
    const firstCallback = vi.fn(async () => { signalEntered(); await hold; });
    const secondCallback = vi.fn(async () => {});
    const first = withSetupJournal("guild-a", firstCallback);
    await entered;
    await expect(withSetupJournal("guild-a", secondCallback)).rejects.toThrow("deja în curs");
    expect(secondCallback).not.toHaveBeenCalled();
    releaseFirst();
    await first;
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes("pg_try_advisory_lock"))).toHaveLength(2);
  });
  it("releases the lock on failures without masking the original error", async () => {
    await expect(withSetupJournal("guild-a", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
