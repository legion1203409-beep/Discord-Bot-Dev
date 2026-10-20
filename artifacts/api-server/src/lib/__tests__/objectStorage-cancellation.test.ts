import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService } from "../objectStorage";

const sdk = vi.hoisted(() => ({
  file: {
    name: "private/uploads/banner",
    bucket: { name: "test-bucket" },
    exists: vi.fn(() => new Promise(() => {})),
    getMetadata: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() { return { file: () => sdk.file }; }
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("cancellable App Storage downloads", () => {
  it("cancels a stalled signing/metadata request without starting the object download", async () => {
    const fetch = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
    const service = new ObjectStorageService();
    const controller = new AbortController();
    const file = await service.getObjectEntityFile("/objects/uploads/banner", controller.signal);
    const result = service.downloadObject(file, controller.signal);
    const rejected = expect(result).rejects.toThrow("deadline");
    controller.abort(new Error("deadline"));
    await rejected;
    expect(fetch).toHaveBeenCalledOnce();
    expect(sdk.file.exists).not.toHaveBeenCalled();
    expect(sdk.file.getMetadata).not.toHaveBeenCalled();
  });

  it.each(["headers", "body"] as const)("closes the real HTTP socket when %s stalls", async (stage) => {
    const nativeFetch = globalThis.fetch;
    let requestArrived!: () => void;
    const requested = new Promise<void>((resolve) => { requestArrived = resolve; });
    let socketClosed!: () => void;
    const closed = new Promise<void>((resolve) => { socketClosed = resolve; });
    const server = createServer((_request, response) => {
      if (stage === "body") {
        response.writeHead(200, { "Content-Type": "image/png" });
        response.write(Buffer.from([1, 2, 3]));
      }
      requestArrived();
    });
    server.on("connection", (socket) => socket.once("close", socketClosed));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, options?: RequestInit) => {
      if (String(url).includes("/object-storage/signed-object-url")) {
        return Promise.resolve(Response.json({ signed_url: `http://127.0.0.1:${address.port}/banner` }));
      }
      return nativeFetch(url, options);
    }));
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private");
    const service = new ObjectStorageService();
    const controller = new AbortController();
    try {
      const file = await service.getObjectEntityFile("/objects/uploads/banner", controller.signal);
      const download = service.downloadObject(file, controller.signal);
      await requested;
      const result = stage === "body" ? (await download).arrayBuffer() : download;
      const rejected = expect(result).rejects.toThrow();
      controller.abort(new Error("deadline"));
      await rejected;
      await closed;
      expect(sdk.file.exists).not.toHaveBeenCalled();
      expect(sdk.file.getMetadata).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
