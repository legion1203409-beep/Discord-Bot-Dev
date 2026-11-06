/**
 * Modulele paginii Tichete: cele patru fluxuri (Aplicații staff, Parteneriate,
 * Ajutor și raportări, Contestații) și Setări comune. Fiecare flux are
 * categoria în care se deschid tichetele, panoul, întrebările, finalul și o
 * încercare a formularului; logica e în tickets-model.ts.
 */
import React, { useId, useState } from "react";
import { Link } from "wouter";
import { DiscordEmojiText } from "../../../components/moderation/DiscordEmojiText";
import { useBotDraft } from "./bot-draft";
import { usePanel } from "./context";
import { ChannelField, Fields, Fld, Ico, IdPicker, Note, NoteRow, NumField, SectionCard, Seg, SwitchField, cx, roleOptions, type IconName } from "./fields";
import { publishSupportTicketPanel, useStaffReputation } from "../../../hooks/use-moderation-api";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import { ModuleNotes, ModuleView } from "./rules";
import {
  DEADLINES, FLOW_NAMES, MAX_QUESTIONS, TICKETS_MODULES, addQuestion, alliancePublishingOn, categoryOf, deadlinesProblem,
  duplicateKeys, editFlow, flowOf, isFlowOn, isLockedQuestion, moveQuestion, notifiesStaff, partnershipFieldsByQuestion, questionKey,
  removeQuestion, setQuestion, type FlowKind, type TicketFlow, type TicketQuestion, type TicketsModuleId,
  MAX_SUPPORT_CATEGORIES, newSupportCategory, supportTicketsOf, supportTicketsProblem, type SupportCategory, type SupportTickets,
} from "./tickets-model";

const MODULE: Record<TicketsModuleId, (typeof TICKETS_MODULES)[number]> = Object.fromEntries(
  TICKETS_MODULES.map((module) => [module.id, module]),
) as Record<TicketsModuleId, (typeof TICKETS_MODULES)[number]>;

export const TICKET_ICONS: Record<TicketsModuleId, IconName> = {
  bot: "message", reputation: "stairs", staff: "star", partnership: "users", help_report: "info", appeal: "scale", common: "clock",
};

function useFlow(kind: FlowKind) {
  const { config, update } = usePanel();
  const flow = flowOf(config, kind)!;
  return {
    flow,
    change: (patch: Partial<TicketFlow>) => update(["tickets", "flows", kind], (current: TicketFlow) => editFlow(current, patch)),
    replace: (next: (current: TicketFlow) => TicketFlow) => update(["tickets", "flows", kind], next),
  };
}

/* ------------------------------------------------------------------ */
/* Categoria                                                           */
/* ------------------------------------------------------------------ */

const WHERE: Record<FlowKind, string> = {
  staff: "Când botul tău de tichete deschide un canal nou în categoria asta, Oracolul pune în el panoul și cere răspunsurile pe rând.",
  partnership: "Când botul tău de tichete deschide un canal nou în categoria asta, Oracolul pune în el panoul și cere răspunsurile pe rând.",
  help_report: "Când botul tău de tichete deschide un canal nou în categoria asta, Oracolul pune în el panoul și cere răspunsurile pe rând.",
  appeal: "Fă în categorie un canal pe care îl văd membrii, de exemplu #contestații: acolo apare panoul. Butonul deschide pentru fiecare membru un canal privat, văzut doar de el și de rolul staff-ului.",
};

function CategoryCard({ kind }: { kind: FlowKind }) {
  const { config, set, channels } = usePanel();
  const value = categoryOf(config, kind);
  const categories = (channels ?? [])
    .filter((channel) => String(channel.type) === "4" || channel.type === "GuildCategory")
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
  const known = categories.some((channel) => channel.id === value);
  const id = useId();
  return (
    <SectionCard title="Unde se deschid" small={value ? "flux pornit" : "flux oprit"} testId={`tickets-${kind}-category`}>
      <Fields>
        <Fld label="Categoria Discord" labelId={`${id}-l`} hint="Fără categorie, fluxul e oprit: botul nu răspunde în niciun canal.">
          <div className="pn-chan">
            <select
              className="pn-inp" aria-label={`Categoria pentru ${FLOW_NAMES[kind]}`} value={value}
              onChange={(event) => set(["tickets", "categories", kind], event.target.value)}
            >
              <option value="">Nicio categorie (oprit)</option>
              {value && !known ? <option value={value}>Categorie salvată, indisponibilă ({value})</option> : null}
              {categories.map((channel) => <option key={channel.id} value={channel.id}>▰ {channel.name}</option>)}
            </select>
            <input
              className="pn-inp pn-inp-mono" aria-label={`ID categorie ${FLOW_NAMES[kind]}`} value={value} placeholder="ID categorie" inputMode="numeric"
              autoComplete="off" onChange={(event) => set(["tickets", "categories", kind], event.target.value.trim())}
            />
          </div>
        </Fld>
        <NoteRow tone="plain">{WHERE[kind]}</NoteRow>
      </Fields>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Panoul                                                              */
/* ------------------------------------------------------------------ */

function PanelTextsCard({ kind }: { kind: FlowKind }) {
  const { flow, change } = useFlow(kind);
  return (
    <SectionCard title="Panoul" small="primul mesaj din ticket" testId={`tickets-${kind}-panel`}>
      <Fields>
        <EmojiTextField label="Titlul panoului" max={256} value={flow.title ?? ""} onChange={(next) => change({ title: next })} />
        <EmojiTextField label="Textul butonului" max={80} value={flow.startButtonLabel ?? ""} onChange={(next) => change({ startButtonLabel: next })} hint="Butonul care pornește formularul." />
        <EmojiTextField label="Descrierea panoului" max={2_000} multiline rows={3} value={flow.panelDescription ?? ""} onChange={(next) => change({ panelDescription: next })} />
        <EmojiTextField label="Ghidul" max={2_000} multiline rows={3} value={flow.requirementsText ?? ""} onChange={(next) => change({ requirementsText: next })} hint="Apare în panou, la „Ghid”: ce trebuie să știe membrul înainte să înceapă." />
        <ImageUrlField label="Imaginea mare" hint="Sub textul panoului." value={flow.panelImageUrl ?? ""} onChange={(next) => change({ panelImageUrl: next })} />
        <ImageUrlField label="Imaginea mică" hint="În colțul din dreapta sus." value={flow.panelThumbnailUrl ?? ""} onChange={(next) => change({ panelThumbnailUrl: next })} />
      </Fields>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Întrebările                                                         */
/* ------------------------------------------------------------------ */

function QuestionCard({ kind, index, question, total, fields }: {
  kind: FlowKind; index: number; question: TicketQuestion; total: number; fields: string[] | null;
}) {
  const { isOpen, toggleOpen } = usePanel();
  const { replace } = useFlow(kind);
  const locked = isLockedQuestion(kind, question);
  const openKey = `question:${kind}:${index}`;
  const open = isOpen(openKey);
  const edit = (change: Partial<TicketQuestion>) => replace((current) => setQuestion(current, index, change));
  const facts = [
    question.required ? "obligatorie" : "opțională",
    question.multiline ? "răspuns lung" : "răspuns scurt",
    ...(fields?.length ? [`în anunț: ${fields.join(", ")}`] : []),
  ];
  const keyId = useId();
  return (
    <div className={cx("pn-rule is-on", open && "is-open")} data-testid={`question-${kind}-${index}`}>
      <div className="pn-rule-h">
        <button type="button" className="pn-rule-x" aria-expanded={open} onClick={() => toggleOpen(openKey)} data-testid={`question-${kind}-${index}-open`}>
          <span className="pn-qnum" aria-hidden="true">{index + 1}</span>
          <span>
            <b>{question.label.trim() || "Întrebare fără text"}</b>
            <small>{locked ? "ID-ul cazului contestat · mereu prima" : facts.join(" · ")}</small>
          </span>
          <Ico name="down" />
        </button>
        <span className="pn-qmove">
          <button type="button" className="pn-rm" aria-label={`Mută întrebarea ${index + 1} mai sus`} disabled={index === 0 || locked || (kind === "appeal" && index === 1)}
            onClick={() => replace((current) => moveQuestion(kind, current, index, -1))}>↑</button>
          <button type="button" className="pn-rm" aria-label={`Mută întrebarea ${index + 1} mai jos`} disabled={index === total - 1 || locked}
            onClick={() => replace((current) => moveQuestion(kind, current, index, 1))}>↓</button>
          <button type="button" className="pn-rm" aria-label={`Șterge întrebarea ${index + 1}`} disabled={total <= 1 || locked}
            onClick={() => replace((current) => removeQuestion(kind, current, index))}><Ico name="trash" /></button>
        </span>
      </div>
      <div className="pn-rule-b"><div>
        <Fields>
          {locked ? (
            <NoteRow tone="plain">Întrebarea despre caz e fixă: botul o pune mereu prima, ca să știe ce sancțiune e contestată.</NoteRow>
          ) : (
            <>
              <EmojiTextField label="Întrebarea" max={45} value={question.label} onChange={(next) => edit({ label: next })} hint="Titlul scurt al pasului." />
              <EmojiTextField label="Explicația" max={900} multiline rows={2} value={question.description} onChange={(next) => edit({ description: next })} />
              <EmojiTextField label="Exemplul din câmp" max={100} value={question.placeholder} onChange={(next) => edit({ placeholder: next })} hint="Textul gri din căsuța de răspuns." />
              <SwitchField label="Răspuns lung" hint="O căsuță pe mai multe rânduri." checked={question.multiline} onChange={(next) => edit({ multiline: next })} />
              <SwitchField label="Obligatorie" hint="Fără răspuns, membrul nu poate trece mai departe." checked={question.required} onChange={(next) => edit({ required: next })} />
              <Fld label="Cheia" htmlFor={keyId} hint="Numele intern al răspunsului: litere mici, cifre și „_”, unic în formular.">
                <input
                  id={keyId} className="pn-inp pn-inp-mono" value={question.key} maxLength={32} autoComplete="off"
                  onChange={(event) => edit({ key: questionKey(event.target.value) })}
                />
              </Fld>
              <ImageUrlField label="Imagine după răspuns" hint="Opțional, sub confirmarea răspunsului." value={question.imageUrl ?? ""} onChange={(next) => edit({ imageUrl: next })} />
              <ImageUrlField label="Imagine mică după răspuns" hint="Opțional, în colțul confirmării." value={question.thumbnailUrl ?? ""} onChange={(next) => edit({ thumbnailUrl: next })} />
            </>
          )}
        </Fields>
      </div></div>
    </div>
  );
}

function QuestionsCard({ kind }: { kind: FlowKind }) {
  const { flow, replace } = useFlow(kind);
  const fields = kind === "partnership" ? partnershipFieldsByQuestion(flow) : null;
  const duplicates = duplicateKeys(flow);
  return (
    <SectionCard title="Întrebările" small={`${flow.questions.length} din ${MAX_QUESTIONS}`} testId={`tickets-${kind}-questions`}>
      <div className="pn-rules">
        {flow.questions.map((question, index) => (
          <QuestionCard key={`${index}-${question.key}`} kind={kind} index={index} question={question} total={flow.questions.length} fields={fields?.[index] ?? null} />
        ))}
        {duplicates.length ? (
          <Note tone="bad" role="alert">Aceeași cheie apare de mai multe ori: {duplicates.join(", ")}. Schimb-o la una dintre întrebări.</Note>
        ) : null}
        {kind === "partnership" ? (
          <Note tone="plain">Botul ia din răspunsuri numele serverului, reprezentantul, linkul, membrii, descrierea, motivul, oferta și condițiile, după cheie sau, altfel, după poziție.</Note>
        ) : null}
        <button
          type="button" className="pn-btn-ghost pn-btn-sm pn-add" disabled={flow.questions.length >= MAX_QUESTIONS}
          data-testid={`tickets-${kind}-add-question`} onClick={() => replace((current) => addQuestion(current))}
        ><Ico name="plus" />Adaugă o întrebare</button>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Finalul                                                             */
/* ------------------------------------------------------------------ */

const AFTER: Partial<Record<FlowKind, string>> = {
  partnership: "Staff-ul primește în ticket rezumatul alianței, cu „Confirmă pentru publicare” și „Refuză pactul”.",
  appeal: "Staff-ul primește în ticket contestația, cu „Acceptă”, „Respinge” și „Cere clarificări”. Decizia nu ridică singură sancțiunea.",
};

function FinishCard({ kind }: { kind: FlowKind }) {
  const { flow, change } = useFlow(kind);
  const notify = notifiesStaff(flow);
  return (
    <SectionCard title="La final" small="după ultimul răspuns" testId={`tickets-${kind}-finish`}>
      <Fields>
        <EmojiTextField label="Mesajul de final" max={2_000} multiline rows={3} value={flow.completionMessage ?? ""} onChange={(next) => change({ completionMessage: next })} hint="Apare în ticket deasupra rezumatului cu toate răspunsurile." />
        <ImageUrlField label="Imaginea mare a finalului" hint="Opțional." value={flow.completionImageUrl ?? ""} onChange={(next) => change({ completionImageUrl: next })} />
        <ImageUrlField label="Imaginea mică a finalului" hint="Opțional." value={flow.completionThumbnailUrl ?? ""} onChange={(next) => change({ completionThumbnailUrl: next })} />
        <SwitchField
          label="Anunță staff-ul" testId={`tickets-${kind}-notify`}
          hint={<>Menționează rolul staff-ului ales la <Link href={MODULE.common.route}>Setări comune</Link>, cu mesajul de mai jos. Oprit, formularul doar se închide.</>}
          checked={notify} onChange={(next) => change({ completionAction: next ? "notify_staff" : "lock" })}
        />
        <EmojiTextField label="Mesajul pentru staff" max={2_000} multiline rows={2} value={flow.staffNotificationMessage ?? ""} onChange={(next) => change({ staffNotificationMessage: next })} hint={notify ? "Lângă mențiunea rolului." : "Se trimite doar cât timp e pornit „Anunță staff-ul”."} />
        {notify ? (
          <>
            <ImageUrlField label="Imaginea mare pentru staff" hint="Opțional." value={flow.staffNotificationImageUrl ?? ""} onChange={(next) => change({ staffNotificationImageUrl: next })} />
            <ImageUrlField label="Imaginea mică pentru staff" hint="Opțional." value={flow.staffNotificationThumbnailUrl ?? ""} onChange={(next) => change({ staffNotificationThumbnailUrl: next })} />
          </>
        ) : null}
        {AFTER[kind] ? <NoteRow tone="plain">{AFTER[kind]}</NoteRow> : null}
      </Fields>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Alianțele                                                           */
/* ------------------------------------------------------------------ */

function AlliancesCard() {
  const draft = useBotDraft();
  const { config, set, channels } = usePanel();
  const tickets = config.tickets;
  const on = alliancePublishingOn(config, draft.guildId);
  return (
    <SectionCard title="Publicarea alianțelor" testId="tickets-alliances">
      <Fields>
        <SwitchField
          label="Publică alianțele aprobate" testId="tickets-alliances-switch"
          hint="După confirmare, staff-ul apasă „Publică pactul”, iar botul postează anunțul în canalul alianțelor. Oprit, butonul spune că publicarea e oprită."
          checked={on} onChange={(next) => set(["tickets", "allianceOwnerGuildId"], next ? draft.guildId ?? "" : "")}
        />
        <ChannelField
          label="Canalul alianțelor" selectLabel="Canalul alianțelor" value={tickets.alliancePublicChannelId || null} channels={channels}
          hint="Unde apare anunțul public." onChange={(next) => set(["tickets", "alliancePublicChannelId"], next ?? "")}
        />
        {on && !tickets.alliancePublicChannelId ? <NoteRow tone="warn">Alege canalul alianțelor; fără el, „Publică pactul” nu are unde posta.</NoteRow> : null}
        <Seg
          label="Forma anunțului" value={tickets.allianceAnnouncementMode === "embed" ? "embed" : "text"} testId="tickets-alliances-mode"
          options={[["text", "Text simplu"], ["embed", "Embed"]]} onChange={(next) => set(["tickets", "allianceAnnouncementMode"], next)}
        />
        <ImageUrlField
          label="Imaginea mare a anunțului" hint="Sub anunț." value={tickets.allianceAnnouncementImageUrl ?? ""}
          onChange={(next) => { set(["tickets", "allianceAnnouncementImageUrl"], next); set(["tickets", "allianceAnnouncementImageMode"], next ? "large" : "none"); }}
        />
        <ImageUrlField
          label="Imaginea mică a anunțului" hint="În colțul din dreapta sus." value={tickets.allianceAnnouncementThumbnailUrl ?? ""}
          onChange={(next) => set(["tickets", "allianceAnnouncementThumbnailUrl"], next)}
        />
        <NoteRow tone="plain">
          Textul anunțului îl schimbi la <Link href="/config/mesaje/alianta">Personalizare mesaje → Anunțul alianței</Link>.
          Răspunsurile intră în el prin {"{server_name}"}, {"{description}"}, {"{invite}"}, {"{members_total}"} și celelalte.
        </NoteRow>
        <EmojiTextField
          label="Textul de recrutare" max={2_000} multiline rows={5} optional value={String(config.allianceRecruitmentText ?? "")}
          onChange={(next) => set(["allianceRecruitmentText"], next)}
          hint="Textul pe care îl dai serverelor partenere. Botul doar îl păstrează (îl schimbi și cu /setaliantatext); gol înseamnă textul de bază."
        />
      </Fields>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Încearcă formularul                                                 */
/* ------------------------------------------------------------------ */

function TryFlow({ kind }: { kind: FlowKind }) {
  const { flow } = useFlow(kind);
  const draft = useBotDraft();
  const emojis = draft.metadata?.emojis;
  const [step, setStep] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const total = flow.questions?.length ?? 0;
  const question = step !== null && step < total ? flow.questions[step] : undefined;
  const done = step !== null && step >= total;
  const restart = () => { setStep(null); setAnswers({}); setValue(""); setProblem(null); };
  const submit = () => {
    if (!question) return;
    if (question.required && !value.trim()) { setProblem("Răspunsul e obligatoriu."); return; }
    setAnswers((current) => ({ ...current, [question.key]: value.trim() || "—" }));
    setValue("");
    setProblem(null);
    setStep((current) => (current ?? 0) + 1);
  };
  const text = (content: string) => <DiscordEmojiText emojis={emojis}>{content}</DiscordEmojiText>;
  return (
    <SectionCard title="Încearcă formularul" small="nu se trimite nimic în Discord" testId={`tickets-${kind}-try`}>
      <div className="pn-dc pn-dc-try">
        <div className="pn-dc-embed">
          {flow.panelThumbnailUrl ? <img src={flow.panelThumbnailUrl} alt="" className="pn-dc-thumb" /> : null}
          <p className="pn-dc-title">{text(flow.title || "Titlul panoului")}</p>
          <p className="pn-dc-text">{text(flow.panelDescription ?? "")}</p>
          <p className="pn-dc-field"><b>📜 Întrebări</b>{total} întrebări · răspunsurile sunt cerute în ordine.</p>
          <p className="pn-dc-field"><b>📖 Ghid</b>{text(flow.requirementsText ?? "")}</p>
          {flow.panelImageUrl ? <img src={flow.panelImageUrl} alt="" className="pn-dc-image" /> : null}
        </div>
        {step === null ? (
          <button type="button" className="pn-dc-btn is-primary" onClick={() => setStep(0)} data-testid={`tickets-${kind}-try-start`}>{text(flow.startButtonLabel || "Începe")}</button>
        ) : null}
        {question ? (
          <div className="pn-dc-q" data-testid={`tickets-${kind}-try-question`}>
            <p className="pn-dc-k">Pasul {step! + 1} din {total} · {question.required ? "obligatoriu" : "opțional"}</p>
            <p className="pn-dc-title">{text(question.label)}</p>
            <p className="pn-dc-text">{text(question.description)}</p>
            {question.multiline ? (
              <textarea className="pn-dc-input" rows={3} value={value} placeholder={question.placeholder} aria-label={question.label} onChange={(event) => { setValue(event.target.value); setProblem(null); }} />
            ) : (
              <input className="pn-dc-input" value={value} placeholder={question.placeholder} aria-label={question.label} onChange={(event) => { setValue(event.target.value); setProblem(null); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
            )}
            {problem ? <p className="pn-err" role="alert">{problem}</p> : null}
            <button type="button" className="pn-dc-btn is-primary" onClick={submit} data-testid={`tickets-${kind}-try-next`}>{step === total - 1 ? "Trimite formularul" : "Răspunde"}</button>
          </div>
        ) : null}
        {done ? (
          <div className="pn-dc-q" data-testid={`tickets-${kind}-try-done`}>
            {notifiesStaff(flow) ? <p className="pn-dc-mention">@staff {text(flow.staffNotificationMessage ?? "")}</p> : null}
            <div className="pn-dc-embed">
              <p className="pn-dc-title">Formular complet</p>
              <p className="pn-dc-text">{text(flow.completionMessage ?? "")}</p>
              {flow.questions.map((item) => (
                <p key={item.key} className="pn-dc-field"><b>{text(item.label)}</b>{answers[item.key] ?? "—"}</p>
              ))}
            </div>
            {kind === "appeal" ? <p className="pn-dc-btns"><span>Acceptă contestația</span><span>Respinge contestația</span><span>Cere clarificări</span></p> : null}
            {kind === "partnership" ? <p className="pn-dc-btns"><span>🛡️ Confirmă pentru publicare</span><span>Refuză pactul</span></p> : null}
          </div>
        ) : null}
        {step !== null ? <button type="button" className="pn-lnk" onClick={restart}>Încearcă din nou</button> : null}
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Modulul unui flux                                                   */
/* ------------------------------------------------------------------ */

function FlowModule({ kind }: { kind: FlowKind }) {
  const { config } = usePanel();
  const flow = flowOf(config, kind);
  const { change } = useFlow(kind);
  const on = isFlowOn(config, kind);
  const aside = <span className={cx("pn-chipst", on && "on")} data-testid={`tickets-${kind}-state`}>{on ? "Pornit" : "Oprit · fără categorie"}</span>;
  if (!flow) {
    return <ModuleView module={MODULE[kind]} icon={TICKET_ICONS[kind]} aside={aside}><Note tone="bad">Setările fluxului nu au venit de la server; reîncarcă pagina.</Note></ModuleView>;
  }
  return (
    <ModuleView module={MODULE[kind]} icon={TICKET_ICONS[kind]} aside={aside}>
      <ModuleNotes>
        {flow.mode === "legacy" ? (
          <Note tone="plain" testId={`tickets-${kind}-legacy`}>
            <p>Botul folosește încă textele lui de bază pentru acest flux. La prima modificare de aici trece pe textele și întrebările de pe pagină.</p>
            <button type="button" className="pn-lnk" onClick={() => change({})}>Folosește de acum textele de aici</button>
          </Note>
        ) : null}
      </ModuleNotes>
      <CategoryCard kind={kind} />
      <PanelTextsCard kind={kind} />
      <QuestionsCard kind={kind} />
      <FinishCard kind={kind} />
      {kind === "partnership" ? <AlliancesCard /> : null}
      <TryFlow key={kind} kind={kind} />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Setări comune                                                       */
/* ------------------------------------------------------------------ */

function CommonModule() {
  const { config, set, roles } = usePanel();
  const tickets = config.tickets;
  const id = useId();
  const roleId = String(tickets.staffReviewRoleId ?? "");
  const options = (roles ?? []).filter((role) => !role.managed).sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || a.name.localeCompare(b.name, "ro"));
  const known = options.some((role) => role.id === roleId);
  const problem = deadlinesProblem(tickets);
  const end = Number(tickets.incompleteTimeoutMinutes) || 60;
  const marks = [
    { at: Number(tickets.firstWarningMinutes), label: "primul avertisment" },
    { at: Number(tickets.secondWarningMinutes), label: "al doilea" },
    { at: end, label: "ticket șters" },
  ];
  return (
    <ModuleView module={MODULE.common} icon={TICKET_ICONS.common}>
      <SectionCard title="Staff-ul tichetelor" testId="tickets-staff-role">
        <Fields>
          <Fld label="Rolul staff-ului" labelId={`${id}-l`} hint="Menționat la finalul formularelor care anunță staff-ul. Vede canalele de contestații, confirmă parteneriatele și decide contestațiile.">
            <select
              className="pn-inp" aria-labelledby={`${id}-l`} value={roleId} data-testid="tickets-staff-role-select"
              onChange={(event) => set(["tickets", "staffReviewRoleId"], event.target.value)}
            >
              {!roleId ? <option value="">Alege rolul</option> : null}
              {roleId && !known ? <option value={roleId}>Rol salvat ({roleId})</option> : null}
              {options.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
            </select>
            {!roleId ? <p className="pn-err" role="alert">Alege rolul staff-ului; fără el nu se poate salva.</p> : null}
          </Fld>
        </Fields>
      </SectionCard>
      <SectionCard title="Tichete neterminate" small="pentru toate fluxurile" testId="tickets-deadlines">
        <Fields>
          {DEADLINES.map((deadline) => (
            <NumField
              key={deadline.key} label={deadline.label} min={deadline.min} max={deadline.max} unit="minute" testId={`tickets-${deadline.key}`}
              value={tickets[deadline.key]} onChange={(next) => set(["tickets", deadline.key], next)}
            />
          ))}
          <Fld wide label="Cum trece timpul" hint="Ceasul pornește când se deschide canalul. Cine termină formularul nu mai primește avertismente, iar ticketul rămâne.">
            <div className="pn-tline" aria-hidden="true">
              <span className="pn-tline-bar" />
              {marks.map((mark) => (
                <span key={mark.label} className={cx("pn-tline-m", mark.label === "ticket șters" && "is-end")} style={{ "--x": `${Math.max(0, Math.min(100, (mark.at / end) * 100))}%` } as React.CSSProperties}>
                  <b>{Number.isFinite(mark.at) ? `${mark.at} min` : "?"}</b><small>{mark.label}</small>
                </span>
              ))}
            </div>
          </Fld>
          {problem ? <NoteRow tone="bad" role="alert">{problem}</NoteRow> : null}
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Tichetele botului                                                   */
/* ------------------------------------------------------------------ */

function SupportCategoryCard({ category, index, count, categories, onChange, onMove, onRemove }: {
  category: SupportCategory; index: number; count: number; categories: Array<{ id: string; name: string }>;
  onChange: (change: Partial<SupportCategory>) => void; onMove: (step: -1 | 1) => void; onRemove: () => void;
}) {
  const { roles } = usePanel();
  const id = useId();
  return (
    <div className="pn-stk-cat" data-testid={`tickets-bot-category-${index}`}>
      <div className="pn-stk-cat-head">
        <input className="pn-inp pn-stk-emoji" value={category.emoji} maxLength={32} aria-label={`Emoji pentru ${category.label}`}
          data-testid={`tickets-bot-category-${index}-emoji`} onChange={(event) => onChange({ emoji: event.target.value })} />
        <input className="pn-inp" value={category.label} maxLength={80} aria-label="Numele categoriei" placeholder="Numele categoriei"
          data-testid={`tickets-bot-category-${index}-label`} onChange={(event) => onChange({ label: event.target.value })} />
        <div className="pn-stk-cat-tools">
          <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Mută mai sus">↑</button>
          <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Mută mai jos">↓</button>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={onRemove} data-testid={`tickets-bot-category-${index}-remove`} aria-label={`Șterge ${category.label}`}>Șterge</button>
        </div>
      </div>
      {!category.label.trim() ? <p className="pn-err" role="alert">Categoria are nevoie de un nume.</p> : null}
      <Fields>
        <Fld wide label="Descrierea din meniu" htmlFor={`${id}-d`} hint="Un rând scurt sub nume, în meniul din Discord.">
          <input id={`${id}-d`} className="pn-inp" maxLength={100} value={category.description} onChange={(event) => onChange({ description: event.target.value })} />
        </Fld>
        <Fld wide label="Primul mesaj din tichet" htmlFor={`${id}-w`} hint="{user} devine mențiunea membrului.">
          <textarea id={`${id}-w`} className="pn-inp" rows={3} maxLength={1_500} value={category.welcome} data-testid={`tickets-bot-category-${index}-welcome`}
            onChange={(event) => onChange({ welcome: event.target.value })} />
        </Fld>
        <Fld label="Categoria din Discord" htmlFor={`${id}-p`} hint="Unde apar canalele. Goală: aceeași cu a canalului cu panoul.">
          <select id={`${id}-p`} className="pn-inp" value={category.parentId} onChange={(event) => onChange({ parentId: event.target.value })}>
            <option value="">Ca panoul</option>
            {category.parentId && !categories.some((item) => item.id === category.parentId) ? <option value={category.parentId}>Categorie salvată ({category.parentId})</option> : null}
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Fld>
        <SwitchField label="Cere motivul la deschidere" checked={category.askReason} testId={`tickets-bot-category-${index}-reason`}
          hint="Membrul scrie pe scurt despre ce e vorba înainte să se deschidă canalul."
          onChange={(next) => onChange({ askReason: next })} />
        <IdPicker
          label="Staff doar pentru categoria asta" kind="role" testId={`tickets-bot-category-${index}-roles`} options={roleOptions(roles)} max={10}
          hint="Gol: o văd rolurile de staff de mai sus. Ales: doar aceste roluri (de ex. doar adminii pentru rapoarte)."
          selected={category.staffRoleIds} onChange={(next) => onChange({ staffRoleIds: next })}
        />
      </Fields>
    </div>
  );
}

function SupportTicketsPreview({ tickets }: { tickets: SupportTickets }) {
  const color = /^#[0-9a-f]{6}$/i.test(tickets.color) ? tickets.color : "#d8a964";
  return (
    <div className="pn-dc" data-testid="tickets-bot-preview">
      <p className="pn-dc-k">Panoul, în Discord</p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <div className="pn-dc-embed" style={{ borderLeftColor: color }}>
            <p className="pn-dc-title">{tickets.panelTitle}</p>
            <p className="pn-dc-text">{tickets.panelDescription}</p>
            <div className="pn-stk-grid">
              {tickets.categories.slice(0, 10).map((category) => (
                <div key={category.id} className="pn-dc-field"><b>{category.emoji} {category.label || "…"}</b><span className="pn-ctl-metric">{category.description || " "}</span></div>
              ))}
            </div>
          </div>
          <div className="pn-stk-menu" aria-hidden="true">Alege categoria tichetului ▾</div>
        </div>
      </div>
      {tickets.rating.enabled ? (
        <>
          <p className="pn-dc-k">După închidere, în privat</p>
          <div className="pn-dc-embed" style={{ borderLeftColor: color }}>
            <p className="pn-dc-title">⭐ {tickets.rating.question}</p>
            <p className="pn-dc-text">Te-a ajutat <span className="pn-dc-mention">@Adina</span>. Alege de la 1 la 5 stele.</p>
            <div className="pn-stk-stars">{[1, 2, 3, 4, 5].map((value) => <span key={value}>⭐ {value}</span>)}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function BotTicketsModule() {
  const { config, set, channels, roles } = usePanel();
  const draft = useBotDraft();
  const tickets = supportTicketsOf(config);
  const setTickets = (change: Partial<SupportTickets>) => set(["supportTickets"], { ...tickets, ...change });
  const setCategories = (categories: SupportCategory[]) => setTickets({ categories });
  const problem = supportTicketsProblem({ supportTickets: tickets });
  const discordCategories = (channels ?? []).filter((channel) => channel.type === 4).map((channel) => ({ id: channel.id, name: channel.name }));
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const unsaved = draft.changed.length > 0;
  const publish = async () => {
    if (!draft.guildId) return;
    setPublishing(true);
    setPublished(null);
    try {
      await publishSupportTicketPanel(draft.guildId);
      setPublished({ tone: "info", text: "Panoul e în canal. Membrii pot deschide tichete din meniu." });
    } catch (error) {
      setPublished({ tone: "bad", text: error instanceof Error ? error.message : "Panoul nu s-a putut publica." });
    } finally {
      setPublishing(false);
    }
  };
  const id = useId();
  return (
    <ModuleView module={MODULE.bot} icon={TICKET_ICONS.bot} aside={(
      <SwitchField label="Tichetele botului" checked={tickets.enabled} testId="tickets-bot-switch" onChange={(next) => setTickets({ enabled: next })} />
    )}>
      <ModuleNotes>
        {problem ? <Note tone="bad" role="alert">{problem}</Note> : null}
        <Note tone="plain">E separat de fluxurile de mai jos (Aplicații, Parteneriate…), care pun formulare în canalele create de alt bot. Pot merge amândouă.</Note>
      </ModuleNotes>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <SectionCard title="Panoul și staff-ul" testId="tickets-bot-panel">
            <Fields>
              <ChannelField label="Canalul panoului" selectLabel="Canalul panoului de tichete" value={tickets.panelChannelId || null} channels={channels} wide
                hint="Aici botul pune mesajul cu meniul de categorii." onChange={(next) => setTickets({ panelChannelId: next ?? "" })} />
              <IdPicker label="Rolurile staff-ului" kind="role" testId="tickets-bot-staff" options={roleOptions(roles)} max={10}
                hint="Văd toate tichetele, le pot prelua și închide, și primesc ping la un tichet nou."
                selected={tickets.staffRoleIds} onChange={(next) => setTickets({ staffRoleIds: next })} />
              <ChannelField label="Jurnalul tichetelor" selectLabel="Canalul jurnalului de tichete" value={tickets.logChannelId || null} channels={channels} wide
                hint="Transcrierile, închiderile și evaluările. Un canal doar pentru staff." onChange={(next) => setTickets({ logChannelId: next ?? "" })} />
              <Fld label="Titlul panoului" htmlFor={`${id}-t`}>
                <input id={`${id}-t`} className="pn-inp" maxLength={256} value={tickets.panelTitle} onChange={(event) => setTickets({ panelTitle: event.target.value })} />
              </Fld>
              <Fld label="Culoarea" htmlFor={`${id}-c`}>
                <input id={`${id}-c`} className="pn-inp pn-inp-mono" maxLength={7} value={tickets.color} onChange={(event) => setTickets({ color: event.target.value.trim() })} />
              </Fld>
              <Fld wide label="Textul panoului" htmlFor={`${id}-x`}>
                <textarea id={`${id}-x`} className="pn-inp" rows={2} maxLength={2_000} value={tickets.panelDescription} onChange={(event) => setTickets({ panelDescription: event.target.value })} />
              </Fld>
              <Seg label="Tichete deschise odată de un membru" testId="tickets-bot-max" value={String(tickets.maxOpenPerUser)}
                options={[1, 2, 3, 5].map((value) => [String(value), String(value)] as const)} onChange={(next) => setTickets({ maxOpenPerUser: Number(next) })} />
              <SwitchField label="Șterge canalul după închidere" checked={tickets.deleteAfterClose} testId="tickets-bot-delete"
                hint="Transcrierea rămâne în jurnal. Oprit: canalul rămâne închis, doar de citit."
                onChange={(next) => setTickets({ deleteAfterClose: next })} />
              <Fld wide label="Publică panoul" hint={unsaved ? "Salvează întâi (bara de jos), apoi publică." : tickets.panelMessageId ? "Panoul există: publicarea îl actualizează, nu face altul." : "Pune mesajul cu meniul în canalul ales."}>
                <div>
                  <button type="button" className="pn-btn pn-btn-sm" data-testid="tickets-bot-publish" disabled={publishing || unsaved || !tickets.enabled || !tickets.panelChannelId}
                    onClick={() => void publish()}><Ico name="send" />{publishing ? "Se publică…" : tickets.panelMessageId ? "Actualizează panoul" : "Publică panoul"}</button>
                </div>
              </Fld>
              {published ? <NoteRow tone={published.tone} role={published.tone === "bad" ? "alert" : undefined}>{published.text}</NoteRow> : null}
            </Fields>
          </SectionCard>
          <SectionCard title="Categorii" small={`${tickets.categories.length} din ${MAX_SUPPORT_CATEGORIES}`} testId="tickets-bot-categories">
            <div className="pn-stk-cats">
              {tickets.categories.map((category, index) => (
                <SupportCategoryCard
                  key={category.id} category={category} index={index} count={tickets.categories.length} categories={discordCategories}
                  onChange={(change) => setCategories(tickets.categories.map((item, at) => (at === index ? { ...item, ...change } : item)))}
                  onMove={(step) => {
                    const next = [...tickets.categories];
                    const [moved] = next.splice(index, 1);
                    next.splice(index + step, 0, moved!);
                    setCategories(next);
                  }}
                  onRemove={() => setCategories(tickets.categories.filter((_, at) => at !== index))}
                />
              ))}
              <button type="button" className="pn-btn-ghost pn-btn-sm" data-testid="tickets-bot-add" disabled={tickets.categories.length >= MAX_SUPPORT_CATEGORIES}
                onClick={() => setCategories([...tickets.categories, newSupportCategory(tickets.categories.map((item) => item.id))])}>
                <Ico name="plus" />Adaugă o categorie
              </button>
            </div>
          </SectionCard>
          <SectionCard title="Evaluarea staff-ului" small={tickets.rating.enabled ? "pornită" : "oprită"} testId="tickets-bot-rating">
            <Fields>
              <SwitchField label="Întreabă membrul la închidere" checked={tickets.rating.enabled} testId="tickets-bot-rating-switch"
                hint="Primește în privat 1–5 stele pentru cine l-a ajutat (cine a preluat tichetul sau cine din staff l-a închis), cu comentariu dacă vrea. Doar în privat: dacă are mesajele private închise, nu primește întrebarea."
                onChange={(next) => setTickets({ rating: { ...tickets.rating, enabled: next } })} />
              {tickets.rating.enabled ? (
                <Fld wide label="Întrebarea" htmlFor={`${id}-q`}>
                  <input id={`${id}-q`} className="pn-inp" maxLength={200} value={tickets.rating.question} onChange={(event) => setTickets({ rating: { ...tickets.rating, question: event.target.value } })} />
                </Fld>
              ) : null}
            </Fields>
          </SectionCard>
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><SupportTicketsPreview tickets={tickets} /></aside>
      </div>
    </ModuleView>
  );
}

const REPUTATION_RANGES = [["7", "7 zile"], ["30", "30 de zile"], ["90", "90 de zile"], ["all", "Tot"]] as const;

function ReputationModule() {
  const draft = useBotDraft();
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");
  const { rows, error } = useStaffReputation(draft.guildId ?? null, range);
  return (
    <ModuleView module={MODULE.reputation} icon={TICKET_ICONS.reputation}>
      <SectionCard title="Clasamentul staff-ului" testId="tickets-reputation">
        <Fields>
          <Seg label="Perioada" testId="tickets-reputation-range" value={range} options={REPUTATION_RANGES} onChange={(next) => setRange(next as typeof range)} />
          {error ? <NoteRow tone="bad" role="alert">{error}</NoteRow> : null}
          {!rows && !error ? <NoteRow tone="plain">Se încarcă…</NoteRow> : null}
          {rows && !rows.length ? <NoteRow tone="plain">Încă nicio evaluare în perioada asta. Evaluările vin după tichetele închise din „Tichetele botului”.</NoteRow> : null}
          {rows?.length ? (
            <div className="pn-rep" data-testid="tickets-reputation-rows">
              {rows.map((row, index) => (
                <div key={row.staffId} className="pn-rep-row">
                  <span className="pn-rep-place">{["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`}</span>
                  {row.avatarUrl ? <img className="pn-rep-av" src={row.avatarUrl} alt="" /> : <span className="pn-rep-av" aria-hidden="true" />}
                  <span className="pn-rep-name"><b>{row.name ?? `@${row.staffId}`}</b><small>{row.handled} {row.handled === 1 ? "tichet" : "tichete"} · {row.ratings} {row.ratings === 1 ? "evaluare" : "evaluări"}</small></span>
                  <span className="pn-rep-avg" aria-label={`Media ${row.average.toFixed(1)} din 5`}>{row.average.toFixed(1).replace(".", ",")} ⭐</span>
                  <span className="pn-rep-dist" aria-hidden="true">
                    {[5, 4, 3, 2, 1].map((star) => (
                      <i key={star} style={{ width: `${row.ratings ? (row.distribution[star - 1]! / row.ratings) * 100 : 0}%` }} data-star={star} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <NoteRow tone="plain">Ordinea ține cont și de câte evaluări are fiecare: o singură notă de 5 nu bate douăzeci de 4. În Discord: /topstaff.</NoteRow>
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

export const TICKET_VIEWS: Record<TicketsModuleId, () => React.JSX.Element> = {
  bot: BotTicketsModule,
  reputation: ReputationModule,
  staff: () => <FlowModule kind="staff" />,
  partnership: () => <FlowModule kind="partnership" />,
  help_report: () => <FlowModule kind="help_report" />,
  appeal: () => <FlowModule kind="appeal" />,
  common: CommonModule,
};
