/**
 * Modulele paginii Oracol: Pornire (comutatorul general și răspunsul pentru
 * Oracolul oprit), Conversație (unde și când răspunde, pauza dintre răspunsuri),
 * Ton și lungime (cu un exemplu) și Profeții (/profetie și profeția zilei).
 * Logica e în oracle-model.ts; ciorna și salvarea în bot-draft.tsx.
 */
import React, { useId, useMemo, useState } from "react";
import { Link } from "wouter";
import { DiscordEmojiText } from "../../../components/moderation/DiscordEmojiText";
import { useBotDraft } from "./bot-draft";
import { usePanel } from "./context";
import { ChannelField, Fields, Fld, IdPicker, Ico, Note, NoteRow, NumField, SectionCard, Seg, Switch, SwitchField, cx, type IconName } from "./fields";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import { countLabel } from "./model";
import {
  DEFAULT_PAUSED_MESSAGE, LENGTHS, MAX_COOLDOWN_SECONDS, MAX_DAILY_LIMIT, MAX_ORACLE_CHANNELS, MAX_PAUSED_MESSAGE, ORACLE_MODULES, SAMPLE_QUESTION,
  TIME_ZONES, TONES, cooldownText, dayWord, hourText, isCategory, isDailyHourNow, nextDailyProphecy, oracleChannelOptions, oracleOf, sampleAnswer,
  timeZoneClock, whereSummary, withOracle, type OracleModuleId,
} from "./oracle-model";
import { ModuleNotes, ModuleView } from "./rules";
import { isMessageImageUrl } from "./verification-model";

const MODULE: Record<OracleModuleId, (typeof ORACLE_MODULES)[number]> = Object.fromEntries(
  ORACLE_MODULES.map((module) => [module.id, module]),
) as Record<OracleModuleId, (typeof ORACLE_MODULES)[number]>;

export const ORACLE_ICONS: Record<OracleModuleId, IconName> = { status: "power", chat: "message", style: "quill", prophecy: "orb" };

/** The Oracle's settings with the defaults, and a setter for one of them. */
function useOracle() {
  const { config, update } = usePanel();
  const oracle = oracleOf(config);
  const setOracle = (path: string[], value: unknown) => update(["oracle"], (current: unknown) => withOracle({ oracle: current }, path, value));
  return { oracle, setOracle };
}

/** Shown on the modules that stop working while the whole Oracle is off. */
function OracleOffNote({ what }: { what: string }) {
  const { oracle, setOracle } = useOracle();
  if (oracle.enabled) return null;
  return (
    <div className="pn-mod-off" role="status" data-testid="oracle-off-note">
      <Ico name="power" />
      <span>Oracolul e oprit pe server, deci {what}. Setările rămân salvate pentru când îl pornești.</span>
      <button type="button" className="pn-btn pn-btn-sm" onClick={() => setOracle(["enabled"], true)}>Pornește Oracolul</button>
    </div>
  );
}

/** The Oracle's own message in a Discord preview. */
function OracleMessage({ children, ephemeral }: { children: React.ReactNode; ephemeral?: boolean }) {
  return (
    <div className="pn-dc-msg">
      <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
      <div className="pn-dc-body">
        <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
        {children}
        {ephemeral ? <small className="pn-orc-eph">Doar tu poți vedea acest mesaj</small> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pornire                                                             */
/* ------------------------------------------------------------------ */

function ServiceRow({ icon, title, text, on, state, href, testId }: {
  icon: IconName; title: string; text: React.ReactNode; on: boolean; state: string; href?: string; testId?: string;
}) {
  const body = (
    <>
      <span className="pn-orc-svc-ic" aria-hidden="true"><Ico name={icon} /></span>
      <span className="pn-orc-svc-t"><b>{title}</b><small>{text}</small></span>
      <span className={cx("pn-orc-state", on && "on")}>{state}</span>
      {href ? <span className="pn-orc-svc-go" aria-hidden="true"><Ico name="arrow" /></span> : <span className="pn-orc-svc-go" aria-hidden="true" />}
    </>
  );
  return href
    ? <li><Link href={href} className="pn-orc-svc" data-testid={testId}>{body}</Link></li>
    : <li><div className="pn-orc-svc" data-testid={testId}>{body}</div></li>;
}

function ServicesCard() {
  const { oracle } = useOracle();
  const on = oracle.enabled;
  const { prophecy } = oracle;
  return (
    <SectionCard title="Ce face Oracolul" small={on ? "pornit" : "oprit"} testId="oracle-services">
      <ul className="pn-orc-svcs">
        <ServiceRow
          icon="message" title="Răspunde în chat" href={MODULE.chat.route} testId="oracle-service-chat"
          text={`Când e menționat, ${whereSummary(oracle)}${oracle.chat.replyToReplies ? ", și la reply-uri" : ""}.`}
          on={on} state={on ? "pornit" : "oprit"}
        />
        <ServiceRow
          icon="orb" title="Profeții la cerere" href={MODULE.prophecy.route} testId="oracle-service-command"
          text={prophecy.commandEnabled ? `Cu /profetie, cel mult ${prophecy.dailyLimit} pe zi pentru fiecare membru.` : "/profetie e oprită pe server."}
          on={on && prophecy.commandEnabled} state={on && prophecy.commandEnabled ? "pornit" : "oprit"}
        />
        <ServiceRow
          icon="sun" title="Profeția zilei" href={MODULE.prophecy.route} testId="oracle-service-daily"
          text={prophecy.daily.enabled ? `În fiecare zi la ${hourText(prophecy.daily.hour)}, pentru tot serverul.` : "Nu e programată."}
          on={on && prophecy.daily.enabled} state={on && prophecy.daily.enabled ? "pornit" : "oprit"}
        />
        <ServiceRow
          icon="info" title="Întrebările din /ajutor"
          text="Oracolul le răspunde pe loc. Cât e oprit, botul dă răspunsul din ghidul scris."
          on={on} state={on ? "AI" : "ghid"}
        />
        <ServiceRow
          icon="users" title="Consiliul Umbrelor"
          text="Se oprește și el odată cu Oracolul. Setările lui vin pe pagina RPG."
          on={on} state={on ? "pornit" : "oprit"}
        />
      </ul>
      <Fields>
        <NoteRow tone="plain">
          Comenzile <code>/stopai</code> și <code>/startai</code> din Discord schimbă același comutator ca pagina asta. Dacă le folosește cineva cât
          ai pagina deschisă, reîncarc-o înainte să schimbi comutatorul.
        </NoteRow>
      </Fields>
    </SectionCard>
  );
}

function PausedPreview() {
  const draft = useBotDraft();
  const { config } = usePanel();
  const messages = config.gameplayConfig?.messages ?? {};
  const image = isMessageImageUrl(String(messages.oraclePausedImageUrl ?? "").trim()) ? String(messages.oraclePausedImageUrl ?? "").trim() : "";
  const thumbnail = isMessageImageUrl(String(messages.oraclePausedThumbnailUrl ?? "").trim()) ? String(messages.oraclePausedThumbnailUrl ?? "").trim() : "";
  return (
    <div className="pn-dc" data-testid="oracle-paused-preview">
      <p className="pn-dc-k">Așa apare în Discord</p>
      <p className="pn-orc-cmd"><Ico name="slash" /><span>Membru a folosit <b>/profetie</b></span></p>
      <OracleMessage ephemeral>
        <p className="pn-dc-text pn-orc-plain"><DiscordEmojiText emojis={draft.metadata?.emojis}>{String(messages.oraclePaused ?? "") || "…"}</DiscordEmojiText></p>
        {image || thumbnail ? (
          <div className="pn-dc-embed pn-orc-media">
            {thumbnail ? <img src={thumbnail} alt="" className="pn-dc-thumb" /> : null}
            {image ? <img src={image} alt="" className="pn-dc-image" /> : null}
          </div>
        ) : null}
      </OracleMessage>
    </div>
  );
}

function PausedCard() {
  const { config, set } = usePanel();
  const messages = config.gameplayConfig?.messages ?? {};
  const value = String(messages.oraclePaused ?? "");
  return (
    <SectionCard title="Cât timp e oprit" small="răspunsul la /profetie" testId="oracle-paused">
      <Fields>
        <EmojiTextField
          label="Mesajul" max={MAX_PAUSED_MESSAGE} multiline rows={3} value={value} testId="oracle-paused-text"
          hint="Îl primește, doar el, cine cere o profeție cât Oracolul e oprit. În chat, Oracolul oprit nu răspunde deloc."
          onChange={(next) => set(["gameplayConfig", "messages", "oraclePaused"], next)}
        />
        <ImageUrlField
          label="Imaginea mare" hint="Apare sub mesaj." value={String(messages.oraclePausedImageUrl ?? "")}
          onChange={(next) => set(["gameplayConfig", "messages", "oraclePausedImageUrl"], next)}
        />
        <ImageUrlField
          label="Imaginea mică" hint="Apare în colțul din dreapta sus." value={String(messages.oraclePausedThumbnailUrl ?? "")}
          onChange={(next) => set(["gameplayConfig", "messages", "oraclePausedThumbnailUrl"], next)}
        />
        <Fld label="Textul de bază" hint="Pune la loc mesajul cu care vine botul.">
          <button
            type="button" className="pn-btn-ghost pn-btn-sm" disabled={value === DEFAULT_PAUSED_MESSAGE} data-testid="button-oracle-paused-default"
            onClick={() => set(["gameplayConfig", "messages", "oraclePaused"], DEFAULT_PAUSED_MESSAGE)}
          ><Ico name="refresh" />Folosește textul de bază</button>
        </Fld>
      </Fields>
    </SectionCard>
  );
}

function StatusModule() {
  const { oracle, setOracle } = useOracle();
  const { saved } = usePanel();
  const on = oracle.enabled;
  return (
    <ModuleView module={MODULE.status} icon={ORACLE_ICONS.status} aside={(
      <div className="pn-mod-pw">
        <span aria-hidden="true">{on ? "Pornit" : "Oprit"}</span>
        <Switch large checked={on} label="Oracolul e pornit pe server" testId="oracle-enabled-switch" onChange={(next) => setOracle(["enabled"], next)} />
      </div>
    )}>
      {!on ? (
        <div className="pn-mod-off" data-testid="oracle-disabled">
          <Ico name="power" />
          <span>Oracolul e oprit: nu răspunde în chat, nu trimite profeții și nu ține Consiliul. Setările rămân salvate.</span>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => setOracle(["enabled"], true)}>Pornește Oracolul</button>
        </div>
      ) : null}
      <ModuleNotes>
        {saved?.discordLive === false ? <Note tone="warn">Botul Discord e offline. Setările se salvează și se aplică imediat ce revine.</Note> : null}
      </ModuleNotes>
      <ServicesCard />
      <div className="pn-vsplit">
        <div className="pn-vsplit-main"><PausedCard /></div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><PausedPreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Conversație                                                         */
/* ------------------------------------------------------------------ */

function WhereCard() {
  const { oracle, setOracle } = useOracle();
  const { channels } = usePanel();
  const ids = oracle.chat.channelIds;
  const [chosen, setChosen] = useState(ids.length > 0);
  const limited = chosen || ids.length > 0;
  const options = useMemo(() => oracleChannelOptions(channels), [channels]);
  const nameOf = (id: string) => {
    const channel = channels?.find((item) => item.id === id);
    if (!channel) return `ID ${id}`;
    return isCategory(channels, id) ? `categoria ${channel.name}` : `#${channel.name}`;
  };
  return (
    <SectionCard title="Unde răspunde" small={whereSummary(oracle)} testId="oracle-where">
      <Fields>
        <Seg
          label="Locurile" value={limited ? "chosen" : "all"} testId="oracle-where-mode"
          hint="Peste tot înseamnă orice canal pe care botul îl poate vedea și în care poate scrie."
          options={[["all", "Peste tot"], ["chosen", "Doar unde aleg"]]}
          onChange={(next) => {
            setChosen(next === "chosen");
            if (next === "all") setOracle(["chat", "channelIds"], []);
          }}
        />
        {limited ? (
          <IdPicker
            label="Canale și categorii" kind="channel" options={options} selected={ids} max={MAX_ORACLE_CHANNELS} testId="oracle-channels"
            hint="O categorie include toate canalele din ea. Firele (threads) urmează canalul în care sunt."
            onChange={(next) => setOracle(["chat", "channelIds"], next)}
          >
            {ids.length ? (
              <p className="pn-fh" role="status" data-testid="oracle-where-summary">
                Răspunde doar în {ids.slice(0, 4).map(nameOf).join(", ")}{ids.length > 4 ? ` și încă ${countLabel(ids.length - 4, "loc", "locuri")}` : ""}.
              </p>
            ) : (
              <p className="pn-err" role="alert" data-testid="oracle-where-empty">Alege cel puțin un canal sau o categorie. Fără niciunul, Oracolul răspunde peste tot.</p>
            )}
          </IdPicker>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

function WhenCard() {
  const { oracle, setOracle } = useOracle();
  const { capabilities } = usePanel();
  return (
    <SectionCard title="Când răspunde" testId="oracle-when">
      <Fields>
        <Fld label="Când e menționat" hint="Un membru scrie @Oracolul Cenușii în mesaj. Merge mereu, în locurile alese mai sus.">
          <span className="pn-orc-state on">mereu</span>
        </Fld>
        <SwitchField
          label="La reply-urile la mesajele lui" testId="oracle-reply-switch" checked={oracle.chat.replyToReplies}
          hint="Un membru dă reply la un mesaj al Oracolului, fără să-l mai menționeze, și conversația continuă."
          onChange={(next) => setOracle(["chat", "replyToReplies"], next)}
        />
        {capabilities?.messageContent === false ? (
          <NoteRow tone="warn">Botul nu are „Message Content Intent”, deci nu poate citi întrebările. Pornește-l din Discord Developer Portal.</NoteRow>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

function PaceCard() {
  const { oracle, setOracle } = useOracle();
  return (
    <SectionCard title="Ritm" small={cooldownText(oracle.chat.cooldownSeconds)} testId="oracle-pace">
      <Fields>
        <NumField
          label="Pauza pentru un membru" unit="secunde" min={0} max={MAX_COOLDOWN_SECONDS} testId="oracle-cooldown"
          hint="Cât așteaptă un membru între două răspunsuri. Ce scrie în pauză rămâne fără răspuns. 0 înseamnă fără pauză."
          value={oracle.chat.cooldownSeconds} onChange={(next) => setOracle(["chat", "cooldownSeconds"], next)}
        />
        <NoteRow tone="plain">Pe lângă pauza de aici, botul are o limită de răspunsuri pe oră, aceeași pentru toate serverele.</NoteRow>
      </Fields>
    </SectionCard>
  );
}

function ChatModule() {
  return (
    <ModuleView module={MODULE.chat} icon={ORACLE_ICONS.chat}>
      <OracleOffNote what="nu răspunde nicăieri" />
      <WhereCard />
      <WhenCard />
      <PaceCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Ton și lungime                                                      */
/* ------------------------------------------------------------------ */

function ToneCard() {
  const { oracle, setOracle } = useOracle();
  const id = useId();
  return (
    <SectionCard title="Tonul" testId="oracle-tone">
      <Fields>
        <Fld wide label="Cum vorbește" labelId={`${id}-l`} hint="Starea de spirit a Oracolului se simte în continuare, dar tonul ales are întâietate.">
          <div className="pn-orc-tones" role="radiogroup" aria-labelledby={`${id}-l`}>
            {TONES.map((tone) => {
              const checked = oracle.chat.tone === tone.id;
              return (
                <button
                  key={tone.id} type="button" role="radio" aria-checked={checked} className="pn-orc-tone" data-testid={`oracle-tone-${tone.id}`}
                  onClick={() => setOracle(["chat", "tone"], tone.id)}
                >
                  <b>{tone.label}</b>
                  <small>{tone.text}</small>
                </button>
              );
            })}
          </div>
        </Fld>
      </Fields>
    </SectionCard>
  );
}

function LengthCard() {
  const { oracle, setOracle } = useOracle();
  const selected = LENGTHS.find((length) => length.id === oracle.chat.length) ?? LENGTHS[1]!;
  return (
    <SectionCard title="Lungimea" testId="oracle-length">
      <Fields>
        <Seg
          label="Cât de lung răspunde" hint={selected.text} value={oracle.chat.length} testId="oracle-length-seg"
          options={LENGTHS.map((length) => [length.id, length.label] as const)}
          onChange={(next) => setOracle(["chat", "length"], next)}
        />
      </Fields>
    </SectionCard>
  );
}

function StylePreview() {
  const { oracle } = useOracle();
  return (
    <div className="pn-dc" data-testid="oracle-style-preview">
      <p className="pn-dc-k">Exemplu</p>
      <div className="pn-dc-msg pn-orc-q">
        <span className="pn-dc-av pn-orc-member" aria-hidden="true">M</span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Membru</b></p>
          <p className="pn-dc-text"><span className="pn-orc-mention">@Oracolul Cenușii</span> {SAMPLE_QUESTION}</p>
        </div>
      </div>
      <OracleMessage>
        <p className="pn-dc-text pn-orc-plain" data-testid="oracle-style-sample">{sampleAnswer(oracle.chat.tone, oracle.chat.length)}</p>
      </OracleMessage>
      <p className="pn-orc-fine">Exemplul e scris de mână, ca să vezi diferența. Răspunsurile adevărate le scrie AI-ul, după întrebare.</p>
    </div>
  );
}

function StyleModule() {
  return (
    <ModuleView module={MODULE.style} icon={ORACLE_ICONS.style}>
      <OracleOffNote what="nu răspunde în chat" />
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <ToneCard />
          <LengthCard />
          <Note tone="plain">Tonul și lungimea se aplică răspunsurilor din chat. Profețiile își păstrează vocea lor.</Note>
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><StylePreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Profeții                                                            */
/* ------------------------------------------------------------------ */

function CommandCard() {
  const { oracle, setOracle } = useOracle();
  const { commandEnabled, dailyLimit } = oracle.prophecy;
  return (
    <SectionCard title="Profeții la cerere" small="/profetie" testId="oracle-command">
      <Fields>
        <SwitchField
          label="Comanda /profetie" testId="oracle-command-switch" checked={commandEnabled}
          hint="Un membru scrie /profetie și primește, doar el, o profeție despre drumul lui în Regat."
          onChange={(next) => setOracle(["prophecy", "commandEnabled"], next)}
        />
        {commandEnabled ? (
          <NumField
            label="Câte pe zi" unit="de fiecare membru" min={1} max={MAX_DAILY_LIMIT} testId="oracle-daily-limit"
            hint="Ziua se schimbă la miezul nopții, după fusul orar al profeției zilei. Între două profeții, un membru mai așteaptă câteva minute."
            value={dailyLimit} onChange={(next) => setOracle(["prophecy", "dailyLimit"], next)}
          />
        ) : (
          <NoteRow tone="plain">Cine o încearcă primește: „🔮 Profețiile la cerere sunt oprite pe acest server.”</NoteRow>
        )}
      </Fields>
    </SectionCard>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function HourPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const id = useId();
  const pick = (hour: number) => {
    onChange(hour);
    requestAnimationFrame(() => document.getElementById(`${id}-${hour}`)?.focus());
  };
  return (
    <Fld wide label="Ora" labelId={`${id}-l`} hint="Profeția pleacă în primul minut al orei alese.">
      <div className="pn-orc-hours" role="radiogroup" aria-labelledby={`${id}-l`} data-testid="oracle-daily-hour">
        {HOURS.map((hour) => {
          const checked = hour === value;
          return (
            <button
              key={hour} id={`${id}-${hour}`} type="button" role="radio" aria-checked={checked} aria-label={hourText(hour)} tabIndex={checked ? 0 : -1}
              className={cx("pn-orc-hour", hour >= 6 && hour < 20 ? "is-day" : "is-night")}
              onClick={() => onChange(hour)}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                event.preventDefault();
                pick((hour + step + 24) % 24);
              }}
            >{String(hour).padStart(2, "0")}</button>
          );
        })}
      </div>
    </Fld>
  );
}

function NextProphecy() {
  const { oracle } = useOracle();
  const { saved } = usePanel();
  const daily = oracle.prophecy.daily;
  const now = new Date();
  const next = nextDailyProphecy(daily, now);
  if (!next) return null;
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const viewerTime = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: viewerZone }).format(next);
  const sameClock = viewerTime === hourText(daily.hour);
  const ready = oracle.enabled && daily.enabled && Boolean(daily.channelId);
  return (
    <div className={cx("pn-orc-next", ready && "is-ready")} role="status" data-testid="oracle-daily-next">
      <Ico name="clock" />
      <span>
        {ready ? (
          <>
            Următoarea profeție: <b>{dayWord(next, now, daily.timeZone)}, la {hourText(daily.hour)}</b>, {timeZoneClock(daily.timeZone)}
            {sameClock ? null : <> (adică {viewerTime} la tine)</>}.
            {isDailyHourNow(daily, now) ? " Ora aleasă e chiar acum: dacă azi n-a plecat încă, pleacă la un minut după salvare." : null}
            {saved?.discordLive === false ? " Botul e offline acum; profeția pleacă doar cât e online." : null}
          </>
        ) : !oracle.enabled ? "Oracolul e oprit, deci profeția zilei nu pleacă." : !daily.enabled ? "Profeția zilei e oprită." : "Alege canalul ca să programezi profeția."}
      </span>
    </div>
  );
}

function TimeZoneField({ hint }: { hint: string }) {
  const { oracle, setOracle } = useOracle();
  const zone = oracle.prophecy.daily.timeZone;
  const id = useId();
  return (
    <Fld label="Fusul orar" labelId={`${id}-l`} hint={hint}>
      <select
        className="pn-inp" aria-labelledby={`${id}-l`} value={zone} data-testid="oracle-daily-timezone"
        onChange={(event) => setOracle(["prophecy", "daily", "timeZone"], event.target.value)}
      >
        {!TIME_ZONES.some(([known]) => known === zone) ? <option value={zone}>{zone}</option> : null}
        {TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </Fld>
  );
}

function DailyCard() {
  const { oracle, setOracle } = useOracle();
  const { channels } = usePanel();
  const daily = oracle.prophecy.daily;
  return (
    <SectionCard title="Profeția zilei" small={daily.enabled ? `zilnic la ${hourText(daily.hour)}` : "oprită"} testId="oracle-daily">
      <Fields>
        <SwitchField
          label="Trimite profeția zilei" testId="oracle-daily-switch" checked={daily.enabled}
          hint="O dată pe zi, Oracolul scrie o profeție pentru tot serverul, în canalul ales."
          onChange={(next) => setOracle(["prophecy", "daily", "enabled"], next)}
        />
        {daily.enabled ? (
          <>
            <ChannelField
              label="Canalul" selectLabel="Canalul profeției zilei" value={daily.channelId || null} channels={channels}
              hint="Un canal text pe care îl văd membrii și în care botul poate scrie."
              onChange={(next) => setOracle(["prophecy", "daily", "channelId"], next ?? "")}
            />
            {!daily.channelId ? <NoteRow tone="bad" role="alert">Alege canalul; fără el profeția zilei nu se poate salva pornită.</NoteRow> : null}
            <HourPicker value={daily.hour} onChange={(next) => setOracle(["prophecy", "daily", "hour"], next)} />
            <TimeZoneField hint="După el se socotesc ora profeției și ziua pentru limita de la /profetie." />
            <Fld wide label="Când pleacă"><NextProphecy /></Fld>
            <Fld wide label="Cum arată">
              <div className="pn-dc" data-testid="oracle-daily-preview">
                <OracleMessage>
                  <div className="pn-dc-embed">
                    <p className="pn-dc-title">🔮 Profeția zilei</p>
                    <p className="pn-dc-text pn-orc-ghost">Textul îl scrie AI-ul în fiecare zi: două-patru propoziții pentru tot Regatul, după atmosfera serverului.</p>
                  </div>
                </OracleMessage>
              </div>
            </Fld>
          </>
        ) : (
          <TimeZoneField hint="După el se schimbă ziua pentru limita de la /profetie." />
        )}
      </Fields>
    </SectionCard>
  );
}

function ProphecyModule() {
  return (
    <ModuleView module={MODULE.prophecy} icon={ORACLE_ICONS.prophecy}>
      <OracleOffNote what="nu trimite profeții" />
      <CommandCard />
      <DailyCard />
    </ModuleView>
  );
}

export const ORACLE_VIEWS: Record<OracleModuleId, () => React.JSX.Element> = {
  status: StatusModule,
  chat: ChatModule,
  style: StyleModule,
  prophecy: ProphecyModule,
};
