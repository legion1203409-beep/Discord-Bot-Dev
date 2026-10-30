/**
 * Modulele paginii Cazuri și jurnale: Cazuri, Audit și Jurnale de activitate.
 * Fiecare scrie direct în secțiunea ei din configurație (cases, audit,
 * activityLog); logica e în logs-model.ts.
 */
import React, { useId } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import { Fields, Fld, Ico, Note, NoteRow, NumField, SectionCard, Seg, Switch, SwitchField, cx } from "./fields";
import { isValidInteger } from "./model";
import { ModuleNotes, ModuleView, ChannelRow } from "./rules";
import {
  ACTIVITY_CATEGORIES, DETAIL_HINT, DETAIL_LEVELS, LOGS_MODULES, MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, RETENTION_PRESETS, STAFF_RIGHTS,
  categoriesWithoutChannel, categoryChannel, describeRetention, enabledCategoryCount, isCategoryOn, moduleLogDestinations, retentionDays,
  retentionShrinks, staffRight, type ActivityCategory, type DetailLevel, type LogsModuleId,
} from "./logs-model";

const MODULE: Record<LogsModuleId, (typeof LOGS_MODULES)[number]> = Object.fromEntries(
  LOGS_MODULES.map((module) => [module.id, module]),
) as Record<LogsModuleId, (typeof LOGS_MODULES)[number]>;

/** "#name" for a channel the server knows, else its ID. */
function useChannelName() {
  const { channels } = usePanel();
  return (id: string) => {
    const channel = channels?.find((item) => item.id === id);
    return channel ? `#${channel.name}` : `canalul ${id}`;
  };
}

/* ------------------------------------------------------------------ */
/* Cazuri                                                              */
/* ------------------------------------------------------------------ */

export function CasesModule() {
  const { config, saved, set } = usePanel();
  const days = retentionDays(config);
  const shrinks = retentionShrinks(saved, config);
  return (
    <ModuleView module={MODULE.cases} icon="folder" aside={(
      <Link href="/cazuri" className="pn-btn-ghost pn-btn-sm pn-go" data-testid="link-open-cases">Deschide cazurile<Ico name="arrow" /></Link>
    )}>
      <SectionCard title="Păstrare" testId="cases-retention">
        <Fields>
          <Fld
            wide label="Păstrează cazurile"
            hint="Cazurile mai vechi se șterg singure, cu notele și contestațiile lor: la fiecare salvare și când se deschide lista de cazuri."
          >
            <div className="pn-presets" role="group" aria-label="Durate uzuale">
              {RETENTION_PRESETS.map(([value, text]) => (
                <button
                  key={value} type="button" className="pn-preset" aria-pressed={days === value} data-testid={`cases-retention-${value}`}
                  onClick={() => set(["cases", "retentionDays"], value)}
                >{text}</button>
              ))}
            </div>
          </Fld>
          <NumField
            label="Sau un număr exact de zile" unit={isValidInteger(days, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS) ? describeRetention(days!) : "zile"}
            min={MIN_RETENTION_DAYS} max={MAX_RETENTION_DAYS} value={days} testId="cases-retention-days"
            hint="Cel mult 3.650 de zile (10 ani)." onChange={(next) => set(["cases", "retentionDays"], next)}
          />
          {shrinks !== null ? (
            <NoteRow tone="warn" testId="cases-retention-warning">
              La salvare, cazurile mai vechi de {describeRetention(shrinks).toLocaleLowerCase("ro")} se șterg definitiv, cu notele și contestațiile lor.
            </NoteRow>
          ) : null}
        </Fields>
      </SectionCard>
      <SectionCard title="Ce poate face staff-ul" small="proprietarul și administratorii pot oricând" testId="cases-staff">
        <Fields>
          {STAFF_RIGHTS.map((right) => (
            <SwitchField
              key={right.key} label={right.label} hint={right.hint} checked={staffRight(config, right.key)} testId={`cases-${right.key}`}
              onChange={(next) => set(["cases", right.key], next)}
            />
          ))}
          <NoteRow tone="plain">
            Staff-ul înseamnă cei care intră în panou fără să fie proprietarul serverului sau administratori în Discord. Ei văd și deschid oricum cazurile.
          </NoteRow>
        </Fields>
      </SectionCard>
      <SectionCard title="Bine de știut">
        <Fields>
          <NoteRow tone="plain">
            <p>
              Botul face un caz pentru fiecare acțiune, automată sau a staff-ului, cu motivul și dovezile. Cazurile nu se pot opri: cazul e și dovada că
              acțiunea s-a făcut, iar numărul lui apare în răspunsul comenzii.
            </p>
            <p>Cazurile se consultă, se închid și primesc note la <Link href="/cazuri">Cazuri</Link>.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

function ModuleDestinations() {
  const { config } = usePanel();
  const name = useChannelName();
  return (
    <ul className="pn-dests" data-testid="module-log-destinations">
      {moduleLogDestinations(config).map((item) => (
        <li key={item.name} className={cx("pn-dest", item.via === "none" && "is-none")}>
          <Link href={item.route}>{item.name}</Link>
          <Ico name="arrow" />
          <span>
            {item.via === "own" ? <b>{name(item.channelId!)}</b> : null}
            {item.via === "audit" ? <><b>{name(item.channelId!)}</b><small>canalul de audit</small></> : null}
            {item.via === "none" ? <b>nicăieri</b> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AuditModule() {
  const { config, set } = usePanel();
  const audit = config.audit ?? {};
  const level: DetailLevel = audit.detailLevel === "minimal" || audit.detailLevel === "verbose" ? audit.detailLevel : "standard";
  return (
    <ModuleView module={MODULE.audit} icon="scroll" independent>
      <ModuleNotes>
        {audit.enabled && !audit.channelId ? (
          <Note tone="plain">Fără canal, auditul se vede doar în panou, la <Link href="/audit">Jurnal de audit</Link>.</Note>
        ) : null}
      </ModuleNotes>
      <SectionCard title="Detalii">
        <Fields>
          <Seg
            label="Nivel de detaliu" testId="audit-detail-level" hint={DETAIL_HINT[level]}
            value={level} options={DETAIL_LEVELS} onChange={(next) => set(["audit", "detailLevel"], next)}
          />
          {config.activityLog?.enabled ? (
            <NoteRow tone="plain">Cât timp jurnalele de activitate sunt pornite, evenimentele se păstrează cu toate detaliile, oricare ar fi nivelul ales.</NoteRow>
          ) : null}
        </Fields>
      </SectionCard>
      <SectionCard title="Canalul de audit">
        <Fields>
          <ChannelRow
            label="Canal de audit" destination="audit.channelId" path={["audit", "channelId"]}
            hint="Aici apar evenimentele de moderare cât timp auditul e pornit, mesajele modulelor fără canal propriu și anunțul când pornești un modul din panou."
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Unde scrie fiecare modul" small="ce găsește și ce face" testId="audit-destinations">
        <Fields>
          <Fld wide hint="Un modul fără canalul lui scrie în canalul de audit, dar doar cât timp auditul e pornit. Canalul fiecărui modul se alege în pagina lui.">
            <ModuleDestinations />
          </Fld>
        </Fields>
      </SectionCard>
      <SectionCard title="Bine de știut">
        <Fields>
          <NoteRow tone="plain">
            <p>
              În panou, la <Link href="/audit">Jurnal de audit</Link>, evenimentele rămân fără textul mesajelor și le văd doar proprietarul și administratorii.
            </p>
            <p>
              Comenzile staff-ului pot fi notate în audit și cu auditul oprit, din <Link href="/sanctiuni/comenzi">Sancțiuni › Comenzi</Link>.
            </p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Jurnale de activitate                                               */
/* ------------------------------------------------------------------ */

function CategoryCard({ categoryKey, label, hint }: { categoryKey: ActivityCategory; label: string; hint: string }) {
  const { config, set, isOpen, toggleOpen } = usePanel();
  const name = useChannelName();
  const titleId = useId();
  const bodyId = useId();
  const on = isCategoryOn(config, categoryKey);
  const channelId = categoryChannel(config, categoryKey);
  const openKey = `activity.${categoryKey}`;
  const open = isOpen(openKey);
  const logsOn = config.activityLog?.enabled === true;
  const summary = !on ? "Oprită" : channelId ? name(channelId) : logsOn ? "Canalul se creează la salvare" : "Fără canal încă";
  return (
    <div className={cx("pn-rule", on && "is-on", open && "is-open")} data-testid={`activity-${categoryKey}`}>
      <div className="pn-rule-h">
        <Switch checked={on} label={label} testId={`activity-${categoryKey}-switch`} onChange={(next) => set(["activityLog", "categories", categoryKey], next)} />
        <button type="button" className="pn-rule-x" aria-expanded={open} aria-controls={bodyId} data-testid={`activity-${categoryKey}-open`} onClick={() => toggleOpen(openKey)}>
          <span>
            <b id={titleId}>{label}</b>
            <small>{summary}</small>
          </span>
          <Ico name="down" />
        </button>
      </div>
      <div className="pn-rule-b" id={bodyId} aria-labelledby={titleId} role="group">
        <div inert={!open}>
          <Fields>
            <Fld wide hint={hint} />
            <ChannelRow
              label={label} destination={`activityLog.${categoryKey}`} path={["activityLog", "channelIds", categoryKey]}
              hint="Gol: botul creează un canal privat la salvare, în categoria jurnalelor. „Creează” îl face chiar acum."
            />
          </Fields>
        </div>
      </div>
    </div>
  );
}

export function ActivityModule() {
  const { config, capabilities } = usePanel();
  const name = useChannelName();
  const log = config.activityLog ?? {};
  const missing = categoriesWithoutChannel(config);
  const cannotCreate = capabilities && (capabilities.online === false || capabilities.canManageChannels === false || capabilities.canManageRoles === false);
  const labelOf = (key: ActivityCategory) => ACTIVITY_CATEGORIES.find((category) => category.key === key)!.label;
  return (
    <ModuleView module={MODULE.activity} icon="list" independent>
      <ModuleNotes>
        {log.enabled && enabledCategoryCount(config) === 0 ? (
          <Note tone="warn">Alege cel puțin o categorie; fără ele, jurnalele nu pot fi pornite.</Note>
        ) : null}
        {log.enabled && missing.length > 0 && enabledCategoryCount(config) > 0 ? (
          <Note tone="plain" testId="activity-pending">
            La salvare, botul creează canalele private pentru: {missing.map(labelOf).join(", ")}.
          </Note>
        ) : null}
        {log.enabled && cannotCreate ? (
          <Note tone="warn">
            {capabilities?.online === false
              ? "Botul e offline acum; jurnalele nu pot fi pornite până nu revine."
              : "Botul are nevoie de Manage Channels și Manage Roles ca să creeze canalele private ale jurnalelor."}
          </Note>
        ) : null}
      </ModuleNotes>
      <SectionCard title="Categorii" small={`${enabledCategoryCount(config)} din ${ACTIVITY_CATEGORIES.length} pornite`} testId="activity-categories">
        <div className="pn-rules pn-rules-grid">
          {ACTIVITY_CATEGORIES.map((category) => (
            <CategoryCard key={category.key} categoryKey={category.key} label={category.label} hint={category.hint} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Canalele private">
        <Fields>
          <NoteRow tone="plain">
            <p>
              Când salvezi jurnalele pornite, botul creează (sau refolosește) o categorie privată și câte un canal pentru fiecare categorie pornită care nu are
              canal. Accesul îl dai rolurilor direct din Discord.
            </p>
            <p data-testid="activity-category-status">
              {log.categoryId ? <>Categoria jurnalelor: <b>{name(log.categoryId).replace(/^#/, "")}</b>.</> : "Categoria jurnalelor se creează la prima salvare cu jurnalele pornite."}
            </p>
            <p>Oprirea jurnalelor oprește doar mesajele noi; canalele și ce s-a scris în ele rămân.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
      <SectionCard title="Textele jurnalelor">
        <Fields>
          <NoteRow tone="plain">
            <p>Titlul și textul fiecărui jurnal (de exemplu „Membru nou” sau „Mesaj șters”) se schimbă la <Link href="/config/mesaje">Personalizare mesaje</Link>.</p>
            <p>Textul mesajelor modificate sau șterse apare doar în canalul din Discord; în panou rămâne doar faptul că s-a întâmplat.</p>
          </NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

export const LOGS_VIEWS: Record<LogsModuleId, () => React.ReactElement> = {
  cases: CasesModule,
  audit: AuditModule,
  activity: ActivityModule,
};
