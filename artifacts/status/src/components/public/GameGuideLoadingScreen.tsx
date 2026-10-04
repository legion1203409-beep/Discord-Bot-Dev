import { useEffect, useRef, type CSSProperties } from "react";
import "./game-guide-loading-screen.css";

const portcullisBars = Array.from({ length: 9 }, (_, index) => 82 + index * 17);
const dripMarks = [
  { progress: 12, height: 12 },
  { progress: 27, height: 24 },
  { progress: 41, height: 9 },
  { progress: 58, height: 20 },
  { progress: 73, height: 14 },
  { progress: 88, height: 26 },
];

const embers = Array.from({ length: 22 }, (_, index) => ({
  left: (index % 2 === 0 ? 30 : 360) + ((index * 37) % 300) / 10,
  duration: 2.2 + ((index * 71) % 240) / 100,
  delay: -((index * 43) % 400) / 100,
  drift: (((index * 53) % 100) / 100 - 0.5) * 50,
}));

export function GameGuideLoadingScreen({
  onOpenComplete,
  ariaLabel = "Se încarcă ghidul jocului",
}: {
  onOpenComplete: () => void;
  ariaLabel?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const portcullisRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGRectElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dripRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const liftDuration = prefersReducedMotion ? 0 : 2400;
    const holdDuration = 420;
    const openingDuration = liftDuration + holdDuration;
    const startedAt = performance.now();
    let animationFrame = 0;
    let lastProgress = -1;

    const fitStage = () => {
      const desktopScale = window.innerWidth >= 1024 ? 1.28 : 1;
      const scale = Math.min(desktopScale, window.innerWidth / 460, window.innerHeight / 560);
      stage.style.setProperty("--stage-scale", String(scale));
      const verticalCompensation = `${(scale - 1) * 210}px`;
      stage.style.marginTop = verticalCompensation;
      stage.style.marginBottom = verticalCompensation;
    };

    const easeInOut = (value: number) => 0.5 - 0.5 * Math.cos(Math.PI * value);

    const animate = (now: number) => {
      const elapsed = now - startedAt;
      const progress = prefersReducedMotion ? 1 : Math.min(1, easeInOut(elapsed / liftDuration));

      portcullisRef.current?.setAttribute("transform", `translate(0 ${-progress * 270})`);
      glowRef.current?.setAttribute("opacity", String(Math.min(1, progress * 1.6)));

      const roundedProgress = Math.round(progress * 100);
      if (roundedProgress !== lastProgress) {
        lastProgress = roundedProgress;
        if (fillRef.current) fillRef.current.style.width = `${roundedProgress}%`;
        root.setAttribute("aria-valuenow", String(roundedProgress));
        dripRefs.current.forEach((drip, index) => {
          drip?.classList.toggle("is-active", roundedProgress > dripMarks[index].progress + 2);
        });
      }

      if (elapsed >= openingDuration) {
        onOpenComplete();
        return;
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    fitStage();
    window.addEventListener("resize", fitStage);
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", fitStage);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [onOpenComplete]);

  return (
    <main
      ref={rootRef}
      className="game-guide-loading"
      role="progressbar"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <div className="game-guide-loading__stage" ref={stageRef} aria-hidden="true">
        <div className="game-guide-loading__gate">
          <svg viewBox="0 0 300 360" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="game-guide-loading-brick" width="50" height="24" patternUnits="userSpaceOnUse">
                <rect width="50" height="24" fill="#1E1E1E" />
                <path
                  d="M0 .5H50M0 12.5H50M25 .5V12.5M0 12.5V24M50 12.5V24"
                  stroke="#2b2b2b"
                  fill="none"
                />
              </pattern>
              <radialGradient id="game-guide-loading-glow" cx="50%" cy="85%" r="80%">
                <stop offset="0" stopColor="#ffc08a" />
                <stop offset=".4" stopColor="#D94A2B" />
                <stop offset="1" stopColor="#2a0e08" />
              </radialGradient>
              <clipPath id="game-guide-loading-opening">
                <path d="M70 340V160A80 80 0 0 1 230 160V340Z" />
              </clipPath>
            </defs>
            <path
              d="M30 340V150A120 120 0 0 1 270 150V340Z"
              fill="url(#game-guide-loading-brick)"
              stroke="#2e2e2e"
              strokeWidth="2"
            />
            <rect x="14" y="340" width="272" height="14" fill="#1E1E1E" stroke="#2e2e2e" />
            <path d="M138 26H162L158 54H142Z" fill="#262626" stroke="#3a3a3a" />
            <path d="M70 340V160A80 80 0 0 1 230 160V340Z" fill="#090909" />
            <g clipPath="url(#game-guide-loading-opening)">
              <rect
                ref={glowRef}
                x="70"
                y="80"
                width="160"
                height="262"
                fill="url(#game-guide-loading-glow)"
                opacity="0"
              />
              <g ref={portcullisRef} fill="#7E7E7E" stroke="#3a3a3a" strokeWidth=".8">
                {portcullisBars.map((x) => (
                  <g key={x}>
                    <rect x={x - 2.5} y="84" width="5" height="238" />
                    <polygon points={`${x - 3.5},322 ${x + 3.5},322 ${x},338`} />
                  </g>
                ))}
              </g>
            </g>
            <path
              d="M70 340V160A80 80 0 0 1 230 160V340"
              fill="none"
              stroke="#3a3a3a"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="game-guide-loading__torch game-guide-loading__torch--left">
          <div className="game-guide-loading__flame" />
          <div className="game-guide-loading__bracket" />
        </div>
        <div className="game-guide-loading__torch game-guide-loading__torch--right">
          <div className="game-guide-loading__flame" />
          <div className="game-guide-loading__bracket" />
        </div>
        <div className="game-guide-loading__embers">
          {embers.map((ember, index) => (
            <span
              key={index}
              className="game-guide-loading__ember"
              style={
                {
                  left: `${ember.left}px`,
                  "--ember-duration": `${ember.duration}s`,
                  "--ember-delay": `${ember.delay}s`,
                  "--ember-drift": `${ember.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="game-guide-loading__blood" aria-hidden="true">
        <div className="game-guide-loading__track" />
        <div className="game-guide-loading__fill" ref={fillRef} />
        {dripMarks.map((drip, index) => (
          <span
            key={drip.progress}
            ref={(element) => {
              dripRefs.current[index] = element;
            }}
            className="game-guide-loading__drip"
            style={
              {
                left: `${drip.progress}%`,
                "--drip-height": `${drip.height}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </main>
  );
}