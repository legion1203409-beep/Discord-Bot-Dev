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
import { ChannelField, Fields, Fld, Ico, Note, NoteRow, NumField, SectionCard, Seg, SwitchField, cx, type IconName } from "./fields";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import { ModuleNotes, ModuleView } from "./rules";
import {
  DEADLINES, FLOW_NAMES, MAX_QUESTIONS, TICKETS_MODULES, addQuestion, alliancePublishingOn, categoryOf, deadlinesProblem,
  duplicateKeys, editFlow, flowOf, isFlowOn, isLockedQuestion, moveQuestion, notifiesStaff, partnershipFieldsByQuestion, questionKey,
  removeQuestion, setQuestion, type FlowKind, type TicketFlow, type TicketQuestion, type TicketsModuleId,
} from "./tickets-model";

const MODULE: Record<TicketsModuleId, (typeof TICKETS_MODULES)[number]> = Object.fromEntries(
  TICKETS_MODULES.map((module) => [module.id, module]),
) as Record<TicketsModuleId, (typeof TICKETS_MODULES)[number]>;

export const TICKET_ICONS: Record<TicketsModuleId, IconName> = {
  staff: "star", partnership: "users", help_report: "info", appeal: "scale", common: "clock",
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
          Textul anunțului îl schimbi la <Link href="/config/mesaje">Mesaje de moderare</Link>, la „Anunțul public al parteneriatului”.
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

export const TICKET_VIEWS: Record<TicketsModuleId, () => React.JSX.Element> = {
  staff: () => <FlowModule kind="staff" />,
  partnership: () => <FlowModule kind="partnership" />,
  help_report: () => <FlowModule kind="help_report" />,
  appeal: () => <FlowModule kind="appeal" />,
  common: CommonModule,
};
