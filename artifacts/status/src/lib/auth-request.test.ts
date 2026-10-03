import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_REQUEST_TIMEOUT_MESSAGE, withAuthRequestTimeout } from "./auth-request";

afterEach(() => vi.useRealTimers());

describe("authentication request deadline", () => {
  it("passes the abort signal and clears the deadline after success", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const response = await withAuthRequestTimeout(async (value) => {
      signal = value;
      return { authenticated: false };
    });
    expect(response).toEqual({ authenticated: false });
    expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts and reports a retryable error when a request never finishes", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const request = withAuthRequestTimeout((value) => {
      signal = value;
      return new Promise(() => {});
    });
    const rejection = expect(request).rejects.toThrow(AUTH_REQUEST_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the original error and clears the timer after a failed request", async () => {
    vi.useFakeTimers();
    const error = new Error("Service unavailable");
    await expect(withAuthRequestTimeout(async () => { throw error; })).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });
});