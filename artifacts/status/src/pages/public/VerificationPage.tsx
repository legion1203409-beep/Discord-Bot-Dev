import { useMemo, useState } from "react";
import { CheckCircle2, Flame, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  getGetVerificationStatusQueryKey,
  useCompleteWebsiteVerification,
  useGetVerificationStatus,
} from "@workspace/api-client-react";
import { PublicLayout } from "../../components/public/PublicLayout";
import { Slider } from "../../components/ui/slider";

export function VerificationPage() {
  const ticket = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("ticket") ?? "", []);
  const legacyError = useMemo(() => new URLSearchParams(window.location.search).get("verification_error"), []);
  const guildId = useMemo(() => new URLSearchParams(window.location.search).get("guildId") ?? undefined, []);
  const [sliderValue, setSliderValue] = useState(0);
  const completion = useCompleteWebsiteVerification();
  const statusParams = guildId ? { guildId } : undefined;
  const status = useGetVerificationStatus(statusParams, {
    query: {
      enabled: !ticket || completion.isSuccess,
      queryKey: getGetVerificationStatusQueryKey(statusParams),
    },
  });
  const sliderCompleted = sliderValue >= 100;
  const legacyErrorText = legacyError === "not_member"
    ? "Contul asociat linkului nu este membru pe server."
    : legacyError === "bot_offline"
      ? "Botul Discord nu este disponibil momentan. Încearcă din nou mai târziu."
      : legacyError
        ? "Acest link nu a putut fi confirmat. Cere un link nou în Discord."
        : null;

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

  return (
    <PublicLayout>
      <div className="public-verification-page page-width flex min-h-[70vh] items-center justify-center py-16">
        <section className="public-verification-card public-ticket-card w-full max-w-xl rounded-2xl p-6 sm:p-10" aria-labelledby="verification-heading">
          <div className="mb-8 flex items-center gap-3">
            <div className="public-verification-icon flex h-12 w-12 items-center justify-center rounded-xl" aria-hidden="true">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="public-verification-kicker text-xs uppercase tracking-[0.2em]">Oracolul Cenușii · Discord</p>
              <h1 id="verification-heading" className="mt-1 text-2xl font-semibold text-[var(--paper)]">Verifică-ți accesul</h1>
            </div>
          </div>

          {isSuccess ? (
            <div className="public-verification-success flex gap-3 rounded-xl p-5" role="status" data-testid="status-verification-success">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <strong className="block">{result?.result === "already_verified" ? "Contul era deja verificat." : result?.verified ? "Verificarea a fost finalizată." : "Contul este verificat."}</strong>
                <span className="mt-1 block text-sm">Poți reveni acum în Discord.</span>
              </div>
            </div>
          ) : legacyErrorText ? (
            <div className="public-verification-error flex gap-3 rounded-xl p-5" role="alert" data-testid="status-verification-error">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{legacyErrorText}</p>
            </div>
          ) : !ticket && status.isLoading ? (
            <div className="public-verification-muted flex items-center gap-3 rounded-xl border border-border/60 p-5 text-sm" role="status" data-testid="status-verification-status-loading">
              <span className="public-ticket-progress" aria-hidden="true" />
              Se verifică starea contului în Discord…
            </div>
          ) : !ticket && statusError ? (
            <div className="public-verification-error space-y-3 rounded-xl p-5" role="alert" data-testid="status-verification-status-error">
              <div className="flex gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{status.data?.reason === "bot_offline" ? "Botul Discord nu poate confirma starea acum." : "Starea verificării nu a putut fi încărcată."}</p>
              </div>
              <button type="button" onClick={() => void status.refetch()} className="public-verification-cta rounded-lg px-4 py-2 text-sm" data-testid="button-retry-verification-status">
                Încearcă din nou
              </button>
            </div>
          ) : !ticket ? (
            <div className="public-verification-muted flex gap-3 rounded-xl border border-dashed p-5 text-sm leading-relaxed" role="status" data-testid="status-verification-ticket-missing">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
              <p>Deschide linkul personal de verificare primit în Discord. Biletul de verificare este opac și nu poate fi înlocuit cu autentificarea pe site.</p>
            </div>
          ) : (
            <div className="space-y-7">
              <p className="public-verification-muted text-sm leading-relaxed">
                Pentru a confirma verificarea, glisează marcajul până la capătul traseului. Biletul a fost emis de Discord și va fi folosit o singură dată pentru acest pas.
              </p>

              <div className={`public-ticket-slider ${sliderCompleted ? "is-complete" : ""}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label htmlFor="verification-slider" className="public-verification-kicker text-xs uppercase tracking-[0.15em]">Aprinde flacăra</label>
                  <span className="public-ticket-slider__status" aria-live="polite" data-testid="status-verification-slider">
                    {sliderCompleted ? "Traseu complet" : "Glisează până la capăt"}
                  </span>
                </div>
                <Slider
                  id="verification-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={[sliderValue]}
                  onValueChange={(value) => setSliderValue(value[0] ?? 0)}
                  aria-label="Glisează pentru a finaliza verificarea"
                  aria-valuetext={sliderCompleted ? "Traseu complet" : `${sliderValue} din 100`}
                  data-testid="slider-verification-completion"
                  className="public-ticket-slider__control"
                />
                <div className="mt-3 flex items-center justify-between text-xs" aria-hidden="true">
                  <span>START</span><span>FINAL</span>
                </div>
              </div>

              {completion.error && (
                <div className="public-verification-error flex gap-3 rounded-lg p-4 text-sm" role="alert" data-testid="status-verification-completion-error">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{completion.error instanceof Error ? completion.error.message : "Verificarea nu a putut fi finalizată. Solicită un link nou în Discord."}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void completeVerification()}
                disabled={!sliderCompleted || completion.isPending}
                className="public-verification-cta inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="button-complete-verification"
              >
                {completion.isPending ? (
                  <span className="public-ticket-progress" aria-hidden="true" />
                ) : (
                  <Flame className="h-4 w-4" aria-hidden="true" />
                )}
                {completion.isPending ? "Se finalizează verificarea" : "Finalizează verificarea"}
              </button>
              <p className="public-verification-muted text-xs leading-relaxed">
                Biletul nu dezvăluie identitatea ta pe această pagină. Verificarea este confirmată de serverul Discord.
              </p>
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
