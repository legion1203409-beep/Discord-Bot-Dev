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
      <main className="page-width flex min-h-[70vh] items-center justify-center py-16">
        <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#1E1E1E] p-6 shadow-2xl shadow-black/40 sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D94A2B]/15 text-[#D94A2B]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#D94A2B]">Verificare Discord</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{config?.guildName ?? "Acces în comunitate"}</h1>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-sm text-[#B0B0B0]"><Loader2 className="h-5 w-5 animate-spin text-[#D94A2B]" /> Se încarcă panoul…</div>
          ) : !guildId ? (
            <div className="space-y-3 text-sm text-[#B0B0B0]">
              <TriangleAlert className="h-6 w-6 text-[#D94A2B]" />
              <p>Deschide acest link din butonul de verificare din serverul Discord.</p>
            </div>
          ) : !config?.enabled ? (
            <div className="space-y-3 text-sm text-[#B0B0B0]">
              <TriangleAlert className="h-6 w-6 text-[#D94A2B]" />
              <p>Verificarea nu este activată pentru acest server.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="whitespace-pre-wrap leading-relaxed text-[#B0B0B0]">{config.message}</p>
              {errorMessage && (
                <p className="flex gap-2 rounded-lg border border-[#D94A2B]/35 bg-[#D94A2B]/10 p-3 text-sm text-[#D94A2B]">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage}
                </p>
              )}
              {successText && (
                <p className="flex gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {successText}
                </p>
              )}
              {!successText && (
                <a
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D94A2B] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#B33C24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D94A2B]"
                  href={`/api/moderation/oauth/discord?verification=1&guildId=${encodeURIComponent(guildId)}`}
                >
                  <DiscordEmojiText>
                    {[config.buttonEmoji, config.buttonLabel].filter(Boolean).join(" ")}
                  </DiscordEmojiText>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <p className="text-xs leading-relaxed text-[#B0B0B0]">
                Vei autoriza Discord să confirme identitatea contului. Site-ul nu primește parola și nu cere permisiuni de administrare.
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}