/**
 * Cele cinci module ale grupului Protecție, legate de setările reale ale botului.
 * Fiecare câmp de aici scrie exact în cheia din configurație pe care o citește botul.
 */
import React, { useId } from "react";
import { usePanel } from "./context";
import { ActionTicks, ChannelScope, ChipsField, Fields, Fld, Note, NoteRow, NumField, Pill, SectionCard, Seg, SwitchField } from "./fields";
import { ChannelRow, MessagesCard, ModuleNotes, ModuleView, RuleCard, RulesCard, StaffAlertNote } from "./rules";
import { MODULE_BY_ID, getAt, hasTickedAction, readTicks, withTickFields, type ModuleDef, type RuleDef } from "./model";

const ruleOf = (module: ModuleDef, id: string): RuleDef => {
  const found = module.rules.find((rule) => rule.id === id);
  if (!found) throw new Error(`Regula ${id} lipsește din ${module.id}.`);
  return found;
};

/* ------------------------------------------------------------------ */
/* AutoMod                                                              */
/* ------------------------------------------------------------------ */

const LINK_CATEGORIES = [
  ["discordInvite", "Invitații Discord", "discord.gg și discord.com/invite"],
  ["social", "Rețele sociale", "Facebook, Instagram, TikTok, X, Reddit"],
  ["video", "Video și streaming", "YouTube, Twitch, Kick"],
  ["shortener", "Linkuri scurtate", "bit.ly, tinyurl.com, t.co"],
  ["all", "Toate linkurile", "orice link http(s) sau www și invitațiile Discord"],
] as const;

function LinkCategories() {
  const { config, set } = usePanel();
  const id = useId();
  const chosen = config.autoMod?.forbiddenLinkCategories ?? {};
  return (
    <Fld label="Categorii de linkuri interzise" labelId={`${id}-l`} wide hint="Bifează tipurile de linkuri pe care botul le oprește.">
      <div className="pn-cards" role="group" aria-labelledby={`${id}-l`}>
        {LINK_CATEGORIES.map(([key, label, help]) => (
          <Pill key={key} label={label} checked={Boolean(chosen[key])} testId={`link-category-${key}`}
            onChange={(next) => set(["autoMod", "forbiddenLinkCategories", key], next)}>
            <span className="pn-pill-t">{label}<small>{help}</small></span>
          </Pill>
        ))}
      </div>
    </Fld>
  );
}

export function AutoModModule() {
  const { config, set, channels } = usePanel();
  const module = MODULE_BY_ID.automod;
  const auto = config.autoMod ?? {};
  const log = auto.logChannelId;
  return (
    <ModuleView module={module} icon="filter">
      <ModuleNotes>
        <Note testId="automod-native-note">
          <p>
            <strong>Discord AutoMod nativ:</strong> sincronizarea regulilor compatibile pornește asincron după salvare; confirmarea salvării nu
            garantează aplicarea pe Discord. Nu există un comutator nativ separat.
          </p>
        </Note>
      </ModuleNotes>
      <RulesCard module={module}>
        <RuleCard module={module} def={ruleOf(module, "wordFilter")} channelId={log}>
          <ChipsField
            label="Cuvinte interzise" hint="Un cuvânt sau o expresie; apasă Enter după fiecare. Cel mult 500." testId="input-forbidden-words"
            values={auto.forbiddenWords} onChange={(next) => set(["autoMod", "forbiddenWords"], next)}
          />
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "linkBlock")} channelId={log}>
          <LinkCategories />
          <ChipsField
            label="Linkuri interzise" hint="Un domeniu sau un link; apasă Enter după fiecare. Cel mult 500." placeholder="exemplu.com, apoi Enter" testId="input-forbidden-links"
            values={auto.forbiddenLinks} onChange={(next) => set(["autoMod", "forbiddenLinks"], next)}
          />
          <ChannelScope channels={channels} selected={auto.linkBlock?.channelIds ?? []} onChange={(next) => set(["autoMod", "linkBlock", "channelIds"], next)} />
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "scamFilter")} channelId={log}>
          <ChipsField
            label="Expresii suplimentare de blocat" hint="Opțional: orice mesaj care conține una dintre ele e tratat ca scam." testId="input-anti-scam-phrases"
            values={auto.scamPhrases} onChange={(next) => set(["autoMod", "scamPhrases"], next)}
          />
          <NoteRow tone="plain" testId="text-anti-scam-requirements">
            Rulează numai când Protecția serverului și AutoMod sunt pornite; mesajul găsit se șterge mereu. Mesajele și sancțiunile apar în Cazuri și în Audit.
            Botul are nevoie de Message Content și Manage Messages; mute cere Moderate Members, iar kick cere Kick Members și un rol al botului suficient de sus.
            OCR verifică local cel mult două imagini PNG, JPG, GIF sau WebP de până la 6 MB pe mesaj; textul ilizibil poate scăpa.
          </NoteRow>
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "emojiLimit")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "capsLimit")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "repeatBlock")} channelId={log} />
      </RulesCard>
      <SectionCard title="Jurnal">
        <Fields>
          <ChannelRow
            label="Canal jurnal AutoMod" hint="Aici scrie botul ce a oprit; aici anunță și staff-ul, când e bifat."
            destination="autoMod.logChannelId" path={["autoMod", "logChannelId"]}
          />
        </Fields>
      </SectionCard>
      <MessagesCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Anti-spam                                                            */
/* ------------------------------------------------------------------ */

export function AntiSpamModule() {
  const { config } = usePanel();
  const module = MODULE_BY_ID.antispam;
  const spam = config.antiSpam ?? {};
  const auto = config.autoMod ?? {};
  const log = spam.logChannelId;
  const messageRule = spam.message ?? {};
  return (
    <ModuleView module={module} icon="msgx">
      <RulesCard module={module}>
        <RuleCard module={module} def={ruleOf(module, "message")} channelId={log}>
          {messageRule.enabled && !hasTickedAction(messageRule, "message") ? (
            <NoteRow tone="warn">Fără nicio acțiune bifată, regula nu face nimic: botul nici nu notează spamul de mesaje în jurnal.</NoteRow>
          ) : null}
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "edit")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "delete")} channelId={log}>
          <NoteRow tone="plain">
            Sancțiunile pentru ștergeri au nevoie de „Vezi jurnalul de audit” și de un autor găsit acolo. Pentru ștergeri fără autor verificabil, botul doar
            alertează; un mesaj deja șters nu poate fi șters din nou.
          </NoteRow>
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "mention")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "emoji")} channelId={log}>
          {auto.enabled && auto.emojiLimit?.enabled ? (
            <NoteRow tone="plain">Limita de emoji din AutoMod e pornită și are prioritate: pentru aceeași abatere se aplică o singură acțiune, cea din AutoMod.</NoteRow>
          ) : null}
        </RuleCard>
      </RulesCard>
      <SectionCard title="Jurnal">
        <Fields>
          <ChannelRow
            label="Canal jurnal anti-spam" hint="Aici scrie botul ce a oprit; aici anunță și staff-ul, când e bifat."
            destination="antiSpam.logChannelId" path={["antiSpam", "logChannelId"]}
          />
        </Fields>
      </SectionCard>
      <MessagesCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Anti-flood                                                           */
/* ------------------------------------------------------------------ */

export function AntiFloodModule() {
  const { config } = usePanel();
  const module = MODULE_BY_ID.antiflood;
  const flood = config.antiFlood ?? {};
  const auto = config.autoMod ?? {};
  const log = flood.logChannelId;
  const canAct = module.rules.some((def) => {
    const rule = getAt(config, def.path);
    return rule?.enabled === true && hasTickedAction(rule, def.kind, def.onlyActions);
  });
  return (
    <ModuleView module={module} icon="waves">
      <ModuleNotes>
        {flood.enabled && !canAct ? (
          <Note tone="warn">Nicio regulă Anti-flood nu poate acționa: pornește cel puțin o regulă și bifează ce face botul.</Note>
        ) : null}
      </ModuleNotes>
      <RulesCard module={module}>
        <RuleCard module={module} def={ruleOf(module, "longMessage")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "character")} channelId={log} />
        <RuleCard module={module} def={ruleOf(module, "caps")} channelId={log}>
          {auto.enabled && auto.capsLimit?.enabled ? (
            <NoteRow tone="plain">Limita de majuscule din AutoMod are prioritate față de cea din Anti-flood; pentru aceeași abatere se aplică o singură acțiune.</NoteRow>
          ) : null}
        </RuleCard>
        <RuleCard module={module} def={ruleOf(module, "symbol")} channelId={log} />
      </RulesCard>
      <SectionCard title="Jurnal">
        <Fields>
          <ChannelRow
            label="Canal jurnal Anti-Flood" hint="Aici scrie botul ce a oprit; aici anunță și staff-ul, când e bifat."
            destination="antiFlood.logChannelId" path={["antiFlood", "logChannelId"]}
          />
        </Fields>
      </SectionCard>
      <MessagesCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Anti-raid                                                            */
/* ------------------------------------------------------------------ */

export function AntiRaidModule() {
  const { config, set } = usePanel();
  const module = MODULE_BY_ID.antiraid;
  const raid = config.antiRaid ?? {};
  return (
    <ModuleView module={module} icon="raid">
      <SectionCard title="Detectare">
        <Fields>
          <NumField
            label="Intrări pe minut" min={1} max={10_000} unit="membri" testId="antiraid-joins-per-minute"
            hint="Valoare de rezervă: pragul care contează este „Intrări” din regula de raid de mai jos."
            value={raid.joinsPerMinute} onChange={(next) => set(["antiRaid", "joinsPerMinute"], next)}
          />
          <NumField
            label="Vârsta minimă a contului" min={0} max={3_650} unit="zile" testId="antiraid-account-age"
            hint="Un membru care intră cu un cont mai nou de atât declanșează regula."
            value={raid.accountAgeDays} onChange={(next) => set(["antiRaid", "accountAgeDays"], next)}
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Alertă și blocare">
        <Fields>
          <SwitchField
            label="Blochează serverul (lockdown)" testId="antiraid-lockdown"
            hint="La un raid, botul blochează scrisul în canalele text. Fiecare canal se deblochează cu /unlock."
            checked={raid.lockdown === true} onChange={(next) => set(["antiRaid", "lockdown"], next)}
          />
          <ChannelRow
            label="Canal alerte raid" hint="Aici apare alerta de raid; aici e menționat staff-ul, când e bifat."
            destination="antiRaid.alertChannelId" path={["antiRaid", "alertChannelId"]}
          />
        </Fields>
      </SectionCard>
      <RulesCard module={module}>
        <RuleCard module={module} def={ruleOf(module, "rule")} channelId={raid.alertChannelId} />
      </RulesCard>
      <MessagesCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Comportament suspect                                                 */
/* ------------------------------------------------------------------ */

const SENSITIVITIES = [["low", "Scăzută"], ["medium", "Medie"], ["high", "Ridicată"]] as const;

export function SuspectModule() {
  const { config, set, update } = usePanel();
  const module = MODULE_BY_ID.suspect;
  const watch = config.suspiciousBehavior ?? {};
  const anyRuleOn = module.rules.some((def) => getAt(config, def.path)?.enabled === true);
  return (
    <ModuleView module={module} icon="scan">
      <ModuleNotes>
        {watch.enabled && !anyRuleOn ? (
          <Note tone="warn">Nicio regulă de comportament suspect nu e pornită. Pornește cel puțin una ca să primești alerte.</Note>
        ) : null}
        {watch.enabled && anyRuleOn && !watch.alertChannelId ? (
          <Note tone="warn">Alege un canal de alerte; fără el, regulile care doar semnalează nu publică nimic.</Note>
        ) : null}
      </ModuleNotes>
      <SectionCard title="Reacție">
        <Fields>
          <Seg
            label="Sensibilitate" hint="Scăzută ridică pragurile tuturor regulilor cu 50%, Ridicată le coboară cu 25%." testId="suspect-sensitivity"
            value={watch.sensitivity ?? "medium"} options={SENSITIVITIES} onChange={(next) => set(["suspiciousBehavior", "sensitivity"], next)}
          />
          <ActionTicks
            label="Ce face botul, pentru tot modulul" testId="actions-suspect-module" rule={watch} kind="event"
            hint="Se aplică regulilor de mai jos care nu au bifat un avertisment sau o sancțiune proprie. Mute, kick și ban nu merg împreună."
            notes={readTicks(watch, "event").alert ? <StaffAlertNote channelId={watch.alertChannelId} /> : null}
            onChange={(next) => update(["suspiciousBehavior"], (current) => withTickFields(current ?? {}, next))}
          />
          <ChannelRow
            label="Canal alerte comportament suspect" hint="Aici apar alertele modulului; aici e menționat staff-ul, când e bifat."
            destination="suspiciousBehavior.alertChannelId" path={["suspiciousBehavior", "alertChannelId"]}
          />
        </Fields>
      </SectionCard>
      <RulesCard module={module}>
        {module.rules.map((def) => (
          <RuleCard key={def.id} module={module} def={def} channelId={watch.alertChannelId} moduleDefaults={watch} />
        ))}
      </RulesCard>
      <MessagesCard />
    </ModuleView>
  );
}

export const MODULE_VIEWS: Record<ModuleDef["id"], () => React.JSX.Element> = {
  automod: AutoModModule,
  antispam: AntiSpamModule,
  antiflood: AntiFloodModule,
  antiraid: AntiRaidModule,
  suspect: SuspectModule,
};
