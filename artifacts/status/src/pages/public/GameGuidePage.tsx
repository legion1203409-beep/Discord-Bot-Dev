import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Award, CalendarDays,
  Hash, MessageSquare, Users, UserPlus, UserMinus, Volume2, Zap, UserRoundPlus,
  X, Menu, type LucideIcon,
} from "lucide-react";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { useSoulStoneStats } from "../../hooks/public/use-stats";
import { useDailyStats } from "../../hooks/public/use-daily-stats";
import {
  getGetPublicServerProfileQueryKey,
  getGetRecruitmentDashboardQueryKey,
  useGetPublicServerProfile,
  useGetRecruitmentDashboard,
} from "@workspace/api-client-react";
import "./server-guide.css";

const count = (value: number | null | undefined) => value == null ? "Indisponibil" : value.toLocaleString("ro-RO");
const formatDay = (day: string) => new Intl.DateTimeFormat("ro-RO", { dateStyle: "long" }).format(new Date(`${day}T12:00:00.000Z`));
const formatTimestamp = (timestamp: string) => new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(new Date(timestamp));
const activityMetrics: { key: "messages" | "uniqueUsers" | "joins" | "leaves" | "boosts" | "peakVoice"; label: string; icon: LucideIcon }[] = [
  { key: "messages", label: "Mesaje", icon: MessageSquare },
  { key: "uniqueUsers", label: "Membri activi", icon: Users },
  { key: "joins", label: "Membri noi", icon: UserPlus },
  { key: "leaves", label: "Plecări", icon: UserMinus },
  { key: "boosts", label: "Boost-uri", icon: Zap },
  { key: "peakVoice", label: "Vârf vocal", icon: Volume2 },
];

export function GameGuidePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const stats = useSoulStoneStats();
  const { data, loading, error, refresh } = useDailyStats();
  const profileQuery = useGetPublicServerProfile({
    query: {
      queryKey: getGetPublicServerProfileQueryKey(),
      staleTime: 0,
      refetchOnMount: "always",
    },
    request: { cache: "no-store" },
  });
  const serverProfile = profileQuery.data ?? { name: "Oracolul Cenușii", iconUrl: null, inviteUrl: DISCORD_INVITE, guildId: null };
  const recruitmentQuery = useGetRecruitmentDashboard(
    { guildId: serverProfile.guildId ?? "" },
    {
      query: {
        enabled: Boolean(serverProfile.guildId),
        queryKey: getGetRecruitmentDashboardQueryKey({ guildId: serverProfile.guildId ?? "" }),
      },
    },
  );
  const inviteLabel = serverProfile.inviteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const online = stats?.onlineCount;
  const members = stats?.totalMembers;
  const onlineShare = online != null && members != null && members > 0
    ? Math.min(100, (online / members) * 100)
    : null;

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
      twitterTitle?.setAttribute("content", oldTwitterTitle);
      twitterDescription?.setAttribute("content", oldTwitterDescription);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        document.getElementById("server-guide-menu-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const inviteClick = (location: string) => () => trackEvent("discord_cta_click", { location });
  const closeMenu = () => setMenuOpen(false);
  const report = data?.report;
  const metrics = report?.metrics;

  return (
    <div className="ash-guide" id="top">
      <a className="ag-skip" href="#main">Sari la conținut</a>
      <header className="ag-header">
        <div className="ag-header-inner">
          <a className="ag-brand" href="#top" aria-label={`${serverProfile.name}, începutul paginii`}>
            <span className="ag-brand-mark">
              {serverProfile.iconUrl ? <img src={serverProfile.iconUrl} alt="" /> : <span aria-hidden="true">OC</span>}
            </span>
            <span className="ag-brand-type"><strong>REGATUL</strong><small>CENUȘII</small></span>
          </a>
          <nav className="ag-desktop-nav" aria-label="Secțiunile paginii">
            <a href="#acum">Comunitatea</a>
            <a href="#raport">Activitate</a>
            <a href="#recrutare">Recrutare</a>
            <a className="ag-nav-cta" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_nav")} data-testid="link-server-guide-nav-invite">Intră pe Discord <ArrowUpRight size={16} aria-hidden="true" /></a>
          </nav>
          <button
            id="server-guide-menu-toggle"
            className="ag-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Închide meniul" : "Deschide meniul"}
            aria-expanded={menuOpen}
            aria-controls="server-guide-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            data-testid="button-server-guide-menu"
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
          {menuOpen && (
            <nav className="ag-mobile-menu" id="server-guide-mobile-menu" aria-label="Navigație mobilă">
              <a href="#acum" onClick={closeMenu}>Comunitatea, acum</a>
              <a href="#raport" onClick={closeMenu}>O zi din comunitate</a>
              <a href="#recrutare" onClick={closeMenu}>Recrutare</a>
              <a className="ag-menu-cta" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_nav_mobile")} data-testid="link-server-guide-nav-mobile-invite">Intră pe Discord <ArrowUpRight size={16} aria-hidden="true" /></a>
            </nav>
          )}
        </div>
        <span className="ag-header-line" aria-hidden="true" />
      </header>

      <section className="ag-hero" aria-labelledby="h-hero">
        <div className="ag-starfield" aria-hidden="true" />
        <div className="ag-aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="ag-fire-haze" aria-hidden="true" />
        <div className="ag-embers" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} className={`ag-ember ag-ember-${i % 4}`} style={{ left: `${(i * 37 + 7) % 100}%`, animationDelay: `${-(i * 1.37) % 16}s`, animationDuration: `${8 + (i % 7)}s` }} />)}</div>
        <div className="ag-hero-inner">
          <div className="ag-hero-copy">
            <p className="ag-eyebrow"><span /> Comunitate românească · Discord</p>
            <h1 id="h-hero"><span>Un loc pentru</span><em>oameni și povești.</em></h1>
            <p className="ag-hero-lead">Oracolul Cenușii este o comunitate românească pe Discord, construită în jurul conversațiilor, întâlnirilor și oamenilor care revin. Intră, fă cunoștință și găsește-ți locul în ritmul tău.</p>
            <div className="ag-hero-pills">
              <span className={`ag-pill ag-pill-live ${stats?.live ? "is-live" : ""}`} data-testid="data-online-count">
                <i aria-hidden="true" /><strong>{count(online)}</strong> online acum
              </span>
              <span className="ag-pill" data-testid="data-total-members"><Users size={16} aria-hidden="true" /><strong>{count(members)}</strong> membri</span>
            </div>
            <div className="ag-hero-actions">
              <a className="ag-button-primary" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_hero")} data-testid="link-server-guide-invite">Alătură-te comunității <ArrowUpRight size={18} aria-hidden="true" /></a>
              <a className="ag-text-link" href="#acum">Vezi comunitatea live <ArrowDown size={18} aria-hidden="true" /></a>
            </div>
          </div>

          <aside className="ag-server-card" aria-label="Profilul serverului">
            <div className="ag-card-cover">
              <div className="ag-cover-crest" aria-hidden="true" />
              <span className="ag-live-chip"><i /> LIVE</span>
            </div>
            <div className="ag-card-body">
              <span className="ag-card-avatar">
                {serverProfile.iconUrl ? <img src={serverProfile.iconUrl} alt="" /> : <span aria-hidden="true">OC</span>}
              </span>
              <p className="ag-card-kicker">Server Discord</p>
              <h2 data-testid="text-server-name">{serverProfile.name}</h2>
              <div className="ag-card-presence">
                <span><i className={stats?.live ? "is-live" : ""} /><strong>{count(online)}</strong> online</span>
                <span><i className="ag-dot-muted" /><strong>{count(members)}</strong> membri</span>
              </div>
              <a className="ag-invite-copy" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_identity")} data-testid="link-server-guide-identity-invite">
                <span>{inviteLabel}</span><ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <div className="ag-card-status" data-testid="status-server-presence" aria-live="polite">
                <i className={stats?.live ? "is-live" : ""} />
                <span>{stats?.live ? "Prezență Discord actualizată" : stats ? "Prezența Discord nu este disponibilă" : "Se verifică prezența Discord"}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <main id="main">
        <div className="ag-marquee" aria-hidden="true">
          <div className="ag-marquee-row"><div className="ag-marquee-track">
            {[0, 1].map((copy) => <div className="ag-marquee-set" key={copy} aria-hidden={copy ? true : undefined}><span>Conversații</span><b /><em>Întâlniri</em><b /><span>Oameni care revin</span><b /><em>Povești</em><b /><span>Comunitate românească</span><b /><em>În ritmul tău</em><b /></div>)}
          </div></div>
          <div className="ag-marquee-row is-reverse"><div className="ag-marquee-track">
            {[0, 1].map((copy) => <div className="ag-marquee-set" key={copy} aria-hidden={copy ? true : undefined}><em>Intră fără grabă</em><b /><em>Rămâi pentru oameni</em><b /><em>Fără tron, doar povești</em><b /><span>Oracolul Cenușii</span><b /><em>Regatul Cenușii</em><b /><em>Fă cunoștință</em><b /></div>)}
          </div></div>
        </div>

        <section className="ag-section ag-community" id="acum" aria-labelledby="h-acum">
          <div className="ag-section-heading">
            <div>
              <p className="ag-eyebrow"><span /> Snapshot live</p>
              <h2 id="h-acum">Comunitatea, acum.</h2>
            </div>
            <p>Numărul online este prezența aproximativă raportată de Discord. Se actualizează automat la fiecare 10 secunde.</p>
          </div>
          <div className="ag-presence-grid">
            <article className="ag-presence-card ag-presence-card-hot">
              <div className="ag-card-top">
                <span className="ag-stat-icon ag-stat-icon-hot"><Activity size={22} aria-hidden="true" /></span>
                <span className="ag-live-chip"><i /> LIVE</span>
              </div>
              <p className="ag-stat-label">Online acum · Prezență Discord</p>
              <strong className="ag-giant-number">{count(online)}</strong>
              <p className="ag-stat-desc">{stats?.live ? "Membri prezenți în acest moment" : "Valoare indisponibilă momentan"}</p>
              <div className="ag-meter-caption"><span>Din toți membrii</span><strong>{onlineShare == null ? "Indisponibil" : `${onlineShare.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`}</strong></div>
              <div className="ag-meter" aria-hidden="true"><span style={{ width: `${onlineShare ?? 0}%` }} /></div>
            </article>
            <article className="ag-presence-card ag-presence-card-gold">
              <div className="ag-card-top"><span className="ag-stat-icon ag-stat-icon-gold"><Users size={22} aria-hidden="true" /></span></div>
              <p className="ag-stat-label">Membri în server</p>
              <strong className="ag-giant-number">{count(members)}</strong>
              <p className="ag-stat-desc">Total raportat de Discord</p>
              <div className="ag-update-note"><span className="ag-orbit-dot" /> Actualizare la fiecare 10 secunde</div>
            </article>
          </div>
        </section>
        <div className="ag-divider" aria-hidden="true"><i /></div>

        <section className="ag-section ag-report" id="raport" aria-labelledby="h-raport">
          <div className="ag-section-heading ag-report-heading">
            <div>
              <p className="ag-eyebrow"><span /> Activitate raportată</p>
              <h2 id="h-raport">O zi din comunitate.</h2>
              <p className="ag-section-lead">Indicatorii de mai jos aparțin zilei raportate, nu sunt un numărător live.</p>
            </div>
            {report && <p className="ag-report-date"><CalendarDays size={19} aria-hidden="true" /><time dateTime={report.day} data-testid="data-report-day">{formatDay(report.day)}</time></p>}
          </div>
          {loading && !data ? (
            <div className="ag-metric-grid ag-skeleton-grid" aria-label="Se încarcă raportul zilnic">
              {activityMetrics.map((metric) => <div className="ag-skeleton" key={metric.key} />)}
            </div>
          ) : error ? (
            <div className="ag-state ag-state-error" role="alert">
              <strong>Raportul zilnic nu este disponibil.</strong><span>{error}</span>
              <button type="button" onClick={() => void refresh()} data-testid="button-retry-server-report">Încearcă din nou</button>
            </div>
          ) : report && data && metrics ? (
            <>
              <div className="ag-metric-grid" data-testid="data-daily-metrics">
                {activityMetrics.map(({ key, label, icon: Icon }) => (
                  <article className="ag-metric" key={key} data-testid={`data-daily-${key}`}>
                    <div><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
                    <strong>{count(metrics[key])}</strong>
                  </article>
                ))}
              </div>
              <div className="ag-channel-card">
                <div className="ag-channel-heading">
                  <span className="ag-hash-icon"><Hash size={24} aria-hidden="true" /></span>
                  <div><h3>Canale active în ziua raportată</h3><p>{data.guildName}</p></div>
                </div>
                {report.topChannels.length ? (
                  <ol className="ag-channel-list">
                    {report.topChannels.map((channel, index) => (
                      <li key={channel.channelId} data-testid={`data-top-channel-${channel.channelId}`}>
                        <div className="ag-channel-line">
                          <span className="ag-channel-rank">{String(index + 1).padStart(2, "0")}</span>
                          <span className="ag-channel-name"><i>#</i>{channel.channelName}</span>
                          <span className="ag-channel-count">{count(channel.messages)} {channel.messages === 1 ? "mesaj" : "mesaje"}</span>
                        </div>
                        <div className="ag-channel-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, report.topChannels[0]?.messages ? channel.messages / report.topChannels[0].messages * 100 : 0)}%` }} /></div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="ag-empty">Nu există canale cu mesaje înregistrate pentru ziua raportată.</p>}
                <p className="ag-timezone">Fus orar al raportului: {data.timezone}</p>
              </div>
            </>
          ) : (
            <div className="ag-state" role="status">
              <strong>Nu există un raport zilnic disponibil.</strong>
              <button type="button" onClick={() => void refresh()} data-testid="button-refresh-server-report">Reîncarcă raportul</button>
            </div>
          )}
        </section>
        <div className="ag-divider" aria-hidden="true"><i /></div>

        <section className="ag-section ag-recruitment" id="recrutare" aria-labelledby="h-recrutare" data-testid="section-recruitment">
          <div className="ag-recruit-copy">
            <p className="ag-eyebrow"><span /> Recrutare comunitate</p>
            <h2 id="h-recrutare">O invitație poate deschide<br /><em>un loc nou.</em></h2>
            <p>Un rezumat transparent al programului de recomandări al serverului. Clasamentul arată numai numele publice și rezultatele raportate.</p>
          </div>
          <div className="ag-recruit-results">
            {profileQuery.isLoading || (Boolean(serverProfile.guildId) && recruitmentQuery.isLoading) ? (
              <div className="ag-recruit-skeleton" aria-label="Se încarcă datele programului de recrutare"><i /><i /><i /></div>
            ) : profileQuery.isError ? (
              <div className="ag-state ag-state-error" role="alert"><strong>Programul de recrutare nu poate fi încărcat.</strong><button type="button" onClick={() => void profileQuery.refetch()} data-testid="button-retry-recruitment-profile">Încearcă din nou</button></div>
            ) : !serverProfile.guildId ? (
              <div className="ag-state" role="status"><strong>Programul de recrutare nu este disponibil pentru acest server.</strong></div>
            ) : recruitmentQuery.isError ? (
              <div className="ag-state ag-state-error" role="alert"><strong>Rezumatul recrutării nu este disponibil momentan.</strong><button type="button" onClick={() => void recruitmentQuery.refetch()} data-testid="button-retry-recruitment">Reîncarcă datele</button></div>
            ) : recruitmentQuery.data && !recruitmentQuery.data.enabled ? (
              <div className="ag-recruit-inactive" role="status"><span className="ag-lock-mark" aria-hidden="true" /><span className="ag-inactive-tag"><i /> Inactiv</span><strong>Programul de recrutare nu este activ momentan.</strong></div>
            ) : recruitmentQuery.data ? (
              <div className="ag-recruit-data">
                <article className="ag-recruit-personal" data-testid="data-recruitment-viewer">
                  <div className="ag-recruit-card-head"><span className="ag-recruit-icon"><UserRoundPlus size={20} aria-hidden="true" /></span><div><p>Rezumatul tău</p><h3>{recruitmentQuery.data.viewer?.displayName ?? "Invitațiile tale"}</h3></div></div>
                  {recruitmentQuery.data.viewer ? (
                    <>
                      <div className="ag-recruit-totals">
                        <div><span>Invitații create</span><strong>{count(recruitmentQuery.data.viewer.createdInviteCount)}</strong></div>
                        <div><span>Recomandări confirmate</span><strong>{count(recruitmentQuery.data.viewer.verifiedInviteCount)}</strong></div>
                        <div><span>Puncte</span><strong>{count(recruitmentQuery.data.viewer.points)}</strong></div>
                      </div>
                      <div className="ag-invitees"><h4>Persoane recomandate</h4>
                        {recruitmentQuery.data.viewer.invitees.length ? <ul>{recruitmentQuery.data.viewer.invitees.map((invitee, index) => <li key={`${invitee.displayName}-${invitee.verifiedAt}-${index}`} data-testid={`data-recruitment-invitee-${index}`}><span>{invitee.displayName}</span><time dateTime={invitee.verifiedAt}>{formatTimestamp(invitee.verifiedAt)}</time></li>)}</ul> : <p>Nicio recomandare confirmată încă.</p>}
                      </div>
                    </>
                  ) : <p className="ag-private-note">Conectează-te prin linkul de verificare primit în Discord pentru a vedea rezumatul personal.</p>}
                </article>
                <article className="ag-leaderboard" data-testid="data-recruitment-leaderboard">
                  <div className="ag-recruit-card-head"><span className="ag-recruit-icon"><Award size={20} aria-hidden="true" /></span><div><p>Clasament public</p><h3>Recomandări confirmate</h3></div></div>
                  {recruitmentQuery.data.leaderboard.length ? <ol>{recruitmentQuery.data.leaderboard.map((entry) => <li key={`${entry.rank}-${entry.displayName}`} data-testid={`data-recruitment-rank-${entry.rank}`}><span className="ag-rank">{String(entry.rank).padStart(2, "0")}</span><strong>{entry.displayName}</strong><span>{count(entry.verifiedInviteCount)} <small>confirmate</small></span><span>{count(entry.points)} <small>puncte</small></span></li>)}</ol> : <p className="ag-empty">Clasamentul va apărea când sunt disponibile rezultate.</p>}
                </article>
              </div>
            ) : (
              <div className="ag-state" role="status"><strong>Nu există date de recrutare disponibile momentan.</strong></div>
            )}
          </div>
        </section>

        <section className="ag-invitation" id="intra" aria-labelledby="h-intra">
          <div className="ag-invitation-inner">
            <div className="ag-invitation-copy">
              <p className="ag-eyebrow"><span /> Început</p>
              <h2 id="h-intra">Intră fără grabă.<br /><em>Rămâi pentru oameni.</em></h2>
              <p>Începe cu un salut și explorează conversațiile care te atrag. Comunitatea e aici să te întâmpine, iar datele de mai sus îți oferă o imagine transparentă a ritmului ei.</p>
              <a className="ag-button-primary" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_footer")} data-testid="link-server-guide-join-bottom">Deschide invitația Discord <ArrowUpRight size={18} aria-hidden="true" /></a>
            </div>
            <div className="ag-seal" aria-hidden="true"><span /><i /><b>OC</b></div>
          </div>
        </section>
      </main>

      <footer className="ag-footer">
        <div className="ag-footer-inner">
          <div className="ag-footer-brand">
            <a className="ag-brand" href="#top" aria-label="Regatul Cenușii, începutul paginii">
              <span className="ag-brand-mark">{serverProfile.iconUrl ? <img src={serverProfile.iconUrl} alt="" /> : <span aria-hidden="true">OC</span>}</span>
              <span className="ag-brand-type"><strong>REGATUL</strong><small>CENUȘII</small></span>
            </a>
            <p>Un loc primitor pentru comunitatea Oracolul Cenușii.</p>
            <a className="ag-footer-invite" href={serverProfile.inviteUrl} target="_blank" rel="noopener noreferrer" onClick={inviteClick("server_guide_custom_footer")} data-testid="link-server-guide-footer-invite">{inviteLabel}<ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="ag-footer-links">
            <p>Oracolul Cenușii · Comunitate Discord</p>
            <nav aria-label="Legături utile">
              <Link href="/server" data-testid="link-footer-server-guide">Ghidul serverului</Link>
              <Link href="/verificare" data-testid="link-footer-verification">Verificare membri</Link>
              <Link href="/statistici" data-testid="link-footer-stats">Statistici</Link>
              <Link href="/moderare" data-testid="link-footer-moderation">Consolă operator</Link>
            </nav>
            <a className="ag-footer-status" href="/#status" onClick={() => trackEvent("operator_status_open", { location: "footer" })} data-testid="link-footer-status"><i className={stats?.live ? "is-live" : ""} /> prezență Discord / actualizare live</a>
            <p className="ag-copyright">© {new Date().getFullYear()} · Fără tron, doar povești.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
