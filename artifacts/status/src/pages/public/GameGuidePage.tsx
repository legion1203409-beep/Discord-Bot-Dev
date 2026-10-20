import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, CalendarDays, Hash, MessageSquare, RefreshCw, Users, UserPlus, UserMinus, Volume2, Zap } from "lucide-react";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { useSoulStoneStats } from "../../hooks/public/use-stats";
import { useDailyStats } from "../../hooks/public/use-daily-stats";

type PublicServerProfile = {
  name: string;
  iconUrl: string | null;
  inviteUrl: string;
};

const count = (value: number | null | undefined) => value == null ? "Indisponibil" : value.toLocaleString("ro-RO");
const formatDay = (day: string) => new Intl.DateTimeFormat("ro-RO", { dateStyle: "long" }).format(new Date(`${day}T12:00:00.000Z`));

export function GameGuidePage() {
  const stats = useSoulStoneStats();
  const { data, loading, error, refresh } = useDailyStats();
  const [serverProfile, setServerProfile] = useState<PublicServerProfile>({
    name: "Oracolul Cenușii",
    iconUrl: null,
    inviteUrl: DISCORD_INVITE,
  });

  useEffect(() => {
    let mounted = true;
    void fetch("/api/moderation/public/server-profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PublicServerProfile> : null)
      .then((profile) => {
        if (mounted && profile?.name && profile.inviteUrl) setServerProfile(profile);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const title = document.title;
    const description = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const oldDescription = description?.getAttribute("content") ?? "";
    const oldOgTitle = ogTitle?.getAttribute("content") ?? "";
    const oldOgDescription = ogDescription?.getAttribute("content") ?? "";
    const oldTwitterTitle = twitterTitle?.getAttribute("content") ?? "";
    const oldTwitterDescription = twitterDescription?.getAttribute("content") ?? "";
    const pageTitle = "Ghid server | Oracolul Cenușii";
    const pageDescription = "Descoperă comunitatea românească Oracolul Cenușii pe Discord și consultă datele reale despre prezență și activitatea zilnică.";
    document.title = pageTitle;
    description?.setAttribute("content", pageDescription);
    ogTitle?.setAttribute("content", pageTitle);
    ogDescription?.setAttribute("content", pageDescription);
    twitterTitle?.setAttribute("content", pageTitle);
    twitterDescription?.setAttribute("content", pageDescription);
    return () => {
      document.title = title;
      description?.setAttribute("content", oldDescription);
      ogTitle?.setAttribute("content", oldOgTitle);
      ogDescription?.setAttribute("content", oldOgDescription);
      twitterTitle?.setAttribute("content", oldTwitterTitle);
      twitterDescription?.setAttribute("content", oldTwitterDescription);
    };
  }, []);

  const report = data?.report;
  const metrics = report?.metrics;
  const activityMetrics = [
    { key: "messages", label: "Mesaje", icon: MessageSquare },
    { key: "uniqueUsers", label: "Membri activi", icon: Users },
    { key: "joins", label: "Membri noi", icon: UserPlus },
    { key: "leaves", label: "Plecări", icon: UserMinus },
    { key: "boosts", label: "Boost-uri", icon: Zap },
    { key: "peakVoice", label: "Vârf vocal", icon: Volume2 },
  ] as const;

  return (
    <main className="server-guide page-width">
      <header className="server-guide-hero">
        <div className="server-guide-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div className="server-guide-intro">
          <p className="server-guide-eyebrow"><span /> COMUNITATE ROMÂNEASCĂ · DISCORD</p>
          <h1>Un loc pentru<br /><em>oameni și povești.</em></h1>
          <p className="server-guide-lead">
            Oracolul Cenușii este o comunitate românească pe Discord, construită în jurul conversațiilor, întâlnirilor și oamenilor care revin.
            Intră, fă cunoștință și găsește-ți locul în ritmul tău.
          </p>
          <a className="server-guide-join" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer"
            onClick={() => trackEvent("discord_cta_click", { location: "server_guide_hero" })}
            data-testid="link-server-guide-invite">
            Alătură-te comunității <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
        <aside className="server-guide-identity" aria-label="Identitatea serverului">
          <div className="server-guide-mark">
            {serverProfile.iconUrl ? <img src={serverProfile.iconUrl} alt="" /> : <span aria-hidden="true">OC</span>}
          </div>
          <p className="server-guide-identity-label">SERVER DISCORD</p>
          <h2 data-testid="text-server-name">{serverProfile.name}</h2>
          <a href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-server-guide-identity-invite"
            onClick={() => trackEvent("discord_cta_click", { location: "server_guide_identity" })}>
            {serverProfile.inviteUrl.replace(/^https?:\/\//, "")}
          </a>
          <div className="server-guide-presence" data-testid="status-server-presence" aria-live="polite">
            <span className={`server-guide-presence-dot ${stats?.live ? "is-live" : ""}`} />
            <span>{stats?.live ? "Prezență Discord actualizată" : stats ? "Prezența Discord nu este disponibilă" : "Se verifică prezența Discord"}</span>
          </div>
        </aside>
      </header>

      <section className="server-guide-live" aria-labelledby="server-live-heading">
        <div className="server-guide-section-heading">
          <div>
            <p className="server-guide-eyebrow"><span /> SNAPSHOT LIVE</p>
            <h2 id="server-live-heading">Comunitatea, acum.</h2>
          </div>
          <p>Numărul online este prezența aproximativă raportată de Discord. Se actualizează automat la fiecare 10 secunde.</p>
        </div>
        <div className="server-guide-live-grid">
          <article className="server-guide-live-feature" data-testid="data-online-count">
            <span className="server-guide-stat-label"><Activity size={15} aria-hidden="true" /> ONLINE ACUM · PREZENȚĂ DISCORD</span>
            <strong>{count(stats?.onlineCount)}</strong>
            <span className="server-guide-stat-note">{stats?.live ? "Membri prezenți în acest moment" : "Valoare indisponibilă momentan"}</span>
          </article>
          <article className="server-guide-live-total" data-testid="data-total-members">
            <span className="server-guide-stat-label"><Users size={15} aria-hidden="true" /> MEMBRI ÎN SERVER</span>
            <strong>{count(stats?.totalMembers)}</strong>
            <span className="server-guide-stat-note">Total raportat de Discord</span>
          </article>
          <div className="server-guide-live-stamp">
            <span className="server-guide-stamp-ring" aria-hidden="true" />
            <span>DATE<br />LIVE</span>
          </div>
        </div>
      </section>

      <section className="server-guide-report" aria-labelledby="server-report-heading">
        <div className="server-guide-report-heading">
          <div>
            <p className="server-guide-eyebrow"><span /> ACTIVITATE RAPORTATĂ</p>
            <h2 id="server-report-heading">O zi din comunitate.</h2>
            <p className="server-guide-report-copy">Indicatorii de mai jos aparțin zilei raportate, nu sunt un numărător live.</p>
          </div>
          {report && <div className="server-guide-report-date"><CalendarDays size={16} aria-hidden="true" /><span data-testid="data-report-day">{formatDay(report.day)}</span></div>}
        </div>
        {loading && !data ? (
          <div className="server-guide-report-skeleton" aria-label="Se încarcă raportul zilnic">
            <div /><div /><div /><div /><div /><div />
          </div>
        ) : error ? (
          <div className="server-guide-report-state" role="alert">
            <strong>Raportul zilnic nu este disponibil.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()} data-testid="button-retry-server-report">Încearcă din nou</button>
          </div>
        ) : report && data && metrics ? (
          <>
            <div className="server-guide-metrics" data-testid="data-daily-metrics">
              {activityMetrics.map(({ key, label, icon: MetricIcon }) => (
                <article className="server-guide-metric" key={key} data-testid={`data-daily-${key}`}>
                  <div><span>{label}</span><MetricIcon size={16} aria-hidden="true" /></div>
                  <strong>{count(metrics[key])}</strong>
                </article>
              ))}
            </div>
            <div className="server-guide-activity">
              <div className="server-guide-activity-title">
                <div><Hash size={17} aria-hidden="true" /><h3>Canale active în ziua raportată</h3></div>
                <span>{data.guildName}</span>
              </div>
              {report.topChannels.length ? (
                <ol className="server-guide-channel-list">
                  {report.topChannels.map((channel, index) => (
                    <li key={channel.channelId} data-testid={`data-top-channel-${channel.channelId}`}>
                      <span className="server-guide-channel-rank">{String(index + 1).padStart(2, "0")}</span>
                      <span className="server-guide-channel-name">#{channel.channelName}</span>
                      <span className="server-guide-channel-count">{count(channel.messages)} mesaje</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="server-guide-no-channels">Nu există canale cu mesaje înregistrate pentru ziua raportată.</p>}
              <p className="server-guide-timezone">Fus orar raportului: {data.timezone}</p>
            </div>
          </>
        ) : (
          <div className="server-guide-report-state" role="status">
            <strong>Nu există un raport zilnic disponibil.</strong>
            <button type="button" onClick={() => void refresh()} data-testid="button-refresh-server-report">Reîncarcă raportul</button>
          </div>
        )}
      </section>

      <section className="server-guide-welcome">
        <div className="server-guide-welcome-index">01 / ÎNCEPUT</div>
        <h2>Intră fără grabă.<br /><em>Rămâi pentru oameni.</em></h2>
        <p>Începe cu un salut și explorează conversațiile care te atrag. Comunitatea e aici să te întâmpine, iar datele de mai sus îți oferă o imagine transparentă a ritmului ei.</p>
        <a href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer"
          onClick={() => trackEvent("discord_cta_click", { location: "server_guide_footer" })}
          data-testid="link-server-guide-join-bottom">
          Deschide invitația Discord <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
