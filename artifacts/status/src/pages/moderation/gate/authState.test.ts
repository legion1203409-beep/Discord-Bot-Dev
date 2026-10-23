import { describe, expect, it, vi } from "vitest";
import { gateAuthState } from "./authState";

const base = { loading: false, error: null, retry: () => undefined, configured: true, loginUrl: "/api/moderation/oauth/discord" };

describe("gateAuthState", () => {
  it("e gata când Discord e configurat și adresa de pornire e bună", () => {
    expect(gateAuthState(base)).toEqual({ kind: "ready", loginUrl: "/api/moderation/oauth/discord" });
  });

  it("arată verificarea cât timp configurația se încarcă", () => {
    expect(gateAuthState({ ...base, loading: true })).toEqual({ kind: "checking" });
  });

  it("verificarea are prioritate față de o eroare veche", () => {
    expect(gateAuthState({ ...base, loading: true, error: { message: "x" } })).toEqual({ kind: "checking" });
  });

  it("păstrează mesajul erorii și funcția de reîncercare", () => {
    const retry = vi.fn();
    const state = gateAuthState({ ...base, error: { message: "Serverul nu răspunde." }, retry });
    expect(state.kind).toBe("error");
    if (state.kind !== "error") return;
    expect(state.message).toBe("Serverul nu răspunde.");
    state.retry();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("eroarea are prioritate față de „indisponibil”", () => {
    expect(gateAuthState({ ...base, configured: false, error: { message: "x" } }).kind).toBe("error");
  });

  it("e indisponibilă dacă Discord nu e configurat", () => {
    expect(gateAuthState({ ...base, configured: false })).toEqual({ kind: "unavailable" });
  });

  it("e indisponibilă dacă adresa de pornire a fost respinsă (alt site)", () => {
    expect(gateAuthState({ ...base, loginUrl: null })).toEqual({ kind: "unavailable" });
  });

  it("cine e deja conectat intră direct în panou", () => {
    expect(gateAuthState({ ...base, signedIn: true })).toEqual({ kind: "signed-in" });
  });

  it("sesiunea existentă are prioritate față de verificare, eroare și „indisponibil”", () => {
    expect(gateAuthState({ ...base, signedIn: true, loading: true }).kind).toBe("signed-in");
    expect(gateAuthState({ ...base, signedIn: true, error: { message: "x" } }).kind).toBe("signed-in");
    expect(gateAuthState({ ...base, signedIn: true, configured: false, loginUrl: null }).kind).toBe("signed-in");
  });

  it("fără sesiune, „conectat” nu apare niciodată", () => {
    expect(gateAuthState({ ...base, signedIn: false }).kind).toBe("ready");
    expect(gateAuthState(base).kind).toBe("ready");
  });
});
