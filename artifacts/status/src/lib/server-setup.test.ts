import { describe, expect, it } from "vitest";
import { validateDraft, type SetupDraft } from "./server-setup";

function draftWithChannel(name: string): SetupDraft {
  return {
    roles: [],
    categories: [{
      key: "welcome",
      name: "Bun venit",
      readers: ["everyone"],
      writers: ["everyone"],
      channels: [{
        key: "welcome-chat",
        name,
        readers: [],
        writers: [],
        inheritsCategory: true,
        explanation: "",
      }],
    }],
    deleteTargets: [],
  };
}

describe("server setup channel names", () => {
  it("accepts Unicode symbols and emoji without rewriting the channel name", () => {
    const name = "╭─・👋・bun-venit";
    expect(validateDraft(draftWithChannel(name))).toEqual([]);
    expect(draftWithChannel(name).categories[0].channels[0].name).toBe(name);
  });

  it("rejects blank, overlong, and mention-like channel names", () => {
    for (const name of ["   ", "a".repeat(101), "staff @everyone"]) {
      expect(validateDraft(draftWithChannel(name)).length).toBeGreaterThan(0);
    }
  });
});
