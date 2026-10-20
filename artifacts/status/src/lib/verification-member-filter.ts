export type VerificationMemberFilter = "all" | "verified" | "unverified";

export type VerificationMemberSearchRecord = {
  id: string;
  displayName: string;
  username: string;
  verified: boolean;
};

export function filterVerificationMembers<T extends VerificationMemberSearchRecord>(
  members: readonly T[],
  filter: VerificationMemberFilter,
  search: string,
): T[] {
  const normalizedSearch = search.trim().toLocaleLowerCase("ro");

  return members.filter((member) => {
    if (filter === "verified" && !member.verified) return false;
    if (filter === "unverified" && member.verified) return false;
    if (!normalizedSearch) return true;

    return [member.displayName, member.username, member.id]
      .some((value) => value.toLocaleLowerCase("ro").includes(normalizedSearch));
  });
}
