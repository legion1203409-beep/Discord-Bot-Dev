/**
 * Modulele paginii Jocul: Stare și pauză, Canale, Evenimente, Misiuni,
 * Economie. Logica e în game-model.ts; ciorna și salvarea în bot-draft.tsx.
 */
import React, { useId } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import { ChannelField, Fields, Fld, Ico, Note, NoteRow, NumField, SectionCard, Switch, cx, type IconName } from "./fields";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import {
  ECONOMY_FIELDS, EVENT_FIELDS, GAME_CHANNELS, GAME_MODULES, MAX_MULTIPLIER, MIN_MULTIPLIER, MISSIONS, MULTIPLIER_PRESETS,
  economyOf, eventsOf, eventsPerDay, gameChannelCount, isValidMultiplier, minutesText, missionOf, multiplierText,
  type GameModuleId,
} from "./game-model";
import { ModuleView } from "./rules";

const MODULE = Object.fromEntries(GAME_MODULES.map((module) => [module.id, module])) as Record<GameModuleId, (typeof GAME_MODULES)[number]>;

export const GAME_ICONS: Record<GameModuleId, IconName> = { state: "power", channels: "hash", events: "calendar", missions: "scroll", economy: "star" };

/* ------------------------------------------------------------------ */
/* Stare                                                               */
/* ------------------------------------------------------------------ */

function StateModule() {
  const { config, set } = usePanel();
  const game = config.gameplayConfig ?? {};
  const running = game.paused === false;
  const messages = game.messages ?? {};
  const channels = gameChannelCount(config);
  return (
    <ModuleView
      module={MODULE.state} icon="power"
      aside={(
        <div className="pn-mod-pw">
          <span aria-hidden="true">{running ? "Pornit" : "Oprit"}</span>
          <Switch large checked={running} label="Jocul rulează pe server" testId="game-running" onChange={(next) => set(["gameplayConfig", "paused"], !next)} />
        </div>
      )}
    >
      {running && channels === 0 ? (
        <Note tone="warn">Jocul e pornit, dar n-ai ales niciun canal, deci nu apare nimic. Alege canalele la <Link href="/joc/canale">Canale</Link>.</Note>
      ) : null}
      <SectionCard title="Ce înseamnă" testId="game-state-how">
        <ul className="pn-fh pn-card-lede" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          <li><b>Pornit</b>: evenimentele, boșii și cuferele vin singure, după programul de la Evenimente.</li>
          <li><b>Oprit</b>: nu mai apare nimic automat, iar comenzile jocului răspund cu mesajul de mai jos. Progresul jucătorilor rămâne.</li>
        </ul>
      </SectionCard>
      <SectionCard title="Mesajul cât jocul e oprit" testId="game-paused-message">
        <Fields>
          <EmojiTextField
            label="Mesajul" max={2_000} multiline rows={3} value={String(messages.gamePaused ?? "")} testId="game-paused-text"
            onChange={(next) => set(["gameplayConfig", "messages", "gamePaused"], next)}
          />
          <ImageUrlField label="Imaginea mare" hint="Sub mesaj; opțional." value={String(messages.gamePausedImageUrl ?? "")} onChange={(next) => set(["gameplayConfig", "messages", "gamePausedImageUrl"], next)} />
          <ImageUrlField label="Imaginea mică" hint="În colțul din dreapta sus; opțional." value={String(messages.gamePausedThumbnailUrl ?? "")} onChange={(next) => set(["gameplayConfig", "messages", "gamePausedThumbnailUrl"], next)} />
        </Fields>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Canale                                                              */
/* ------------------------------------------------------------------ */

const CHANNEL_GROUPS: ReadonlyArray<readonly ["play" | "tops" | "community", string]> = [["play", "Activitățile jocului"], ["tops", "Clasamente"], ["community", "Comunitate"]];

function ChannelsModule() {
  const { config, set, channels } = usePanel();
  return (
    <ModuleView module={MODULE.channels} icon="hash" aside={<span className="pn-badge is-plain">{gameChannelCount(config)}/{GAME_CHANNELS.length}</span>}>
      {CHANNEL_GROUPS.map(([group, title]) => (
        <SectionCard key={group} title={title} testId={`game-channels-${group}`}>
          <Fields>
            {GAME_CHANNELS.filter((channel) => channel.group === group).map((channel) => (
              <ChannelField
                key={channel.key} label={channel.label} hint={channel.hint} selectLabel={`Canalul pentru ${channel.label}`}
                value={config.channels?.[channel.key] || null} channels={channels}
                onChange={(next) => set(["channels", channel.key], next ?? "")}
              />
            ))}
          </Fields>
        </SectionCard>
      ))}
      <Note tone="plain">Același lucru îl face și /setcanal în Discord; ce alegi aici se vede și acolo.</Note>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Evenimente                                                          */
/* ------------------------------------------------------------------ */

function EventsModule() {
  const { config, set } = usePanel();
  const events = eventsOf(config);
  const perDay = eventsPerDay(events);
  const setEvent = (key: string, next: number | undefined) => set(["gameplayConfig", "events", key], next ?? 0);
  return (
    <ModuleView module={MODULE.events} icon="calendar">
      <div className="pn-gstats" data-testid="game-events-day">
        <div><b>~{perDay.shadowHour.toLocaleString("ro-RO")}</b><span>Ore ale Umbrelor pe zi</span></div>
        <div><b>~{perDay.dragon.toLocaleString("ro-RO")}</b><span>Dragoni pe zi</span></div>
        <div><b>~{perDay.chests.toLocaleString("ro-RO")}</b><span>cufere pe zi</span></div>
      </div>
      {EVENT_FIELDS.map((group) => (
        <SectionCard key={group.group} title={group.group}>
          <Fields>
            {group.fields.map((field) => (
              <NumField
                key={field.key} label={field.label} hint={field.hint ?? minutesText(events[field.key])} unit="min" min={1} max={field.max}
                value={events[field.key]} testId={`game-${field.key}`} onChange={(next) => setEvent(field.key, next)}
              />
            ))}
          </Fields>
          {group.group === "Ora Umbrelor" && events.eventCooldownMaxMinutes < events.eventCooldownMinMinutes
            ? <NoteRow tone="bad" role="alert">Pauza maximă trebuie să fie cel puțin cât cea minimă.</NoteRow> : null}
          {group.group === "Dragonul Stins" && events.standaloneBossIntervalMaxMinutes < events.standaloneBossIntervalMinMinutes
            ? <NoteRow tone="bad" role="alert">Intervalul maxim trebuie să fie cel puțin cât cel minim.</NoteRow> : null}
        </SectionCard>
      ))}
      <Note tone="plain">Programul nou pornește de la următorul eveniment; ce e deja în desfășurare se termină normal.</Note>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Misiuni                                                             */
/* ------------------------------------------------------------------ */

function MissionsModule() {
  const { config, set } = usePanel();
  return (
    <ModuleView module={MODULE.missions} icon="scroll">
      {MISSIONS.map((mission) => {
        const value = missionOf(config, mission.key);
        return (
          <SectionCard key={mission.key} title={mission.label} small={`${value.target} ${mission.verb} → ${value.rewardQty}× ${mission.reward}`} testId={`game-mission-${mission.key}`}>
            <Fields>
              <NumField label="Ținta" unit={mission.verb} min={1} max={10_000} value={value.target} testId={`game-${mission.key}-target`}
                onChange={(next) => set(["gameplayConfig", "missions", mission.key], { ...value, target: next ?? 0 })} />
              <NumField label="Recompensa" unit={`× ${mission.reward}`} min={1} max={100} value={value.rewardQty} testId={`game-${mission.key}-reward`}
                onChange={(next) => set(["gameplayConfig", "missions", mission.key], { ...value, rewardQty: next ?? 0 })} />
            </Fields>
          </SectionCard>
        );
      })}
      <Note tone="plain">Misiunile se reînnoiesc zilnic; ținta nouă se aplică de la următoarea zi de misiuni.</Note>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Economie                                                            */
/* ------------------------------------------------------------------ */

function MultiplierField({ label, value, onChange, testId }: { label: string; value: number; onChange: (next: number) => void; testId: string }) {
  const id = useId();
  const invalid = !isValidMultiplier(value);
  return (
    <Fld label={label} htmlFor={id} hint={invalid ? undefined : value === 1 ? "Valoarea de bază." : value > 1 ? `De ${multiplierText(value)} mai mult.` : `De ${multiplierText(1 / value)} mai puțin.`}>
      <div className="pn-mult">
        <input
          id={id} className={cx("pn-inp pn-inp-num", invalid && "is-bad")} type="number" inputMode="decimal" step={0.1} min={MIN_MULTIPLIER} max={MAX_MULTIPLIER}
          value={Number.isFinite(value) ? value : ""} data-testid={testId}
          onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
        />
        <span className="pn-unit">×</span>
        <div className="pn-mult-p" role="group" aria-label={`Valori rapide pentru ${label}`}>
          {MULTIPLIER_PRESETS.map((preset) => (
            <button key={preset} type="button" className={cx("pn-tab", value === preset && "is-on")} onClick={() => onChange(preset)}>{multiplierText(preset)}</button>
          ))}
        </div>
      </div>
      {invalid ? <p className="pn-err" role="alert">Între {MIN_MULTIPLIER} și {MAX_MULTIPLIER}.</p> : null}
    </Fld>
  );
}

function EconomyModule() {
  const { config, set } = usePanel();
  const economy = economyOf(config);
  const setAll = (value: number) => set(["gameplayConfig", "economy"], Object.fromEntries(ECONOMY_FIELDS.map((field) => [field.key, value])));
  return (
    <ModuleView module={MODULE.economy} icon="star">
      <SectionCard title="Rapid" testId="game-economy-quick">
        <div className="pn-btns">
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setAll(1)} data-testid="game-economy-base"><Ico name="refresh" />Valorile de bază</button>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setAll(2)} data-testid="game-economy-double"><Ico name="star" />Weekend dublu (2× la tot)</button>
        </div>
        <p className="pn-fh">Un eveniment special: pune 2× pe tot pentru weekend, apoi revii la valorile de bază.</p>
      </SectionCard>
      {(["monster", "boss"] as const).map((who) => (
        <SectionCard key={who} title={who === "monster" ? "Monștri" : "Boși"}>
          <Fields>
            {ECONOMY_FIELDS.filter((field) => field.who === who).map((field) => (
              <MultiplierField
                key={field.key} label={field.label} value={economy[field.key]} testId={`game-${field.key}`}
                onChange={(next) => set(["gameplayConfig", "economy", field.key], next)}
              />
            ))}
          </Fields>
        </SectionCard>
      ))}
    </ModuleView>
  );
}

export const GAME_VIEWS: Record<GameModuleId, () => React.ReactElement> = {
  state: StateModule,
  channels: ChannelsModule,
  events: EventsModule,
  missions: MissionsModule,
  economy: EconomyModule,
};
