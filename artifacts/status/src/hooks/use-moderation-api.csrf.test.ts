import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { apiFetchWithMeta, useSession } from "./use-moderation-api";

const endpoint = "/guilds/guild-1/bot-control";
const csrfError = "A valid CSRF token is required";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function seedSession(): Promise<void> {
  let retry!: () => Promise<unknown>;
  renderToString(createElement(() => {
    retry = useSession().retry;
    return null;
  }));
  await retry();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moderation CSRF recovery", () => {
  it.each([
    { path: endpoint, method: "PUT" },
    { path: "/guilds/guild-1/emojis", method: "POST" },
    { path: "/storage/uploads/request-url", method: "POST" },
  ])("retries a rejected $method $path once with the same user's new token", async ({ path, method }) => {
    let sessionReads = 0;
    const sentTokens: Array<string | null> = [];
    const body = JSON.stringify({ verification: { enabled: true } });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        sessionReads += 1;
        return json({
          authenticated: true,
          userId: "operator-1",
          guilds: [],
          csrfToken: sessionReads === 1 ? "old-token" : "new-token",
        });
      }
      expect(url).toBe(`/api/moderation${path}`);
      expect(init?.body).toBe(body);
      sentTokens.push(new Headers(init?.headers).get("x-csrf-token"));
      return sentTokens.length === 1
        ? json({ error: csrfError }, 403)
        : json({ saved: true });
    }));

    await seedSession();
    const response = await apiFetchWithMeta<{ saved: boolean }>(path, { method, body });

    expect(response.data.saved).toBe(true);
    expect(sessionReads).toBe(2);
    expect(sentTokens).toEqual(["old-token", "new-token"]);
  });

  it("does not replay a save after the cookie changes to a different user", async () => {
    let sessionReads = 0;
    const sentTokens: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        sessionReads += 1;
        return json({
          authenticated: true,
          userId: sessionReads === 1 ? "operator-1" : "operator-2",
          guilds: [],
          csrfToken: sessionReads === 1 ? "old-token" : "other-token",
        });
      }
      sentTokens.push(new Headers(init?.headers).get("x-csrf-token"));
      return json({ error: csrfError }, 403);
    }));

    await seedSession();
    await expect(apiFetchWithMeta(endpoint, { method: "PUT", body: "{}" }))
      .rejects.toThrow("Sesiunea s-a schimbat");
    expect(sentTokens).toEqual(["old-token"]);
    expect(sessionReads).toBe(2);
  });

  it("stops after one retry if CSRF still fails", async () => {
    let sessionReads = 0;
    const sentTokens: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        sessionReads += 1;
        return json({ authenticated: true, userId: "operator-1", guilds: [], csrfToken: `token-${sessionReads}` });
      }
      sentTokens.push(new Headers(init?.headers).get("x-csrf-token"));
      return json({ error: csrfError }, 403);
    }));

    await seedSession();
    await expect(apiFetchWithMeta(endpoint, { method: "PUT", body: "{}" }))
      .rejects.toThrow(csrfError);
    expect(sentTokens).toEqual(["token-1", "token-2"]);
    expect(sessionReads).toBe(2);
  });

  it("never retries an unrelated authorization failure", async () => {
    let sessionReads = 0;
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/session")) {
        sessionReads += 1;
        return json({ authenticated: true, userId: "operator-1", guilds: [], csrfToken: "valid-token" });
      }
      writes += 1;
      return json({ error: "Nu ai acces la acest server." }, 403);
    }));

    await seedSession();
    await expect(apiFetchWithMeta(endpoint, { method: "PUT", body: "{}" }))
      .rejects.toThrow("Nu ai acces la acest server.");
    expect(writes).toBe(1);
    expect(sessionReads).toBe(1);
  });
});