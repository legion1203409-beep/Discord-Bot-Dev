/**
 * Pagina Comenzi (/comenzi): staff-ul dă o comandă de moderare din panou, ca în
 * Discord. Alegi comanda în stânga, completezi ce cere, vezi propoziția cu ce se
 * va întâmpla și confirmi. Rezultatul duce la cazul deschis. Comanda aleasă e în
 * adresă (?comanda=mute), iar ?membru=<id> completează membrul.
 */
import "./panel.css";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ApiError, useActiveGuild, useManualAction, useModerationConfig, useModerationMetadata, type BulkRoleGrantPreview,
} from "../../../hooks/use-moderation-api";
import { CountSummary, PageHead } from "./draft";
import { Fld, Fields, Ico, Note, NoteRow, NumField, Spinner, cx, messageChannelOptions, roleOptions } from "./fields";
import { countLabel, isDiscordId } from "./model";
import {
  COMMAND_GROUP_LABELS, MAX_SLOWMODE_SECONDS, MAX_TIMEOUT_MINUTES, PANEL_COMMANDS, PURGE_PRESETS, SLOWMODE_PRESETS, TIMEOUT_PRESETS,
  actionErrorText, availableCommands, commandBlock, commandPayload, commandProblem, commandSentence, emptyCommandForm, formMemberId,
  minutesText, panelCommand, secondsText, type CommandForm, type PanelCommand,
} from "./commands-model";
import { commandSummary, STAFF_COMMANDS } from "./sanctions-model";
import { actionKind, caseSource, fullTime, relativeTime } from "./records-model";
import { errorText, useCaseList, usePeople, type Person } from "./records-data";
import { PersonLabel } from "./records-ui";

type Result = { summary: string; caseId?: string | null };

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase("ro") + text.slice(1);
type Attempt = { payload: Record<string, unknown>; preview?: BulkRoleGrantPreview };

export function CommandsPanelPage() {
  const { guildId, guilds } = useActiveGuild();
  const config = useModerationConfig(guildId);
  const metadata = useModerationMetadata(guildId);
  const guildName = guilds.find((guild) => guild.id === guildId)?.name || "Serverul selectat";
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const command = panelCommand(params.get("comanda"));
  const [form, setForm] = useState<CommandForm>(() => ({ ...emptyCommandForm(command.key), member: params.get("membru") ?? "" }));
  const [recentKey, setRecentKey] = useState(0);
  useEffect(() => { setForm((current) => ({ ...current, type: command.key })); }, [command.key]);
  // Another server: nothing typed for the last one carries over.
  const shownGuild = useRef(guildId);
  useEffect(() => {
    if (shownGuild.current === guildId) return;
    shownGuild.current = guildId;
    setForm({ ...emptyCommandForm(command.key), member: "" });
  }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!guildId) {
    return <div className="pn"><div className="pn-fail" role="status"><p>Alege un server ca să dai comenzi.</p></div></div>;
  }
  const cfg = config.data ?? null;
  const pick = (key: string) => {
    const query = new URLSearchParams(search);
    query.set("comanda", key);
    setLocation(`${location.split("?")[0]}?${query}`, { replace: true });
  };

  return (
    <div className="pn" data-testid="commands-page" style={{ "--tc": "#FF8A4C" } as React.CSSProperties}>
      <PageHead
        icon={<Ico name="slash" />} guildName={guildName} title="Comenzi"
        lede="Dă o sancțiune sau schimbă un canal direct din panou. Merge ca în Discord: aceleași reguli, cu contul tău, și totul intră în cazuri și în audit."
        summary={cfg ? <CountSummary on={availableCommands(cfg)} total={PANEL_COMMANDS.length} label={<>comenzi<br />pornite</>} testId="commands-summary" /> : null}
      />
      {cfg && !cfg.manualTools?.enabled ? (
        <div className="pn-rv" style={{ "--i": 3 } as React.CSSProperties}>
          <Note tone="warn" role="alert" testId="commands-off">
            Comenzile staff-ului sunt oprite, deci botul refuză orice comandă, din Discord sau de aici. Le pornești la <Link href="/sanctiuni/comenzi">Sancțiuni → Comenzi</Link>.
          </Note>
        </div>
      ) : null}
      <div className="pn-grid">
        <nav className="pn-nav pn-cmd-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Comenzile">
          {(Object.keys(COMMAND_GROUP_LABELS) as PanelCommand["group"][]).map((group) => (
            <React.Fragment key={group}>
              <p className="pn-cmd-g">{COMMAND_GROUP_LABELS[group]}</p>
              {PANEL_COMMANDS.filter((item) => item.group === group).map((item) => {
                const blocked = cfg ? commandBlock(cfg, item.key) : null;
                return (
                  <button
                    key={item.key} type="button" className={cx("pn-nav-i", blocked && "is-off")} onClick={() => pick(item.key)}
                    aria-current={item.key === command.key ? "page" : undefined} data-testid={`pick-command-${item.key}`}
                  >
                    <span className={cx("pn-nav-ic pn-rec-kind", `is-${item.tone}`)} aria-hidden="true"><Ico name={item.icon} /></span>
                    <span className="pn-nav-t"><b>{item.label}</b><small>{blocked ? "oprită" : `/${item.key}`}</small></span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          <Link href="/sanctiuni/comenzi" className="pn-nav-i pn-nav-out" data-testid="nav-commands-settings">
            <span className="pn-nav-ic" aria-hidden="true"><Ico name="filter" /></span>
            <span className="pn-nav-t"><b>Cine le poate folosi</b><small>Sancțiuni → Comenzi</small></span>
            <Ico name="arrow" />
          </Link>
        </nav>
        <div className="pn-main">
          <CommandModule
            key={`${guildId}|${command.key}`} guildId={guildId} command={command} form={form} setForm={setForm} config={cfg}
            channels={metadata.data?.channels} roles={metadata.data?.roles} onDone={() => setRecentKey((value) => value + 1)}
          />
          <RecentCases guildId={guildId} refreshKey={recentKey} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comanda aleasă                                                      */
/* ------------------------------------------------------------------ */

function CommandModule({ guildId, command, form, setForm, config, channels, roles, onDone }: {
  guildId: string; command: PanelCommand; form: CommandForm; setForm: React.Dispatch<React.SetStateAction<CommandForm>>; config: any;
  channels: Array<{ id: string; name: string; type: number | string }> | undefined; roles: Array<{ id: string; name: string; managed?: boolean; position?: number }> | undefined;
  onDone: () => void;
}) {
  const headingId = useId();
  const { execute, previewBulkRoleGrant } = useManualAction(guildId);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<"edit" | "confirm" | "sending">("edit");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ text: string; toAudit: boolean; retry: Attempt | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const blocked = config ? commandBlock(config, command.key) : null;
  const staff = STAFF_COMMANDS.find((item) => item.key === command.key)!;
  const memberId = command.needs === "member" ? formMemberId(form) : null;
  const person = usePeople(guildId, memberId ? [memberId] : []);
  const set = <K extends keyof CommandForm>(key: K, value: CommandForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPhase("edit");
    setProblem(null);
  };
  const channelName = (id: string) => {
    const channel = channels?.find((item) => item.id === id);
    return channel ? `#${channel.name}` : null;
  };
  const roleName = (id: string) => {
    const role = roles?.find((item) => item.id === id);
    return role ? `rolul @${role.name}` : null;
  };
  const sentence = commandSentence(form, {
    member: memberId ? person(memberId)?.name ?? null : null,
    channel: form.channelId ? channelName(form.channelId) : null,
    role: form.roleId ? roleName(form.roleId) : null,
  });

  const review = async () => {
    setFailure(null);
    setResult(null);
    const issue = commandProblem(form);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    const payload = commandPayload(form);
    if (payload.allMembers) {
      setChecking(true);
      try {
        const preview = await previewBulkRoleGrant(form.roleId);
        if (preview.eligibleCount === 0) {
          setProblem(`Niciun membru nu poate primi rolul: ${countLabel(preview.alreadyAssignedCount, "îl are deja", "îl au deja")}, ${countLabel(preview.skippedCount, "e omis", "sunt omiși")}.`);
          return;
        }
        setAttempt({ payload: { ...payload, previewToken: preview.previewToken }, preview });
        setPhase("confirm");
      } catch (error) {
        setProblem(errorText(error, "Lista membrilor nu a putut fi verificată."));
      } finally {
        setChecking(false);
      }
      return;
    }
    setAttempt({ payload });
    setPhase("confirm");
  };

  const send = async (next: Attempt) => {
    setPhase("sending");
    setFailure(null);
    try {
      const response = await execute(next.payload as Parameters<typeof execute>[0]) as Result | undefined;
      setResult({ summary: response?.summary ?? "Comanda a fost aplicată.", caseId: response?.caseId ?? null });
      // The member stays for the next command; the reason was for this one.
      setForm((current) => ({ ...current, reason: "" }));
      setPhase("edit");
      setAttempt(null);
      onDone();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : null;
      const message = error instanceof Error ? error.message : "";
      const explained = actionErrorText(status, message);
      // The same request keeps its key, so trying it again cannot apply it twice.
      setFailure({ ...explained, retry: explained.toAudit ? null : next });
      setPhase("confirm");
    }
  };

  return (
    <section className="pn-mod is-on pn-cmd-mod" aria-labelledby={headingId} data-testid="command-module">
      <header className="pn-mod-h">
        <span className={cx("pn-mod-ic pn-rec-kind", `is-${command.tone}`)} aria-hidden="true"><Ico name={command.icon} /></span>
        <div className="pn-mod-t">
          <h2 id={headingId}>{command.label}</h2>
          <p>{command.description}</p>
        </div>
        <code className="pn-cmd-key">/{command.key}</code>
      </header>
      <div className="pn-mod-body">
        <p className="pn-cmd-who" data-testid="command-who">
          <Ico name="key" />
          {config ? <span>În Discord: {lowerFirst(commandSummary(config, staff))}.</span> : null}
          <span>Din panou se aplică aceleași reguli, cu contul tău{staff.inChannel ? ", și ai nevoie de permisiune și în canalul ales" : ""}.</span>
        </p>
        {blocked ? (
          <Note tone="warn" testId="command-blocked">
            {blocked} Botul o refuză până o pornești la <Link href="/sanctiuni/comenzi">Sancțiuni → Comenzi</Link>.
          </Note>
        ) : null}

        <form className="pn-cmd-form" onSubmit={(event) => { event.preventDefault(); void review(); }} noValidate>
          <Fields>
            {command.key === "role" ? (
              <Fld label="Cui" labelId="cmd-bulk-l" hint={form.allMembers ? "Toți membrii care pot primi rolul. Boții, cei care îl au deja și cei peste rolul botului sunt omiși." : undefined}>
                <div className="pn-rec-chips" role="radiogroup" aria-labelledby="cmd-bulk-l" data-testid="command-role-scope">
                  <button type="button" role="radio" aria-checked={!form.allMembers} className="pn-rec-chip" onClick={() => set("allMembers", false)}>Unui membru</button>
                  <button type="button" role="radio" aria-checked={form.allMembers} className="pn-rec-chip" onClick={() => set("allMembers", true)}>Tuturor membrilor</button>
                </div>
              </Fld>
            ) : null}
            {command.needs === "member" && !(command.key === "role" && form.allMembers) ? (
              <MemberField value={form.member} onChange={(next) => set("member", next)} person={memberId ? person(memberId) : null} />
            ) : null}
            {command.needs === "channel" ? (
              <PickField
                label="Canalul" selectLabel="Canalul comenzii" idLabel="ID-ul canalului" value={form.channelId} onChange={(next) => set("channelId", next)}
                options={messageChannelOptions(channels as never)?.map((item) => ({ id: item.id, name: `#${item.name}${item.note ? ` (${item.note})` : ""}` }))}
                empty="Alege canalul" testId="command-channel"
              />
            ) : null}
            {command.extra === "role" ? (
              <PickField
                label="Rolul" selectLabel="Rolul de dat" idLabel="ID-ul rolului" value={form.roleId} onChange={(next) => set("roleId", next)}
                options={roleOptions((roles ?? []).filter((role) => role.id !== guildId && !role.managed) as never)?.map((item) => ({ id: item.id, name: `@${item.name}` }))}
                empty="Alege rolul" testId="command-role"
                hint="Doar un rol aflat sub rolul tău și sub al botului, care nu dă permisiuni pe care nu le ai."
              />
            ) : null}
            {command.extra === "duration" ? (
              <PresetNumber
                label="Cât durează" unit="minute" min={1} max={MAX_TIMEOUT_MINUTES} value={form.durationMinutes} presets={TIMEOUT_PRESETS}
                onChange={(next) => set("durationMinutes", next)} describe={(value) => minutesText(value)} testId="command-duration"
              />
            ) : null}
            {command.extra === "slowmode" ? (
              <PresetNumber
                label="Pauza dintre mesaje" unit="secunde" min={0} max={MAX_SLOWMODE_SECONDS} value={form.amount} presets={SLOWMODE_PRESETS}
                onChange={(next) => set("amount", next)} describe={(value) => secondsText(value)} testId="command-slowmode"
              />
            ) : null}
            {command.extra === "purge" ? (
              <PresetNumber
                label="Câte mesaje" unit="mesaje" min={1} max={100} value={form.amount} presets={PURGE_PRESETS.map((value) => [value, String(value)] as const)}
                onChange={(next) => set("amount", next)} describe={(value) => `ultimele ${countLabel(value, "mesaj", "mesaje")}`} testId="command-purge"
                hint="Discord nu lasă botul să șteargă mesaje mai vechi de 14 zile."
              />
            ) : null}
            {command.extra === "nickname" ? (
              <Fld label="Porecla nouă" htmlFor="cmd-nick" hint="Cel mult 32 de caractere.">
                <input id="cmd-nick" className="pn-inp" maxLength={32} value={form.nickname} onChange={(event) => set("nickname", event.target.value)} data-testid="command-nickname" />
              </Fld>
            ) : null}
            <Fld label="Motivul" htmlFor="cmd-reason" wide hint="Opțional. Apare în caz și în audit; la sancțiuni îl vede și membrul, dacă e pornit mesajul în privat.">
              <textarea
                id="cmd-reason" className="pn-inp pn-area" rows={3} maxLength={500} value={form.reason} placeholder="De ce?"
                onChange={(event) => set("reason", event.target.value)} data-testid="command-reason"
              />
              <p className="pn-fh pn-cmd-count">{form.reason.trim().length}/500</p>
            </Fld>
            {problem ? <NoteRow tone="bad" role="alert" testId="command-problem">{problem}</NoteRow> : null}
          </Fields>

          {phase === "edit" ? (
            <div className="pn-cmd-go">
              <button type="submit" className="pn-btn" disabled={checking} data-testid="command-review">
                {checking ? <><Spinner />Se verifică membrii…</> : <><Ico name="arrow" />Continuă</>}
              </button>
            </div>
          ) : null}
        </form>

        {phase !== "edit" && attempt ? (
          <div className={cx("pn-cmd-confirm", command.danger && "is-danger")} role="group" aria-label="Confirmă comanda" data-testid="command-confirm">
            <p className="pn-cmd-ck">Ce se va întâmpla</p>
            <p className="pn-cmd-sentence">{sentence}</p>
            {attempt.preview ? (
              <ul className="pn-cmd-counts" data-testid="command-preview">
                <li><b>{attempt.preview.eligibleCount}</b><span>primesc rolul</span></li>
                <li><b>{attempt.preview.alreadyAssignedCount}</b><span>îl au deja</span></li>
                <li><b>{attempt.preview.skippedCount}</b><span>omiși ({countLabel(attempt.preview.botCount, "bot", "boți")})</span></li>
              </ul>
            ) : null}
            {attempt.payload.reason ? <p className="pn-cmd-reason">Motivul: „{String(attempt.payload.reason)}”</p> : null}
            {attempt.preview ? <p className="pn-fh">Doar membrii de acum. Cine intră după nu primește rolul.</p> : null}
            {failure ? (
              <Note tone="bad" role="alert" testId="command-error">
                {failure.text}{failure.toAudit ? <> <Link href="/audit">Deschide Jurnalul de audit</Link>.</> : null}
              </Note>
            ) : null}
            <div className="pn-cmd-acts">
              <button type="button" className="pn-btn-ghost" onClick={() => { setPhase("edit"); setFailure(null); }} disabled={phase === "sending"} data-testid="command-back">
                Înapoi
              </button>
              {failure?.retry ? (
                <button type="button" className="pn-btn" onClick={() => void send(failure.retry!)} disabled={phase === "sending"} data-testid="command-retry">
                  {phase === "sending" ? <Spinner /> : <Ico name="refresh" />}Reîncearcă aceeași comandă
                </button>
              ) : !failure ? (
                <button
                  type="button" className={cx("pn-btn", command.danger && "pn-ctl-danger-fill")} onClick={() => void send(attempt)}
                  disabled={phase === "sending"} data-testid="command-send" autoFocus
                >
                  {phase === "sending" ? <><Spinner />Se trimite…</> : <><Ico name="send" />{attempt.preview ? `Dă rolul la ${countLabel(attempt.preview.eligibleCount, "membru", "membri")}` : "Confirmă și trimite"}</>}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="pn-cmd-done" role="status" data-testid="command-result">
            <span className="pn-cmd-done-ic" aria-hidden="true"><Ico name="check" /></span>
            <div>
              <b>Gata</b>
              <p>{result.summary}</p>
            </div>
            {result.caseId ? <Link href={`/cazuri?caz=${result.caseId}`} className="pn-btn-ghost pn-btn-sm" data-testid="command-open-case"><Ico name="gavel" />Deschide cazul</Link> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Câmpuri                                                             */
/* ------------------------------------------------------------------ */

function MemberField({ value, onChange, person }: { value: string; onChange: (next: string) => void; person: Person | null }) {
  const id = useId();
  const typedId = value.trim() ? formMemberId({ member: value }) : null;
  return (
    <Fld label="Membrul" htmlFor={id} wide hint="ID-ul, o mențiune <@…> sau linkul profilului. În Discord: clic dreapta pe membru → Copiază ID-ul.">
      <div className="pn-search">
        <Ico name="users" />
        <input
          id={id} className="pn-inp pn-inp-mono" value={value} onChange={(event) => onChange(event.target.value)} placeholder="123456789012345678"
          autoComplete="off" spellCheck={false} data-testid="command-member"
        />
      </div>
      {typedId ? (
        <p className="pn-cmd-member" data-testid="command-member-found">
          {person ? (
            <>
              <PersonLabel id={typedId} person={person} />
              <small>{person.username ? `@${person.username}` : typedId}{person.bot ? " · bot" : ""}{person.inGuild ? "" : " · nu e pe server"}</small>
            </>
          ) : <small>ID {typedId}</small>}
        </p>
      ) : null}
    </Fld>
  );
}

function PickField({ label, selectLabel, idLabel, value, onChange, options, empty, hint, testId }: {
  label: string; selectLabel: string; idLabel: string; value: string; onChange: (next: string) => void;
  options: Array<{ id: string; name: string }> | undefined; empty: string; hint?: string; testId: string;
}) {
  const id = useId();
  const known = options?.some((option) => option.id === value);
  return (
    <Fld label={label} labelId={`${id}-l`} wide hint={hint}>
      <div className="pn-chan">
        <select className="pn-inp" aria-label={selectLabel} value={known ? value : ""} onChange={(event) => onChange(event.target.value)} data-testid={testId}>
          <option value="">{options ? empty : "Lista nu e disponibilă"}</option>
          {(options ?? []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
        <input
          className="pn-inp pn-inp-mono" aria-label={idLabel} value={value} placeholder="sau ID-ul" inputMode="numeric" autoComplete="off"
          onChange={(event) => onChange(event.target.value.trim())} data-testid={`${testId}-id`}
        />
      </div>
      {value && !isDiscordId(value) ? <p className="pn-err" role="alert">Un ID Discord are doar cifre.</p> : null}
    </Fld>
  );
}

function PresetNumber({ label, unit, min, max, value, presets, onChange, describe, hint, testId }: {
  label: string; unit: string; min: number; max: number; value: number | undefined; presets: ReadonlyArray<readonly [number, string]>;
  onChange: (next: number | undefined) => void; describe: (value: number) => string; hint?: string; testId: string;
}) {
  const valid = typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
  return (
    <>
      <Fld label={label} labelId={`${testId}-l`} wide hint={hint}>
        <div className="pn-rec-chips" role="group" aria-labelledby={`${testId}-l`} data-testid={`${testId}-presets`}>
          {presets.map(([preset, text]) => (
            <button key={preset} type="button" className="pn-rec-chip" aria-pressed={value === preset} onClick={() => onChange(preset)}>{text}</button>
          ))}
        </div>
      </Fld>
      <NumField label={`Altă valoare (${unit})`} value={value} min={min} max={max} onChange={onChange} testId={testId} hint={valid ? describe(value) : undefined} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ultimele cazuri                                                     */
/* ------------------------------------------------------------------ */

function RecentCases({ guildId, refreshKey }: { guildId: string; refreshKey: number }) {
  const list = useCaseList(guildId, { status: "all", userId: null, actionType: "all" });
  const items = list.items.slice(0, 5);
  const person = usePeople(guildId, items.flatMap((item) => [item.subjectId, item.actorId ?? ""]).filter(isDiscordId));
  useEffect(() => { if (refreshKey) void list.reload(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="pn-card pn-cmd-recent" aria-label="Ultimele cazuri" data-testid="commands-recent">
      <h3 className="pn-card-t">Ultimele cazuri<small><Link href="/cazuri">Toate cazurile</Link></small></h3>
      {list.loading ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă cazurile…</span></div> : null}
      {!list.loading && list.error && !items.length ? <p className="pn-fh">{errorText(list.error, "Cazurile nu au putut fi încărcate.")}</p> : null}
      {!list.loading && !list.error && !items.length ? <p className="pn-fh">Niciun caz încă.</p> : null}
      {items.length ? (
        <ul className="pn-cmd-rl">
          {items.map((item) => {
            const kind = actionKind(item.actionType);
            const source = caseSource(item);
            return (
              <li key={item.id}>
                <Link href={`/cazuri?caz=${item.id}`} className="pn-cmd-ri">
                  <span className={cx("pn-rec-kind", `is-${kind.tone}`)} aria-hidden="true"><Ico name={kind.icon} /></span>
                  <span className="pn-cmd-rt">
                    <b>{kind.label}</b>
                    {kind.subject === "member" ? <PersonLabel id={item.subjectId} person={person(item.subjectId)} small /> : null}
                  </span>
                  <span className="pn-cmd-rm">
                    {source.automatic ? source.label : person(item.actorId)?.name ?? "staff"} · <time dateTime={item.createdAt} title={fullTime(item.createdAt)}>{relativeTime(item.createdAt)}</time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
