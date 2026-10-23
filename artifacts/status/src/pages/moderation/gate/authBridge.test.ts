import { describe, expect, it, vi } from "vitest";
import { authErrorMessage, gateConnection, sameOriginDiscordUrl } from "./authBridge";

const ORIGIN = "https://codelinked.app";

describe("authErrorMessage", () => {
  it("nu arată nimic fără cod de eroare", () => {
    expect(authErrorMessage("")).toBeNull();
    expect(authErrorMessage("?alt=1")).toBeNull();
  });

  it("traduce codurile cunoscute, cu sau fără „?” în față", () => {
    expect(authErrorMessage("?auth_error=cancelled")).toContain("anulată");
    expect(authErrorMessage("auth_error=state_mismatch")).toContain("a expirat");
    expect(authErrorMessage("auth_error=no_eligible_guild")).toContain("botul este membru pe server");
  });

  it("un cod necunoscut primește mesajul general, fără codul brut", () => {
    const message = authErrorMessage("?auth_error=detaliu_intern_neasteptat");
    expect(message).toContain("nu a putut fi finalizată");
    expect(message).not.toContain("detaliu_intern_neasteptat");
  });
});

describe("sameOriginDiscordUrl", () => {
  it("primește adresa de pornire de pe același site", () => {
    expect(sameOriginDiscordUrl("/api/moderation/oauth/discord", ORIGIN)).toBe("/api/moderation/oauth/discord");
    expect(sameOriginDiscordUrl(`${ORIGIN}/api/moderation/oauth/discord?x=1`, ORIGIN)).toBe("/api/moderation/oauth/discord?x=1");
  });

  it("respinge alt site, altă cale și valorile goale", () => {
    expect(sameOriginDiscordUrl("https://rau.example/api/moderation/oauth/discord", ORIGIN)).toBeNull();
    expect(sameOriginDiscordUrl("/alta/cale", ORIGIN)).toBeNull();
    expect(sameOriginDiscordUrl("https://discord.com/oauth2/authorize", ORIGIN)).toBeNull();
    expect(sameOriginDiscordUrl("", ORIGIN)).toBeNull();
    expect(sameOriginDiscordUrl(null, ORIGIN)).toBeNull();
    expect(sameOriginDiscordUrl(undefined, ORIGIN)).toBeNull();
  });
});

describe("gateConnection", () => {
  const authConfig = {
    discordOAuthConfigured: true,
    authorizationUrl: "/api/moderation/oauth/discord",
    botInviteUrl: "https://discord.com/oauth2/authorize?client_id=1",
    bot: { name: "Oracolul", avatarUrl: null },
  };
  const base = { signedIn: false, authConfig, loading: false, error: null, retry: () => Promise.resolve(), search: "", origin: ORIGIN };

  it("pregătește tot ce are nevoie pagina când autentificarea e gata", () => {
    expect(gateConnection(base)).toEqual({
      botName: "Oracolul",
      botInviteUrl: "https://discord.com/oauth2/authorize?client_id=1",
      authError: null,
      auth: { kind: "ready", loginUrl: "/api/moderation/oauth/discord" },
    });
  });

  it("fără configurație, numele și invitația lipsesc, iar autentificarea e indisponibilă", () => {
    const state = gateConnection({ ...base, authConfig: null });
    expect(state.botName).toBeNull();
    expect(state.botInviteUrl).toBeNull();
    expect(state.auth).toEqual({ kind: "unavailable" });
  });

  it("o adresă de pornire de pe alt site face autentificarea indisponibilă", () => {
    const state = gateConnection({ ...base, authConfig: { ...authConfig, authorizationUrl: "https://rau.example/api/moderation/oauth/discord" } });
    expect(state.auth).toEqual({ kind: "unavailable" });
  });

  it("duce mesajul erorii de autentificare din adresă", () => {
    expect(gateConnection({ ...base, search: "?auth_error=cancelled" }).authError).toContain("anulată");
  });

  it("cine are sesiune ajunge în panou chiar dacă configurația nu s-a încărcat", () => {
    expect(gateConnection({ ...base, signedIn: true, authConfig: null, loading: true }).auth).toEqual({ kind: "signed-in" });
  });

  it("reîncercarea nu aruncă eroarea mai departe", async () => {
    const retry = vi.fn(() => Promise.reject(new Error("tot nu merge")));
    const state = gateConnection({ ...base, authConfig: null, error: { message: "Serverul nu răspunde." }, retry });
    expect(state.auth.kind).toBe("error");
    if (state.auth.kind !== "error") return;
    expect(state.auth.message).toBe("Serverul nu răspunde.");
    expect(state.auth.retry()).toBeUndefined();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
