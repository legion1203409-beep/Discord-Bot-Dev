/**
 * Pagina Judecătorului AI (/moderare/ai): cum judecă Oracolul, ce face botul
 * pentru toate categoriile, cele nouă categorii cu setări proprii sau generale,
 * excepțiile și jurnalul. Totul scrie în secțiunea `ai` a configurației.
 */
import "./panel.css";
import React, { useId } from "react";
import { usePanel, PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import {
  ActionTicks, Fields, Fld, Ico, IdPicker, Note, NoteRow, SectionCard, Seg, Switch, SwitchField, cx, messageChannelOptions, roleOptions,
} from "./fields";
import {
  AI_CATEGORIES, AI_CATEGORY_SENSITIVITIES, AI_SECTIONS, AI_SENSITIVITIES, AI_TONES, aiCategoryHasOwnActions, aiCategoryRule, aiCategorySummary,
  aiDraftError, aiEnabledCategoryCount, aiOnlyRecords, setAiCategoryOwn, setAiCategorySensitivity, setAiCategoryTicks, type AiCategoryKey,
} from "./ai-model";
import { describeTicks, readTicks, withTickFields, type ModuleHeadDef } from "./model";
import { ChannelRow, MessagesCard, ModuleNotes, ModuleView, StaffAlertNote } from "./rules";

const JUDGE_MODULE: ModuleHeadDef = {
  id: "judge",
  configKey: "ai",
  title: "Moderare AI",
  description: "Oracolul citește mesajele, în orice limbă, și judecă ce încalcă regulile, pe categorii pe care le pornești separat.",
  switchLabel: "Activează AI",
};

function AiCategoryCard({ categoryKey, label, hint }: { categoryKey: AiCategoryKey; label: string; hint: string }) {
  const { config, set, update, isOpen, toggleOpen } = usePanel();
  const titleId = useId();
  const bodyId = useId();
  const ai = config.ai ?? {};
  const on = ai.categories?.[categoryKey] === true;
  const own = aiCategoryHasOwnActions(ai, categoryKey);
  const rule = aiCategoryRule(ai, categoryKey);
  const openKey = `ai.${categoryKey}`;
  const open = isOpen(openKey);
  const inherited = describeTicks(rule, "message");
  return (
    <div className={cx("pn-rule", on && "is-on", open && "is-open")} data-testid={`ai-category-${categoryKey}`}>
      <div className="pn-rule-h">
        <Switch checked={on} label={label} testId={`ai-category-${categoryKey}-switch`} onChange={(next) => set(["ai", "categories", categoryKey], next)} />
        <button type="button" className="pn-rule-x" aria-expanded={open} aria-controls={bodyId} data-testid={`ai-category-${categoryKey}-open`} onClick={() => toggleOpen(openKey)}>
          <span>
            <b id={titleId}>{label}</b>
            <small>{aiCategorySummary(ai, categoryKey)}</small>
          </span>
          <Ico name="down" />
        </button>
      </div>
      <div className="pn-rule-b" id={bodyId} aria-labelledby={titleId} role="group">
        <div inert={!open}>
          <Fields>
            <Fld wide hint={hint} />
            <Seg
              label={`Sensibilitate — ${label}`} testId={`ai-category-${categoryKey}-sensitivity`}
              hint="Altfel folosește sensibilitatea generală de mai sus."
              value={ai.categorySettings?.[categoryKey]?.sensitivity ?? "inherit"} options={AI_CATEGORY_SENSITIVITIES}
              onChange={(next) => update(["ai"], (current) => setAiCategorySensitivity(current ?? {}, categoryKey, next))}
            />
            <SwitchField
              label={`Folosește acțiunile generale — ${label}`} checked={!own}
              hint="Oprește-l ca să alegi alte acțiuni doar pentru categoria asta. Pornești de la cele de acum."
              onChange={(follow) => update(["ai"], (current) => setAiCategoryOwn(current ?? {}, categoryKey, !follow))}
            />
            {own ? (
              <ActionTicks
                rule={rule} kind="message" testId={`actions-ai-${categoryKey}`}
                notes={readTicks(rule, "message").alert ? <StaffAlertNote channelId={ai.logChannelId} /> : null}
                onChange={(next) => update(["ai"], (current) => setAiCategoryTicks(current ?? {}, categoryKey, next))}
              />
            ) : (
              <NoteRow tone="plain" testId={`actions-ai-${categoryKey}-inherited`}>
                Ca setările generale: <strong>{inherited.length ? inherited.join(" + ") : "doar înregistrare"}</strong>
              </NoteRow>
            )}
          </Fields>
        </div>
      </div>
    </div>
  );
}

function JudgeModule() {
  const { config, set, update, channels, roles } = usePanel();
  const ai = config.ai ?? {};
  const enabledCount = aiEnabledCategoryCount(ai);
  const messageChannels = messageChannelOptions(channels);
  const serverRoles = roleOptions(roles);
  return (
    <ModuleView module={JUDGE_MODULE} icon="gavel">
      <ModuleNotes>
        {ai.enabled && enabledCount === 0 ? (
          <Note tone="warn">Selectează cel puțin o categorie; fără categorii, analiza AI nu rulează.</Note>
        ) : null}
        {ai.enabled && enabledCount > 0 && aiOnlyRecords(ai) ? (
          <Note tone="plain">Nu sunt bifate acțiuni pentru categoriile active; rezultatele sunt doar jurnalizate.</Note>
        ) : null}
      </ModuleNotes>

      <SectionCard title="Cum judecă">
        <Fields>
          <Seg
            label="Sensibilitate generală AI" testId="ai-sensitivity"
            hint="Cât de sigur trebuie să fie Oracolul înainte să intervină: Scăzută de la 90% încredere, Medie de la 75%, Ridicată de la 60%."
            value={ai.sensitivity ?? "medium"} options={AI_SENSITIVITIES} onChange={(next) => set(["ai", "sensitivity"], next)}
          />
          <Seg
            label="Ton" testId="ai-tone" hint="Cum privește Oracolul mesajele când le judecă."
            value={ai.tone ?? "calm"} options={AI_TONES} onChange={(next) => set(["ai", "tone"], next)}
          />
          <ActionTicks
            label="Ce face botul, pentru toate categoriile" testId="actions-ai-general" rule={ai} kind="message"
            hint="Se aplică fiecărei categorii care nu are acțiuni proprii. Mute, kick și ban nu merg împreună."
            notes={readTicks(ai, "message").alert ? <StaffAlertNote channelId={ai.logChannelId} /> : null}
            onChange={(next) => update(["ai"], (current) => withTickFields(current ?? {}, next))}
          />
          <NoteRow tone="plain">
            Mesajele sunt analizate în limba în care au fost scrise, inclusiv dacă amestecă limbi. Limba folosită nu este o abatere.
          </NoteRow>
        </Fields>
      </SectionCard>

      <SectionCard title="Categorii" small={`${enabledCount} din ${AI_CATEGORIES.length} pornite`} testId="ai-categories">
        <div className="pn-rules">
          {AI_CATEGORIES.map((category) => (
            <AiCategoryCard key={category.key} categoryKey={category.key} label={category.label} hint={category.hint} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Excepții">
        <Fields>
          <IdPicker
            label="Canale exceptate de la AI" kind="channel" testId="ai-excluded-channels" options={messageChannels}
            hint="Oracolul nu judecă mesajele din aceste canale. Alte protecții rămân active."
            selected={Array.isArray(ai.excludedChannelIds) ? ai.excludedChannelIds : []}
            onChange={(next) => set(["ai", "excludedChannelIds"], next)}
          />
          <IdPicker
            label="Roluri exceptate de la AI" kind="role" testId="ai-excluded-roles" options={serverRoles}
            hint="Oracolul nu judecă mesajele membrilor cu aceste roluri. Alte protecții rămân active."
            selected={Array.isArray(ai.excludedRoleIds) ? ai.excludedRoleIds : []}
            onChange={(next) => set(["ai", "excludedRoleIds"], next)}
          />
        </Fields>
      </SectionCard>

      <SectionCard title="Jurnal">
        <Fields>
          <ChannelRow
            label="Canal jurnal AI" hint="Aici scrie Oracolul ce a găsit și ce a făcut; aici anunță și staff-ul, când e bifat."
            destination="ai.logChannelId" path={["ai", "logChannelId"]}
          />
        </Fields>
      </SectionCard>

      <SectionCard title="Bine de știut">
        <Fields>
          <NoteRow tone="plain">
            <p>Analiza are nevoie de cheia OpenAI setată pe serverul botului (OPENAI_API_KEY). Fără ea, Oracolul nu judecă nimic și nu sancționează pe nimeni.</p>
            <p>Ca să nu coste prea mult, se trimit la analiză cel mult 3 mesaje pe minut de la același membru și 30 pe minut de pe tot serverul, doar primele 1.500 de caractere din text, fără imagini.</p>
            <p>Dacă AI-ul nu răspunde sau răspunde greșit, nu se aplică nicio sancțiune.</p>
          </NoteRow>
        </Fields>
      </SectionCard>

      <MessagesCard />
    </ModuleView>
  );
}

export function JudgePage() {
  const draft = useConfigDraft({ sections: AI_SECTIONS, validate: aiDraftError });
  const { api, config } = draft;
  if (draft.status !== "ready" || !api || !config) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările Judecătorului AI…"
      />
    );
  }
  return (
    <PanelContext.Provider value={api}>
      <div className="pn" data-testid="judge-page" style={{ "--tc": "#C79BFF" } as React.CSSProperties}>
        <PageHead
          icon={<Ico name="gavel" />} guildName={draft.guildName} title="Oracolul Judecător"
          lede="Moderare cu AI pe categorii: pentru fiecare alegi cât de sigur trebuie să fie Oracolul și ce face botul când găsește ceva."
          summary={<CountSummary on={aiEnabledCategoryCount(config.ai)} total={AI_CATEGORIES.length} label={<>categorii<br />pornite</>} testId="judge-summary" />}
        />
        <JudgeModule />
        <SaveBar changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="judge" />
      </div>
    </PanelContext.Provider>
  );
}
