/**
 * Cazuri: lista sancțiunilor, cu filtre după stare, acțiune și membru, și foaia
 * unui caz, cu motivul, dovezile, contestația și notele staff-ului. Un caz se
 * poate deschide direct din adresă: /cazuri?caz=<id>.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Ico, Note, Spinner, cx } from "./fields";
import { countLabel } from "./model";
import {
  APPEAL_LABELS, CASE_ACTION_FILTERS, CASE_STATUS_FILTERS, RECORDS_MODULES, actionKind, caseOutcome, casePeopleIds, caseSource, evidenceView,
  fullTime, messageLink, parseMemberQuery, relativeTime, type CaseDetails, type CaseStatusFilter, type ModerationCase,
} from "./records-model";
import { addCaseNote, errorText, updateCase, useCaseDetails, useCaseList, usePeople, type Person } from "./records-data";
import { PersonLabel, RecordsModule, Sheet, useRecords } from "./records-ui";

const MODULE = RECORDS_MODULES[0]!;

/** Discord's mentions in a note, as names. */
function useMentionText() {
  const { channelName } = useRecords();
  return (text: string, person: (id: string) => Person | null) => text
    .replace(/<#(\d+)>/g, (_match, id: string) => channelName(id) ?? `#${id}`)
    .replace(/<@!?(\d+)>/g, (_match, id: string) => `@${person(id)?.name ?? id}`);
}

function CaseSubject({ item, person }: { item: ModerationCase; person: Person | null }) {
  const { channelName, guildId, guildName } = useRecords();
  const kind = actionKind(item.actionType);
  if (kind.subject === "channel") {
    const name = item.subjectId === guildId ? guildName : channelName(item.subjectId)?.replace(/^#/, "") ?? item.subjectId;
    return <span className="pn-rec-who"><span className="pn-rec-av is-chan" aria-hidden="true"><Ico name="hash" /></span><b>{name}</b></span>;
  }
  return <PersonLabel id={item.subjectId} person={person} />;
}

function CaseBadges({ item }: { item: ModerationCase }) {
  const outcome = caseOutcome(item);
  return (
    <>
      {outcome ? <span className="pn-badge is-bad">{outcome.label}</span> : null}
      {item.appealStatus ? <span className={cx("pn-badge", item.appealStatus === "pending" ? "is-wait" : "is-plain")}>{APPEAL_LABELS[item.appealStatus]}</span> : null}
      <span className={cx("pn-badge", item.status === "open" ? "is-open" : "is-plain")}>{item.status === "open" ? "Deschis" : "Închis"}</span>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */

export function CasesView() {
  const { guildId } = useRecords();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const openId = params.get("caz");
  const [status, setStatus] = useState<CaseStatusFilter>("all");
  const [actionType, setActionType] = useState("all");
  const [memberText, setMemberText] = useState(() => params.get("membru") ?? "");
  const member = parseMemberQuery(memberText);
  const [userId, setUserId] = useState<string | null>(member.id);
  // The search applies once the text is a whole ID, so typing does not load the list at every digit.
  useEffect(() => { if (!member.error) setUserId(member.id); }, [member.id, member.error]);

  const list = useCaseList(guildId, { status, userId, actionType });
  const person = usePeople(guildId, casePeopleIds(list.items));
  const counts = list.counts;
  const statusOptions = CASE_STATUS_FILTERS.map(([key, label]) => {
    const count = !counts ? null : key === "open" ? counts.open : key === "closed" ? counts.closed : counts.open + counts.closed;
    return [key, count === null ? label : `${label} · ${count}`] as const;
  });

  const go = (next: Record<string, string | null>) => {
    const query = new URLSearchParams(search);
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const text = query.toString();
    setLocation(`${location.split("?")[0]}${text ? `?${text}` : ""}`, { replace: true });
  };
  const filtered = status !== "all" || actionType !== "all" || Boolean(userId);

  return (
    <RecordsModule
      id="cases" title={MODULE.title} description={MODULE.description} icon={MODULE.icon}
      aside={(
        <a className="pn-btn-ghost pn-btn-sm pn-go" href={`/api/moderation/guilds/${guildId}/cases/export`} download data-testid="cases-export">
          <Ico name="scroll" />Exportă CSV
        </a>
      )}
    >
      <div className="pn-rec-tools" data-testid="cases-filters">
        <div className="pn-rec-chips" role="radiogroup" aria-label="Starea cazurilor" data-testid="cases-status">
          {statusOptions.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={status === key} className="pn-rec-chip" onClick={() => setStatus(key)}>{label}</button>
          ))}
        </div>
        <div className="pn-rec-row2">
          <label className="pn-rec-f" htmlFor="cases-member">
            <span>Membru</span>
            <div className="pn-search">
              <Ico name="search" />
              <input
                id="cases-member" className="pn-inp" type="search" value={memberText} placeholder="ID, <@mențiune> sau link de profil"
                aria-invalid={Boolean(member.error)} aria-describedby={member.error ? "cases-member-err" : undefined}
                onChange={(event) => setMemberText(event.target.value)} data-testid="cases-member"
              />
            </div>
          </label>
          <label className="pn-rec-f" htmlFor="cases-action">
            <span>Acțiunea</span>
            <select id="cases-action" className="pn-inp" value={actionType} onChange={(event) => setActionType(event.target.value)} data-testid="cases-action">
              {CASE_ACTION_FILTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        {member.error ? <p className="pn-err" id="cases-member-err" role="alert">{member.error}</p> : null}
        {filtered ? (
          <button type="button" className="pn-lnk" onClick={() => { setStatus("all"); setActionType("all"); setMemberText(""); }} data-testid="cases-clear">
            Arată toate cazurile
          </button>
        ) : null}
      </div>

      <CaseList list={list} person={person} filtered={filtered} onOpen={(id) => go({ caz: id })} />
      {openId ? (
        <CaseSheet
          caseId={openId} person={person} onClose={() => go({ caz: null })}
          onChanged={(item) => list.patch(item)}
          onMemberCases={(id) => { setMemberText(id); setStatus("all"); setActionType("all"); go({ caz: null }); }}
        />
      ) : null}
    </RecordsModule>
  );
}

function CaseList({ list, person, filtered, onOpen }: {
  list: ReturnType<typeof useCaseList>; person: (id: string | null | undefined) => Person | null; filtered: boolean; onOpen: (id: string) => void;
}) {
  if (list.loading) return <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă cazurile…</span></div>;
  if (list.error && !list.items.length) {
    return (
      <div className="pn-fail" role="alert">
        <p>{errorText(list.error, "Cazurile nu au putut fi încărcate.")}</p>
        <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void list.reload()}>Reîncearcă</button>
      </div>
    );
  }
  if (!list.items.length) {
    return (
      <div className="pn-rec-empty" role="status" data-testid="cases-empty">
        <Ico name="gavel" />
        <p>{filtered ? "Niciun caz nu se potrivește filtrelor." : "Niciun caz încă. Fiecare sancțiune dată de staff sau de bot apare aici."}</p>
      </div>
    );
  }
  return (
    <>
      <ul className={cx("pn-rec-list", list.refreshing && "is-busy")} aria-label="Cazuri" data-testid="cases-list">
        {list.items.map((item) => {
          const kind = actionKind(item.actionType);
          const source = caseSource(item);
          return (
            <li key={item.id}>
              <button type="button" className="pn-rec-item" onClick={() => onOpen(item.id)} data-testid={`case-row-${item.id}`} aria-label={`Cazul ${item.id.slice(0, 8)}: ${kind.label}`}>
                <span className={cx("pn-rec-kind", `is-${kind.tone}`)} aria-hidden="true"><Ico name={kind.icon} /></span>
                <span className="pn-rec-main">
                  <span className="pn-rec-l1"><b className="pn-rec-k">{kind.label}</b><CaseSubject item={item} person={person(item.subjectId)} /></span>
                  <span className="pn-rec-reason">{item.reason || "Fără motiv"}</span>
                  <span className="pn-rec-meta">
                    {source.automatic ? <span>de {source.label}</span> : <span className="pn-rec-by">de <PersonLabel id={item.actorId} person={person(item.actorId)} small fallback="staff" /></span>}
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.createdAt} title={fullTime(item.createdAt)}>{relativeTime(item.createdAt)}</time>
                  </span>
                </span>
                <span className="pn-rec-side">
                  <CaseBadges item={item} />
                  <code className="pn-rec-id">#{item.id.slice(0, 8)}</code>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {list.error ? <Note tone="bad" role="alert">{errorText(list.error, "Următoarele cazuri nu au putut fi încărcate.")}</Note> : null}
      {list.hasMore ? (
        <button type="button" className="pn-btn-ghost pn-btn-sm pn-more" disabled={list.loadingMore} onClick={() => void list.loadMore()} data-testid="cases-more">
          {list.loadingMore ? <><Spinner />Se încarcă…</> : "Arată mai multe cazuri"}
        </button>
      ) : list.items.length > 10 ? <p className="pn-rec-end">Acestea sunt toate cazurile{filtered ? " care se potrivesc" : ""}.</p> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Foaia unui caz                                                      */
/* ------------------------------------------------------------------ */

function CaseSheet({ caseId, person, onClose, onChanged, onMemberCases }: {
  caseId: string; person: (id: string | null | undefined) => Person | null; onClose: () => void;
  onChanged: (item: ModerationCase) => void; onMemberCases: (userId: string) => void;
}) {
  const { guildId, countsChanged } = useRecords();
  const details = useCaseDetails(guildId, caseId);
  const item = details.data;
  const noteIds = item ? [...new Set([...(item.notes ?? []).map((note) => note.authorId), item.appeal?.decidedBy ?? ""].filter(Boolean))] : [];
  const sheetPerson = usePeople(guildId, noteIds);
  const who = (id: string | null | undefined) => person(id) ?? sheetPerson(id);
  const [busy, setBusy] = useState<"status" | "note" | "reason" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (kind: "status" | "note" | "reason", work: () => Promise<unknown>, success: string) => {
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      await work();
      setDone(success);
      await details.reload();
    } catch (failure) {
      setError(errorText(failure, "Schimbarea nu a putut fi salvată."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet label={`Cazul ${caseId.slice(0, 8)}`} onClose={onClose} testId="case-sheet">
      <div className="pn-sheet-h">
        <div>
          <p className="pn-sheet-k">Cazul #{caseId.slice(0, 8)}</p>
          <h2>{item ? actionKind(item.actionType).label : "Caz"}</h2>
        </div>
        <button type="button" className="pn-icon-btn" onClick={onClose} aria-label="Închide fișa cazului" data-autofocus><Ico name="x" /></button>
      </div>
      <div className="pn-sheet-b">
        {details.loading && !item ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă cazul…</span></div> : null}
        {details.error && !item ? (
          <div className="pn-fail" role="alert">
            <p>{errorText(details.error, "Cazul nu a putut fi încărcat.")}</p>
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void details.reload()}>Reîncearcă</button>
          </div>
        ) : null}
        {item ? (
          <CaseBody
            item={item} who={who} busy={busy} error={error} done={done}
            onStatus={() => void run("status", async () => {
              const updated = await updateCase(guildId, item.id, { status: item.status === "open" ? "closed" : "open" });
              onChanged(updated);
              countsChanged();
            }, item.status === "open" ? "Cazul e închis." : "Cazul e deschis din nou.")}
            onReason={(reason) => run("reason", async () => onChanged(await updateCase(guildId, item.id, { reason })), "Motivul e schimbat.")}
            onNote={(body) => run("note", () => addCaseNote(guildId, item.id, body), "Nota e adăugată.")}
            onMemberCases={onMemberCases}
          />
        ) : null}
      </div>
    </Sheet>
  );
}

function CaseBody({ item, who, busy, error, done, onStatus, onReason, onNote, onMemberCases }: {
  item: CaseDetails; who: (id: string | null | undefined) => Person | null; busy: "status" | "note" | "reason" | null; error: string | null; done: string | null;
  onStatus: () => void; onReason: (reason: string) => Promise<void>; onNote: (body: string) => Promise<void>; onMemberCases: (userId: string) => void;
}) {
  const { guildId, channelName } = useRecords();
  const mentions = useMentionText();
  const kind = actionKind(item.actionType);
  const source = caseSource(item);
  const outcome = caseOutcome(item);
  const evidence = (item.evidence ?? []).map((value) => evidenceView(guildId, value));
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(item.reason ?? "");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const subjectPerson = who(item.subjectId);
  const appeal = item.appeal;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?caz=${item.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="pn-sheet-tags"><CaseBadges item={item} /></div>
      {done ? <Note tone="info" role="status" testId="case-done">{done}</Note> : null}
      {error ? <Note tone="bad" role="alert" testId="case-error">{error}</Note> : null}
      {outcome ? <Note tone="warn">{outcome.text}</Note> : null}

      <dl className="pn-rec-facts" data-testid="case-facts">
        <div>
          <dt>{kind.subject === "channel" ? "Canalul" : "Membrul"}</dt>
          <dd>
            <CaseSubject item={item} person={subjectPerson} />
            {kind.subject === "member" ? (
              <small>{subjectPerson?.username ? `@${subjectPerson.username} · ` : ""}{item.subjectId}{subjectPerson && !subjectPerson.inGuild ? " · nu mai e pe server" : ""}</small>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Dat de</dt>
          <dd>{source.automatic ? <b className="pn-rec-plain">{source.label === "anti-raid" ? "Anti-raid" : "Moderarea automată"}</b> : <PersonLabel id={item.actorId} person={who(item.actorId)} fallback="staff" />}</dd>
        </div>
        <div><dt>Când</dt><dd>{fullTime(item.createdAt)}</dd></div>
        <div>
          <dt>Stare</dt>
          <dd>
            {item.status === "open" ? "Deschis" : "Închis"}
            {item.status === "closed" && item.closedAt ? <small>pe {fullTime(item.closedAt)}{item.closedBy ? <> de {who(item.closedBy)?.name ?? item.closedBy}</> : null}</small> : null}
          </dd>
        </div>
      </dl>

      <section className="pn-sheet-s" aria-label="Motivul">
        <div className="pn-sheet-sh"><h3>Motivul</h3>{!editing ? <button type="button" className="pn-lnk" onClick={() => { setReason(item.reason ?? ""); setEditing(true); }}>Schimbă</button> : null}</div>
        {editing ? (
          <div className="pn-rec-form">
            <textarea className="pn-inp pn-area" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Motivul cazului" data-testid="case-reason-input" />
            <div className="pn-rec-form-a">
              <span className="pn-fh">{reason.trim().length}/500</span>
              <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setEditing(false)} disabled={busy === "reason"}>Renunță</button>
              <button
                type="button" className="pn-btn pn-btn-sm" disabled={!reason.trim() || reason.trim() === (item.reason ?? "") || busy === "reason"} data-testid="case-reason-save"
                onClick={() => void onReason(reason.trim()).then(() => setEditing(false))}
              >{busy === "reason" ? <Spinner /> : <Ico name="check" />}Salvează motivul</button>
            </div>
          </div>
        ) : <p className="pn-rec-text">{item.reason || "Fără motiv."}</p>}
      </section>

      {evidence.length ? (
        <section className="pn-sheet-s" aria-label="Dovezi">
          <div className="pn-sheet-sh"><h3>Dovezi</h3><span className="pn-fh">{evidence.length}</span></div>
          <ul className="pn-rec-ev">
            {evidence.map((piece, index) => (
              <li key={index}>
                {piece.kind ? <span className="pn-badge is-plain">{piece.kind}</span> : null}
                {piece.text ? <p>{piece.text}</p> : null}
                {piece.link ? <a href={piece.link} target="_blank" rel="noopener noreferrer" className="pn-lnk">{piece.linkLabel}<Ico name="arrow" /></a> : null}
                {piece.url ? <a href={piece.url} target="_blank" rel="noopener noreferrer" className="pn-lnk pn-rec-url">{piece.url}</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {appeal ? (
        <section className="pn-sheet-s" aria-label="Contestația" data-testid="case-appeal">
          <div className="pn-sheet-sh"><h3>Contestația</h3><span className={cx("pn-badge", appeal.status === "pending" ? "is-wait" : "is-plain")}>{APPEAL_LABELS[appeal.status]}</span></div>
          <p className="pn-rec-text">
            Depusă pe {fullTime(appeal.createdAt)}
            {messageLink(guildId, appeal.channelId) ? <> în tichetul <a className="pn-lnk" href={messageLink(guildId, appeal.channelId)!} target="_blank" rel="noopener noreferrer">{channelName(appeal.channelId) ?? "contestației"}</a></> : null}.
          </p>
          {appeal.decidedAt ? (
            <p className="pn-rec-text">
              {appeal.status === "accepted" ? "Acceptată" : "Respinsă"} pe {fullTime(appeal.decidedAt)}{appeal.decidedBy ? ` de ${who(appeal.decidedBy)?.name ?? appeal.decidedBy}` : ""}.
              {appeal.decisionNote ? <> Nota: „{appeal.decisionNote}”</> : null}
            </p>
          ) : <p className="pn-fh">Răspunsul se dă din tichetul contestației, în Discord.</p>}
        </section>
      ) : null}

      <section className="pn-sheet-s" aria-label="Note">
        <div className="pn-sheet-sh"><h3>Note</h3><span className="pn-fh">{countLabel(item.notes?.length ?? 0, "notă", "note")}</span></div>
        {item.notes?.length ? (
          <ol className="pn-rec-notes" data-testid="case-notes">
            {item.notes.map((entry, index) => (
              <li key={entry.id ?? index}>
                <div className="pn-rec-note-h">
                  <PersonLabel id={entry.authorId} person={who(entry.authorId)} small />
                  <time dateTime={entry.createdAt} title={fullTime(entry.createdAt)}>{relativeTime(entry.createdAt)}</time>
                </div>
                <p className="pn-rec-note-b">{mentions(entry.body, (id) => who(id))}</p>
              </li>
            ))}
          </ol>
        ) : <p className="pn-fh">Nicio notă încă.</p>}
        <div className="pn-rec-form">
          <textarea
            className="pn-inp pn-area" rows={3} maxLength={4000} value={note} placeholder="Ce s-a mai aflat, ce s-a hotărât…"
            onChange={(event) => setNote(event.target.value)} aria-label="Notă nouă" data-testid="case-note-input"
          />
          <div className="pn-rec-form-a">
            <span className="pn-fh">Notele le văd doar cei cu acces la panou.</span>
            <button
              type="button" className="pn-btn pn-btn-sm" disabled={!note.trim() || busy === "note"} data-testid="case-note-add"
              onClick={() => void onNote(note.trim()).then(() => setNote(""))}
            >{busy === "note" ? <Spinner /> : <Ico name="plus" />}Adaugă nota</button>
          </div>
        </div>
      </section>

      <div className="pn-sheet-f">
        <button type="button" className={item.status === "open" ? "pn-btn" : "pn-btn-ghost"} onClick={onStatus} disabled={busy === "status"} data-testid="case-toggle">
          {busy === "status" ? <Spinner /> : <Ico name={item.status === "open" ? "check" : "refresh"} />}
          {item.status === "open" ? "Închide cazul" : "Redeschide cazul"}
        </button>
        {kind.subject === "member" ? (
          <button type="button" className="pn-btn-ghost" onClick={() => onMemberCases(item.subjectId)} data-testid="case-member-cases">
            <Ico name="list" />Toate cazurile membrului
          </button>
        ) : null}
        {kind.subject === "member" ? (
          <Link href={`/comenzi?membru=${item.subjectId}`} className="pn-btn-ghost" data-testid="case-command">
            <Ico name="slash" />Dă o comandă
          </Link>
        ) : null}
        <button type="button" className="pn-btn-ghost" onClick={() => void copyLink()}><Ico name="send" />{copied ? "Link copiat" : "Copiază linkul"}</button>
      </div>
      <p className="pn-fh pn-sheet-fine">Setările cazurilor (cât se păstrează, ce poate face staff-ul) sunt la <Link href="/jurnale/cazuri">Cazuri și jurnale</Link>.</p>
    </>
  );
}
