import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  VERIFICATION_MODULES, categoryRoleLabel, changedVerificationParts, chunk, describeGrantTotals, extraRoleCandidates, filterMembers,
  grantButtonLabel, isCategoryRoleName, isVerificationModuleChanged, liveRefreshMs, isVerificationRoute, memberCounts, messagesSummary, missingRoleIds,
  profileRoles, roleProblem, rolesSummary, settingsSummary, verificationDraftError, verificationModuleForRoute, verificationRoleIds,
  type MemberRecord,
} from "./verification-model";

const config = (verification: Record<string, unknown> = {}) => ({
  verification: {
    enabled: true, channelId: "100000000000000001", roleId: "200000000000000002", extraRoleIds: [],
    title: "Verifică-ți contul", message: "Apasă butonul.", buttonLabel: "Verifică-mă", buttonEmoji: "✅",
    successMessage: "Gata.", alreadyVerifiedMessage: "Ești deja verificat.", imageUrl: "", thumbnailUrl: "", panelMessageId: "",
    ...verification,
  },
});

describe("the verification group", () => {
  it("is its own page, apart from the tickets, with three modules", () => {
    expect(VERIFICATION_MODULES.map((module) => module.route)).toEqual(["/verificare/setari", "/verificare/mesaje", "/verificare/membri"]);
    expect(verificationModuleForRoute("/verificare").id).toBe("settings");
    expect(verificationModuleForRoute("/verificare/membri/").id).toBe("members");
    expect(isVerificationRoute("/verificare/mesaje")).toBe(true);
    expect(isVerificationRoute("/tichete")).toBe(false);
    expect(panelGroupRoute("/verificare/membri")).toBe("/verificare");
    expect(isWidePanelRoute("/verificare")).toBe(true);
  });

  it("marks only the module whose part changed and names it in the save bar", () => {
    const saved = config();
    const draft = config({ extraRoleIds: ["300000000000000003"] });
    expect(VERIFICATION_MODULES.map((module) => isVerificationModuleChanged(module, saved, draft))).toEqual([true, false, false]);
    expect(changedVerificationParts(saved, draft).map((part) => part.label)).toEqual(["Setările verificării"]);
    expect(changedVerificationParts(saved, config({ title: "Bun venit" })).map((part) => part.label)).toEqual(["Mesajele verificării"]);
    expect(changedVerificationParts(saved, config())).toEqual([]);
  });

  it("sums each module up for the menu", () => {
    expect(settingsSummary(config({ enabled: false }))).toBe("Oprită");
    expect(settingsSummary(config({ panelMessageId: "400000000000000004" }))).toBe("Pornită · panou publicat");
    expect(rolesSummary(config({ extraRoleIds: ["300000000000000003", "300000000000000004"] }))).toBe("Rolul standard + 2 roluri în plus");
    expect(rolesSummary(config({ roleId: "" }))).toBe("Fără rol standard");
    expect(messagesSummary(config())).toBe("Butonul „Verifică-mă”");
  });
});

describe("the roles a verified member receives", () => {
  it("gives the standard role first, then the extra ones, once each", () => {
    expect(verificationRoleIds(config({ extraRoleIds: ["300000000000000003", "200000000000000002"] })))
      .toEqual(["200000000000000002", "300000000000000003"]);
  });

  it("recognises category roles by the lines around their name", () => {
    expect(isCategoryRoleName("━━━ MEMBRI ━━━")).toBe(true);
    expect(isCategoryRoleName("──── Ranguri")).toBe(true);
    expect(isCategoryRoleName("✦✦ Roluri ✦✦")).toBe(true);
    expect(isCategoryRoleName("Membru")).toBe(false);
    expect(isCategoryRoleName("Co-fondator")).toBe(false);
    expect(categoryRoleLabel("━━━ MEMBRI ━━━")).toBe("MEMBRI");
  });

  it("says why the bot cannot give a role, as the server does", () => {
    expect(roleProblem({ id: "1", name: "Membru", assignable: true }, "extra", true)).toBeNull();
    expect(roleProblem({ id: "1", name: "Bot", managed: true }, "extra", true)?.blocking).toBe(true);
    expect(roleProblem({ id: "1", name: "Mod", elevated: true, assignable: true }, "extra", true)?.text).toMatch(/drepturi de staff/);
    expect(roleProblem({ id: "1", name: "Mod", elevated: true, assignable: true }, "standard", true)?.blocking).toBe(false);
    expect(roleProblem({ id: "1", name: "Sus", assignable: false }, "standard", true)?.text).toMatch(/deasupra rolului botului/);
    expect(roleProblem(undefined, "extra", true)?.text).toMatch(/nu mai există/);
    expect(roleProblem(undefined, "extra", false)).toBeNull();
  });

  it("offers as extra roles neither the standard one nor integrations nor staff roles", () => {
    const roles = [
      { id: "1", name: "Membru", position: 2 }, { id: "2", name: "━━ MEMBRI ━━", position: 5 },
      { id: "3", name: "Bot", position: 9, managed: true }, { id: "4", name: "Mod", position: 7, elevated: true },
    ];
    expect(extraRoleCandidates(roles, "1")?.map((role) => role.name)).toEqual(["━━ MEMBRI ━━"]);
    expect(extraRoleCandidates(undefined, "1")).toBeUndefined();
  });

  it("lays the roles out as on the member's profile, highest first", () => {
    const roles = [
      { id: "1", name: "Membru", position: 2, color: "#2fcb8c" }, { id: "2", name: "━━ MEMBRI ━━", position: 5 },
      { id: "5", name: "Cititor", position: 1 },
    ];
    expect(profileRoles(roles, "1", ["5", "2", "9"]).map((role) => [role.name, role.category, role.standard, role.known])).toEqual([
      ["━━ MEMBRI ━━", true, false, true],
      ["Membru", false, true, true],
      ["Cititor", false, false, true],
      ["Rol 9", false, false, false],
    ]);
  });
});

describe("the members", () => {
  const required = ["200000000000000002", "300000000000000003"];
  const member = (id: string, verified: boolean, roleIds: string[], displayName = `Membru ${id}`): MemberRecord => ({
    id, displayName, username: `user${id}`, avatarUrl: "", joinedAt: null, verified, roleIds,
  });
  const members = [
    member("1", false, [], "Ana"),
    member("2", true, ["200000000000000002"], "Bogdan"),
    member("3", true, required, "Cezar"),
  ];

  it("shows which verification roles each member misses", () => {
    expect(missingRoleIds(members[0]!, required)).toEqual(required);
    expect(missingRoleIds(members[1]!, required)).toEqual(["300000000000000003"]);
    expect(missingRoleIds(members[2]!, required)).toEqual([]);
  });

  it("counts and filters by state and by name, username or ID", () => {
    expect(memberCounts(members, required)).toEqual({ all: 3, verified: 2, unverified: 1, missing: 1 });
    expect(filterMembers(members, "missing", "", required).map((item) => item.displayName)).toEqual(["Bogdan"]);
    expect(filterMembers(members, "unverified", "", required).map((item) => item.displayName)).toEqual(["Ana"]);
    expect(filterMembers(members, "all", "user3", required).map((item) => item.displayName)).toEqual(["Cezar"]);
    expect(filterMembers(members, "verified", "ana", required)).toEqual([]);
  });

  it("names the button after what it will do", () => {
    expect(grantButtonLabel([])).toBe("Bifează membri");
    expect(grantButtonLabel([members[0]!])).toBe("Verifică 1 membru");
    expect(grantButtonLabel([members[1]!, members[2]!])).toBe("Dă rolurile lipsă (2 membri)");
    expect(grantButtonLabel(members)).toBe("Verifică și dă rolurile (3 membri)");
  });

  it("reloads the list less often on big servers", () => {
    expect(liveRefreshMs(undefined)).toBe(15_000);
    expect(liveRefreshMs(800)).toBe(15_000);
    expect(liveRefreshMs(6_000)).toBe(45_000);
    expect(liveRefreshMs(40_000)).toBe(120_000);
  });

  it("sends the members in small groups and sums the result up", () => {
    expect(chunk(Array.from({ length: 60 }, (_, index) => index), 25).map((part) => part.length)).toEqual([25, 25, 10]);
    expect(describeGrantTotals({ verified: 2, updated: 1, unchanged: 0, failed: 1 }))
      .toBe("2 membri verificați acum · 1 membru a primit rolurile lipsă · la 1 membru nu a mers");
    expect(describeGrantTotals({ verified: 0, updated: 0, unchanged: 3, failed: 0 })).toBe("3 membri aveau deja tot");
    expect(describeGrantTotals({ verified: 25, updated: 0, unchanged: 0, failed: 0 })).toBe("25 de membri verificați acum");
  });
});

describe("checks before saving", () => {
  it("accepts a complete verification and a switched-off empty one", () => {
    expect(verificationDraftError(config())).toBeNull();
    expect(verificationDraftError(config({ enabled: false, channelId: "", roleId: "" }))).toBeNull();
  });

  it("needs a channel and a standard role to switch the verification on", () => {
    expect(verificationDraftError(config({ channelId: "" }))).toMatch(/^Setări — Alege canalul/);
    expect(verificationDraftError(config({ roleId: "" }))).toMatch(/^Setări — Alege rolul standard/);
    expect(verificationDraftError(config({ roleId: "abc" }))).toMatch(/nu este un ID Discord/);
  });

  it("limits the extra roles and checks the texts and images like the server", () => {
    const many = Array.from({ length: 11 }, (_, index) => String(300000000000000000 + index));
    expect(verificationDraftError(config({ extraRoleIds: many }))).toMatch(/cel mult 10 roluri/);
    expect(verificationDraftError(config({ title: "  " }))).toBe("Mesaje — Titlul nu poate fi gol.");
    expect(verificationDraftError(config({ buttonEmoji: "" }))).toBeNull();
    expect(verificationDraftError(config({ buttonLabel: "x".repeat(81) }))).toMatch(/cel mult 80/);
    expect(verificationDraftError(config({ imageUrl: "http://exemplu.ro/a.png" }))).toMatch(/^Mesaje — Imaginea mare/);
    expect(verificationDraftError(config({ thumbnailUrl: "/api/storage/objects/uploads/abc" }))).toBeNull();
  });
});
