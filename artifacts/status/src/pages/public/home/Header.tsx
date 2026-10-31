import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { trackEvent } from "../../../lib/analytics";
import crest from "./crest.webp";

const NAV = [
  { href: "#acum", label: "Comunitatea", mobile: "Comunitatea, acum" },
  { href: "#raport", label: "Activitate", mobile: "O zi din comunitate" },
  { href: "#oracol", label: "Oracolul", mobile: "Întreabă Oracolul" },
  { href: "#recrutare", label: "Recrutare", mobile: "Recrutare" },
] as const;

const desktopLink: CSSProperties = { color: "#B7B3AD", textDecoration: "none", fontSize: "15px", fontWeight: "500" };

const mobileItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: "50px",
  padding: "0 14px",
  borderRadius: "10px",
  color: "#F6F1EA",
  textDecoration: "none",
  fontSize: "17px",
  fontWeight: "500",
};

export function Header({ invite }: { invite: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  const closeMenu = () => {
    if (menu.current) menu.current.open = false;
  };

  // Meniul de pe telefon se închide și când atingi altceva în pagină, nu doar la Escape sau la alegerea unui link.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el = menu.current;
      if (el?.open && event.target instanceof Node && !el.contains(event.target)) el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const onMenuKey = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !menu.current?.open) return;
    closeMenu();
    summary.current?.focus();
  };
  const inviteClick = (location: string) => () => trackEvent("discord_cta_click", { location });

  return (
    <header
      style={{
        position: "sticky",
        top: "0",
        zIndex: "50",
        background: "rgba(9,9,11,.76)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 clamp(20px,5vw,56px)",
          boxSizing: "border-box",
          minHeight: "72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <a
          href="#top"
          aria-label="Regatul Cenușii, începutul paginii"
          style={{ display: "inline-flex", alignItems: "center", gap: "12px", textDecoration: "none" }}
        >
          <img
            className="crestG"
            src={crest}
            alt=""
            width="40"
            height="40"
            style={{
              display: "block",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              boxShadow: "0 0 0 1px rgba(226,180,103,.7), 0 0 18px rgba(255,107,61,.35)",
            }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1" }}>
            <span style={{ fontWeight: "700", fontSize: "16px", letterSpacing: ".24em", color: "#F6F1EA" }}>REGATUL</span>
            <span style={{ fontWeight: "500", fontSize: "10.5px", letterSpacing: ".42em", color: "#E2B467" }}>CENUȘII</span>
          </span>
        </a>

        <nav className="deskNav" aria-label="Secțiunile paginii" style={{ alignItems: "center", gap: "32px" }}>
          {NAV.map((item) => (
            <a key={item.href} className="navl" href={item.href} style={desktopLink}>
              {item.label}
            </a>
          ))}
          <a
            className="btnP"
            href={invite}
            target="_blank"
            rel="noopener noreferrer"
            onClick={inviteClick("server_guide_nav")}
            data-testid="link-server-guide-nav-invite"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              minHeight: "44px",
              padding: "0 20px",
              boxSizing: "border-box",
              borderRadius: "10px",
              background: "linear-gradient(135deg,#D24320 0%,#B3301B 55%,#8E2116 100%)",
              boxShadow: "0 10px 28px -10px rgba(255,90,40,.7), inset 0 1px 0 rgba(255,255,255,.22)",
              color: "#FFFFFF",
              fontWeight: "700",
              fontSize: "15px",
              textDecoration: "none",
            }}
          >
            Intră pe Discord
          </a>
        </nav>

        <details className="menuWrap" ref={menu} onKeyDown={onMenuKey} style={{ position: "relative" }}>
          <summary
            ref={summary}
            aria-label="Meniu"
            data-testid="button-server-guide-menu"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "46px",
              height: "46px",
              boxSizing: "border-box",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: "12px",
              background: "rgba(255,255,255,.03)",
              color: "#F6F1EA",
            }}
          >
            <svg className="ico icoMenu" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg className="ico icoClose" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </summary>
          <div
            className="mPanel"
            style={{
              position: "absolute",
              right: "0",
              top: "calc(100% + 12px)",
              zIndex: "60",
              width: "min(300px, calc(100vw - 40px))",
              padding: "8px",
              boxSizing: "border-box",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,.1)",
              background: "#121317",
              boxShadow: "0 30px 70px rgba(0,0,0,.65)",
            }}
          >
            {NAV.map((item) => (
              <a key={item.href} className="mItem" href={item.href} onClick={closeMenu} style={mobileItem}>
                {item.mobile}
              </a>
            ))}
            <a
              className="btnP"
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                inviteClick("server_guide_nav_mobile")();
                closeMenu();
              }}
              data-testid="link-server-guide-nav-mobile-invite"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                minHeight: "50px",
                marginTop: "6px",
                borderRadius: "10px",
                background: "linear-gradient(135deg,#D24320 0%,#B3301B 55%,#8E2116 100%)",
                color: "#FFFFFF",
                fontWeight: "700",
                fontSize: "16px",
                textDecoration: "none",
              }}
            >
              Intră pe Discord
            </a>
          </div>
        </details>
      </div>
      <div className="hdrLine" aria-hidden="true" />
      <span className="prog" aria-hidden="true" />
    </header>
  );
}
