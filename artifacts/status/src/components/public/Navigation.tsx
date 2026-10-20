import { useState, useEffect, useContext } from "react";
import { Link, useLocation } from "wouter";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { Brand, Icon } from "./UiElements";
import { PublicToolbarActionContext } from "./PublicToolbarActionContext";

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const toolbarAction = useContext(PublicToolbarActionContext)?.action;

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        document.getElementById("public-menu-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <header className="site-nav fire-toolbar">
      <Brand />

      <nav id="public-navigation" data-aos="flip-left" className={`nav-links ${isOpen ? "is-open" : ""}`} aria-label="Navigație principală">
        <div className="nav-links-inner">
          <Link href="/joc" data-testid="link-nav-game" aria-current={location === "/joc" ? "page" : undefined} className={location === "/joc" ? "active" : ""}>Lumea jocului</Link>
          <Link href="/verificare" data-testid="link-nav-verification" aria-current={location === "/verificare" ? "page" : undefined} className={location === "/verificare" ? "active" : ""}>Verificare membru</Link>
          <Link href="/statistici" data-testid="link-nav-stats" aria-current={location === "/statistici" ? "page" : undefined} className={location === "/statistici" ? "active" : ""}>Cronica live</Link>
          <Link href="/moderare" data-testid="link-nav-home" className="nav-console-link">Consolă operator</Link>
          
          <a className="nav-cta nav-cta--mobile" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "nav_mobile" })} data-testid="link-nav-discord-mobile">
            Intră pe Discord <Icon name="arrow" size={15} />
          </a>
        </div>
      </nav>

      <div data-aos="flip-left" className="nav-actions">
        {toolbarAction}
        <a className="nav-cta" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "nav" })} data-testid="link-nav-discord">
          Intră pe Discord <Icon name="arrow" size={15} />
        </a>
        
        <button 
          id="public-menu-toggle"
          className="mobile-menu-toggle" 
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Închide meniul" : "Deschide meniul"}
          aria-expanded={isOpen}
          aria-controls="public-navigation"
        >
          <Icon name={isOpen ? "x" : "menu"} size={24} />
        </button>
      </div>
    </header>
  );
}
