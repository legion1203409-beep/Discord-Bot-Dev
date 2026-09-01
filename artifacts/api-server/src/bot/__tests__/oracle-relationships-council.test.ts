import { describe, expect, it } from "vitest";
import { oracleRelationshipTitle, type OracleCouncilRecord } from "../db";
import { councilWinner } from "../oracle-council";

describe("Oracle relationship titles", () => {
  it("maps loyalty, suspicion and chaos to the medieval titles", () => {
    expect(oracleRelationshipTitle(15, 12, 0)).toBe("Favoritul Cenușii");
    expect(oracleRelationshipTitle(8, 8, 0)).toBe("Vânător de umbre");
    expect(oracleRelationshipTitle(4, 4, 0)).toBe("Străjer loial");
    expect(oracleRelationshipTitle(0, 2, 0)).toBe("Suflet necunoscut");
    expect(oracleRelationshipTitle(-4, 3, 0)).toBe("Suflet suspect");
    expect(oracleRelationshipTitle(-10, 5, 0)).toBe("Trădător");
    expect(oracleRelationshipTitle(10, 10, 5)).toBe("Nebunul Regatului");
  });
});

function council(votes: Record<string, string>): OracleCouncilRecord {
  return {
    id: "test-council",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: "message-1",
    question: "Ce cale alegem?",
    options: [
      { id: "aur", label: "Aur", emoji: "🪙", decree: "Aurul domnește." },
      { id: "glorie", label: "Glorie", emoji: "👑", decree: "Gloria domnește." },
      { id: "taine", label: "Taine", emoji: "🔮", decree: "Tainele domnesc." },
    ],
    votes,
    openedAt: 1,
    closesAt: 2,
    status: "closed",
  };
}

describe("Council of Shadows winner", () => {
  it("returns the uniquely most-voted option", () => {
    expect(councilWinner(council({ u1: "glorie", u2: "glorie", u3: "aur" }))?.id).toBe("glorie");
  });

  it("returns no decree for a tie", () => {
    expect(councilWinner(council({ u1: "glorie", u2: "aur" }))).toBeNull();
  });

  it("returns no decree when nobody voted", () => {
    expect(councilWinner(council({}))).toBeNull();
  });
});