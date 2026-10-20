import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { fetchActivityRankBanner, renderActivityRankBanner } from "../activity-rank-card";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const storageMock = vi.hoisted(() => ({
  getObjectEntityFile: vi.fn(),
  downloadObject: vi.fn(),
}));
vi.mock("../../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityFile(value: string, signal?: AbortSignal) { return storageMock.getObjectEntityFile(value, signal); }
    downloadObject(file: unknown, signal?: AbortSignal) { return storageMock.downloadObject(file, signal); }
  },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  vi.mocked(spawn).mockImplementation(actual.spawn);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

class FakeRenderer extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  // Killing is deliberately separate from close, as it is for a real child.
  kill = vi.fn(() => true);

  succeed(): void {
    this.stdout.emit("data", Buffer.from("GIF89a"));
    this.emit("close", 0);
  }
}

function mockRenderProcesses(): FakeRenderer[] {
  vi.useFakeTimers();
  const children: FakeRenderer[] = [];
  vi.mocked(spawn).mockImplementation(() => {
    const child = new FakeRenderer();
    children.push(child);
    return child as unknown as ReturnType<typeof spawn>;
  });
  return children;
}

const render = () => renderActivityRankBanner(null, 62, "#a34b2b", "discord");
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("bounded activity rank render queue", () => {
  it("renders three simultaneous requests FIFO with only two active processes", async () => {
    const children = mockRenderProcesses();
    const first = render();
    const second = render();
    const third = render();
    await flush();
    expect(children).toHaveLength(2);

    children[0].succeed();
    await expect(first).resolves.toEqual(Buffer.from("GIF89a"));
    await flush();
    expect(children).toHaveLength(3);
    children[1].succeed();
    children[2].succeed();
    await expect(Promise.all([second, third])).resolves.toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the queue at four and rejects overflow without spawning or serializing it", async () => {
    const children = mockRenderProcesses();
    const requests = Array.from({ length: 6 }, () => render());
    const image = Buffer.from("banner");
    const encode = vi.spyOn(image, "toString");
    await expect(renderActivityRankBanner(image, 62, "#a34b2b", "discord")).rejects.toThrow("busy");
    await flush();
    expect(children).toHaveLength(2);
    expect(encode).not.toHaveBeenCalled();
    for (let index = 0; index < 6; index += 1) {
      children[index].succeed();
      await requests[index];
      await flush();
      expect(children.length).toBe(Math.min(6, index + 3));
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes expired queued requests, frees capacity and never runs them later", async () => {
    const children = mockRenderProcesses();
    const active = [render(), render()];
    const expired = Array.from({ length: 4 }, () =>
      expect(render()).rejects.toThrow("queue wait timed out"));
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(expired);
    expect(children).toHaveLength(2);

    const replacement = render();
    children[0].succeed();
    await flush();
    expect(children).toHaveLength(3);
    children[1].succeed();
    children[2].succeed();
    await Promise.all([...active, replacement]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks queue deadlines even when timeout callbacks have not run yet", async () => {
    const children = mockRenderProcesses();
    const active = [render(), render()];
    const expired = expect(render()).rejects.toThrow("queue wait timed out");
    await flush();
    vi.setSystemTime(Date.now() + 10_000);
    children[0].succeed();
    await expired;
    expect(children).toHaveLength(2);
    children[1].succeed();
    await Promise.all(active);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills timed-out processes but reserves their slots until close", async () => {
    const children = mockRenderProcesses();
    const timedOut = [render(), render()].map((request) =>
      expect(request).rejects.toThrow("image rendering timed out"));
    await vi.advanceTimersByTimeAsync(24_000);
    const queued = render();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(children).toHaveLength(2);
    expect(children[0].kill).toHaveBeenCalledWith("SIGKILL");
    expect(children[1].kill).toHaveBeenCalledWith("SIGKILL");
    children[0].stdout.emit("data", Buffer.alloc(9 * 1024 * 1024));
    children[0].emit("close", null);
    await flush();
    expect(children).toHaveLength(3);
    children[1].emit("close", null);
    children[2].succeed();
    await Promise.all([...timedOut, queued]);
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const failure of ["spawn", "stdin", "exit", "output"] as const) {
    it(`releases slots and drains the queue after a ${failure} error`, async () => {
      const children = mockRenderProcesses();
      const message = {
        spawn: "spawn failed",
        stdin: "broken pipe",
        exit: "Could not render activity rank banner: renderer failed",
        output: "exceeded the output limit",
      }[failure];
      const failed = expect(render()).rejects.toThrow(message);
      const second = render();
      const third = render();
      await flush();
      if (failure === "exit") {
        children[0].stderr.emit("data", Buffer.from("renderer failed"));
        children[0].emit("close", 1);
      } else {
        if (failure === "spawn") children[0].emit("error", new Error(message));
        if (failure === "stdin") children[0].stdin.emit("error", new Error(message));
        if (failure === "output") children[0].stdout.emit("data", Buffer.alloc(8 * 1024 * 1024 + 1));
        expect(children[0].kill).toHaveBeenCalledWith("SIGKILL");
        await flush();
        expect(children).toHaveLength(2);
        children[0].emit("close", null);
      }
      await failed;
      await flush();
      expect(children).toHaveLength(3);
      children[1].succeed();
      children[2].succeed();
      await Promise.all([second, third]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("releases a reserved slot if spawning throws synchronously", async () => {
    const children = mockRenderProcesses();
    vi.mocked(spawn).mockImplementationOnce(() => { throw new Error("spawn threw"); });
    await expect(render()).rejects.toThrow("spawn threw");
    const requests = [render(), render(), render()];
    await flush();
    expect(children).toHaveLength(2);
    children[0].succeed();
    await flush();
    children[1].succeed();
    children[2].succeed();
    await Promise.all(requests);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects oversized image inputs before allocating queue capacity", async () => {
    const children = mockRenderProcesses();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(renderActivityRankBanner(oversized, 62, "#a34b2b", "discord")).rejects.toThrow("10 MB");
    await expect(renderActivityRankBanner(null, 62, "#a34b2b", "discord", {
      displayName: "Member", level: 1, avatar: oversized,
    })).rejects.toThrow("avatar exceeds");
    expect(children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("defers the Discord /rank reply before database work or waiting for a renderer", () => {
    // Source-level guard avoids importing the bot entrypoint (and live services).
    const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("async function handleActivityRank("));
    expect(handler).toMatch(/^async function handleActivityRank[^{]+\{\s*await interaction\.deferReply\(\);/);
    expect(handler.indexOf("await interaction.deferReply()")).toBeLessThan(handler.indexOf("getActivityRank(guildId"));
    expect(handler.indexOf("await interaction.deferReply()")).toBeLessThan(handler.indexOf("await renderActivityRankBanner("));
  });
});

describe("animated activity rank cards", () => {
  for (const style of ["discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword"] as const) {
    it(`renders the supplied ${style} artwork as an animated banner-sized GIF`, async () => {
      const result = await renderActivityRankBanner(null, 62, "#a34b2b", style);
      expect(result.subarray(0, 6).toString("ascii")).toBe("GIF89a");
      expect(result.readUInt16LE(6)).toBe(800);
      expect(result.readUInt16LE(8)).toBe(534);
      expect(result.byteLength).toBeLessThan(8 * 1024 * 1024);
      expect(result.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
    }, 20_000);
  }

  it("rejects literal addresses, private DNS aliases and untrusted hostnames before any connection", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const url of [
      "https://127.0.0.1/test.png",
      "https://[::1]/test.png",
      "https://localhost/test.png",
      "https://host.local/test.png",
      "https://127.0.0.1.sslip.io/test.png",
      "https://10.0.0.1.nip.io/test.png",
      "https://cdn.discordapp.com.attacker.example/test.png",
      "https://cdn.discordapp.com@attacker.example/test.png",
    ]) {
      await expect(fetchActivityRankBanner(url)).rejects.toThrow("trusted HTTPS");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(storageMock.getObjectEntityFile).not.toHaveBeenCalled();
  });

  it("accepts explicitly trusted public image hosts with redirects disabled", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }),
    ));
    vi.stubGlobal("fetch", fetch);
    for (const host of ["cdn.discordapp.com", "media.discordapp.net", "i.imgur.com", "images.unsplash.com"]) {
      expect(await fetchActivityRankBanner(`https://${host}/banner.png`)).toEqual(Buffer.from([1, 2, 3]));
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });

  it("reads uploaded banners directly from app storage without an HTTP or DNS request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = { id: "uploaded-image" };
    storageMock.getObjectEntityFile.mockResolvedValue(file);
    storageMock.downloadObject.mockResolvedValue(
      new Response(new Uint8Array([4, 5, 6]), { headers: { "Content-Type": "image/png" } }),
    );
    expect(await fetchActivityRankBanner("/api/storage/objects/uploads/banner-id")).toEqual(Buffer.from([4, 5, 6]));
    expect(storageMock.getObjectEntityFile).toHaveBeenCalledWith("/objects/uploads/banner-id", expect.any(AbortSignal));
    expect(storageMock.downloadObject).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["lookup", "download"] as const)("bounds a stalled storage %s and aborts its operation", async (stage) => {
    vi.useFakeTimers();
    storageMock.getObjectEntityFile.mockResolvedValue({ id: "file" });
    storageMock.downloadObject.mockImplementation(() => new Promise(() => {}));
    if (stage === "lookup") {
      storageMock.getObjectEntityFile.mockImplementationOnce(() => new Promise(() => {}));
    }
    const result = fetchActivityRankBanner("/api/storage/objects/uploads/stalled");
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    expect(storageMock.getObjectEntityFile.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a partially read uploaded banner when its total download deadline expires", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    storageMock.getObjectEntityFile.mockResolvedValue({ id: "file" });
    storageMock.downloadObject.mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); },
      cancel,
    }), { headers: { "Content-Type": "image/png" } }));
    const result = fetchActivityRankBanner("/api/storage/objects/uploads/stalled-stream");
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a download if a stalled lookup resolves after the deadline", async () => {
    vi.useFakeTimers();
    let resolveLookup!: (file: unknown) => void;
    storageMock.getObjectEntityFile.mockImplementationOnce(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const result = fetchActivityRankBanner("/api/storage/objects/uploads/late");
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    resolveLookup({ id: "late-file" });
    await vi.advanceTimersByTimeAsync(0);
    expect(storageMock.downloadObject).not.toHaveBeenCalled();
  });

  it("composes both trusted public and uploaded banner image bytes into the animated card", async () => {
    const image = readFileSync(new URL("../../../../status/public/opengraph.jpg", import.meta.url));
    const imageResponse = () => new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(imageResponse())));
    storageMock.getObjectEntityFile.mockResolvedValue({ id: "banner" });
    storageMock.downloadObject.mockImplementation(() => Promise.resolve(imageResponse()));
    for (const source of ["https://i.imgur.com/banner.jpg", "/api/storage/objects/uploads/banner-id"]) {
      const banner = await fetchActivityRankBanner(source);
      const result = await renderActivityRankBanner(banner, 62, "#a34b2b", "discord");
      expect(result.subarray(0, 6).toString("ascii")).toBe("GIF89a");
      expect(result.readUInt16LE(6)).toBe(800);
      expect(result.readUInt16LE(8)).toBe(534);
    }
  }, 20_000);

  it("rejects unsupported content and oversized banners", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    ));
    await expect(fetchActivityRankBanner("https://cdn.discordapp.com/banner.svg")).rejects.toThrow("PNG, JPEG");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("large", { headers: { "Content-Type": "image/png", "Content-Length": String(11 * 1024 * 1024) } }),
    ));
    await expect(fetchActivityRankBanner("https://cdn.discordapp.com/banner.png")).rejects.toThrow("10 MB");
  });

  it("shows a member beneath the supplied XP bar on the default banner", async () => {
    const plain = await renderActivityRankBanner(null, 68, "#a34b2b", "discord");
    const named = await renderActivityRankBanner(null, 68, "#a34b2b", "discord", {
      displayName: "Membru Ștefan",
      level: 5,
      avatar: null,
    });
    expect(named.equals(plain)).toBe(false);
    expect(named.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(named.readUInt16LE(8)).toBe(534);
    const withAvatar = await renderActivityRankBanner(null, 68, "#a34b2b", "discord", {
      displayName: "Membru Ștefan",
      level: 5,
      avatar: readFileSync(new URL("../../../../status/public/opengraph.jpg", import.meta.url)),
    });
    expect(withAvatar.equals(named)).toBe(false);
  }, 20_000);

  it("renders saved banner-relative positions and proportional sizes", async () => {
    const member = { displayName: "Membru Ștefan", level: 5, avatar: null };
    const automatic = await renderActivityRankBanner(null, 62, "#a34b2b", "discord", member);
    const adjusted = await renderActivityRankBanner(null, 62, "#a34b2b", "discord", member, {
      bar: { x: 8, y: 24, width: 48 },
      member: { x: 12, y: 72, width: 60 },
    });

    expect(adjusted.equals(automatic)).toBe(false);
    expect(adjusted.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(adjusted.readUInt16LE(6)).toBe(800);
    expect(adjusted.readUInt16LE(8)).toBe(534);
  }, 20_000);
});
