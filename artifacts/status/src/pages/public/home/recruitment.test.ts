import { describe, expect, it, vi } from "vitest";
import { recruitmentFact, recruitmentView } from "./recruitment";

type Q<T> = { isLoading: boolean; isError: boolean; data: T | undefined; refetch: () => unknown };
const q = <T,>(over: Partial<Q<T>> = {}): Q<T> => ({ isLoading: false, isError: false, data: undefined, refetch: () => undefined, ...over });

const profile = { name: "Regatul Cenușii", iconUrl: null, inviteUrl: "https://discord.gg/regatulcenusii", guildId: "123456789012345678" };
const dashboard = (enabled: boolean) => ({ guildId: "123456789012345678", guildName: "Regatul", enabled, viewer: null, leaderboard: [] });

describe("recruitmentView", () => {
  it("așteaptă cât timp se încarcă profilul sau datele", () => {
    expect(recruitmentView(q({ isLoading: true }), null, q()).kind).toBe("loading");
    expect(recruitmentView(q({ data: profile }), profile.guildId, q({ isLoading: true })).kind).toBe("loading");
  });

  it("nu așteaptă datele de recrutare când nu există server", () => {
    expect(recruitmentView(q({ data: { ...profile, guildId: null } }), null, q({ isLoading: true })).kind).toBe("no-guild");
  });

  it("arată eroarea profilului și știe să o reia", () => {
    const refetch = vi.fn();
    const view = recruitmentView(q({ isError: true, refetch }), null, q());
    expect(view.kind).toBe("profile-error");
    if (view.kind === "profile-error") view.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("arată eroarea datelor de recrutare și știe să o reia", () => {
    const refetch = vi.fn();
    const view = recruitmentView(q({ data: profile }), profile.guildId, q({ isError: true, refetch }));
    expect(view.kind).toBe("error");
    if (view.kind === "error") view.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("nu ia datele bune când o reîmprospătare din fundal eșuează", () => {
    expect(recruitmentView(q({ data: profile, isError: true }), profile.guildId, q({ data: dashboard(true) })).kind).toBe("active");
    expect(recruitmentView(q({ data: profile }), profile.guildId, q({ data: dashboard(true), isError: true })).kind).toBe("active");
    expect(recruitmentView(q({ data: profile }), profile.guildId, q({ data: dashboard(false), isError: true })).kind).toBe("inactive");
  });

  it("deosebește programul inactiv de cel activ", () => {
    expect(recruitmentView(q({ data: profile }), profile.guildId, q({ data: dashboard(false) })).kind).toBe("inactive");
    const active = recruitmentView(q({ data: profile }), profile.guildId, q({ data: dashboard(true) }));
    expect(active.kind).toBe("active");
  });

  it("e „gol” când nu a venit nimic și nu e nicio eroare", () => {
    expect(recruitmentView(q({ data: profile }), profile.guildId, q()).kind).toBe("empty");
  });
});

describe("recruitmentFact", () => {
  it("traduce starea pentru Oracol", () => {
    expect(recruitmentFact({ kind: "inactive" })).toBe("inactive");
    expect(recruitmentFact({ kind: "active", dashboard: dashboard(true) })).toBe("active");
    expect(recruitmentFact({ kind: "loading" })).toBe("unknown");
    expect(recruitmentFact({ kind: "empty" })).toBe("unknown");
  });
});
