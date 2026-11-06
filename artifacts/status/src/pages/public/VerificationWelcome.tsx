import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import type { VerificationPageTexts } from "../../lib/verification-page-texts";
import { WELCOME_RUNES, discordServerUrl, drawThree, runeShareText, saveRune, savedRune, type WelcomeRune } from "./verification-runes";

/** Asks the page's fire canvas (VerificationPage) for a burst of golden sparks at a point on screen. */
export const VX_BURST_EVENT = "vx:burst";
function burstAt(element: Element | null, strength = 1) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent(VX_BURST_EVENT, { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, strength } }));
}

const RING_TEXT = WELCOME_RUNES.map((rune) => rune.glyph).join(" · ");

/**
 * Ce vede membrul după ce s-a verificat: pecetea regatului (un cerc de rune
 * care se aprinde), un buton spre server și „Trage-ți runa”: trei cărți vin
 * pe masă, membrul alege una, cartea explodează în scântei, se întoarce și îi
 * spune titlul și profeția, cuvânt cu cuvânt.
 */
export function VerificationWelcome({ guildId, texts }: { guildId?: string | null; texts: VerificationPageTexts }) {
  const [cards] = useState(() => drawThree());
  const [remembered] = useState<WelcomeRune | null>(() => savedRune(guildId ?? undefined));
  const [picked, setPicked] = useState<WelcomeRune | null>(remembered);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const serverUrl = discordServerUrl(guildId);

  useEffect(() => {
    const seal = document.querySelector(".vx-seal");
    const timer = window.setTimeout(() => burstAt(seal, 1.2), 350);
    return () => window.clearTimeout(timer);
  }, []);

  const pick = (index: number, element: HTMLElement) => {
    if (picked) return;
    setFlipped(index);
    setPicked(cards[index]);
    saveRune(guildId ?? undefined, cards[index]);
    burstAt(element, 1.4);
    window.setTimeout(() => burstAt(element, .8), 520);
    navigator.vibrate?.(30);
  };
  const tilt = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--rx", `${((event.clientY - rect.top) / rect.height - .5) * -16}deg`);
    event.currentTarget.style.setProperty("--ry", `${((event.clientX - rect.left) / rect.width - .5) * 18}deg`);
    event.currentTarget.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  };
  const untilt = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  };
  const copy = async () => {
    if (!picked) return;
    try {
      await navigator.clipboard.writeText(runeShareText(picked));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="vx-welcome" data-testid="verification-welcome">
      <div className="vx-seal" aria-hidden="true">
        <span className="vx-seal-wave" />
        <span className="vx-seal-wave vx-seal-wave--two" />
        <svg className="vx-seal-ring" viewBox="0 0 200 200">
          <defs><path id="vx-seal-path" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
          <circle cx="100" cy="100" r="92" className="vx-seal-line" />
          <circle cx="100" cy="100" r="64" className="vx-seal-line vx-seal-line--dash" />
          <text className="vx-seal-runes"><textPath href="#vx-seal-path" textLength="488">{RING_TEXT} · </textPath></text>
        </svg>
        <span className="vx-seal-core">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <span className="vx-seal-label">{texts.welcomeLabel}</span>
      </div>

      {serverUrl ? (
        <a className="vx-cta vx-welcome-open" href={serverUrl} target="_blank" rel="noreferrer" data-testid="link-open-discord">
          <ExternalLink className="vx-button-icon" aria-hidden="true" />
          <span>Intră în regat</span>
        </a>
      ) : null}

      {texts.runesEnabled ? (
      <div className={`vx-runes ${picked ? "is-picked" : ""}`}>
        <div className="vx-runes-head">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>{picked ? "Runa ta de bun venit" : texts.runesTitle}</strong>
            <span>{picked ? "Oracolul a vorbit. Arat-o pe chat." : texts.runesText}</span>
          </div>
        </div>

        {remembered && flipped === null ? (
          <div className="vx-rune-saved">
            <span className="vx-rune-card is-flipped is-static" aria-hidden="true">
              <span className="vx-rune-inner"><RuneFront rune={remembered} /></span>
            </span>
            <RuneText rune={remembered} />
          </div>
        ) : (
          <>
            <div className="vx-rune-row" role="group" aria-label="Trei cărți cu rune">
              {cards.map((rune, index) => {
                const isFlipped = flipped === index;
                const isOther = flipped !== null && !isFlipped;
                return (
                  <button
                    key={rune.id}
                    type="button"
                    className={`vx-rune-card ${isFlipped ? "is-flipped" : ""} ${isOther ? "is-away" : ""}`}
                    style={{ "--deal": index } as CSSProperties}
                    onClick={(event) => pick(index, event.currentTarget)}
                    onPointerMove={picked ? undefined : tilt}
                    onPointerLeave={untilt}
                    disabled={Boolean(picked)}
                    aria-label={isFlipped ? `${rune.name}: ${rune.title}` : `Cartea ${index + 1}`}
                    data-testid={`button-rune-${index}`}
                  >
                    <span className="vx-rune-float">
                      <span className="vx-rune-inner">
                        <span className="vx-rune-back" aria-hidden="true"><i>ᛟ</i><em /></span>
                        <RuneFront rune={rune} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {picked && flipped !== null ? <RuneText rune={picked} delayed /> : null}
          </>
        )}

        {picked ? (
          <button type="button" className={`vx-secondary-button vx-rune-copy ${copied ? "is-copied" : ""}`} onClick={() => void copy()} data-testid="button-copy-rune">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copiat! Lipește-l pe chat" : "Copiază ca să te lauzi pe chat"}
          </button>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

function RuneFront({ rune }: { rune: WelcomeRune }) {
  return (
    <span className="vx-rune-front" aria-hidden="true">
      <span className="vx-rune-halo" />
      <b>{rune.glyph}</b>
      <small>{rune.name}</small>
    </span>
  );
}

function RuneText({ rune, delayed = false }: { rune: WelcomeRune; delayed?: boolean }) {
  const words = rune.prophecy.split(" ");
  return (
    <div className={`vx-rune-text ${delayed ? "is-delayed" : ""}`} role="status" data-testid="text-rune">
      <span>{rune.glyph} {rune.name}</span>
      <strong>„{rune.title}”</strong>
      <p aria-label={rune.prophecy}>
        {words.map((word, index) => (
          <i key={index} aria-hidden="true" style={{ "--w": index } as CSSProperties}>{word} </i>
        ))}
      </p>
    </div>
  );
}
