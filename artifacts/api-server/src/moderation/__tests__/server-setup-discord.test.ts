import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
const mocks = vi.hoisted(() => ({ options: vi.fn(), post: vi.fn() }));
vi.mock("discord.js", async importOriginal => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return {
    ...actual,
    REST: class {
      constructor(options: unknown) { mocks.options(options); }
      setToken() { return this; }
      post = mocks.post;
    },
  };
});
import { createSetupRole } from "../server-setup-discord";
describe("non-idempotent Discord creation transport", () => {
  it("disables SDK retries and never grants Administrator", async () => {
    mocks.post.mockResolvedValue({ id: "role" });
    const guild = { id: "guild", client: { token: "test-placeholder", rest: { options: { retries: 3 } } } } as unknown as Guild;
    await createSetupRole(guild, "Administrator");
    expect(mocks.options).toHaveBeenCalledWith({ retries: 0 });
    expect(mocks.post).toHaveBeenCalledWith("/guilds/guild/roles", expect.objectContaining({ body: { name: "Administrator", permissions: "0" } }));
  });
});
