/**
 * Modulele paginii Personalizare mesaje: catalogul, textele jurnalelor și
 * anunțul alianței. Logica e în messages-model.ts.
 */
import React, { useId, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import { Fld, Ico, Note, SectionCard, cx, type IconName } from "./fields";
import {
  ALLIANCE_VARIABLES, DEFAULT_ALLIANCE, MAX_ALLIANCE, MAX_LOG_DESCRIPTION, MAX_LOG_TITLE, MESSAGES_MODULES, allianceTemplateOf,
  customLogCount, insertVariable, isCustomLog, logGroups, logTemplate, logVariables, messageCatalog, previewAlliance, previewLog,
  withLogTemplate, type LogEntry, type MessagesModuleId,
} from "./messages-model";

export const MESSAGES_ICONS: Record<MessagesModuleId, IconName> = { catalog: "list", logs: "scroll", alliance: "quill" };

const MODULE = Object.fromEntries(MESSAGES_MODULES.map((module) => [module.id, module])) as Record<MessagesModuleId, (typeof MESSAGES_MODULES)[number]>;

function ModuleHead({ id }: { id: MessagesModuleId }) {
  const module = MODULE[id];
  return (
    <header className="pn-mod-h">
      <span className="pn-mod-ic" aria-hidden="true"><Ico name={MESSAGES_ICONS[id]} /></span>
      <div className="pn-mod-t">
        <h2>{module.title}</h2>
        <p>{module.description}</p>
      </div>
    </header>
  );
}

/** Variable chips that drop {variable} where the cursor was in the last field used. */
function VariableChips({ variables, onInsert }: { variables: readonly string[]; onInsert: (variable: string) => void }) {
  return (
    <div className="pn-vars" role="group" aria-label="Variabile">
      {variables.map((variable) => (
        <button
          key={variable} type="button" className="pn-var" aria-label={`Inserează {${variable}}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(variable)}
        >{`{${variable}}`}</button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export function CatalogModule({ bot }: { bot: any }) {
  const { config } = usePanel();
  const entries = messageCatalog(config, bot);
  const groups = [...new Set(entries.map((entry) => entry.group))];
  return (
    <section className="pn-mod is-on" data-testid="module-catalog">
      <ModuleHead id="catalog" />
      {groups.map((group) => (
        <SectionCard key={group} title={group}>
          <ul className="pn-cat">
            {entries.filter((entry) => entry.group === group).map((entry) => (
              <li key={entry.id}>
                <Link href={entry.href} className="pn-cat-i" data-testid={`catalog-${entry.id}`}>
                  <span className="pn-cat-t">
                    <b>{entry.title}</b>
                    <small>{entry.text}</small>
                  </span>
                  <span className="pn-cat-m">
                    {entry.on === null ? null : <span className={cx("pn-badge", entry.on ? "is-good" : "is-plain")}>{entry.on ? "Pornit" : "Oprit"}</span>}
                    <span className="pn-cat-p">{entry.place}</span>
                  </span>
                  <span aria-hidden="true" className="pn-cat-a"><Ico name="arrow" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Jurnale                                                             */
/* ------------------------------------------------------------------ */

function LogEditor({ entry }: { entry: LogEntry }) {
  const { config, set } = usePanel();
  const template = logTemplate(config, entry.key);
  const [open, setOpen] = useState(false);
  const id = useId();
  const focused = useRef<{ field: "title" | "description"; at: number | null }>({ field: "description", at: null });
  const preview = previewLog(entry, template);
  const custom = isCustomLog(template);
  const change = (next: Partial<typeof template>) => set(["activityLog"], withLogTemplate(config.activityLog, entry.key, { ...template, ...next }));
  const remember = (field: "title" | "description") => (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focused.current = { field, at: event.currentTarget.selectionStart };
  };
  const insert = (variable: string) => {
    const { field, at } = focused.current;
    const result = insertVariable(template[field], variable, at, field === "title" ? MAX_LOG_TITLE : MAX_LOG_DESCRIPTION);
    focused.current = { field, at: result.cursor };
    change({ [field]: result.text });
  };
  return (
    <div className={cx("pn-rule", open && "is-open", custom && "is-on")} data-testid={`log-${entry.key}`}>
      <div className="pn-rule-h">
        <button type="button" className="pn-rule-x" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(!open)} data-testid={`log-${entry.key}-open`}>
          <span><b>{entry.title}</b><small>{custom ? "Text personalizat" : "Textul de bază"}</small></span>
          <Ico name="down" />
        </button>
      </div>
      {open ? (
        <div className="pn-rule-b" id={`${id}-b`}>
          <div className="pn-log-b">
          <VariableChips variables={logVariables(entry)} onInsert={insert} />
          <Fld wide label="Titlul" htmlFor={`${id}-t`} hint="Gol: titlul de bază.">
            <input
              id={`${id}-t`} className="pn-inp" maxLength={MAX_LOG_TITLE} value={template.title} placeholder={entry.title} data-testid={`log-${entry.key}-title`}
              onChange={(event) => { change({ title: event.target.value }); remember("title")(event); }}
              onSelect={remember("title")} onFocus={remember("title")}
            />
          </Fld>
          <Fld wide label="Descrierea" htmlFor={`${id}-d`} hint="Gol: detaliile primite de la Discord. {details} pune toate detaliile în descriere.">
            <textarea
              id={`${id}-d`} className="pn-inp" rows={4} maxLength={MAX_LOG_DESCRIPTION} value={template.description} data-testid={`log-${entry.key}-description`}
              onChange={(event) => { change({ description: event.target.value }); remember("description")(event); }}
              onSelect={remember("description")} onFocus={remember("description")}
            />
            <span className="pn-count">{template.description.length}/{MAX_LOG_DESCRIPTION}</span>
          </Fld>
          <div className="pn-msg-prev" aria-label="Previzualizare" data-testid={`log-${entry.key}-preview`}>
            <b>{preview.title}</b>
            <p>{preview.description}</p>
          </div>
          {custom ? (
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => change({ title: "", description: "" })} data-testid={`log-${entry.key}-reset`}>
              <Ico name="refresh" />Textul de bază
            </button>
          ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LogsModule() {
  const { config } = usePanel();
  const groups = useMemo(() => logGroups(), []);
  const [active, setActive] = useState(groups[0]!.group);
  const current = groups.find((group) => group.group === active) ?? groups[0]!;
  return (
    <section className="pn-mod is-on" data-testid="module-logs">
      <ModuleHead id="logs" />
      {config.activityLog?.enabled ? null : (
        <Note tone="warn">Jurnalele de activitate sunt oprite, deci textele de aici nu apar încă. Le pornești la <Link href="/jurnale/activitate">Cazuri și jurnale → Activitate</Link>.</Note>
      )}
      <SectionCard title="Jurnale" small={`${customLogCount(config)} personalizate`} testId="logs-list">
        <div className="pn-tabs" role="tablist" aria-label="Categoriile jurnalelor">
          {groups.map((group) => (
            <button
              key={group.group} type="button" role="tab" aria-selected={group.group === active} className={cx("pn-tab", group.group === active && "is-on")}
              onClick={() => setActive(group.group)} data-testid={`logs-tab-${group.group}`}
            >{group.label.replace("Loguri de ", "")}</button>
          ))}
        </div>
        <div className="pn-rules">
          {current.entries.map((entry) => <LogEditor key={entry.key} entry={entry} />)}
        </div>
      </SectionCard>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Anunțul alianței                                                    */
/* ------------------------------------------------------------------ */

export function AllianceModule() {
  const { config, set } = usePanel();
  const raw = typeof config.tickets?.allianceAnnouncementTemplate === "string" ? config.tickets.allianceAnnouncementTemplate : "";
  const shown = allianceTemplateOf(config);
  const id = useId();
  const cursor = useRef<number | null>(null);
  const write = (next: string) => set(["tickets", "allianceAnnouncementTemplate"], next);
  const insert = (variable: string) => {
    // An empty field (the standard text) gets just the variable; "Pornește de la textul de bază" copies the standard text first.
    const base = raw.trim() ? raw : "";
    const result = insertVariable(base, variable, base ? cursor.current : null, MAX_ALLIANCE);
    cursor.current = result.cursor;
    write(result.text);
  };
  const remember = (event: React.SyntheticEvent<HTMLTextAreaElement>) => { cursor.current = event.currentTarget.selectionStart; };
  return (
    <section className="pn-mod is-on" data-testid="module-alliance">
      <ModuleHead id="alliance" />
      <SectionCard title="Textul" small={raw.trim() ? "Text personalizat" : "Textul de bază"} testId="alliance-text">
        <VariableChips variables={ALLIANCE_VARIABLES} onInsert={insert} />
        <Fld wide label="Anunțul" htmlFor={`${id}-a`} hint="Gol: textul de bază (îl vezi în previzualizare). Răspunsurile din cererea de parteneriat intră prin variabile.">
          <textarea
            id={`${id}-a`} className="pn-inp" rows={12} maxLength={MAX_ALLIANCE} value={raw} placeholder={DEFAULT_ALLIANCE} data-testid="alliance-template"
            onChange={(event) => { write(event.target.value); remember(event); }}
            onSelect={remember} onFocus={remember}
          />
          <span className="pn-count">{raw.length}/{MAX_ALLIANCE}</span>
        </Fld>
        <div className="pn-btns">
          {!raw.trim() ? (
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => write(DEFAULT_ALLIANCE)} data-testid="alliance-start">
              <Ico name="quill" />Pornește de la textul de bază
            </button>
          ) : (
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => write("")} data-testid="alliance-reset">
              <Ico name="refresh" />Textul de bază
            </button>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Cum arată" testId="alliance-preview">
        <div className="pn-msg-prev"><p>{previewAlliance(shown)}</p></div>
        <p className="pn-fh">Cu un parteneriat de exemplu. Canalul, forma (text sau embed) și imaginile le alegi la <Link href="/tichete/parteneriate">Tichete → Parteneriate</Link>.</p>
      </SectionCard>
    </section>
  );
}
