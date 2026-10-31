/**
 * Jurnalul de audit: acțiunile pe care Discord nu le-a confirmat (de
 * verificat), apoi evenimentele, pe zile, cu căutare, categorie și interval.
 */
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Ico, Note, Spinner, cx } from "./fields";
import { countLabel, isDiscordId } from "./model";
import {
  AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_OPTIONS, RECORDS_MODULES, auditCategory, auditDetailLines, auditPeopleIds, clockTime, fullTime,
  groupAuditByDay, ledgerSummary, relativeTime, type LedgerAction,
} from "./records-model";
import { errorText, reconcileAction, useAuditPage, useLedger, usePeople, type Person } from "./records-data";
import { PersonLabel, RecordsModule, useRecords } from "./records-ui";
import {
  AUDIT_EVENT_CATEGORIES, AUDIT_PAGE_SIZE, auditDateRangeError, presentAuditActor, presentAuditLog, type ModerationAuditLog,
} from "../../../lib/moderation-audit";

const MODULE = RECORDS_MODULES[1]!;

function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const QUICK_RANGES = [
  { id: "today", label: "Azi", start: () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; } },
  { id: "week", label: "7 zile", start: () => new Date(Date.now() - 7 * 86_400_000) },
  { id: "month", label: "30 de zile", start: () => new Date(Date.now() - 30 * 86_400_000) },
] as const;

export function AuditView({ auditEnabled }: { auditEnabled?: boolean }) {
  const { guildId } = useRecords();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(0);
  const [ledgerKey, setLedgerKey] = useState(0);
  // The search runs when typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  useEffect(() => { setPage(0); }, [guildId]);

  const rangeError = auditDateRangeError({ start, end });
  const events = useAuditPage(guildId, { search, category, start, end, page }, !rangeError);
  const ledger = useLedger(guildId, ledgerKey);
  const items = events.data?.items ?? [];
  const total = events.data?.total ?? 0;
  const person = usePeople(guildId, [...auditPeopleIds(items), ...(ledger.data ?? []).flatMap((action) => [action.actorId, ledgerSummary(action).targetId ?? ""]).filter(isDiscordId)]);
  const categoryLabel = AUDIT_EVENT_CATEGORIES.find((option) => option.value === category)?.label;
  const filtered = Boolean(search.trim() || category !== "all" || start || end);
  const emptyMessage = rangeError || (start || end
    ? "Niciun eveniment din interval nu se potrivește filtrelor."
    : category !== "all" && search.trim()
      ? `Niciun eveniment din categoria „${categoryLabel}” nu se potrivește căutării.`
      : category !== "all"
        ? `Niciun eveniment în categoria „${categoryLabel}”.`
        : search.trim()
          ? "Niciun eveniment nu se potrivește căutării."
          : "Niciun eveniment încă.");
  const quick = QUICK_RANGES.find((range) => !end && start && Math.abs(Date.parse(start) - range.start().getTime()) < 120_000)?.id;

  return (
    <RecordsModule
      id="audit" title={MODULE.title} description={MODULE.description} icon={MODULE.icon}
      aside={<Link href="/jurnale/audit" className="pn-btn-ghost pn-btn-sm pn-go" data-testid="link-audit-settings"><Ico name="filter" />Setările auditului</Link>}
    >
      {auditEnabled === false ? (
        <Note tone="warn" testId="audit-off">
          Auditul e oprit, deci evenimentele noi de moderare nu se mai scriu aici. Îl pornești la <Link href="/jurnale/audit">Setările auditului</Link>.
        </Note>
      ) : null}
      {ledger.data?.length ? <LedgerCard actions={ledger.data} person={person} onDone={() => setLedgerKey((value) => value + 1)} /> : null}

      <div className="pn-rec-tools" data-testid="audit-filters">
        <div className="pn-rec-row2">
          <label className="pn-rec-f" htmlFor="audit-search">
            <span>Caută</span>
            <div className="pn-search">
              <Ico name="search" />
              <input
                id="audit-search" className="pn-inp" type="search" value={searchText} maxLength={200} placeholder="Acțiune, membru, ID…"
                onChange={(event) => setSearchText(event.target.value)} data-testid="audit-search"
              />
            </div>
          </label>
          <label className="pn-rec-f" htmlFor="audit-category">
            <span>Categorie</span>
            <select id="audit-category" className="pn-inp" value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }} data-testid="audit-category">
              {AUDIT_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="pn-rec-row2 pn-rec-range">
          <label className="pn-rec-f" htmlFor="audit-start">
            <span>De la</span>
            <input id="audit-start" className="pn-inp" type="datetime-local" step="1" value={start} aria-invalid={Boolean(rangeError)}
              aria-describedby="audit-range-help" onChange={(event) => { setStart(event.target.value); setPage(0); }} />
          </label>
          <label className="pn-rec-f" htmlFor="audit-end">
            <span>Până la</span>
            <input id="audit-end" className="pn-inp" type="datetime-local" step="1" value={end} aria-invalid={Boolean(rangeError)}
              aria-describedby="audit-range-help" onChange={(event) => { setEnd(event.target.value); setPage(0); }} />
          </label>
        </div>
        <div className="pn-rec-chips" role="group" aria-label="Interval rapid">
          {QUICK_RANGES.map((range) => (
            <button
              key={range.id} type="button" className="pn-rec-chip" aria-pressed={quick === range.id}
              onClick={() => { setStart(localInput(range.start())); setEnd(""); setPage(0); }}
            >{range.label}</button>
          ))}
          {start || end ? (
            <button type="button" className="pn-lnk" onClick={() => { setStart(""); setEnd(""); setPage(0); }}>Elimină intervalul</button>
          ) : null}
          {category !== "all" ? <button type="button" className="pn-lnk" onClick={() => { setCategory("all"); setPage(0); }}>Elimină categoria</button> : null}
        </div>
        <p id="audit-range-help" className="pn-fh">Orele sunt ale tale (locale), iar capetele intervalului sunt incluse. Filtrele caută în tot jurnalul, nu doar pe pagina deschisă.</p>
        {rangeError ? <p className="pn-err" role="alert">{rangeError}</p> : null}
      </div>

      {events.loading && !events.data && !rangeError ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă jurnalul…</span></div> : null}
      {events.error && !events.data ? (
        <div className="pn-fail" role="alert">
          <p>{errorText(events.error, "Jurnalul de audit nu a putut fi încărcat.")}</p>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void events.reload()}>Reîncearcă</button>
        </div>
      ) : null}
      {(events.data || rangeError) && !items.length ? (
        <div className="pn-rec-empty" role="status" data-testid="audit-empty"><Ico name="scroll" /><p>{emptyMessage}</p></div>
      ) : null}
      {items.length ? <AuditDays events={items} person={person} busy={events.loading} /> : null}
      {items.length && total > 0 ? (
        <div className="pn-rec-pages" data-testid="audit-pages">
          <span role="status">{page * AUDIT_PAGE_SIZE + 1}–{Math.min(page * AUDIT_PAGE_SIZE + items.length, total)} din {countLabel(total, "eveniment", "evenimente")}{filtered ? " găsite" : ""}</span>
          <div>
            <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={page === 0 || events.loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>Mai noi</button>
            <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={(page + 1) * AUDIT_PAGE_SIZE >= total || events.loading} onClick={() => setPage((current) => current + 1)}>Mai vechi</button>
          </div>
        </div>
      ) : null}
    </RecordsModule>
  );
}

function AuditTarget({ event, person }: { event: ModerationAuditLog; person: (id: string | null | undefined) => Person | null }) {
  const { channelName } = useRecords();
  if (!event.targetId) return null;
  if (event.targetType === "case") {
    return <Link href={`/cazuri?caz=${event.targetId}`} className="pn-lnk pn-aud-case">cazul #{event.targetId.slice(0, 8)}</Link>;
  }
  if (["member", "user"].includes(event.targetType ?? "") && isDiscordId(event.targetId)) {
    return <PersonLabel id={event.targetId} person={person(event.targetId)} small />;
  }
  if (event.targetType === "channel") return <span>{channelName(event.targetId) ?? `canalul ${event.targetId}`}</span>;
  if (event.targetType === "config" || event.targetType === "guild") return null;
  return <span className="pn-aud-raw">{event.targetType ? `${event.targetType} ` : ""}{event.targetId}</span>;
}

function AuditDays({ events, person, busy }: { events: ModerationAuditLog[]; person: (id: string | null | undefined) => Person | null; busy: boolean }) {
  const days = groupAuditByDay(events);
  return (
    <div className={cx("pn-aud-days", busy && "is-busy")} data-testid="audit-list">
      {days.map((day) => (
        <section key={day.key} className="pn-aud-day" aria-label={day.label}>
          <h3 className="pn-aud-dh"><span>{day.label}</span><small>{countLabel(day.items.length, "eveniment", "evenimente")}</small></h3>
          <ol className="pn-aud-list">
            {day.items.map((event) => {
              const view = presentAuditLog(event);
              const category = auditCategory(event);
              const actor = presentAuditActor(event);
              const lines = auditDetailLines(event.detail);
              return (
                <li key={event.id} className="pn-aud-ev" data-testid={`audit-event-${event.id}`}>
                  <span className={cx("pn-aud-ic", `is-${category}`)} aria-hidden="true"><Ico name={AUDIT_CATEGORY_ICONS[category]} /></span>
                  <div className="pn-aud-main">
                    <div className="pn-aud-l1">
                      <b>{view.title}</b>
                      <time dateTime={event.createdAt} title={fullTime(event.createdAt)}>{clockTime(event.createdAt)}</time>
                    </div>
                    <p className="pn-aud-d">{view.details}</p>
                    <div className="pn-aud-meta">
                      {event.actorId && isDiscordId(event.actorId) && event.detail?.actorVerified !== false
                        ? <PersonLabel id={event.actorId} person={person(event.actorId)} small />
                        : <span>{actor}</span>}
                      <AuditTargetWithArrow event={event} person={person} />
                      <span className="pn-aud-cat">{AUDIT_EVENT_CATEGORIES.find((option) => option.value === category)?.label}</span>
                    </div>
                    {lines.length ? (
                      <details className="pn-aud-more">
                        <summary>Detalii</summary>
                        <dl>{lines.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function AuditTargetWithArrow({ event, person }: { event: ModerationAuditLog; person: (id: string | null | undefined) => Person | null }) {
  const target = <AuditTarget event={event} person={person} />;
  if (!event.targetId || event.targetType === "config" || event.targetType === "guild") return null;
  return <><span className="pn-aud-arrow" aria-label="către">→</span>{target}</>;
}

/* ------------------------------------------------------------------ */
/* De verificat                                                        */
/* ------------------------------------------------------------------ */

function LedgerCard({ actions, person, onDone }: { actions: LedgerAction[]; person: (id: string | null | undefined) => Person | null; onDone: () => void }) {
  return (
    <section className="pn-aud-ledger" aria-label="Acțiuni de verificat" data-testid="audit-ledger">
      <div className="pn-aud-ledger-h">
        <span className="pn-aud-ic is-security" aria-hidden="true"><Ico name="alert" /></span>
        <div>
          <h3>{countLabel(actions.length, "acțiune de verificat", "acțiuni de verificat")}</h3>
          <p>Discord nu a confirmat dacă s-au aplicat. Uită-te în Discord și spune ce ai găsit. Nu le repeta până nu știi sigur: Discord le poate aplica și cu întârziere.</p>
        </div>
      </div>
      <ul className="pn-aud-ledger-l">
        {actions.map((action) => <LedgerRow key={action.id} action={action} person={person} onDone={onDone} />)}
      </ul>
    </section>
  );
}

function LedgerRow({ action, person, onDone }: { action: LedgerAction; person: (id: string | null | undefined) => Person | null; onDone: () => void }) {
  const { guildId, channelName } = useRecords();
  const summary = ledgerSummary(action);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"applied" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = async (status: "applied" | "failed") => {
    setBusy(status);
    setError(null);
    try {
      await reconcileAction(guildId, action.id, status, note.trim());
      onDone();
    } catch (failure) {
      setError(errorText(failure, "Răspunsul nu a putut fi salvat."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="pn-aud-lrow" data-testid={`ledger-${action.id}`}>
      <div className="pn-aud-lrow-h">
        <b>{summary.title}</b>
        {summary.targetId ? <PersonLabel id={summary.targetId} person={person(summary.targetId)} small /> : summary.channelId ? <span>{channelName(summary.channelId) ?? summary.channelId}</span> : null}
        <span className={cx("pn-badge", action.status === "uncertain" ? "is-bad" : "is-wait")}>{action.status === "uncertain" ? "Nesigură" : "În așteptare"}</span>
      </div>
      <p className="pn-aud-meta">
        cerută de {person(action.actorId)?.name ?? action.actorId} · <time dateTime={action.createdAt} title={fullTime(action.createdAt)}>{relativeTime(action.createdAt)}</time>
        {summary.reason ? <> · „{summary.reason}”</> : null}
      </p>
      {action.error ? <p className="pn-fh">Eroarea: {action.error}</p> : null}
      {open ? (
        <div className="pn-rec-form">
          <textarea
            className="pn-inp pn-area" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}
            placeholder="Ce ai văzut în Discord (de exemplu: membrul are timeout până la 18:40)" aria-label="Ce ai găsit în Discord"
          />
          {error ? <p className="pn-err" role="alert">{error}</p> : null}
          <div className="pn-rec-form-a">
            <span className="pn-fh">Nota e obligatorie și rămâne în audit.</span>
            <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={!note.trim() || Boolean(busy)} onClick={() => void answer("failed")}>
              {busy === "failed" ? <Spinner /> : <Ico name="x" />}Nu s-a aplicat
            </button>
            <button type="button" className="pn-btn pn-btn-sm" disabled={!note.trim() || Boolean(busy)} onClick={() => void answer("applied")}>
              {busy === "applied" ? <Spinner /> : <Ico name="check" />}S-a aplicat
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setOpen(true)} data-testid={`ledger-check-${action.id}`}>Verifică</button>
      )}
    </li>
  );
}
