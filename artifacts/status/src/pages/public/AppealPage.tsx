import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, LoaderCircle, LogOut, ShieldAlert } from "lucide-react";
import {
  APPEAL_ERRORS, APPEAL_MAX, APPEAL_MIN, appealAvatarUrl, appealScreen, formatAppealDate,
  type AppealSession, type AppealView,
} from "./appeal-model";
import "./appeal-page.css";

const BASE = "/api/moderation/appeals";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Ceva n-a mers. Încearcă din nou.");
  return data as T;
}

export function AppealPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const guildId = params.get("guildId") ?? undefined;
  const urlError = APPEAL_ERRORS[params.get("appeal_error") ?? ""] ?? null;
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const [session, setSession] = useState<AppealSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSession(await call<AppealSession>(`/session${query}`));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Nu am putut încărca pagina.");
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const send = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setFormError(null);
    try {
      const result = await call<{ status: AppealView }>(path, { method: "POST", body: JSON.stringify({ guildId, ...body }) });
      setSession((current) => current && current.authenticated ? { ...current, status: result.status } : current);
      setText("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nu am putut trimite.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await call("/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setSession({ authenticated: false, enabled: true });
  };

  const login = `/api/moderation/oauth/discord?appeal=1${guildId ? `&guildId=${encodeURIComponent(guildId)}` : ""}`;
  const status = session?.authenticated ? session.status : null;
  const screen = status ? appealScreen(status) : null;
  const tooShort = text.trim().length < APPEAL_MIN;

  return (
    <div className="ap-page">
      <main className="ap-card" aria-live="polite">
        <div className="ap-flame" aria-hidden="true"><Flame size={30} /></div>
        <h1>Contestă banul</h1>
        <p className="ap-sub">{status?.guild.name ?? (session && !session.authenticated ? session.guildName : null) ?? "Discord"}</p>

        {(urlError || loadError) && <p className="ap-error" role="alert">{urlError ?? loadError}</p>}
        {!session && !loadError && <p className="ap-muted"><LoaderCircle className="ap-spin" size={16} /> Se încarcă…</p>}

        {session && !session.authenticated && (
          <>
            <p>Dacă ai primit ban pe server, nu mai poți deschide un tichet acolo. Conectează-te cu contul Discord al banului și spune-ne ce s-a întâmplat. Staff-ul citește fiecare contestație.</p>
            {!session.enabled && <p className="ap-muted">Contestațiile de pe site sunt oprite acum.</p>}
            <a className="ap-btn" href={login}>Conectează-te cu Discord</a>
            <p className="ap-muted">Cerem doar numele și poza contului. Nu putem citi mesaje și nu intrăm în contul tău.</p>
          </>
        )}

        {status && session?.authenticated && (
          <>
            <div className="ap-user">
              <img src={appealAvatarUrl(session.user)} alt="" width={36} height={36} />
              <span>{session.user.name}</span>
              <button type="button" className="ap-link" onClick={() => void logout()}><LogOut size={14} /> Ieși</button>
            </div>

            {status.ban && screen !== "accepted" && screen !== "not-banned" && screen !== "disabled" && (
              <div className="ap-ban">
                <ShieldAlert size={16} />
                <div><strong>Banul tău</strong><span>{status.ban.reason || "Fără motiv trecut."}</span></div>
              </div>
            )}

            {screen === "disabled" && <p>Contestațiile de pe site sunt oprite pe acest server. Scrie unui staff dacă îl cunoști.</p>}
            {screen === "not-banned" && <p>Nu ai ban pe acest server, deci nu ai ce contesta.</p>}

            {(screen === "form" || screen === "rejected-open") && (
              <>
                {screen === "rejected-open" && status.appeal && (
                  <p className="ap-muted">Contestația de dinainte a fost respinsă{status.appeal.decisionNote ? `: ${status.appeal.decisionNote}` : "."} Poți încerca din nou.</p>
                )}
                <label htmlFor="ap-text">Ce s-a întâmplat și de ce să fie scos banul?</label>
                <textarea
                  id="ap-text" value={text} maxLength={APPEAL_MAX} rows={7}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Spune-ne pe scurt, sincer, fără scuze lungi."
                />
                <p className="ap-muted">{text.trim().length}/{APPEAL_MAX}{tooShort ? ` · minim ${APPEAL_MIN} de caractere` : ""}</p>
                {formError && <p className="ap-error" role="alert">{formError}</p>}
                <button type="button" className="ap-btn" disabled={busy || tooShort} onClick={() => void send("", { text })}>
                  {busy ? "Se trimite…" : "Trimite contestația"}
                </button>
              </>
            )}

            {screen === "pending" && status.appeal && (
              <>
                <p><strong>Contestația ta a ajuns la staff.</strong> Trimisă pe {formatAppealDate(status.appeal.createdAt)}. Revino pe această pagină ca să vezi răspunsul.</p>
                <blockquote>{status.appeal.body}</blockquote>
              </>
            )}

            {screen === "question" && status.appeal?.question && (
              <>
                <p><strong>Staff-ul îți cere o clarificare:</strong></p>
                <blockquote>{status.appeal.question.text}</blockquote>
                <textarea value={text} maxLength={1500} rows={5} onChange={(event) => setText(event.target.value)} aria-label="Răspunsul tău" />
                {formError && <p className="ap-error" role="alert">{formError}</p>}
                <button
                  type="button" className="ap-btn" disabled={busy || text.trim().length < 2}
                  onClick={() => void send("/answer", { clarificationId: status.appeal!.question!.id, text })}
                >{busy ? "Se trimite…" : "Trimite răspunsul"}</button>
              </>
            )}

            {screen === "rejected-wait" && status.appeal && (
              <>
                <p><strong>Contestația a fost respinsă.</strong></p>
                {status.appeal.decisionNote && <blockquote>{status.appeal.decisionNote}</blockquote>}
                {status.nextAllowedAt && <p className="ap-muted">Poți face o contestație nouă după {formatAppealDate(status.nextAllowedAt)}.</p>}
              </>
            )}

            {screen === "accepted" && (
              <>
                <p><strong>Contestația a fost acceptată.</strong> Banul a fost scos, te poți întoarce.</p>
                {status.appeal?.decisionNote && <blockquote>{status.appeal.decisionNote}</blockquote>}
                {status.inviteUrl && <a className="ap-btn" href={status.inviteUrl}>{status.inviteLabel || "Intră în regat"}</a>}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
