import { describe, expect, it } from "vitest";
import { validateDraft } from "./server-setup";
import { getSetupPreset, setupPresets } from "./server-setup-tools";

describe("server setup presets", () => {
  it("provides valid drafts with unique resource keys and names", () => {
    for (const preset of setupPresets) {
      expect(validateDraft(getSetupPreset(preset.key))).toEqual([]);
    }
  });

  it("returns an independent draft copy for each use", () => {
    const first = getSetupPreset("community");
    first.roles[0]!.name = "Edited";

    expect(getSetupPreset("community").roles[0]!.name).toBe("Membru");
  });
});
