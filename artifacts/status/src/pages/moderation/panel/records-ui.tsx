/**
 * Piesele comune ale paginii Cazuri și audit: contextul paginii, antetul unui
 * modul fără setări, un membru cu poza lui și foaia laterală în care se
 * deschide un caz.
 */
import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ico, cx, type IconName } from "./fields";
import type { Person } from "./records-data";

export type RecordsApi = {
  guildId: string;
  guildName: string;
  /** "#general", or null for a channel the panel does not know. */
  channelName: (id: string | null | undefined) => string | null;
  /** The case counts changed (a case was closed or reopened). */
  countsChanged: () => void;
};

export const RecordsContext = createContext<RecordsApi | null>(null);

export function useRecords(): RecordsApi {
  const value = useContext(RecordsContext);
  if (!value) throw new Error("useRecords must be used inside the records page");
  return value;
}

/** A module of the page: the same head as the settings modules, without a switch. */
export function RecordsModule({ id, title, description, icon, aside, children }: {
  id: string; title: string; description: string; icon: IconName; aside?: React.ReactNode; children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="pn-mod is-on" aria-labelledby={headingId} data-testid={`module-${id}`}>
      <header className="pn-mod-h">
        <span className="pn-mod-ic" aria-hidden="true"><Ico name={icon} /></span>
        <div className="pn-mod-t">
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        {aside}
      </header>
      <div className="pn-mod-body">{children}</div>
    </section>
  );
}

/** A member by name and picture when the bot found them, else by ID. */
export function PersonLabel({ id, person, fallback, small }: { id: string | null | undefined; person: Person | null; fallback?: string; small?: boolean }) {
  // A picture Discord does not serve falls back to the plain icon.
  const [broken, setBroken] = useState<string | null>(null);
  if (!id) return <span className="pn-rec-who"><span className="pn-rec-av is-sys" aria-hidden="true"><Ico name="bot" /></span><b>{fallback ?? "Sistem"}</b></span>;
  return (
    <span className={cx("pn-rec-who", small && "is-small")} title={person ? `${person.name}${person.username ? ` (@${person.username})` : ""} · ${id}` : id}>
      {person && broken !== person.avatarUrl
        ? <img className="pn-rec-av" src={person.avatarUrl} alt="" loading="lazy" onError={() => setBroken(person.avatarUrl)} />
        : <span className="pn-rec-av" aria-hidden="true"><Ico name="users" /></span>}
      <b>{person ? person.name : fallback ?? id}</b>
    </span>
  );
}

/**
 * A panel that slides in from the right (from the bottom on a phone), over the page.
 * Escape and the backdrop close it; focus stays inside while it is open and goes
 * back where it was after.
 */
export function Sheet({ label, onClose, children, testId }: { label: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="pn pn-sheet-root">
      <div className="pn-sheet-back" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <div ref={ref} className="pn-sheet" role="dialog" aria-modal="true" aria-label={label} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
