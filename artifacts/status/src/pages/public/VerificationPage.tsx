import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Flame, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  getGetVerificationStatusQueryKey,
  useCompleteWebsiteVerification,
  useGetVerificationStatus,
} from "@workspace/api-client-react";
import "./verification-page.css";

const EMBERS = Array.from({ length: 26 }, (_, index) => ({
  left: `${(index * 43 + 7) % 98}%`,
  delay: `${-((index * 1.37) % 20)}s`,
  duration: `${11 + ((index * 7) % 11)}s`,
  drift: `${((index * 17) % 81) - 40}px`,
  size: `${2 + ((index * 13) % 26) / 10}px`,
}));

type VerificationParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  kind: "spark" | "smoke" | "ash" | "gold";
};

export function VerificationPage() {
  const ticket = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("ticket") ?? "", []);
  const legacyError = useMemo(() => new URLSearchParams(window.location.search).get("verification_error"), []);
  const guildId = useMemo(() => new URLSearchParams(window.location.search).get("guildId") ?? undefined, []);
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fuseWidth, setFuseWidth] = useState(0);
  const fuseRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const rippleSequence = useRef(0);
  const [ripple, setRipple] = useState<{ id: number; x: number; y: number } | null>(null);
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
    if (!ticket || !sliderCompleted || completion.isPending || completion.isSuccess) return;
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
    completion.error ? "is-error" : "",
  ].filter(Boolean).join(" ");
  const markerStyle: CSSProperties = { left: `${markerLeft}px` };
  const ashStyle: CSSProperties = { width: `${Math.max(0, markerLeft - 24)}px` };
  const pageStyle = { "--vx-progress": progress } as CSSProperties;
  const effectState = useRef({ progress, isDragging, sliderCompleted, isSuccess });
  effectState.current = { progress, isDragging, sliderCompleted, isSuccess };
  const successHeading = result?.result === "already_verified"
    ? "Contul era deja verificat."
    : result?.verified
      ? "Verificarea a fost finalizată."
      : "Contul este verificat.";

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const particles: VerificationParticle[] = [];
    let frameId = 0;
    let lastFrame = performance.now();
    let width = 0;
    let height = 0;
    let ambient = 0;
    let trail = 0;
    let lastMarkerX: number | null = null;
    let markerVelocity = 0;
    let previousDone = false;
    let previousSuccess = false;
    let previousDragging = false;
    let sweep: { fromX: number; toX: number; y: number; elapsed: number } | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    resize();

    const emit = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      life: number,
      size: number,
      kind: VerificationParticle["kind"] = "spark",
      gravity = 0,
      drag = 0.7,
    ) => {
      if (particles.length >= 260) particles.shift();
      particles.push({ x, y, vx, vy, life, maxLife: life, size, gravity, drag, kind });
    };
    const localPoint = (element: HTMLElement | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - canvasRect.left,
        y: rect.top + rect.height / 2 - canvasRect.top,
      };
    };
    const burst = (x: number, y: number, count: number, spread: number, gold = false) => {
      for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 55 + Math.random() * spread;
        emit(
          x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 18,
          .55 + Math.random() * .8, 1.2 + Math.random() * 2.4,
          gold ? "gold" : "spark", gold ? 105 : 90, 1.5,
        );
      }
    };

    const animate = (now: number) => {
      const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      const current = effectState.current;
      const marker = localPoint(markerRef.current);
      const fuse = fuseRef.current;
      const endpoint = fuse?.querySelector<HTMLElement>(".vx-endpoint") ?? null;

      if (marker) {
        if (lastMarkerX !== null && dt > 0) markerVelocity = (marker.x - lastMarkerX) / dt;
        lastMarkerX = marker.x;
      }
      if (current.sliderCompleted && !previousDone && marker) {
        const goal = localPoint(endpoint) ?? marker;
        burst(goal.x, goal.y, 78, 250);
        const fuseRect = fuse?.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        if (fuseRect) {
          sweep = {
            fromX: fuseRect.left + 24 - canvasRect.left,
            toX: goal.x,
            y: goal.y,
            elapsed: 0,
          };
        }
      }
      if (current.isSuccess && !previousSuccess) {
        const button = localPoint(ctaRef.current);
        const origin = button ?? { x: width / 2, y: height * .72 };
        burst(origin.x, origin.y, 58, 300, true);
        for (let index = 0; index < 34; index++) {
          emit(
            Math.random() * width, -8 - Math.random() * 28,
            (Math.random() - .5) * 26, 35 + Math.random() * 75,
            .8 + Math.random() * .8, 1.2 + Math.random() * 2,
            "gold", 95, .25,
          );
        }
      }
      if (previousDragging && !current.isDragging && marker && current.progress > 0 && !current.sliderCompleted) {
        for (let index = 0; index < 12; index++) {
          emit(
            marker.x + (Math.random() - .5) * 12, marker.y + (Math.random() - .5) * 8,
            (Math.random() - .5) * 24, -18 - Math.random() * 48,
            .55 + Math.random() * .6, 3 + Math.random() * 4,
            "smoke", -8, .6,
          );
        }
      }

      ambient += dt * 2.1;
      while (ambient >= 1) {
        ambient -= 1;
        emit(
          Math.random() * width, -4, (Math.random() - .5) * 10, 18 + Math.random() * 24,
          5 + Math.random() * 5, .8 + Math.random() * 1.3, "ash", 0, 0,
        );
      }
      if (marker && (current.isDragging || current.progress > 0 || current.sliderCompleted)) {
        trail += dt * (current.isDragging ? 32 + Math.min(24, Math.abs(markerVelocity) * .06) : 14);
        while (trail >= 1) {
          trail -= 1;
          emit(
            marker.x + (Math.random() - .5) * 9, marker.y - 19 + (Math.random() - .5) * 8,
            -markerVelocity * .12 + (Math.random() - .5) * 32, -38 - Math.random() * 76,
            .45 + Math.random() * .55, 1.1 + Math.random() * 2, "spark", 15, .75,
          );
        }
      }
      if (sweep) {
        sweep.elapsed += dt;
        const t = Math.min(1, sweep.elapsed / 1.1);
        const x = sweep.fromX + (sweep.toX - sweep.fromX) * (1 - (1 - t) ** 2);
        for (let index = 0; index < 2; index++) {
          emit(
            x + (Math.random() - .5) * 12, sweep.y + (Math.random() - .5) * 8,
            (Math.random() - .5) * 22, -28 - Math.random() * 70,
            .45 + Math.random() * .6, 1 + Math.random() * 2, "spark", 0, .8,
          );
        }
        if (t >= 1) sweep = null;
      }

      context.clearRect(0, 0, width, height);
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index];
        particle.life -= dt;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        particle.vx *= 1 - Math.min(1, particle.drag * dt);
        particle.vy += particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        const opacity = Math.min(1, particle.life / particle.maxLife * 1.5);
        if (particle.kind === "smoke") {
          const radius = particle.size * (1 + (1 - particle.life / particle.maxLife) * 2.2);
          const gradient = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius);
          gradient.addColorStop(0, `rgba(194,166,145,${(opacity * .28).toFixed(3)})`);
          gradient.addColorStop(1, "rgba(194,166,145,0)");
          context.globalCompositeOperation = "source-over";
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          context.fill();
          continue;
        }
        if (particle.kind === "ash") {
          context.globalCompositeOperation = "source-over";
          context.fillStyle = `rgba(220,198,179,${(opacity * .36).toFixed(3)})`;
          context.fillRect(particle.x, particle.y, particle.size, particle.size * .7);
          continue;
        }
        const color = particle.kind === "gold" ? "255,211,132" : "255,154,78";
        const radius = particle.size * (.55 + opacity * .6);
        const gradient = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius * 3);
        gradient.addColorStop(0, `rgba(255,243,206,${opacity.toFixed(3)})`);
        gradient.addColorStop(.28, `rgba(${color},${(opacity * .86).toFixed(3)})`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        context.globalCompositeOperation = "lighter";
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(particle.x, particle.y, radius * 3, 0, Math.PI * 2);
        context.fill();
      }
      context.globalCompositeOperation = "source-over";
      previousDone = current.sliderCompleted;
      previousSuccess = current.isSuccess;
      previousDragging = current.isDragging;
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleCtaPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!sliderCompleted || completion.isPending || completion.isSuccess) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setRipple({ id: ++rippleSequence.current, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  return (
    <div className={pageClassName} style={pageStyle}>
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
          <canvas ref={canvasRef} className="vx-effects-canvas" aria-hidden="true" />
          <div className="vx-card-head">
            <div className="vx-tile" aria-hidden="true">
              <span className="vx-tile-orbit" />
              <svg className="vx-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path className="vx-shield-outline" pathLength={1} d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
                <path className="vx-shield-check" d="M8.8 12.2l2.2 2.2 4.2-4.4" />
              </svg>
            </div>
            <div>
              <p className="vx-eyebrow">ORACOLUL CENUȘII · DISCORD</p>
              <h1 id="verification-heading" className="vx-title">Verifică-ți accesul</h1>
            </div>
          </div>

          {isSuccess && !ticket ? (
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
                  <span className="vx-fuse-glimmer" aria-hidden="true" />
                  <span className="vx-ash" style={ashStyle} aria-hidden="true"><i /></span>
                  <span className="vx-startpoint" aria-hidden="true" />
                  <span className="vx-endpoint" aria-hidden="true">
                    <span className="vx-endpoint-ring" />
                    <Flame />
                    <span className="vx-completion-ring vx-completion-ring--one" />
                    <span className="vx-completion-ring vx-completion-ring--two" />
                  </span>
                  <span className="vx-completion-flash" aria-hidden="true" />
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
                  <span className="vx-head-glow" style={markerStyle} aria-hidden="true"><i className="vx-rays" /></span>
                  <span className="vx-marker" ref={markerRef} style={markerStyle} aria-hidden="true">
                    <span className="vx-core" />
                    <span className="vx-spark-trail"><i /><i /><i /><i /><i /></span>
                  </span>
                  <span className="vx-flame" style={markerStyle} aria-hidden="true">
                    <i className="vx-flame-preheat" />
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
                    onPointerUp={(event) => {
                      // Native range inputs can round the final pointer pixel to 999/1000.
                      // Treat that last reachable pointer step as the visual endpoint.
                      if (Number(event.currentTarget.value) >= 999) setSliderValue(1000);
                      setIsDragging(false);
                    }}
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
                ref={ctaRef}
                type="button"
                onClick={() => void completeVerification()}
                onPointerDown={handleCtaPointerDown}
                disabled={!sliderCompleted || completion.isPending || completion.isSuccess}
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
                {ripple && (
                  <i
                    className="vx-cta-ripple"
                    key={ripple.id}
                    style={{ left: ripple.x, top: ripple.y }}
                    onAnimationEnd={() => setRipple(null)}
                    aria-hidden="true"
                  />
                )}
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
