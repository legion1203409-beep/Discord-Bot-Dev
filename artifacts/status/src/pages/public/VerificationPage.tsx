import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Flame, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  getGetVerificationStatusQueryKey,
  useCompleteWebsiteVerification,
  useGetVerificationStatus,
} from "@workspace/api-client-react";
import "./verification-page.css";

const EMBERS = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 43 + 7) % 98}%`,
  delay: `${-((index * 1.37) % 19)}s`,
  duration: `${11 + ((index * 7) % 10)}s`,
  drift: `${((index * 17) % 81) - 40}px`,
  size: `${2 + ((index * 13) % 26) / 10}px`,
}));

export function VerificationPage() {
  const ticket = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("ticket") ?? "", []);
  const legacyError = useMemo(() => new URLSearchParams(window.location.search).get("verification_error"), []);
  const guildId = useMemo(() => new URLSearchParams(window.location.search).get("guildId") ?? undefined, []);
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fuseWidth, setFuseWidth] = useState(0);
  const fuseRef = useRef<HTMLDivElement>(null);
  const completion = useCompleteWebsiteVerification();
  const statusParams = guildId ? { guildId } : undefined;
  const status = useGetVerificationStatus(statusParams, {
    query: {
      enabled: !ticket || completion.isSuccess,
      queryKey: getGetVerificationStatusQueryKey(statusParams),
    },
  });
  const sliderCompleted = sliderValue >= 1000;
  const legacyErrorText = legacyError === "not_member"
    ? "Contul asociat linkului nu este membru pe server."
    : legacyError === "bot_offline"
      ? "Botul Discord nu este disponibil momentan. Încearcă din nou mai târziu."
      : legacyError
        ? "Acest link nu a putut fi confirmat. Cere un link nou în Discord."
        : null;

  useEffect(() => {
    const fuse = fuseRef.current;
    if (!fuse) return;
    const updateWidth = () => setFuseWidth(fuse.getBoundingClientRect().width);
    const stopDragging = () => setIsDragging(false);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(fuse);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const completeVerification = async () => {
    if (!ticket || !sliderCompleted || completion.isPending) return;
    try {
      await completion.mutateAsync({ data: { ticket, sliderCompleted: true } });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch {
      // The mutation error is rendered below without exposing the opaque ticket.
    }
  };

  const result = completion.data;
  const isSuccess = result?.verified === true || status.data?.verified === true;
  const statusError = status.isError || status.data?.reason === "bot_offline";
  const progress = sliderValue / 1000;
  const travel = Math.max(0, fuseWidth - 48);
  const markerLeft = 24 + travel * progress;
  const pageClassName = [
    "vx-page",
    sliderValue > 0 ? "is-burning" : "is-idle",
    isDragging ? "is-drag" : "",
    progress >= 0.78 ? "is-near" : "",
    sliderCompleted ? "is-done" : "",
    completion.isPending ? "is-busy" : "",
    isSuccess ? "is-sent" : "",
  ].filter(Boolean).join(" ");
  const markerStyle: CSSProperties = { left: `${markerLeft}px` };
  const ashStyle: CSSProperties = { width: `${Math.max(0, markerLeft - 24)}px` };
  const successHeading = result?.result === "already_verified"
    ? "Contul era deja verificat."
    : result?.verified
      ? "Verificarea a fost finalizată."
      : "Contul este verificat.";

  return (
    <div className={pageClassName}>
      <div className="vx-background" aria-hidden="true">
        <div className="vx-background-glow" />
        <div className="vx-background-ring" />
        <div className="vx-embers">
          {EMBERS.map((ember, index) => (
            <i
              key={index}
              className="vx-ember"
              style={{
                "--ember-left": ember.left,
                "--ember-delay": ember.delay,
                "--ember-duration": ember.duration,
                "--ember-drift": ember.drift,
                "--ember-size": ember.size,
              } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <header className="vx-top">
        <span className="vx-sigil" aria-hidden="true"><i /></span>
        <span className="vx-brand">Oracolul Cenușii</span>
        <span className="vx-top-caption">VERIFICARE DISCORD</span>
      </header>

      <main className="vx-main">
        <section className="vx-card" aria-labelledby="verification-heading">
          <div className="vx-card-glow" aria-hidden="true" />
          <div className="vx-card-head">
            <div className="vx-tile" aria-hidden="true">
              <ShieldCheck className="vx-shield" />
              <span className="vx-tile-orbit" />
            </div>
            <div>
              <p className="vx-eyebrow">ORACOLUL CENUȘII · DISCORD</p>
              <h1 id="verification-heading" className="vx-title">Verifică-ți accesul</h1>
            </div>
          </div>

          {isSuccess ? (
            <div className="vx-message vx-message--success" role="status" data-testid="status-verification-success">
              <CheckCircle2 className="vx-message-icon" aria-hidden="true" />
              <div>
                <strong>{successHeading}</strong>
                <span>Poți reveni acum în Discord.</span>
              </div>
            </div>
          ) : legacyErrorText ? (
            <div className="vx-message vx-message--error" role="alert" data-testid="status-verification-error">
              <TriangleAlert className="vx-message-icon" aria-hidden="true" />
              <p>{legacyErrorText}</p>
            </div>
          ) : !ticket && status.isLoading ? (
            <div className="vx-message vx-message--muted" role="status" data-testid="status-verification-status-loading">
              <LoaderCircle className="vx-message-icon vx-spin" aria-hidden="true" />
              <p>Se verifică starea contului în Discord…</p>
            </div>
          ) : !ticket && statusError ? (
            <div className="vx-message-wrap">
              <div className="vx-message vx-message--error" role="alert" data-testid="status-verification-status-error">
                <TriangleAlert className="vx-message-icon" aria-hidden="true" />
                <p>{status.data?.reason === "bot_offline" ? "Botul Discord nu poate confirma starea acum." : "Starea verificării nu a putut fi încărcată."}</p>
              </div>
              <button type="button" onClick={() => void status.refetch()} className="vx-secondary-button" data-testid="button-retry-verification-status">
                Încearcă din nou
              </button>
            </div>
          ) : !ticket ? (
            <div className="vx-message vx-message--muted" role="status" data-testid="status-verification-ticket-missing">
              <TriangleAlert className="vx-message-icon" aria-hidden="true" />
              <p>Deschide butonul personal de verificare primit în Discord. Biletul este unic și nu poate fi înlocuit cu autentificarea pe site.</p>
            </div>
          ) : (
            <>
              <p className="vx-lead">
                Pentru a confirma verificarea, glisează marcajul până la capătul traseului. Biletul a fost emis de Discord și va fi folosit o singură dată pentru acest pas.
              </p>

              <div className="vx-rite">
                <div className="vx-rite-top">
                  <span className="vx-rite-label">{sliderCompleted ? "Flacără aprinsă" : "Aprinde flacăra"}</span>
                  <span className="vx-rite-hint" id="verification-hint" aria-live="polite">
                    {sliderCompleted ? "Poți finaliza verificarea" : "Glisează până la capăt"}
                  </span>
                </div>

                <div className={`vx-fuse ${sliderCompleted ? "is-complete" : ""}`} ref={fuseRef}>
                  <span className="vx-cord" aria-hidden="true" />
                  <span className="vx-ash" style={ashStyle} aria-hidden="true"><i /></span>
                  <span className="vx-endpoint" aria-hidden="true">
                    <span className="vx-endpoint-ring" />
                    <Flame />
                    <span className="vx-completion-ring vx-completion-ring--one" />
                    <span className="vx-completion-ring vx-completion-ring--two" />
                  </span>
                  {Array.from({ length: 7 }, (_, index) => {
                    const notchProgress = (index + 1) / 8;
                    return (
                      <i
                        key={index}
                        className={`vx-notch ${progress >= notchProgress ? "is-lit" : ""}`}
                        style={{ left: `${24 + travel * notchProgress}px` }}
                        aria-hidden="true"
                      />
                    );
                  })}
                  <span className="vx-head-glow" style={markerStyle} aria-hidden="true" />
                  <span className="vx-marker" style={markerStyle} aria-hidden="true">
                    <span className="vx-core" />
                    <span className="vx-spark-trail"><i /><i /><i /><i /><i /></span>
                  </span>
                  <span className="vx-flame" style={markerStyle} aria-hidden="true">
                    <i className="vx-flame-outer" />
                    <i className="vx-flame-middle" />
                    <i className="vx-flame-core" />
                  </span>
                  <span className="vx-fuse-hint" aria-hidden="true"><ChevronRightIcon /><ChevronRightIcon /><ChevronRightIcon /></span>
                  <input
                    id="verification-slider"
                    className="vx-range"
                    type="range"
                    min={0}
                    max={1000}
                    step={1}
                    value={sliderValue}
                    onChange={(event) => setSliderValue(Number(event.currentTarget.value))}
                    onPointerDown={() => setIsDragging(true)}
                    onPointerUp={() => setIsDragging(false)}
                    onPointerCancel={() => setIsDragging(false)}
                    onBlur={() => setIsDragging(false)}
                    aria-label="Glisează pentru a finaliza verificarea"
                    aria-valuetext={sliderCompleted ? "Traseu complet" : `${Math.round(progress * 100)} din 100`}
                    aria-describedby="verification-hint"
                    data-testid="slider-verification-completion"
                  />
                  <span className="vx-marker-focus" style={markerStyle} aria-hidden="true"><span /></span>
                </div>

                <div className="vx-rite-foot" aria-hidden="true">
                  <span>START</span>
                  <span className="vx-percent">{Math.round(progress * 100)}%</span>
                  <span>FINAL</span>
                </div>
              </div>

              {completion.error && (
                <div className="vx-message vx-message--error vx-completion-error" role="alert" data-testid="status-verification-completion-error">
                  <TriangleAlert className="vx-message-icon" aria-hidden="true" />
                  <span>{completion.error instanceof Error ? completion.error.message : "Verificarea nu a putut fi finalizată. Solicită un link nou în Discord."}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void completeVerification()}
                disabled={!sliderCompleted || completion.isPending}
                aria-busy={completion.isPending}
                className="vx-cta"
                data-testid="button-complete-verification"
              >
                {completion.isPending ? (
                  <LoaderCircle className="vx-button-icon vx-spin" aria-hidden="true" />
                ) : completion.isSuccess ? (
                  <Check className="vx-button-icon" aria-hidden="true" />
                ) : (
                  <Flame className="vx-button-icon" aria-hidden="true" />
                )}
                <span>
                  {completion.isPending
                    ? "Se confirmă…"
                    : completion.isSuccess
                      ? "Verificare confirmată"
                      : "Finalizează verificarea"}
                </span>
              </button>
              {completion.isSuccess && (
                <p className="vx-submit-note" role="status">Totul e gata. Te poți întoarce în Discord.</p>
              )}
              <p className="vx-fine">
                Biletul nu dezvăluie identitatea ta pe această pagină. Verificarea este confirmată de serverul Discord.
              </p>
              <span className="vx-sr-only" aria-live="polite">
                {sliderCompleted ? "Flacără aprinsă. Poți finaliza verificarea." : ""}
              </span>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m7 4 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
