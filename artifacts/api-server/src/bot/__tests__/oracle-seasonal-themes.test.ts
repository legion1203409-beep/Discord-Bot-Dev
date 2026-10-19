import { describe, expect, it } from "vitest";
import { buildOracleSeasonalSystemInstruction } from "../oracle-chat";

describe("Oracle seasonal reply themes", () => {
  it("adds Halloween and Christmas guidance while keeping the Oracle voice", () => {
    expect(buildOracleSeasonalSystemInstruction(new Date("2026-10-31T12:00:00Z"))).toMatch(/Halloween.*vocea medievală|vocea medievală.*Halloween/i);
    expect(buildOracleSeasonalSystemInstruction(new Date("2026-12-24T12:00:00Z"))).toContain("atmosferă caldă de sărbătoare");
  });

  it("does not add a seasonal instruction outside the holiday periods", () => {
    expect(buildOracleSeasonalSystemInstruction(new Date("2026-03-15T12:00:00Z"))).toBeNull();
  });
});
