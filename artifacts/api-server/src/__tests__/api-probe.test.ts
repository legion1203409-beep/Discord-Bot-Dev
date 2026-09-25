import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../app";

describe("API deployment probes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers the API artifact base path without masking unknown routes", async () => {
    for (const path of ["/api", "/api/"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(200);
    }
    const missing = await fetch(`${baseUrl}/api/not-a-route`);
    expect(missing.status).toBe(404);
  });

  it("keeps the detailed health endpoint available", async () => {
    const response = await fetch(`${baseUrl}/api/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      botOnline: expect.any(Boolean),
    });
  });
});