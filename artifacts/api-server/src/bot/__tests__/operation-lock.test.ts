import { describe, expect, it, vi } from "vitest";
import { serializeBotOperation } from "../operation-lock";

describe("bot resource serialization", () => {
  it("serializes concurrent read/create/save cycles on the same resource", async () => {
    let storedId: string | undefined;
    const create = vi.fn(async () => { await Promise.resolve(); return "single-message"; });
    const action = async () => {
      if (!storedId) storedId = await create();
      return storedId;
    };
    expect(await Promise.all(Array.from({ length: 8 }, () =>
      serializeBotOperation("vote:guild-test", action),
    ))).toEqual(Array(8).fill("single-message"));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("allows the next operation after a failure", async () => {
    const failed = serializeBotOperation("retry:guild-test", async () => { throw new Error("temporary"); });
    const recovered = serializeBotOperation("retry:guild-test", async () => "recovered");
    await expect(failed).rejects.toThrow("temporary");
    await expect(recovered).resolves.toBe("recovered");
  });

  it("does not block a different guild behind a slow resource", async () => {
    let finish!: () => void;
    const slow = serializeBotOperation("slow:guild-a", () => new Promise<void>((resolve) => { finish = resolve; }));
    await Promise.resolve();
    await Promise.resolve();
    await expect(serializeBotOperation("slow:guild-b", async () => "independent")).resolves.toBe("independent");
    finish();
    await slow;
  });
});
