import { describe, expect, it } from "vitest";
import { buildOracleStatusLine } from "../oracle-chat";

describe("Oracle relationship status", () => {
  it("shows a positive bond change and the current title", () => {
    const status = buildOracleStatusLine(
      "extatic",
      2,
      { oracleBond: 15, oracleTitle: "Favoritul Cenușii" },
    );

    expect(status).toContain("Starea Oracolului: Extatic");
    expect(status).toContain("Legătura cu Oracolul a crescut cu **+2**");
    expect(status).toContain("Favoritul Cenușii");
    expect(status).toContain("total **+15**");
  });

  it("shows a negative bond change and an irritated Oracle", () => {
    const status = buildOracleStatusLine(
      "iritat",
      -3,
      { oracleBond: -4, oracleTitle: "Suflet suspect" },
    );

    expect(status).toContain("Oracolul este deranjat");
    expect(status).toContain("Legătura cu Oracolul a scăzut cu **3**");
    expect(status).toContain("Suflet suspect");
  });
});