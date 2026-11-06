import { useState } from "react";
import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { discordServerUrl, drawThree, runeShareText, saveRune, savedRune, type WelcomeRune } from "./verification-runes";

/**
 * Ce vede membrul după ce s-a verificat: un buton spre server și „Trage-ți
 * runa”: alege una din trei cărți întoarse, cartea se întoarce și îi dă un
 * titlu și o profeție de bun venit, pe care le poate copia pe chat.
 */
export function VerificationWelcome({ guildId }: { guildId?: string | null }) {
  const [cards] = useState(() => drawThree());
  const [picked, setPicked] = useState<WelcomeRune | null>(() => savedRune(guildId ?? undefined));
  const [flipped, setFlipped] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const serverUrl = discordServerUrl(guildId);

  const pick = (index: number) => {
    if (picked) return;
    setFlipped(index);
    setPicked(cards[index]);
    saveRune(guildId ?? undefined, cards[index]);
  };
  const copy = async () => {
    if (!picked) return;
    try {
      await navigator.clipboard.writeText(runeShareText(picked));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="vx-welcome" data-testid="verification-welcome">
      {serverUrl ? (
        <a className="vx-cta vx-welcome-open" href={serverUrl} target="_blank" rel="noreferrer" data-testid="link-open-discord">
          <ExternalLink className="vx-button-icon" aria-hidden="true" />
          <span>Intră în regat</span>
        </a>
      ) : null}

      <div className="vx-runes">
        <div className="vx-runes-head">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>{picked ? "Runa ta de bun venit" : "Trage-ți runa"}</strong>
            <span>{picked ? "Oracolul a vorbit. Arat-o pe chat." : "Alege o carte. Oracolul îți spune cine ești în regat."}</span>
          </div>
        </div>

        {picked && flipped === null ? (
          <RuneFace rune={picked} />
        ) : (
          <div className="vx-rune-row" role="group" aria-label="Trei cărți cu rune">
            {cards.map((rune, index) => {
              const isFlipped = flipped === index;
              const isOther = flipped !== null && !isFlipped;
              return (
                <button
                  key={rune.id}
                  type="button"
                  className={`vx-rune-card ${isFlipped ? "is-flipped" : ""} ${isOther ? "is-away" : ""}`}
                  onClick={() => pick(index)}
                  disabled={Boolean(picked)}
                  aria-label={isFlipped ? `${rune.name}: ${rune.title}` : `Cartea ${index + 1}`}
                  data-testid={`button-rune-${index}`}
                >
                  <span className="vx-rune-inner">
                    <span className="vx-rune-back" aria-hidden="true"><i>ᛟ</i></span>
                    <span className="vx-rune-front" aria-hidden="true"><b>{rune.glyph}</b><small>{rune.name}</small></span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {picked && flipped !== null ? <RuneText rune={picked} /> : null}

        {picked ? (
          <button type="button" className="vx-secondary-button vx-rune-copy" onClick={() => void copy()} data-testid="button-copy-rune">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copiat! Lipește-l pe chat" : "Copiază ca să te lauzi pe chat"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RuneFace({ rune }: { rune: WelcomeRune }) {
  return (
    <div className="vx-rune-saved">
      <span className="vx-rune-card is-flipped is-static" aria-hidden="true">
        <span className="vx-rune-inner">
          <span className="vx-rune-front"><b>{rune.glyph}</b><small>{rune.name}</small></span>
        </span>
      </span>
      <RuneText rune={rune} />
    </div>
  );
}

function RuneText({ rune }: { rune: WelcomeRune }) {
  return (
    <div className="vx-rune-text" role="status" data-testid="text-rune">
      <span>{rune.name}</span>
      <strong>„{rune.title}”</strong>
      <p>{rune.prophecy}</p>
    </div>
  );
}
