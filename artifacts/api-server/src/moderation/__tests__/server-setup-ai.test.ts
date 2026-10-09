import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: class { chat = { completions: { create: mocks.create } }; },
}));
vi.mock("../auth", () => ({
  ModerationAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { suggestSetup, setupSuggestionSchema } from "../server-setup-ai";
import { setupTemplate } from "../server-setup-schema";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("suggestions are untrusted data, never Discord actions", () => {
  const input = { communityType: "Joc", goals: "Comunitate sigură", refinement: "" };
  it("reports unavailable AI without pretending the template is generated", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(suggestSetup(input)).rejects.toThrow("nu este disponibil");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["", "not json", JSON.stringify({ ...setupTemplate, actions: ["delete"] }),
    JSON.stringify({ ...setupTemplate, roles: [{ key: "admin", name: "Admin", permissions: ["Administrator"] }] }),
  ])("rejects invalid response %s", async content => {
    vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
    mocks.create.mockResolvedValue({ choices: [{ message: { content } }] });
    await expect(suggestSetup(input)).rejects.toThrow("propunere validă");
  });
  it("returns only a validated proposal with no tools or Discord access", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
    mocks.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(setupTemplate) } }] });
    expect(await suggestSetup(input)).toEqual(setupTemplate);
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("tools");
    expect(setupSuggestionSchema.safeParse({ ...input, goals: "" }).success).toBe(false);
  });
  it("strips resource selections and deletion targets from generated suggestions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
    const generated = structuredClone(setupTemplate);
    generated.roles[0] = { ...generated.roles[0], mode: "existing", discordId: "1234567" };
    generated.categories[0].discordId = "1234568";
    generated.categories[0].channels[0].discordId = "1234569";
    generated.deleteTargets = [{ id: "1234570", kind: "category" }];
    mocks.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(generated) } }] });
    const result = await suggestSetup(input);
    expect(result.roles.every(role => role.mode === "new" && !Object.hasOwn(role, "discordId"))).toBe(true);
    expect(result.categories.every(category =>
      !Object.hasOwn(category, "discordId") && category.channels.every(channel => !Object.hasOwn(channel, "discordId")))).toBe(true);
    expect(result.deleteTargets).toEqual([]);
  });
});
