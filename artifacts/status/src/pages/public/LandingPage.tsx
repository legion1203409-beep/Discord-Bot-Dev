import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE, realmFeatures, factions, champions, events } from "../../lib/public-constants";
import { Icon, StatusDot, DragonLogo, AshCore } from "../../components/public/UiElements";
import { useOracleHealth, type OracleHealth } from "../../hooks/public/use-health";
import { useSoulStoneStats, type DiscordStats } from "../../hooks/public/use-stats";

function LiveRealm({ health, stats }: { health: OracleHealth | null; stats: DiscordStats | null }) {
  const botOnline = health?.botOnline ?? false;
  const isLive = stats?.live ?? false;
  
  return (
    <section className="live-section page-width" id="stare-live" aria-labelledby="live-heading">
      <div className="live-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> Pulsul regatului</div>
        <h2 id="live-heading">Cenușa nu doarme<br /><em>niciodată.</em></h2>
        <p>Piatra de Suflete păstrează ritmul serverului. Cifrele de mai jos sunt citite direct din Discord și se schimbă odată cu lumea.</p>
         <a className="quiet-link" href="/#status" onClick={() => trackEvent("operator_status_open", { location: "live_realm" })} data-testid="link-live-status">
           Deschide consola operatorului <Icon name="arrow" size={17} />
         </a>
      </div>
      <div className="live-core-panel">
        <div className="hud-corner hud-corner--tl" /><div className="hud-corner hud-corner--br" />
        <div className="core-label"><StatusDot active={isLive} /> <span>ASH CORE / {isLive ? "SYNC" : "STANDBY"}</span></div>
        <AshCore />
        <div className="core-readout"><span>REȚEA DISCORD</span><strong>{botOnline ? "TREAZĂ" : "ÎN AȘTEPTARE"}</strong></div>
        <div className="core-axis core-axis--x" /><div className="core-axis core-axis--y" />
      </div>
      <div className="live-metrics" data-testid="stats-live-panel">
        <div className="live-metric">
          <span className="metric-kicker">AVENTURIERI ONLINE</span>
          <strong data-testid="text-online-count">{stats?.onlineCount ?? "—"}</strong>
          <span className="metric-status"><StatusDot active={isLive} /> actualizat live</span>
        </div>
        <div className="live-metric">
          <span className="metric-kicker">MEMBRI AI REGATULUI</span>
          <strong data-testid="text-total-members">{stats?.totalMembers ?? "—"}</strong>
          <span className="metric-status"><StatusDot active={isLive} /> comunitate</span>
        </div>
        <div className="live-metric live-metric--wide">
          <span className="metric-kicker">ULTIMA SOSIRE</span>
          <strong>{stats?.lastJoined ?? "—"}</strong>
          <span className="metric-status"><StatusDot active={isLive} /> poarta deschisă</span>
        </div>
      </div>
    </section>
  );
}

function LandingStatusCard({ health, stats }: { health: OracleHealth | null; stats: DiscordStats | null }) {
  const botOnline = health?.botOnline ?? false;
  const statsLive = stats?.live ?? false;
  
  return (
    <aside className="hero-status-card" aria-label="Starea live a regatului" data-testid="card-hero-status">
      <div className="status-card-topline">
        <span className="eyebrow eyebrow--small">Piatra de Suflete</span>
        <span className={`live-pill ${statsLive ? "live-pill--on" : ""}`}>
          <StatusDot active={statsLive} />
          {stats === null ? "Se verifică" : statsLive ? "Live" : "Offline"}
        </span>
      </div>
      <div className="status-orb-wrap">
        <AshCore compact />
        <div>
          <strong>Regatul este {botOnline ? "treaz" : "în așteptare"}</strong>
          <p>Activitatea serverului se actualizează automat.</p>
        </div>
      </div>
      <div className="status-metrics">
        <div><span className="metric-value">{stats?.onlineCount ?? "—"}</span><span className="metric-label">online acum</span></div>
        <div><span className="metric-value">{stats?.totalMembers ?? "—"}</span><span className="metric-label">aventurieri</span></div>
        <div><span className={`metric-value metric-value--${botOnline ? "green" : "muted"}`}>{health === null ? "—" : botOnline ? "OK" : "OFF"}</span><span className="metric-label">bot Discord</span></div>
      </div>
      <a className="status-card-link" href="/#status" onClick={() => trackEvent("operator_status_open", { location: "hero_card" })} data-testid="link-hero-status">
        Vezi starea completă <Icon name="arrow" size={15} />
      </a>
    </aside>
  );
}

export function LandingPage() {
  const health = useOracleHealth();
  const stats = useSoulStoneStats();

  return (
    <>
      <section className="hero-section">
        <div className="hero-backdrop" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content page-width">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> Server Discord RPG · RO</div>
            <h1>Legenda ta<br />începe <em>în Cenușă.</em></h1>
            <p className="hero-lead">Un regat întunecat, viu și fără un final scris. Alege-ți jurământul, înfruntă ceea ce se ascunde în ceață și lasă comunitatea să-ți țină minte numele.</p>
            <div className="hero-actions">
              <a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "hero" })} data-testid="link-hero-discord">
                <span className="button-seal"><Icon name="mark" size={16} /></span> Alătură-te regatului <Icon name="arrow" size={17} />
              </a>
              <a className="text-link" href="#lumea" data-testid="link-hero-world">Coboară în lume <span>↓</span></a>
            </div>
            <div className="hero-proof">
              <span className="proof-sigils" aria-hidden="true"><i>V</i><i>S</i><i>F</i></span>
              <span><strong>O comunitate cu memorie</strong><br />fiecare aventură lasă o urmă</span>
            </div>
          </div>
          <div className="hero-aside">
            <div className="hero-coordinate">45° 18' N<br /><span>Ținuturile de Cenușă</span></div>
            <DragonLogo className="dragon-logo--hero" />
            <LandingStatusCard health={health} stats={stats} />
          </div>
        </div>
        <div className="hero-scroll-hint"><span /> Scroll pentru a intra în regat</div>
      </section>

      <LiveRealm health={health} stats={stats} />

      <section className="intro-section page-width" id="lumea">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> Harta lumii</div>
            <h2 id="world-heading">Nu este doar un server.<br /><em>Este povestea ta.</em></h2>
          </div>
          <p>Regatul Cenușii este un RPG social în Discord, construit în jurul alegerilor tale. Intră pentru o luptă. Rămâi pentru cronică.</p>
        </div>
        <div className="feature-grid">
          {realmFeatures.map((feature) => (
            <a className={`feature-card feature-card--${feature.tone}`} href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: `feature_${feature.tone}` })} key={feature.title} data-testid={`link-feature-${feature.tone}`}>
              <span className="feature-number">{feature.number}</span>
              <span className="feature-icon"><Icon name={feature.icon} size={22} /></span>
              <span className="feature-eyebrow">{feature.eyebrow}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              <span className="feature-link">Intră în zonă <Icon name="arrow" size={14} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="lore-section">
        <div className="lore-map" aria-hidden="true">
          <span className="map-line map-line--one" />
          <span className="map-line map-line--two" />
          <span className="map-pin map-pin--one" />
          <span className="map-pin map-pin--two" />
          <span className="map-label map-label--one">TURNUL GOL</span>
          <span className="map-label map-label--two">MLAȘTINA</span>
        </div>
        <div className="page-width lore-content">
          <div className="lore-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> Din cronicile vechi</div>
            <h2>După foc, nu a rămas liniște.<br /><em>A rămas loc.</em></h2>
            <p>Când vechiul regat a ars, cenușa s-a strâns în jurul unei pietre care încă bate. Din ea se ridică drumuri, monștri și jurăminte. Nimeni nu știe cine a aprins primul foc. Toți pot decide cine îl stinge.</p>
            <span className="lore-signature">FRAGMENTUL 07 · ARHIVA REGALĂ</span>
          </div>
          <div className="lore-aside">
            <AshCore />
            <div className="lore-aside-label">Miezul încă veghează</div>
          </div>
        </div>
      </section>

      <section className="factions-section page-width" id="facțiuni">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> Trei jurăminte</div>
            <h2>Nu alegi o clasă.<br /><em>Alegi un ecou.</em></h2>
          </div>
          <p>Facțiunile nu sunt cuști. Sunt felul în care lumea începe să te recunoască.</p>
        </div>
        <div className="factions-list">
          {factions.map((faction, index) => (
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className={`faction-row faction-row--${faction.color}`} onClick={() => trackEvent("discord_cta_click", { location: `faction_${faction.color}` })} key={faction.name} data-testid={`link-faction-${index}`}>
              <span className="faction-mark">{faction.mark}</span>
              <span className="faction-copy">
                <span className="faction-detail">{faction.detail}</span>
                <strong>{faction.name}</strong>
                <p>{faction.copy}</p>
              </span>
              <span className="faction-enter"><Icon name="arrow" size={19} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="quote-section">
        <div className="quote-orbit" aria-hidden="true" />
        <div className="page-width quote-inner">
          <span className="quote-mark">“</span>
          <blockquote>În Cenușă nu contează de unde ai venit.<br /><em>Contează ce alegi să devii.</em></blockquote>
          <span className="quote-rule" />
          <span className="quote-attribution">— Cronica Regatului · anul fără soare</span>
        </div>
      </section>

      <section className="hall-section page-width" id="hall-of-fame">
        <div className="hall-intro">
          <div className="eyebrow"><span className="eyebrow-line" /> Sala numelor</div>
          <h2>Cei care au lăsat<br /><em>urme în piatră.</em></h2>
          <p>O galerie pentru aventurierii care au dus povestea mai departe. Următorul portret poate fi al tău.</p>
          <a className="quiet-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "hall_of_fame" })} data-testid="link-hall-discord">
            Scrie-ți numele în cronică <Icon name="arrow" size={17} />
          </a>
        </div>
        <div className="champions">
          {champions.map((champion) => (
            <div className={`champion champion--${champion.tone}`} key={champion.name}>
              <span className="champion-rank">{champion.rank}</span>
              <span className="champion-avatar">{champion.name.slice(0, 1)}</span>
              <span className="champion-copy">
                <strong>{champion.name}</strong>
                <small>{champion.title}</small>
              </span>
              <span className="champion-score">{champion.score}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="arena-section" id="arena">
        <div className="page-width arena-layout">
          <div className="arena-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> Calendarul porții</div>
            <h2>Focul se vede<br /><em>cel mai bine în arenă.</em></h2>
            <p>Evenimentele comunității sunt locul unde planurile devin povești pe care le repeți la tavernă.</p>
            <a className="button button--outline" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "arena" })} data-testid="link-arena-discord">
              Vezi anunțurile pe Discord <Icon name="arrow" size={16} />
            </a>
          </div>
          <div className="event-list">
            {events.map((event, index) => (
              <a className="event-row" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: `event_${index + 1}` })} key={event.name} data-testid={`link-event-${index}`}>
                <span className="event-date">{event.date}</span>
                <span className="event-name">
                  <strong>{event.name}</strong>
                  <small>{event.copy}</small>
                </span>
                <span className="event-status">{event.status}</span>
                <Icon name="arrow" size={17} />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="tavern-section page-width" id="comunitate">
        <div className="tavern-card">
          <div className="tavern-ornament" aria-hidden="true"><Icon name="flame" size={29} /></div>
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> Serverul nostru Discord</div>
            <h2>Comunitatea ta.<br /><em>Regatul Cenușii.</em></h2>
            <p>O comunitate activă, conversații târzii, meme-uri fără praf și oameni care te ajută să-ți găsești primul drum.</p>
            <a className="community-invite-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "community_invite" })} data-testid="link-community-invite">
              {DISCORD_INVITE.replace("https://", "")} <Icon name="arrow" size={14} />
            </a>
          </div>
          <a className="button button--ghost" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "tavern" })} data-testid="link-tavern-discord">
            Intră pe server <Icon name="arrow" size={16} />
          </a>
        </div>
      </section>

      <section className="journey-section page-width" id="cum-incepi">
        <div className="section-heading section-heading--center">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> Ritualul de inițiere</div>
            <h2>Intră. <em>Alege.</em> Evoluează.</h2>
          </div>
          <p>Nu ai nevoie de experiență. Doar de curajul de a deschide poarta.</p>
        </div>
        <div className="journey-grid">
          <div className="journey-step">
            <span className="step-icon">01</span>
            <div>
              <h3>Deschide poarta</h3>
              <p>Intră pe serverul Discord, citește regulile și primește-ți locul în Regat.</p>
            </div>
          </div>
          <div className="journey-connector"><Icon name="arrow" size={22} /></div>
          <div className="journey-step">
            <span className="step-icon">02</span>
            <div>
              <h3>Alege-ți ecoul</h3>
              <p>Descoperă facțiunile, clasele și companionul care ți se potrivesc.</p>
            </div>
          </div>
          <div className="journey-connector"><Icon name="arrow" size={22} /></div>
          <div className="journey-step">
            <span className="step-icon">03</span>
            <div>
              <h3>Lasă o urmă</h3>
              <p>Luptă în evenimente, ajută un nou venit și scrie următorul capitol.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section page-width">
        <div className="cta-card">
          <div className="cta-glow" aria-hidden="true" />
          <div className="cta-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> Poarta este deschisă</div>
            <h2>Locul tău în Regat<br /><em>te așteaptă.</em></h2>
            <p>Nu trebuie să vii pregătit. Trebuie doar să vii.</p>
            <a className="button button--primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "final_cta" })} data-testid="link-final-discord">
              Intră pe Discord <Icon name="arrow" size={17} />
            </a>
          </div>
          <div className="cta-sigil"><Icon name="crown" size={43} /><span>RC</span></div>
          <DragonLogo className="dragon-logo--cta" />
        </div>
      </section>
    </>
  );
}
