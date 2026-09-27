import { describe, expect, it } from "vitest";
import {
  getManualCommandDefinition,
  MANUAL_COMMAND_CATALOG,
  MANUAL_COMMAND_GROUPS_WITH_COMMANDS,
  MANUAL_COMMAND_KEYS,
} from "./manual-command-catalog";

describe("manual moderation command catalog", () => {
  it("contains each command exactly once and keeps the intended order", () => {
    expect(new Set(MANUAL_COMMAND_KEYS).size).toBe(MANUAL_COMMAND_KEYS.length);
    expect(MANUAL_COMMAND_GROUPS_WITH_COMMANDS.flatMap((group) => group.commands.map(({ key }) => key)))
      .toEqual(MANUAL_COMMAND_KEYS);
  });

  it("groups commands by purpose", () => {
    expect(MANUAL_COMMAND_GROUPS_WITH_COMMANDS.map((group) => [group.label, group.commands.map(({ key }) => key)])).toEqual([
      ["Sancțiuni", ["warn", "mute", "unmute", "kick", "ban"]],
      ["Administrare membri", ["nick", "role"]],
      ["Canale și mesaje", ["purge", "slowmode", "lock", "unlock"]],
    ]);
  });

  it("keeps each command's target and extra input metadata together", () => {
    expect(getManualCommandDefinition("mute")).toMatchObject({ target: "user", extraField: "durationMinutes" });
    expect(getManualCommandDefinition("role")).toMatchObject({ target: "user", extraField: "roleId" });
    expect(getManualCommandDefinition("purge")).toMatchObject({ target: "channel", extraField: "purgeAmount" });
    expect(getManualCommandDefinition("slowmode")).toMatchObject({ target: "channel", extraField: "slowmodeAmount" });
    expect(MANUAL_COMMAND_CATALOG).toHaveLength(MANUAL_COMMAND_KEYS.length);
  });
});