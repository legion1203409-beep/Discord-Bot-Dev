import { describe, expect, it } from "vitest";
import { buildOracleRelationshipAnnouncement, buildOracleStatusLine } from "../oracle-chat";

describe("Oracle relationship status", () => {
  it("shows a positive bond change and the current title", () => {
    const status = buildOracleStatusLine(
      2,
      { oracleBond: 15, oracleTitle: "Favoritul Cenușii" },
    );

    expect(status).toContain("s-a bucurat de respectul tău");
    expect(status).toContain("Legătura a crescut cu **+2**");
    expect(status).toContain("Favoritul Cenușii");
    expect(status).toContain("total **+15**");
  });

  it("shows a negative bond change and an irritated Oracle", () => {
    const status = buildOracleStatusLine(
      -3,
      { oracleBond: -4, oracleTitle: "Suflet suspect" },
    );

    expect(status).toContain("s-a supărat pe cuvintele tale");
    expect(status).toContain("Legătura a scăzut cu **3**");
    expect(status).toContain("Suflet suspect");
  });

  it("builds a public announcement for a bond increase", () => {
    const announcement = buildOracleRelationshipAnnouncement(
      "user-1",
      2,
      { oracleBond: 17, oracleTitle: "Favoritul Cenușii" },
    );

    expect(announcement).toContain("<@user-1>");
    expect(announcement).toContain("a câștigat **+2** puncte");
    expect(announcement).toContain("Total: **+17**");
  });

  it("builds a public announcement for a bond loss", () => {
    const announcement = buildOracleRelationshipAnnouncement(
      "user-2",
      -3,
      { oracleBond: -7, oracleTitle: "Suflet suspect" },
    );

    expect(announcement).toContain("<@user-2>");
    expect(announcement).toContain("a pierdut **3** puncte");
    expect(announcement).toContain("Total: **-7**");
  });
});