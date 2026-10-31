/**
 * Modulele paginii Jocul: Stare și pauză, Canale, Evenimente, Misiuni,
 * Economie. Logica e în game-model.ts; ciorna și salvarea în bot-draft.tsx.
 */
import React, { createContext, useContext, useEffect, useId, useState } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import { ChannelField, Fields, Fld, Ico, Note, NoteRow, NumField, SectionCard, Spinner, Switch, SwitchField, cx, type IconName } from "./fields";
import type { useGameplayState } from "../../../hooks/use-moderation-api";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import {
  ECONOMY_FIELDS, EVENT_FIELDS, GAME_CHANNELS, GAME_MODULES, MAX_MULTIPLIER, MIN_MULTIPLIER, MISSIONS, MULTIPLIER_PRESETS,
  RAID_WEEKDAYS, raidOf, raidWindowText, PLACES, SEASON_POINT_LIST, seasonsOf, ACHIEVEMENT_LIST, progressOf, streakLadder, economyOf, eventsOf, eventsPerDay, gameChannelCount, isValidMultiplier, minutesText, missionOf, multiplierText,
  type GameModuleId,
} from "./game-model";
import { ModuleView } from "./rules";

const MODULE = Object.fromEntries(GAME_MODULES.map((module) => [module.id, module])) as Record<GameModuleId, (typeof GAME_MODULES)[number]>;

/** The game's running state, read and changed at once through /gameplay-state (not part of the draft). */
export const GameStateContext = createContext<ReturnType<typeof useGameplayState> | null>(null);

export const GAME_ICONS: Record<GameModuleId, IconName> = { state: "power", channels: "hash", events: "calendar", missions: "scroll", economy: "star", progress: "verified", seasons: "calendar", raid: "raid" };

/* ------------------------------------------------------------------ */
/* Stare                                                               */
/* ------------------------------------------------------------------ */

function StateModule() {
  const { config, set } = usePanel();
  const game = useContext(GameStateContext);
  const messages = config.gameplayConfig?.messages ?? {};
  const channels = gameChannelCount(config);
  const paused = game?.paused ?? null;
  const running = paused === false;
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { setConfirming(false); }, [paused]);
  const change = async (nextRunning: boolean) => {
    if (!game) return;
    setSaving(true);
    setProblem(null);
    try {
      await game.update(!nextRunning);
      setConfirming(false);
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "Starea jocului nu a putut fi schimbată.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModuleView
      module={MODULE.state} icon="power"
      aside={(
        <div className="pn-mod-pw">
          <span aria-hidden="true">{paused === null ? (game?.loading ? "Se încarcă" : "Necunoscut") : running ? "Pornit" : "Oprit"}</span>
          {saving ? <Spinner /> : null}
          <Switch
            large checked={running} label="Jocul rulează pe server" testId="game-running" disabled={paused === null || saving}
            onChange={(next) => (next ? void change(true) : setConfirming(true))}
          />
        </div>
      )}
    >
      {confirming ? (
        <div className="pn-mod-off" role="alert" data-testid="game-stop-confirm">
          <Ico name="alert" />
          <span>Evenimentele, boșii, cuferele și recompensele se opresc până pornești jocul. Progresul jucătorilor rămâne.</span>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setConfirming(false)} disabled={saving}>Renunță</button>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => void change(false)} disabled={saving} data-testid="game-stop-confirm-button">Da, oprește jocul</button>
        </div>
      ) : null}
      {problem ? <Note tone="bad" role="alert">{problem}</Note> : null}
      {paused === null && !game?.loading ? (
        <Note tone="warn">Starea jocului nu a putut fi citită. <button type="button" className="pn-lnk" onClick={() => void game?.refetch()}>Încearcă din nou</button></Note>
      ) : null}
      <Note tone="plain">Pornirea și oprirea se aplică pe loc, fără „Salvează”.</Note>
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

/* ------------------------------------------------------------------ */
/* Serii și realizări                                                  */
/* ------------------------------------------------------------------ */

function ProgressModule() {
  const { config, set } = usePanel();
  const progress = progressOf(config);
  const change = (key: string, value: unknown) => set(["gameplayConfig", "progress"], { ...progress, [key]: value });
  const ladder = streakLadder(progress, 7);
  return (
    <ModuleView module={MODULE.progress} icon="verified">
      <SectionCard title="Seria zilnică" small={progress.streakEnabled ? "Pornită" : "Oprită"} testId="game-streak">
        <Fields>
          <SwitchField label="Seria zilnică" testId="game-streak-switch" checked={progress.streakEnabled} hint="Zile la rând cu Cufărul Vegherii deschis. O zi sărită o ia de la capăt." onChange={(next) => change("streakEnabled", next)} />
          <NumField label="Bonus pe zi" unit="%" min={0} max={100} value={progress.streakBonusPercent} testId="game-streak-bonus" hint="Cât adaugă fiecare zi la Obolii și XP-ul cufărului, începând cu a doua." onChange={(next) => change("streakBonusPercent", next ?? 0)} />
          <NumField label="Bonusul crește până în ziua" unit="" min={1} max={30} value={progress.streakMaxDays} testId="game-streak-max" onChange={(next) => change("streakMaxDays", next ?? 0)} />
          <SwitchField label="Cheie epică la fiecare 7 zile" testId="game-streak-key" checked={progress.weeklyKey} onChange={(next) => change("weeklyKey", next)} />
        </Fields>
        {progress.streakEnabled ? (
          <div className="pn-ladder" aria-label="Bonusul pe zile" data-testid="game-streak-ladder">
            {ladder.map((bonus, index) => (
              <div key={index} className={cx("pn-ladder-d", index === 6 && progress.weeklyKey && "is-key")}>
                <span>Ziua {index + 1}</span>
                <b>{bonus ? `+${bonus}%` : "—"}</b>
                {index === 6 && progress.weeklyKey ? <small>🗝️ cheie</small> : null}
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title="Realizările" small={`${ACHIEVEMENT_LIST.length} insigne`} testId="game-achievements">
        <Fields>
          <SwitchField label="Realizările" testId="game-achievements-switch" checked={progress.achievementsEnabled} hint="Oprite, nu se mai deblochează insigne noi; cele câștigate rămân." onChange={(next) => change("achievementsEnabled", next)} />
          <SwitchField label="Recompense în Oboli" testId="game-achievements-rewards" checked={progress.achievementRewards} disabled={!progress.achievementsEnabled} onChange={(next) => change("achievementRewards", next)} />
        </Fields>
        <ul className="pn-ach">
          {ACHIEVEMENT_LIST.map((achievement) => (
            <li key={achievement.name}>
              <span aria-hidden="true">{achievement.emoji}</span>
              <b>{achievement.name}</b>
              <small>{achievement.description}</small>
              {progress.achievementRewards ? <em>+{achievement.reward.toLocaleString("ro-RO")} Oboli</em> : null}
            </li>
          ))}
        </ul>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Sezoane                                                             */
/* ------------------------------------------------------------------ */

function SeasonsModule() {
  const { config, set, roles, channels } = usePanel();
  const seasons = seasonsOf(config);
  const change = (next: Partial<typeof seasons>) => set(["gameplayConfig", "seasons"], { ...seasons, ...next });
  const id = useId();
  const assignable = (roles ?? []).filter((role) => !role.managed && role.name !== "@everyone");
  return (
    <ModuleView module={MODULE.seasons} icon="calendar">
      <SectionCard title="Sezoanele" small={seasons.enabled ? "Pornite" : "Oprite"} testId="game-seasons">
        <Fields>
          <SwitchField label="Sezoane lunare" testId="game-seasons-switch" checked={seasons.enabled} hint="Oprite, nu se mai adună puncte și nu se mai dau premii." onChange={(next) => change({ enabled: next })} />
          <ChannelField
            label="Anunțul câștigătorilor" selectLabel="Canalul anunțului de sezon" value={seasons.channelId || null} channels={channels}
            hint="Gol: în canalul Top Ora Umbrelor." onChange={(next) => change({ channelId: next ?? "" })}
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Premii" testId="game-seasons-prizes">
        <Fields>
          {PLACES.map((place, index) => (
            <React.Fragment key={place}>
              <NumField
                label={`${place}: Oboli`} unit="Oboli" min={0} max={1_000_000} value={seasons.rewards[index]} testId={`game-season-reward-${index + 1}`}
                onChange={(next) => change({ rewards: seasons.rewards.map((gold, at) => at === index ? next ?? 0 : gold) as [number, number, number] })}
              />
              <Fld label={`${place}: rol`} htmlFor={`${id}-r${index}`} hint={index === 0 ? "Opțional. Botul îl ia de la câștigătorul de luna trecută și îl dă celui nou; are nevoie de Manage Roles și de un rol mai mare." : undefined}>
                <select
                  id={`${id}-r${index}`} className="pn-inp" value={seasons.roleIds[index]} data-testid={`game-season-role-${index + 1}`}
                  onChange={(event) => change({ roleIds: seasons.roleIds.map((roleId, at) => at === index ? event.target.value : roleId) as [string, string, string] })}
                >
                  <option value="">Fără rol</option>
                  {seasons.roleIds[index] && !assignable.some((role) => role.id === seasons.roleIds[index]) ? <option value={seasons.roleIds[index]}>Rol salvat ({seasons.roleIds[index]})</option> : null}
                  {assignable.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
                </select>
              </Fld>
            </React.Fragment>
          ))}
        </Fields>
        <p className="pn-fh">Primii trei primesc și titlul de onoare („Campionul Sezonului de Noiembrie 2026”), afișat pe /profil.</p>
      </SectionCard>
      <SectionCard title="Cum se adună puncte" testId="game-seasons-points">
        <ul className="pn-ach">
          {SEASON_POINT_LIST.map(([label, points]) => (
            <li key={label}><span aria-hidden="true">{label.split(" ")[0]}</span><b>{label.split(" ").slice(1).join(" ")}</b><small>{points ? `${points} ${points === 1 ? "punct" : "puncte"}` : "nu dau puncte, ca vorba să nu cumpere un sezon"}</small></li>
          ))}
        </ul>
      </SectionCard>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Raid                                                                */
/* ------------------------------------------------------------------ */

function RaidModule() {
  const { config, set, channels } = usePanel();
  const raid = raidOf(config);
  const change = (next: Partial<typeof raid>) => set(["gameplayConfig", "raid"], { ...raid, ...next });
  const id = useId();
  return (
    <ModuleView module={MODULE.raid} icon="raid" aside={<span className="pn-badge is-plain">{raid.enabled ? raidWindowText(raid) : "Oprit"}</span>}>
      <SectionCard title="Când vine" testId="game-raid-when">
        <Fields>
          <SwitchField label="Raidul săptămânal" testId="game-raid-switch" checked={raid.enabled} hint="Vine doar cât jocul e pornit." onChange={(next) => change({ enabled: next })} />
          <Fld label="Ziua" htmlFor={`${id}-d`} hint="Ora României.">
            <select id={`${id}-d`} className="pn-inp" value={raid.weekday} data-testid="game-raid-weekday" onChange={(event) => change({ weekday: Number(event.target.value) })}>
              {RAID_WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Fld>
          <NumField label="Ora" unit=":00" min={0} max={23} value={raid.hour} testId="game-raid-hour" onChange={(next) => change({ hour: next ?? -1 })} />
          <NumField label="Cât stă" unit="ore" min={1} max={144} value={raid.durationHours} testId="game-raid-duration" onChange={(next) => change({ durationHours: next ?? 0 })} />
          <ChannelField
            label="Canalul raidului" selectLabel="Canalul raidului" value={raid.channelId || null} channels={channels}
            hint="Gol: în canalul Dragonul Stins." onChange={(next) => change({ channelId: next ?? "" })}
          />
        </Fields>
      </SectionCard>
      <SectionCard title="Lupta și prada" testId="game-raid-fight">
        <Fields>
          <NumField label="Pauza dintre lovituri" unit="min" min={1} max={1_440} value={raid.cooldownMinutes} testId="game-raid-cooldown" hint="Cât așteaptă un jucător între două lovituri." onChange={(next) => change({ cooldownMinutes: next ?? 0 })} />
          <NumField label="Viață pe jucător activ" unit="viață" min={100} max={10_000_000} value={raid.hpPerPlayer} testId="game-raid-hp" hint="Ori jucătorii activi în ultima săptămână (cel puțin 5). Mai mult înseamnă un titan mai greu." onChange={(next) => change({ hpPerPlayer: next ?? 0 })} />
          <NumField label="Prada" unit="Oboli" min={0} max={10_000_000} value={raid.rewardPool} testId="game-raid-pool" hint="Împărțită după daune; primii trei mai primesc o cheie epică." onChange={(next) => change({ rewardPool: next ?? 0 })} />
        </Fields>
        <p className="pn-fh">Fiecare participare contează ca o bătălie cu un boss: pentru cufărul zilnic, realizări și sezon.</p>
      </SectionCard>
    </ModuleView>
  );
}

export const GAME_VIEWS: Record<GameModuleId, () => React.ReactElement> = {
  state: StateModule,
  channels: ChannelsModule,
  events: EventsModule,
  missions: MissionsModule,
  economy: EconomyModule,
  progress: ProgressModule,
  seasons: SeasonsModule,
  raid: RaidModule,
};
