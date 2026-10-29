/**
 * Piesele comune ale modulelor: capul unui modul cu comutatorul lui, cardul
 * unei reguli (pornită/oprită, praguri, severitate, ce face botul) și câteva
 * rânduri folosite peste tot (canal de jurnal, mesajele botului).
 */
import React, { useId } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import { ActionTicks, ChannelField, Fields, Fld, Ico, Note, NoteRow, NumField, SectionCard, Seg, Switch, cx, type IconName } from "./fields";
import {
  actionsText, enabledRuleCount, getAt, isModuleEnabled, moduleStatus, readThreshold, readTicks, ruleSummary,
  staffAlertProblems, thresholdFields, withTickFields, writeThreshold, type ModuleDef, type Path, type RuleDef, type RuleLike,
} from "./model";

export const SEVERITIES = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]] as const;
const SEVERITY_HINT: Record<"thresholds" | "slowmode", string> = {
  thresholds: "Blândă ridică pragurile cu 50%, Strictă le coboară cu 25%.",
  slowmode: "Regula nu are un prag de ajustat; severitatea schimbă doar încetinirea automată din canalele alese la Politici (Strictă: 10 secunde între mesaje, altfel 5).",
};

/** Explains why a ticked staff alert would not reach anyone yet. */
export function StaffAlertNote({ channelId }: { channelId: string | null | undefined }) {
  const { config } = usePanel();
  const problems = staffAlertProblems(config, channelId);
  if (!problems.length) return null;
  const rolesMissing = !Array.isArray(config?.permissions?.staffRoleIds) || config.permissions.staffRoleIds.length === 0;
  return (
    <Note tone="warn">
      {problems.map((problem) => <p key={problem}>{problem}</p>)}
      {rolesMissing ? <p><Link href="/config/avansat">Alege rolurile de staff în Setări avansate</Link></p> : null}
    </Note>
  );
}

/** A channel row whose channel can also be created by the bot. */
export function ChannelRow({ label, hint, destination, path }: { label: string; hint?: string; destination: string; path: Path }) {
  const { config, set, channels, createChannel, creating, createDisabled } = usePanel();
  return (
    <ChannelField
      label={label} hint={hint} value={getAt(config, path) ?? null} channels={channels}
      onChange={(next) => set(path, next)}
      onCreate={createChannel ? () => createChannel(destination, path) : undefined}
      creating={creating === destination} createDisabled={createDisabled || (creating !== null && creating !== destination)}
    />
  );
}

/** The card of one rule: its switch and summary, and when opened, everything it can be set to. */
export function RuleCard({ module, def, channelId, moduleDefaults, children }: {
  module: ModuleDef;
  def: RuleDef;
  /** The module's log or alert channel, where a staff alert is posted. */
  channelId: string | null | undefined;
  /** The module-wide choice an event rule follows when it has no warning or sanction of its own. */
  moduleDefaults?: RuleLike | null;
  /** Fields of this rule shown before the common ones (word lists, link categories …). */
  children?: React.ReactNode;
}) {
  const { config, set, update, isOpen, toggleOpen } = usePanel();
  const titleId = useId();
  const bodyId = useId();
  const rule: RuleLike = getAt(config, def.path) ?? {};
  const key = `${module.id}.${def.id}`;
  const open = isOpen(key);
  const on = rule.enabled === true;
  const ticks = readTicks(rule, def.kind);
  const follows = Boolean(moduleDefaults) && def.kind === "event";
  const testBase = `rule-${module.id}-${def.id}`;
  return (
    <div className={cx("pn-rule", on && "is-on", open && "is-open")} data-testid={testBase}>
      <div className="pn-rule-h">
        <Switch
          checked={on} label={def.switchLabel ?? def.title} testId={def.id === "scamFilter" ? "toggle-anti-scam" : `${testBase}-switch`}
          onChange={(next) => set([...def.path, "enabled"], next)}
        />
        <button type="button" className="pn-rule-x" aria-expanded={open} aria-controls={bodyId} data-testid={`${testBase}-open`} onClick={() => toggleOpen(key)}>
          <span>
            <b id={titleId}>{def.title}</b>
            <small>{ruleSummary(def, rule, moduleDefaults)}</small>
          </span>
          <Ico name="down" />
        </button>
      </div>
      <div className="pn-rule-b" id={bodyId} aria-labelledby={titleId} role="group">
        <div inert={!open}>
          <Fields>
            <Fld wide hint={def.hint} />
            {children}
            {def.severity !== "none" ? (
              <Seg
                label="Severitate" hint={SEVERITY_HINT[def.severity]} value={rule.severity ?? "normal"} options={SEVERITIES}
                onChange={(next) => set([...def.path, "severity"], next)} testId={`${testBase}-severity`}
              />
            ) : null}
            {thresholdFields(def.thresholds).map((field) => (
              <NumField
                key={field.key} label={field.label} hint={field.help} min={field.min} max={field.max}
                value={readThreshold(rule, field)} validate={field.groupKeys.map((name) => rule.thresholds?.[name])}
                onChange={(value) => update(def.path, (current) => writeThreshold(current ?? {}, field, value))}
                testId={`${testBase}-${field.key}`}
              />
            ))}
            <ActionTicks
              rule={rule} kind={def.kind} only={def.onlyActions} testId={`actions-${def.title}`}
              hint={def.onlyActions?.length === 1 && def.onlyActions[0] === "alert"
                ? "Intrările și ieșirile nu au un autor care poate fi sancționat, așa că regula poate doar să anunțe staff-ul."
                : follows
                  ? "Dacă nu bifezi aici un avertisment sau o sancțiune, regula folosește acțiunile modulului de mai sus. „Anunță staff-ul” se aplică dacă e bifat aici sau la modul."
                  : undefined}
              summary={follows ? actionsText(rule, def.kind, { only: def.onlyActions, moduleDefaults }) : undefined}
              notes={ticks.alert ? <StaffAlertNote channelId={channelId} /> : null}
              onChange={(next) => update(def.path, (current) => withTickFields(current ?? {}, next))}
            />
          </Fields>
        </div>
      </div>
    </div>
  );
}

/** A card holding a module's rules, with how many of them are on. */
export function RulesCard({ module, children }: { module: ModuleDef; children: React.ReactNode }) {
  const { config } = usePanel();
  return (
    <SectionCard title={module.rulesTitle ?? "Reguli"} small={`${enabledRuleCount(config, module)} din ${module.rules.length} pornite`} testId={`rules-${module.id}`}>
      <div className="pn-rules">{children}</div>
    </SectionCard>
  );
}

/** Header of a module (icon, title, main switch) and its body. */
export function ModuleView({ module, icon, children }: { module: ModuleDef; icon: IconName; children: React.ReactNode }) {
  const { config, set } = usePanel();
  const headingId = useId();
  const on = isModuleEnabled(config, module);
  const status = moduleStatus(config, module);
  return (
    <section className={cx("pn-mod", on && "is-on")} aria-labelledby={headingId} data-testid={`module-${module.id}`}>
      <header className="pn-mod-h">
        <span className="pn-mod-ic" aria-hidden="true"><Ico name={icon} /></span>
        <div className="pn-mod-t">
          <h2 id={headingId}>{module.title}</h2>
          <p>{module.description}</p>
        </div>
        <div className="pn-mod-pw">
          <span aria-hidden="true">{on ? "Pornit" : "Oprit"}</span>
          <Switch large checked={on} label={module.switchLabel} testId={`module-${module.id}-switch`} onChange={(next) => set([module.configKey, "enabled"], next)} />
        </div>
      </header>
      {!on ? (
        <div className="pn-mod-off">
          <Ico name="power" />
          <span>Modulul e oprit. Setările de mai jos rămân salvate pentru când îl pornești.</span>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => set([module.configKey, "enabled"], true)}>Pornește modulul</button>
        </div>
      ) : null}
      {status === "paused" ? (
        <div className="pn-mod-off" role="status">
          <Ico name="alert" />
          <span>Modulul e pornit, dar Protecția serverului este oprită, așa că nu rulează.</span>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => set(["protection", "enabled"], true)}>Pornește protecția</button>
        </div>
      ) : null}
      <div className="pn-mod-body">{children}</div>
    </section>
  );
}

/** Where the texts the bot sends are edited today. */
export function MessagesCard() {
  return (
    <SectionCard title="Mesajele botului" small="pentru toate modulele">
      <Fields>
        <NoteRow tone="plain">
          <p>
            Titlul și textul notificărilor de moderare se schimbă acum din{" "}
            <Link href="/config/mesaje">Personalizare mesaje</Link>, pentru toate modulele deodată.
          </p>
          <p>Textele separate pentru fiecare modul vor veni într-o etapă următoare.</p>
        </NoteRow>
      </Fields>
    </SectionCard>
  );
}

/** Module-wide notes stacked at the top of a module. */
export function ModuleNotes({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className="pn-notes">{items}</div>;
}
