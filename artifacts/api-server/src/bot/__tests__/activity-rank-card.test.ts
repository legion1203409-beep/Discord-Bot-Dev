import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fetchActivityRankBanner, renderActivityRankBanner } from "../activity-rank-card";

const storageMock = vi.hoisted(() => ({
  getObjectEntityFile: vi.fn(),
  downloadObject: vi.fn(),
}));
vi.mock("../../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityFile(value: string) { return storageMock.getObjectEntityFile(value); }
    downloadObject(file: unknown) { return storageMock.downloadObject(file); }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(storageMock.getObjectEntityFile).toHaveBeenCalledWith("/objects/uploads/banner-id");
    expect(storageMock.downloadObject).toHaveBeenCalledWith(file);
    expect(fetch).not.toHaveBeenCalled();
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
