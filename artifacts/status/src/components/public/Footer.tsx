import { Link } from "wouter";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { Brand, Icon, StatusDot } from "./UiElements";

export function Footer({ health }: { health: any }) {
  return (
    <footer className="site-footer page-width">
      <div className="footer-top">
        <Brand footer />
        <span className="footer-motto">Un loc primitor pentru comunitatea Oracolul Cenușii.</span>
        <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "footer" })} data-testid="link-footer-discord">
          discord.gg/regatulcenusii <Icon name="arrow" size={14} />
        </a>
      </div>
      <div className="footer-bottom">
        <span>ORACOLUL CENUȘII · COMUNITATE DISCORD</span>
        <nav className="footer-navigation" aria-label="Navigare secundară">
          <Link href="/server" data-testid="link-footer-server-guide">Ghidul serverului</Link>
          <Link href="/verificare" data-testid="link-footer-verification">Verificare membru</Link>
          <Link href="/statistici" data-testid="link-footer-stats">Statistici</Link>
          <Link href="/moderare" data-testid="link-footer-moderation">Consolă operator</Link>
        </nav>
        <a href="/#status" onClick={() => trackEvent("operator_status_open", { location: "footer" })} data-testid="link-footer-status">
          <StatusDot active={health?.botOnline ?? false} /> operator / stare live
        </a>
        <span>© {new Date().getFullYear()} — fără tron, doar povești</span>
      </div>
    </footer>
  );
}
