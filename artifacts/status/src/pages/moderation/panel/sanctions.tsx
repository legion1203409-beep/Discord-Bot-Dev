/**
 * Modulele paginii Sancțiuni: Escaladare, Comenzi, Roluri și canale, Program.
 * Fiecare scrie direct în secțiunea ei din configurație (escalation,
 * manualTools, roles, channels, timeProfiles); logica e în sanctions-model.ts.
 */
import React, { useEffect, useId, useMemo, useState } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import {
  ChannelField, Fields, Fld, Ico, IdPicker, Note, NoteRow, NumField, NumberBox, SectionCard, Seg, Switch, SwitchField, cx, messageChannelOptions, roleOptions,
  type IconName, type PickerOption,
} from "./fields";
import { MAX_MUTE_MINUTES, MIN_MUTE_MINUTES, isValidInteger, isValidMuteMinutes } from "./model";
import { ModuleNotes, ModuleView } from "./rules";
import {
  CHANNEL_POLICIES, COMMAND_GROUPS, ESCALATION_ACTIONS, LEGACY_ESCALATION_ACTIONS, MAX_ESCALATION_LEVELS, MAX_RESET_DAYS, MAX_VIOLATIONS,
  MIN_RESET_DAYS, MIN_VIOLATIONS, PROFILE_LABEL, ROLE_POLICIES, SANCTIONS_MODULES, SEVERITY_LABEL, SEVERITY_OPTIONS, STAFF_COMMANDS, TIMEZONES,
  evasionSettings, appealSettings, MAX_APPEAL_COOLDOWN_DAYS, MIN_APPEAL_COOLDOWN_DAYS, addEscalationLevel, commandGrants, commandSummary, dayTimeline, describeEscalationAction, enabledCommandCount, enabledProfiles,
  escalationLadder, escalationLevels, formatHourRange, isCommandOn, isValidTimezone, ladderRange, localTime, policyConflicts, policyList,
  removeEscalationLevel, scheduleNow, setCommandGrants, setCommandOn, setEscalationAction, setEscalationMuteMinutes, setEscalationViolations,
  shadowedEscalationLevels, timelineStretches, type CommandDef, type EscalationLevel, type SanctionsModuleId, type ScheduleProfile, type Severity,
} from "./sanctions-model";

const MODULE: Record<SanctionsModuleId, (typeof SANCTIONS_MODULES)[number]> = Object.fromEntries(
  SANCTIONS_MODULES.map((module) => [module.id, module]),
) as Record<SanctionsModuleId, (typeof SANCTIONS_MODULES)[number]>;

/* ------------------------------------------------------------------ */
/* Escaladare                                                          */
/* ------------------------------------------------------------------ */

const STEP_COLOR: Record<string, string> = { warn: "#F5C451", mute: "#4FB6FF", kick: "#FF9F4A", ban: "#FF5F6B", delete: "#FF8A6B", none: "#8E8A84" };

function LevelRows({ levels, onChange }: { levels: EscalationLevel[]; onChange: (next: EscalationLevel[]) => void }) {
  const id = useId();
  const problems = levels.flatMap((level, index) => {
    const list: string[] = [];
    if (!isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS)) list.push(`Treapta ${index + 1}: la ce abatere pornește? Un număr întreg între ${MIN_VIOLATIONS} și ${MAX_VIOLATIONS}.`);
    if (level.muteMinutes !== undefined && !isValidMuteMinutes(level.muteMinutes)) list.push(`Treapta ${index + 1}: minutele de mute sunt între ${MIN_MUTE_MINUTES} și ${MAX_MUTE_MINUTES}.`);
    return list;
  });
  return (
    <div className="pn-rows" role="group" aria-labelledby={`${id}-h`}>
      <span id={`${id}-h`} className="pn-sr">Treptele de escaladare</span>
      <div className="pn-rows-h" aria-hidden="true"><span>La abaterea</span><span>Sancțiune</span><span>Minute de mute</span><span /></div>
      {levels.map((level, index) => {
        const isMute = level.action === "mute";
        const known = ESCALATION_ACTIONS.some(([key]) => key === level.action);
        return (
          <div className="pn-row" key={index} data-testid={`escalation-level-${index + 1}`} style={{ "--ac": STEP_COLOR[level.action] ?? "#8E8A84" } as React.CSSProperties}>
            <div className="pn-cell">
              <span className="pn-cell-l" aria-hidden="true">La abaterea</span>
              <NumberBox
                id={`${id}-v${index}`} value={level.violations} min={MIN_VIOLATIONS} max={MAX_VIOLATIONS} label={`La abaterea, treapta ${index + 1}`}
                invalid={!isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS)} testId={`escalation-level-${index + 1}-violations`}
                onChange={(next) => onChange(setEscalationViolations(levels, index, next))}
              />
            </div>
            <div className="pn-cell">
              <span className="pn-cell-l" aria-hidden="true">Sancțiune</span>
              <select
                className="pn-inp" aria-label={`Sancțiune, treapta ${index + 1}`} value={level.action} data-testid={`escalation-level-${index + 1}-action`}
                onChange={(event) => onChange(setEscalationAction(levels, index, event.target.value))}
              >
                {!known ? <option value={level.action}>{LEGACY_ESCALATION_ACTIONS[level.action] ?? level.action}</option> : null}
                {ESCALATION_ACTIONS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </div>
            <div className={cx("pn-cell", !isMute && "is-dim")} aria-hidden={!isMute || undefined}>
              <span className="pn-cell-l" aria-hidden="true">Minute de mute</span>
              {isMute ? (
                <NumberBox
                  id={`${id}-m${index}`} value={level.muteMinutes} min={MIN_MUTE_MINUTES} max={MAX_MUTE_MINUTES} placeholder="regula" start={10}
                  label={`Minute de mute, treapta ${index + 1}`} invalid={level.muteMinutes !== undefined && !isValidMuteMinutes(level.muteMinutes)}
                  testId={`escalation-level-${index + 1}-minutes`} onChange={(next) => onChange(setEscalationMuteMinutes(levels, index, next))}
                />
              ) : <span className="pn-cell-none">doar la mute</span>}
            </div>
            <button
              type="button" className="pn-rm" aria-label={`Șterge treapta ${index + 1}`} disabled={levels.length <= 1}
              title={levels.length <= 1 ? "Botul are nevoie de cel puțin o treaptă." : undefined}
              onClick={() => onChange(removeEscalationLevel(levels, index))}
            ><Ico name="trash" /></button>
          </div>
        );
      })}
      {levels.length < MAX_ESCALATION_LEVELS ? (
        <button type="button" className="pn-btn-ghost pn-btn-sm pn-add" onClick={() => onChange(addEscalationLevel(levels))} data-testid="escalation-add-level">
          <Ico name="plus" />Adaugă o treaptă
        </button>
      ) : <p className="pn-fh">Ai ajuns la cele patru trepte pe care le are botul.</p>}
      {problems.length ? <div className="pn-err" role="alert">{problems.map((problem) => <p key={problem}>{problem}</p>)}</div> : null}
    </div>
  );
}

function Ladder({ levels }: { levels: EscalationLevel[] }) {
  const ladder = escalationLadder(levels);
  if (!ladder.length) return <p className="pn-fh">Completează la ce abatere pornește fiecare treaptă ca să vezi cum urcă un membru.</p>;
  return (
    <ol className="pn-ladder" aria-label="Treptele, în ordinea în care le aplică botul" data-testid="escalation-ladder">
      {ladder.map((step, position) => (
        <li key={step.index} style={{ "--ac": STEP_COLOR[step.level.action] ?? "#8E8A84", "--h": `${36 + (position * 64) / Math.max(1, ladder.length - 1)}%` } as React.CSSProperties}>
          <span className="pn-ladder-bar" aria-hidden="true" />
          <b>{step.to === null && step.from > 1 ? `De la abaterea ${step.from}` : step.to === null ? "Orice abatere" : step.to === step.from ? `Abaterea ${step.from}` : `Abaterile ${ladderRange(step)}`}</b>
          <span>{describeEscalationAction(step.level)}</span>
        </li>
      ))}
    </ol>
  );
}

export function EscalationModule() {
  const { config, set, update } = usePanel();
  const escalation = config.escalation ?? {};
  const levels = escalationLevels(config);
  const ladder = escalationLadder(levels);
  const shadowed = shadowedEscalationLevels(levels);
  const firstFrom = ladder[0]?.from;
  return (
    <ModuleView module={MODULE.escalation} icon="stairs">
      <ModuleNotes>
        {shadowed.length ? (
          <Note tone="warn">
            {shadowed.map((index) => `Treapta ${index + 1}`).join(", ")} nu se aplică niciodată: o treaptă de mai jos pornește la aceeași abatere și are prioritate.
          </Note>
        ) : null}
      </ModuleNotes>
      <SectionCard title="Trepte" small={`${levels.length} din ${MAX_ESCALATION_LEVELS}`} testId="escalation-levels">
        <Fields>
          <Fld wide hint="La fiecare abatere, botul se uită câte a strâns membrul și aplică treapta atinsă, în locul sancțiunii bifate la regulă. Treptele se citesc după numărul de abateri, nu după ordinea din listă.">
            <LevelRows levels={levels} onChange={(next) => update(["escalation"], (current) => ({ ...(current ?? {}), levels: next }))} />
          </Fld>
          <Fld wide label="Cum urcă un membru" hint={firstFrom !== undefined && firstFrom > 1 ? `Până la abaterea ${firstFrom}, regula aplică ce ai bifat la ea.` : undefined}>
            <Ladder levels={levels} />
          </Fld>
        </Fields>
      </SectionCard>
      <SectionCard title="Resetare">
        <Fields>
          <NumField
            label="Abaterile se uită după" unit="zile" min={MIN_RESET_DAYS} max={MAX_RESET_DAYS} value={escalation.resetAfterDays}
            hint="Dacă un membru nu mai greșește atâtea zile la rând, numărătoarea lui începe din nou de la zero."
            onChange={(next) => set(["escalation", "resetAfterDays"], next)} testId="escalation-reset-days"
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Cum se numără">
        <Fields>
          <NoteRow tone="plain">
            <p>
              Se numără abaterile prinse automat (AutoMod, anti-spam, anti-flood, anti-raid, comportament suspect și Judecătorul AI) care au dus la o acțiune:
              mesaj șters, avertisment, mute, kick sau ban. Un incident se numără o singură dată, chiar dacă botul a șters mesajul și a dat și un avertisment.
              Regulile care doar notează nu adaugă abateri.
            </p>
            <p>
              Treapta atinsă alege sancțiunea pentru regulile care judecă mesaje: AutoMod, anti-spam, anti-flood și Judecătorul AI. Ștergerea mesajului,
              avertismentul în plus și anunțul pentru staff rămân cele bifate la regulă. Regulile pentru editări, raid și comportament suspect își păstrează
              sancțiunea, dar abaterile lor se adună.
            </p>
            <p>Un mute fără minute la treaptă ține cât e bifat la regula care l-a prins (10 minute, dacă acolo nu e ales nimic).</p>
            <p>Comenzile date de staff nu se numără și nu sunt schimbate de escaladare. Se numără doar cât timp escaladarea e pornită.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Comenzi                                                             */
/* ------------------------------------------------------------------ */

function CommandCard({ command, roles }: { command: CommandDef; roles: PickerOption[] | undefined }) {
  const { config, update, isOpen, toggleOpen } = usePanel();
  const titleId = useId();
  const bodyId = useId();
  const on = isCommandOn(config, command.key);
  const openKey = `command.${command.key}`;
  const open = isOpen(openKey);
  return (
    <div className={cx("pn-rule", on && "is-on", open && "is-open")} data-testid={`command-${command.key}`}>
      <div className="pn-rule-h">
        <Switch
          checked={on} label={`/${command.key}`} testId={`command-${command.key}-switch`}
          onChange={(next) => update(["manualTools"], (current) => setCommandOn(current ?? {}, command.key, next))}
        />
        <button type="button" className="pn-rule-x" aria-expanded={open} aria-controls={bodyId} data-testid={`command-${command.key}-open`} onClick={() => toggleOpen(openKey)}>
          <span>
            <b id={titleId} className="pn-cmd"><i aria-hidden="true">/</i>{command.key}</b>
            <small>{commandSummary(config, command)}</small>
          </span>
          <Ico name="down" />
        </button>
      </div>
      <div className="pn-rule-b" id={bodyId} aria-labelledby={titleId} role="group">
        <div inert={!open}>
          <Fields>
            <Fld wide hint={command.description} />
            <IdPicker
              label={`Roluri pentru /${command.key}`} kind="role" testId={`command-${command.key}-roles`} options={roles}
              hint={<>Fără roluri alese, o pot folosi membrii cu permisiunea Discord <strong>{command.permission}</strong>, administratorii și rolurile cu acces la toate comenzile. Rolurile alese aici o primesc în plus.</>}
              selected={commandGrants(config, command.key)}
              onChange={(next) => update(["manualTools"], (current) => setCommandGrants(current ?? {}, command.key, next))}
            >
              {command.inChannel ? (
                <Note tone="plain">Chiar și cu un rol ales aici, membrul are nevoie de {command.permission} în canalul în care folosește comanda.</Note>
              ) : null}
            </IdPicker>
          </Fields>
        </div>
      </div>
    </div>
  );
}

export function CommandsModule() {
  const { config, set, roles } = usePanel();
  const serverRoles = roleOptions(roles);
  const special = policyList(config, { path: ["roles", "specialPermissionRoleIds"] });
  return (
    <ModuleView module={MODULE.commands} icon="slash" independent>
      <SectionCard title="Comenzi" small={`${enabledCommandCount(config)} din ${STAFF_COMMANDS.length} pornite`} testId="staff-commands">
        <p className="pn-fh pn-card-lede">Oprește o comandă și nimeni nu o mai poate folosi, nici administratorii, nici din Discord, nici din site.</p>
        {COMMAND_GROUPS.map(([group, label]) => (
          <div key={group} className="pn-group" role="group" aria-label={label}>
            <h4 className="pn-sub" aria-hidden="true">{label}</h4>
            <div className="pn-rules pn-rules-grid">
              {STAFF_COMMANDS.filter((command) => command.group === group).map((command) => (
                <CommandCard key={command.key} command={command} roles={serverRoles} />
              ))}
            </div>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Acces la toate comenzile">
        <Fields>
          <IdPicker
            label="Roluri cu acces la toate comenzile" kind="role" testId="commands-special-roles" options={serverRoles}
            hint="Membrii cu aceste roluri pot folosi orice comandă pornită, chiar fără permisiunile Discord. Ierarhia rolurilor se verifică în continuare: nimeni nu poate sancționa pe cineva cu un rol mai mare decât al lui."
            selected={special} onChange={(next) => set(["roles", "specialPermissionRoleIds"], next)}
          >
            {special.length ? <Note tone="warn">Rolurile alese aici pot da ban și kick. Alege doar roluri de încredere.</Note> : null}
          </IdPicker>
        </Fields>
      </SectionCard>
      <SectionCard title="Jurnal">
        <Fields>
          <SwitchField
            label="Notează comenzile în jurnalul de audit" testId="commands-log-actions" checked={config.manualTools?.logActions === true}
            hint="Comenzile date de staff, din Discord și din site, apar în Jurnal de audit chiar dacă auditul complet e oprit. Fiecare acțiune primește oricum dosarul ei la Cazuri."
            onChange={(next) => set(["manualTools", "logActions"], next)}
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Bine de știut">
        <Fields>
          <NoteRow tone="plain">
            <p>
              Aceleași comenzi se pot da și din site, la <Link href="/comenzi">Acțiuni manuale</Link>, cu aceleași reguli: comenzile oprite sunt refuzate,
              iar permisiunile și ierarhia se verifică la fel.
            </p>
            <p>/moderare login rămâne mereu disponibilă: deschide autentificarea în panou.</p>
            <p>Dacă botul refuză o comandă (lipsă de permisiune, ierarhie, comandă oprită), spune de ce în răspunsul pe care îl vede doar cel care a dat comanda.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Roluri și canale                                                    */
/* ------------------------------------------------------------------ */

export function PoliciesModule() {
  const { config, set, roles, channels } = usePanel();
  const serverRoles = roleOptions(roles);
  const messageChannels = messageChannelOptions(channels);
  const textChannels = messageChannelOptions(channels, { textOnly: true });
  const name = (kind: "role" | "channel", id: string) => (kind === "role"
    ? `@${roles?.find((role) => role.id === id)?.name ?? id}`
    : `#${channels?.find((channel) => channel.id === id)?.name ?? id}`);
  const conflicts = policyConflicts(config, name);
  return (
    <ModuleView module={MODULE.policies} icon="users">
      <ModuleNotes>{conflicts.map((note) => <Note key={note} tone="warn">{note}</Note>)}</ModuleNotes>
      <SectionCard title="Roluri" small="pe cine moderează botul" testId="policy-roles">
        <Fields>
          {ROLE_POLICIES.map((def) => {
            const selected = policyList(config, def);
            return (
              <IdPicker
                key={def.testId} label={def.label} kind="role" testId={def.testId} hint={def.hint} options={serverRoles}
                selected={selected} onChange={(next) => set([...def.path], next)}
              >
                {def.path[1] === "sanctionableRoleIds" && selected.length ? (
                  <Note tone="warn">Membrii fără niciunul dintre aceste roluri nu mai sunt moderați deloc: botul îi lasă în pace, iar comenzile staff-ului îi refuză.</Note>
                ) : null}
              </IdPicker>
            );
          })}
        </Fields>
      </SectionCard>
      <SectionCard title="Canale" small="unde și cât de strict" testId="policy-channels">
        <Fields>
          {CHANNEL_POLICIES.map((def) => (
            <IdPicker
              key={def.testId} label={def.label} kind="channel" testId={def.testId} hint={def.hint}
              options={def.textOnly ? textChannels : messageChannels}
              selected={policyList(config, def)} onChange={(next) => set([...def.path], next)}
            />
          ))}
          <NoteRow tone="plain">
            Severitatea schimbă pragurile regulilor de mesaje (emoji, majuscule, repetări, flood, mențiuni) și slowmode-ul automat; sancțiunile rămân cele bifate.
            Un canal ales aici are prioritate față de <Link href="/sanctiuni/program">Program</Link>.
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Program                                                             */
/* ------------------------------------------------------------------ */

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function allTimezones(): string[] | undefined {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    return Array.isArray(list) ? list : undefined;
  } catch {
    return undefined;
  }
}

function TimezoneField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const id = useId();
  const all = useMemo(allTimezones, []);
  const common = new Set(TIMEZONES.map(([zone]) => zone));
  const valid = isValidTimezone(value);
  const listed = common.has(value) || Boolean(all?.includes(value));
  return (
    <Fld label="Fusul orar" htmlFor={id} hint="Orele profilurilor sunt citite pe ceasul acestui fus orar, cu tot cu ora de vară.">
      <select id={id} className="pn-inp" value={value} data-testid="schedule-timezone" onChange={(event) => onChange(event.target.value)}>
        {!listed ? <option value={value}>{valid ? value : `${value} (nu este valid)`}</option> : null}
        <optgroup label="Uzuale">
          {TIMEZONES.map(([zone, city]) => <option key={zone} value={zone}>{city === zone ? zone : `${city} · ${zone}`}</option>)}
        </optgroup>
        {all?.length ? (
          <optgroup label="Toate fusurile orare">
            {all.filter((zone) => !common.has(zone)).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </optgroup>
        ) : null}
      </select>
      {!valid ? <p className="pn-err" role="alert">Fusul orar salvat nu este valid; alege unul din listă.</p> : null}
    </Fld>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function HourSelect({ label, value, end, onChange, testId }: { label: string; value: number; end?: boolean; onChange: (next: number) => void; testId: string }) {
  return (
    <label className="pn-hour">
      <span>{label}</span>
      <select className="pn-inp" value={isValidInteger(value, 0, 23) ? value : ""} data-testid={testId} onChange={(event) => onChange(Number(event.target.value))}>
        {!isValidInteger(value, 0, 23) ? <option value="">Alege</option> : null}
        {HOURS.map((hour) => <option key={hour} value={hour}>{pad(hour)}:{end ? "59" : "00"}</option>)}
      </select>
    </label>
  );
}

function ProfileCard({ profile, icon, summary, hint, children }: {
  profile: ScheduleProfile; icon: IconName; summary: string; hint: string; children: React.ReactNode;
}) {
  const { config, set } = usePanel();
  const titleId = useId();
  const on = config.timeProfiles?.[profile]?.enabled === true;
  return (
    <div className={cx("pn-prof", on && "is-on")} role="group" aria-labelledby={titleId} data-testid={`profile-${profile}`}>
      <div className="pn-prof-h">
        <span className="pn-prof-ic" aria-hidden="true"><Ico name={icon} /></span>
        <div className="pn-prof-t">
          <b id={titleId}>{PROFILE_LABEL[profile]}</b>
          <small>{on ? summary : "Oprit"}</small>
        </div>
        <Switch checked={on} label={PROFILE_LABEL[profile]} testId={`profile-${profile}-switch`} onChange={(next) => set(["timeProfiles", profile, "enabled"], next)} />
      </div>
      <p className="pn-fh pn-prof-hint">{hint}</p>
      <div className="pn-prof-b">{children}</div>
    </div>
  );
}

const SEVERITY_TONE: Record<Severity, string> = { hard: "is-hard", normal: "is-normal", soft: "is-soft" };

function DayTimeline({ timeProfiles, weekend, label, now }: { timeProfiles: any; weekend: boolean; label: string; now: { hour: number; minute: number; weekend: boolean } | null }) {
  const stretches = timelineStretches(dayTimeline(timeProfiles, weekend));
  const spoken = stretches.map((stretch) => `${formatHourRange(stretch.from, stretch.to)}: ${stretch.active
    ? `${PROFILE_LABEL[stretch.active.profile]}, ${SEVERITY_LABEL[stretch.active.severity]}`
    : "severitatea fiecărei reguli"}`).join("; ");
  const marker = now && now.weekend === weekend ? ((now.hour * 60 + now.minute) / 1_440) * 100 : null;
  return (
    <div className="pn-tl" data-testid={`timeline-${weekend ? "weekend" : "weekday"}`}>
      <span className="pn-tl-l">{label}</span>
      <div className="pn-tl-bar" role="img" aria-label={`${label}. ${spoken}.`}>
        {stretches.map((stretch) => (
          <i
            key={stretch.from} className={cx("pn-tl-s", stretch.active && SEVERITY_TONE[stretch.active.severity])}
            style={{ "--span": stretch.to - stretch.from + 1 } as React.CSSProperties}
            title={`${formatHourRange(stretch.from, stretch.to)} · ${stretch.active ? `${PROFILE_LABEL[stretch.active.profile]} (${SEVERITY_LABEL[stretch.active.severity]})` : "severitatea regulii"}`}
          />
        ))}
        {marker !== null ? <b className="pn-tl-now" style={{ "--x": `${marker}%` } as React.CSSProperties} aria-hidden="true" /> : null}
      </div>
      <div className="pn-tl-x" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </div>
  );
}

export function ScheduleModule() {
  const { config, set } = usePanel();
  const timeProfiles = config.timeProfiles ?? {};
  const timezone: string = timeProfiles.timezone ?? "UTC";
  const now = useNow();
  const current = scheduleNow(timeProfiles, now);
  const local = isValidTimezone(timezone) ? localTime(timezone, now) : null;
  const night = timeProfiles.strictNight ?? {};
  const day = timeProfiles.softDay ?? {};
  const hoursText = (profile: { startHour?: number; endHour?: number }, fallback: [number, number]) => {
    const start = profile.startHour ?? fallback[0];
    const end = profile.endHour ?? fallback[1];
    return isValidInteger(start, 0, 23) && isValidInteger(end, 0, 23) ? formatHourRange(start, end) : "ore nealese";
  };
  return (
    <ModuleView
      module={MODULE.schedule} icon="clock"
      aside={current ? (
        <div className="pn-now" role="status" data-testid="schedule-now">
          <span>Acum, {current.day} {current.time}</span>
          <b>{current.active ? `${PROFILE_LABEL[current.active.profile]} · ${SEVERITY_LABEL[current.active.severity]}` : "Severitatea fiecărei reguli"}</b>
        </div>
      ) : null}
    >
      <SectionCard title="Ceasul serverului">
        <Fields>
          <TimezoneField value={timezone} onChange={(next) => set(["timeProfiles", "timezone"], next)} />
        </Fields>
      </SectionCard>
      <SectionCard title="Profiluri" small={`${enabledProfiles(timeProfiles).length} din 4 pornite`} testId="schedule-profiles">
        <div className="pn-profs">
          <ProfileCard profile="strictNight" icon="moon" summary={`${hoursText(night, [22, 7])} · Strictă`} hint="Între aceste ore, regulile de mesaje sunt pe Strictă: praguri cu 25% mai mici.">
            <HourSelect label="De la" value={night.startHour ?? 22} onChange={(next) => set(["timeProfiles", "strictNight", "startHour"], next)} testId="schedule-strictNight-start" />
            <HourSelect label="Până la" value={night.endHour ?? 7} end onChange={(next) => set(["timeProfiles", "strictNight", "endHour"], next)} testId="schedule-strictNight-end" />
          </ProfileCard>
          <ProfileCard profile="softDay" icon="sun" summary={`${hoursText(day, [8, 21])} · Blândă`} hint="Între aceste ore, regulile de mesaje sunt pe Blândă: praguri cu 50% mai mari. În weekend, dacă e pornit, contează weekendul.">
            <HourSelect label="De la" value={day.startHour ?? 8} onChange={(next) => set(["timeProfiles", "softDay", "startHour"], next)} testId="schedule-softDay-start" />
            <HourSelect label="Până la" value={day.endHour ?? 21} end onChange={(next) => set(["timeProfiles", "softDay", "endHour"], next)} testId="schedule-softDay-end" />
          </ProfileCard>
          <ProfileCard profile="weekend" icon="calendar" summary={`Sâmbăta și duminica · ${SEVERITY_LABEL[(timeProfiles.weekend?.severity as Severity) ?? "normal"] ?? "Normală"}`} hint="Sâmbăta și duminica, în afara nopții stricte, regulile de mesaje au severitatea aleasă aici.">
            <Seg
              label="Severitate în weekend" testId="schedule-weekend-severity" value={timeProfiles.weekend?.severity ?? "normal"} options={SEVERITY_OPTIONS}
              onChange={(next) => set(["timeProfiles", "weekend", "severity"], next)}
            />
          </ProfileCard>
          <ProfileCard profile="majorEvent" icon="star" summary={`La orice oră · ${SEVERITY_LABEL[(timeProfiles.majorEvent?.severity as Severity) ?? "hard"] ?? "Strictă"}`} hint="Pornește-l pe durata unui eveniment mare (un turneu, o lansare) și oprește-l după. Cât e pornit, are prioritate față de celelalte profiluri.">
            <Seg
              label="Severitate în timpul evenimentului" testId="schedule-majorEvent-severity" value={timeProfiles.majorEvent?.severity ?? "hard"} options={SEVERITY_OPTIONS}
              onChange={(next) => set(["timeProfiles", "majorEvent", "severity"], next)}
            />
          </ProfileCard>
        </div>
      </SectionCard>
      <SectionCard title="O zi pe server" small={isValidTimezone(timezone) ? timezone : undefined} testId="schedule-timelines">
        <div className="pn-tls">
          <DayTimeline timeProfiles={timeProfiles} weekend={false} label="Luni – vineri" now={local} />
          <DayTimeline timeProfiles={timeProfiles} weekend label="Sâmbătă și duminică" now={local} />
          <div className="pn-tl-legend" aria-hidden="true">
            <span className="is-hard">Strictă</span><span className="is-normal">Normală</span><span className="is-soft">Blândă</span><span>Severitatea fiecărei reguli</span>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Bine de știut">
        <Fields>
          <NoteRow tone="plain">
            <p>Ordinea: canalele stricte și blânde de la <Link href="/sanctiuni/roluri-canale">Roluri și canale</Link>, apoi evenimentul major, noaptea strictă, weekendul și ziua blândă. Fără niciun profil activ, fiecare regulă își folosește severitatea ei.</p>
            <p>Profilul activ înlocuiește severitatea aleasă la reguli. Schimbă doar pragurile regulilor de mesaje (emoji, majuscule, repetări, flood, mențiuni) și slowmode-ul automat; sancțiunile rămân cele bifate.</p>
            <p>Orele se iau întregi: „Până la 07:59” înseamnă că ora 7 intră toată în profil.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Contestații                                                         */
/* ------------------------------------------------------------------ */

function AcceptedMessageCard() {
  const { config, set } = usePanel();
  const settings = appealSettings(config);
  const id = useId();
  const fill = (text: string) => text.replaceAll("{guild}", "numele serverului");
  return (
    <SectionCard title="Mesajul când e acceptată" testId="appeals-accepted">
      <Fields>
        <SwitchField
          label="Trimite-i un mesaj privat" testId="appeals-dm" checked={settings.dmOnAccept}
          hint="La Acceptă, botul îi scrie că banul a fost scos, cu butonul spre server. Dacă n-are cum să-i scrie (DM-uri închise, niciun server comun), vede vestea pe pagina de contestație."
          onChange={(next) => set(["appeals", "dmOnAccept"], next)}
        />
        <Fld label="Titlul" htmlFor={`${id}-t`}>
          <input id={`${id}-t`} className="pn-inp" data-testid="appeals-accepted-title" maxLength={200} value={settings.acceptedTitle} onChange={(event) => set(["appeals", "acceptedTitle"], event.target.value)} />
        </Fld>
        <Fld label="Textul" htmlFor={`${id}-m`} hint="{guild} se înlocuiește cu numele serverului. Nota scrisă de staff la Acceptă apare dedesubt.">
          <textarea id={`${id}-m`} className="pn-inp" data-testid="appeals-accepted-message" rows={3} maxLength={1500} value={settings.acceptedMessage} onChange={(event) => set(["appeals", "acceptedMessage"], event.target.value)} />
        </Fld>
        <Fld label="Textul butonului" htmlFor={`${id}-b`}>
          <input id={`${id}-b`} className="pn-inp" data-testid="appeals-accepted-button" maxLength={80} value={settings.acceptedButton} onChange={(event) => set(["appeals", "acceptedButton"], event.target.value)} />
        </Fld>
        <Fld label="Linkul serverului" htmlFor={`${id}-i`} hint="Invitația din butonul mesajului și de pe pagina de contestație. Lasă gol și botul face o invitație de o singură folosire, valabilă 7 zile.">
          <input
            id={`${id}-i`} className="pn-inp" data-testid="appeals-invite" placeholder="https://discord.gg/..." inputMode="url" autoComplete="off"
            value={settings.inviteUrl ?? ""} onChange={(event) => set(["appeals", "inviteUrl"], event.target.value.trim() || null)}
          />
        </Fld>
      </Fields>
      <div className="pn-appeal-dm" aria-label="Previzualizare" data-testid="appeals-preview">
        <b>{fill(settings.acceptedTitle)}</b>
        <p>{fill(settings.acceptedMessage).replace(/\*\*/g, "")}</p>
        <span className="pn-appeal-dm-btn">{settings.acceptedButton}</span>
      </div>
    </SectionCard>
  );
}

export function AppealsModule() {
  const { config, set, channels } = usePanel();
  const settings = appealSettings(config);
  return (
    <ModuleView module={MODULE.appeals} icon="scale" independent>
      <SectionCard title="Cum merge" testId="appeals-how">
        <ol className="pn-fh pn-card-lede" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Cel cu ban deschide pagina <b>/contestatie</b> a site-ului (linkul vine și în mesajul privat al banului, dacă ai mesaje private pornite) și se conectează cu Discord.</li>
          <li>Scrie contestația; botul o postează în canalul de mai jos, cu butoanele Acceptă, Respinge și Cere clarificări.</li>
          <li>Răspunsul apare pe pagină, iar contestația se vede și în Cazuri, la fișa banului.</li>
        </ol>
      </SectionCard>
      <SectionCard title="Setări" testId="appeals-settings">
        <Fields>
          <ChannelField
            label="Canalul staff-ului" selectLabel="Canalul contestațiilor" value={settings.channelId} channels={channels}
            hint="Aici ajung contestațiile. Pune un canal pe care îl văd doar moderatorii; botul trebuie să poată scrie în el."
            onChange={(next) => set(["appeals", "channelId"], next)}
          />
          {settings.enabled && !settings.channelId ? <NoteRow tone="bad" role="alert">Alege canalul, altfel contestațiile nu ajung la nimeni.</NoteRow> : null}
          <SwitchField
            label="Scoate banul când e acceptată" testId="appeals-unban" checked={settings.unbanOnAccept}
            hint="Botul scoate banul singur la Acceptă și trece asta în caz. Dacă e oprit, acceptarea doar se notează, iar banul îl scoți tu."
            onChange={(next) => set(["appeals", "unbanOnAccept"], next)}
          />
          <NumField
            label="Zile până la o contestație nouă" testId="appeals-cooldown" unit="zile" value={settings.cooldownDays}
            min={MIN_APPEAL_COOLDOWN_DAYS} max={MAX_APPEAL_COOLDOWN_DAYS}
            hint="După o respingere, același ban poate fi contestat din nou abia după atâtea zile."
            onChange={(next) => set(["appeals", "cooldownDays"], next)}
          />
        </Fields>
      </SectionCard>
      <AcceptedMessageCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Ocolire ban                                                         */
/* ------------------------------------------------------------------ */

export function EvasionModule() {
  const { config, set, channels } = usePanel();
  const settings = evasionSettings(config);
  return (
    <ModuleView module={MODULE.evasion} icon="users" independent>
      <SectionCard title="Cum merge" testId="evasion-how">
        <ol className="pn-fh pn-card-lede" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>La fiecare ban (dat de bot sau direct din Discord), botul ține minte numele și poza contului.</li>
          <li>Când intră un cont tânăr, îl compară cu banurile recente: nume asemănător (și cu cifre în loc de litere, puncte sau litere dublate) sau exact aceeași poză.</li>
          <li>Dacă seamănă, trimite o alertă cu motivul, plus butoanele <b>Ban</b> și <b>Nu e el</b>. Banul trece prin aceleași verificări ca /ban.</li>
        </ol>
        <Note>Botul nu vede IP-ul sau dispozitivul nimănui, așa că e un semnal, nu o dovadă. Cea mai tare barieră rămâne nivelul de verificare „Highest” din setările serverului (telefon verificat). Vârsta minimă a contului o setezi la Protecție → Anti-raid.</Note>
        <Note>Alertele la intrare cer intenția „Server Members” pornită pentru bot (la fel ca anti-raid).</Note>
      </SectionCard>
      <SectionCard title="Setări" testId="evasion-settings">
        <Fields>
          <ChannelField
            label="Canalul alertelor" selectLabel="Canalul alertelor de ocolire" value={settings.alertChannelId} channels={channels}
            hint="Un canal pe care îl văd doar moderatorii."
            onChange={(next) => set(["banEvasion", "alertChannelId"], next)}
          />
          {settings.enabled && !settings.alertChannelId ? <NoteRow tone="bad" role="alert">Alege canalul, altfel alertele nu ajung la nimeni.</NoteRow> : null}
          <SwitchField label="Compară numele" testId="evasion-name" checked={settings.matchName} onChange={(next) => set(["banEvasion", "matchName"], next)} />
          <SwitchField label="Compară poza de profil" testId="evasion-avatar" checked={settings.matchAvatar} hint="Doar aceeași poză exactă; o poză ușor schimbată nu e recunoscută." onChange={(next) => set(["banEvasion", "matchAvatar"], next)} />
          <NumField
            label="Cât timp după ban" testId="evasion-watch" unit="zile" value={settings.watchDays} min={1} max={365}
            hint="Se compară doar cu banurile din această perioadă."
            onChange={(next) => set(["banEvasion", "watchDays"], next)}
          />
          <NumField
            label="Conturi mai noi de" testId="evasion-age" unit="zile" value={settings.maxAccountAgeDays} min={1} max={3650}
            hint="Conturile mai vechi nu se verifică: cine ocolește banul își face de obicei un cont nou."
            onChange={(next) => set(["banEvasion", "maxAccountAgeDays"], next)}
          />
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

export const SANCTIONS_VIEWS: Record<SanctionsModuleId, () => React.ReactElement> = {
  escalation: EscalationModule,
  commands: CommandsModule,
  policies: PoliciesModule,
  schedule: ScheduleModule,
  appeals: AppealsModule,
  evasion: EvasionModule,
};
