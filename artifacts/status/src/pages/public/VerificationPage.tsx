import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { PublicLayout } from "../../components/public/PublicLayout";
import { DiscordEmojiText } from "../../components/moderation/DiscordEmojiText";

type VerificationConfig = {
  guildId: string;
  guildName: string | null;
  enabled: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  buttonEmoji: string;
  successMessage: string;
  alreadyVerifiedMessage: string;
};

export function VerificationPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const guildId = params.get("guildId") ?? "";
  const result = params.get("verification");
  const errorCode = params.get("verification_error");
  const [config, setConfig] = useState<VerificationConfig | null>(null);
  const [loading, setLoading] = useState(Boolean(guildId));
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    void fetch(`/api/moderation/verification/${encodeURIComponent(guildId)}/config`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Configurația nu este disponibilă.");
        return response.json() as Promise<VerificationConfig>;
      })
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [guildId]);

  useEffect(() => {
    if (!guildId) return;
    void fetch(`/api/moderation/verification/status?guildId=${encodeURIComponent(guildId)}`, { cache: "no-store", credentials: "include" })
      .then((response) => response.json() as Promise<{ verified?: boolean }>)
      .then((value) => setVerified(value.verified === true))
      .catch(() => setVerified(false));
  }, [guildId, result]);

  const errorMessage = errorCode === "not_member"
    ? "Contul Discord nu este membru pe acest server."
    : errorCode === "bot_offline"
      ? "Botul nu este disponibil momentan. Încearcă din nou în câteva momente."
      : errorCode
        ? "Linkul de verificare nu mai este valid. Apasă din nou butonul din Discord."
        : "";
  const successText = result === "already_verified"
    ? config?.alreadyVerifiedMessage
    : result === "verified" || verified
      ? config?.successMessage
      : "";

  return (
    <PublicLayout>
      <main className="public-verification-page page-width flex min-h-[70vh] items-center justify-center py-16">
        <section className="public-verification-card w-full max-w-xl rounded-2xl p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="public-verification-icon flex h-12 w-12 items-center justify-center rounded-xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="public-verification-kicker text-xs uppercase tracking-[0.2em]">Verificare Discord</p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--paper)]">{config?.guildName ?? "Acces în comunitate"}</h1>
            </div>
          </div>

          {loading ? (
            <div className="public-verification-muted flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 animate-spin text-[var(--ember-light)]" /> Se încarcă panoul…</div>
          ) : !guildId ? (
            <div className="public-verification-muted space-y-3 text-sm">
              <TriangleAlert className="h-6 w-6 text-[var(--warning)]" />
              <p>Deschide acest link din butonul de verificare din serverul Discord.</p>
            </div>
          ) : !config?.enabled ? (
            <div className="public-verification-muted space-y-3 text-sm">
              <TriangleAlert className="h-6 w-6 text-[var(--warning)]" />
              <p>Verificarea nu este activată pentru acest server.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="public-verification-muted whitespace-pre-wrap leading-relaxed">{config.message}</p>
              {errorMessage && (
                <p className="public-verification-error flex gap-2 rounded-lg p-3 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage}
                </p>
              )}
              {successText && (
                <p className="public-verification-success flex gap-2 rounded-lg p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {successText}
                </p>
              )}
              {!successText && (
                <a
                  className="public-verification-cta inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors"
                  href={`/api/moderation/oauth/discord?verification=1&guildId=${encodeURIComponent(guildId)}`}
                >
                  <DiscordEmojiText>
                    {[config.buttonEmoji, config.buttonLabel].filter(Boolean).join(" ")}
                  </DiscordEmojiText>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <p className="public-verification-muted text-xs leading-relaxed">
                Vei autoriza Discord să confirme identitatea contului. Site-ul nu primește parola și nu cere permisiuni de administrare.
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}