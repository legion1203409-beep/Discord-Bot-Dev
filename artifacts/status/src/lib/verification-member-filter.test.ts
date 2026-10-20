import { describe, expect, it } from "vitest";
import { filterVerificationMembers, type VerificationMemberSearchRecord } from "./verification-member-filter";

const members: VerificationMemberSearchRecord[] = [
  { id: "1001", displayName: "Ana", username: "ana_discord", verified: true },
  { id: "1002", displayName: "Mihai", username: "mihai", verified: false },
  { id: "1003", displayName: "Ștefan", username: "stefan", verified: true },
];

describe("filterVerificationMembers", () => {
  it("shows all members by default and filters each verification state", () => {
    expect(filterVerificationMembers(members, "all", "")).toEqual(members);
    expect(filterVerificationMembers(members, "verified", "").map((member) => member.id)).toEqual(["1001", "1003"]);
    expect(filterVerificationMembers(members, "unverified", "").map((member) => member.id)).toEqual(["1002"]);
  });

  it("combines the verification filter with name, username, and ID search", () => {
    expect(filterVerificationMembers(members, "verified", "ANA").map((member) => member.id)).toEqual(["1001"]);
    expect(filterVerificationMembers(members, "unverified", "1002").map((member) => member.id)).toEqual(["1002"]);
    expect(filterVerificationMembers(members, "verified", "mihai")).toEqual([]);
  });

  it("ignores leading and trailing whitespace in the search", () => {
    expect(filterVerificationMembers(members, "all", "  ȘTEFAN  ").map((member) => member.id)).toEqual(["1003"]);
  });
});
