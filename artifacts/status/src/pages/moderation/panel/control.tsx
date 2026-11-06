/**
 * Modulele paginii Control bot: Invitații, Recrutare, Raport zilnic, Canale și
 * acces, Botul pe server. Logica e în control-model.ts; ciorna, salvarea și
 * crearea canalelor în bot-draft.tsx.
 */
import React, { useEffect, useId, useMemo, useState } from "react";
import { Link } from "wouter";
import { DiscordEmojiText } from "../../../components/moderation/DiscordEmojiText";
import { apiFetchWithMeta, useActiveGuild, useChannelNames, useInviteStats, useSession, type ChannelPermissionConfig, type InviteStatsRange } from "../../../hooks/use-moderation-api";
import { useToast } from "../../../hooks/use-toast";
import { useBotDraft } from "./bot-draft";
import { usePanel } from "./context";
import {
  ChannelField, Fields, Fld, Ico, Note, NoteRow, NumField, Pill, SectionCard, Seg, Spinner, Switch, SwitchField, cx, type IconName,
} from "./fields";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import {
  ACTIVE_TOP_LIMITS, ACTIVE_TOP_PREVIEW_CHAT, ACTIVE_TOP_PREVIEW_VOICE, activeTopOf, activeTopProblem, activeTopVoiceTime, type ActiveTop,
  CONTROL_MODULES, DAILY_INTERVALS, DAILY_METRICS, DAILY_PREVIEW_ACTIVITY, DAILY_PREVIEW_INVITERS, dailyInterval, dailyIntervalText, dailyInviteTopOn, dailyTitleFor,
  longDayName, nextDailyReport, shortPeriod, DAILY_PREVIEW_DAYS, DAILY_PREVIEW_MEMBERS, DAILY_TEXTS, DAILY_TOKENS, PROVISION_CATEGORIES,
  BOT_CHECKS, RECRUITMENT_FIELDS, dailyCardDelta, dailyCardText, dailyChartOn, dailyDeltaText, dailyPreviewChannels, dailyPreviewWeek,
  REPORT_TIME_ZONES, ROLE_PRESETS, WEEKDAYS, accessSummary, dailyProblem, inviteReportSummary, isClockTime, permissionOf, presetRole,
  recruitmentProblem, renderDailyText, roleAccessOf, withRole, withRoleAccess, type ControlModuleId, type ProvisionKey, type RoleAccess,
} from "./control-model";
import { ModuleNotes, ModuleView } from "./rules";
import { isMessageImageUrl } from "./verification-model";

const MODULE: Record<ControlModuleId, (typeof CONTROL_MODULES)[number]> = Object.fromEntries(
  CONTROL_MODULES.map((module) => [module.id, module]),
) as Record<ControlModuleId, (typeof CONTROL_MODULES)[number]>;

export const CONTROL_ICONS: Record<ControlModuleId, IconName> = { invites: "send", recruitment: "star", daily: "calendar", activeTop: "stairs", channels: "folder", server: "bot" };

/** A big on/off switch on the right of a module head, and the note when it is off. */
function HeadSwitch({ on, label, testId, onChange }: { on: boolean; label: string; testId: string; onChange: (next: boolean) => void }) {
  return (
    <div className="pn-mod-pw">
      <span aria-hidden="true">{on ? "Pornit" : "Oprit"}</span>
      <Switch large checked={on} label={label} testId={testId} onChange={onChange} />
    </div>
  );
}

function OffNote({ text, action, onTurnOn, testId }: { text: string; action: string; onTurnOn: () => void; testId: string }) {
  return (
    <div className="pn-mod-off" data-testid={testId}>
      <Ico name="power" />
      <span>{text}</span>
      <button type="button" className="pn-btn pn-btn-sm" onClick={onTurnOn}>{action}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invitații                                                           */
/* ------------------------------------------------------------------ */

function useTracking() {
  const { config, set } = usePanel();
  const tracking = config.inviteTracking;
  const setTracking = (key: string, value: unknown) => set(["inviteTracking", key], value);
  return { tracking, setTracking };
}

function InviteNeeds() {
  const { capabilities } = usePanel();
  return (
    <Note tone={capabilities?.canManageGuild === false || capabilities?.guildMembers === false ? "warn" : "plain"} testId="control-invites-needs">
      <p>Ca să știe cine a adus pe cine, botul are nevoie de permisiunea <b>Manage Server</b> și de intenția <b>Server Members</b>, pornită din Discord Developer Portal.</p>
      {capabilities?.canManageGuild === false ? <p><b>Botului îi lipsește acum Manage Server.</b></p> : null}
      {capabilities?.guildMembers === false ? <p><b>Intenția Server Members e oprită: intrările nu se văd.</b></p> : null}
      <p>Când Discord nu poate confirma invitația, intrarea apare ca neatribuită. Statisticile nu păstrează ID-urile membrilor.</p>
    </Note>
  );
}

function ReportCard() {
  const { tracking, setTracking } = useTracking();
  const { channels } = usePanel();
  const id = useId();
  const zone = REPORT_TIME_ZONES.find(([value]) => value === tracking.reportTimeZone)?.[1] ?? tracking.reportTimeZone;
  return (
    <SectionCard title="Raportul automat" small={inviteReportSummary(tracking)} testId="control-invites-report">
      <Fields>
        <SwitchField
          label="Trimite raportul" testId="control-invites-report-switch" checked={tracking.reportEnabled} disabled={!tracking.enabled}
          hint={tracking.enabled ? "Un clasament al linkurilor de invitație, postat în canalul ales." : "Pornește întâi urmărirea invitațiilor."}
          onChange={(next) => setTracking("reportEnabled", next)}
        />
        {tracking.reportEnabled ? (
          <>
            <ChannelField
              label="Canalul" selectLabel="Canalul raportului de invitații" value={tracking.reportChannelId || null} channels={channels}
              onChange={(next) => setTracking("reportChannelId", next ?? "")}
            />
            {!tracking.reportChannelId ? <NoteRow tone="bad" role="alert">Alege canalul raportului.</NoteRow> : null}
            <Seg
              label="Cât de des" value={tracking.reportFrequency} testId="control-invites-frequency"
              options={[["daily", "Zilnic"], ["weekly", "Săptămânal"]]} onChange={(next) => setTracking("reportFrequency", next)}
            />
            {tracking.reportFrequency === "weekly" ? (
              <Seg
                label="În ce zi" value={String(tracking.reportWeekday)} testId="control-invites-weekday"
                options={WEEKDAYS.map(([value, short]) => [String(value), short] as const)} onChange={(next) => setTracking("reportWeekday", Number(next))}
              />
            ) : null}
            <Fld label="Ora" htmlFor={`${id}-t`} hint={`După ${zone.startsWith("Ora ") ? `ora ${zone.slice(4)}` : zone}.`}>
              <input
                id={`${id}-t`} type="time" className="pn-inp pn-set-hex" value={tracking.reportTime} data-testid="control-invites-time"
                onChange={(event) => setTracking("reportTime", event.target.value)}
              />
              {!isClockTime(tracking.reportTime) ? <p className="pn-err" role="alert">Ora are forma HH:MM.</p> : null}
            </Fld>
            <Seg
              label="Fusul orar" value={tracking.reportTimeZone} testId="control-invites-zone"
              options={REPORT_TIME_ZONES} onChange={(next) => setTracking("reportTimeZone", next)}
            />
            <NumField
              label="Linkuri în clasament" unit="linkuri" min={3} max={10} testId="control-invites-top"
              value={tracking.reportTopLimit} onChange={(next) => setTracking("reportTopLimit", next)}
            />
          </>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

const RANGES: ReadonlyArray<readonly [InviteStatsRange, string]> = [["7", "7 zile"], ["30", "30 de zile"], ["90", "90 de zile"], ["all", "Tot"]];

function InviteStats() {
  const draft = useBotDraft();
  const { toast } = useToast();
  const [range, setRange] = useState<InviteStatsRange>("7");
  const stats = useInviteStats(draft.guildId ?? null, range);
  const sync = () => {
    void stats.sync().then(() => {
      toast({ title: "Invitațiile au fost sincronizate", description: "Lista și numărul de utilizări au fost citite din Discord." });
    }).catch((failure: any) => {
      toast({ variant: "destructive", title: "Sincronizarea a eșuat", description: failure?.message ?? "Verifică permisiunea Manage Server a botului." });
    });
  };
  const rows = stats.data?.rows ?? [];
  return (
    <SectionCard title="Linkurile de invitație" small="din Discord" testId="control-invites-stats">
      <Fields>
        <Seg label="Perioada" value={range} options={RANGES} onChange={(next) => setRange(next as InviteStatsRange)} testId="control-invites-range" />
        <Fld label="Linkurile active" hint="Citește din Discord linkurile și utilizările lor.">
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={sync} disabled={stats.syncing} data-testid="control-invites-sync">
            {stats.syncing ? <Spinner /> : <Ico name="refresh" />}Sincronizează
          </button>
        </Fld>
        {stats.error ? <NoteRow tone="bad" role="alert">{stats.error.message}</NoteRow> : null}
        <div className="pn-fld pn-wide">
          <div className="pn-ctl-tiles">
            <div><small>Intrări atribuite</small><b>{(stats.data?.totals.attributedJoins ?? 0).toLocaleString("ro-RO")}</b></div>
            <div><small>Intrări neatribuite</small><b>{(stats.data?.totals.unknownJoins ?? 0).toLocaleString("ro-RO")}</b></div>
          </div>
        </div>
        <div className="pn-fld pn-wide">
          {stats.loading ? <p className="pn-fh"><Spinner /> Se încarcă…</p> : rows.length ? (
            <ul className="pn-ctl-links" data-testid="control-invites-rows">
              {rows.map((row) => (
                <li key={row.code}>
                  <a href={row.url} target="_blank" rel="noreferrer"><code>{row.code}</code></a>
                  <span className="pn-ctl-who">{row.inviterName ?? "Necunoscut"}</span>
                  <span><b>{row.attributedJoins.toLocaleString("ro-RO")}</b> intrări</span>
                  <span>{row.totalDiscordUses.toLocaleString("ro-RO")} utilizări</span>
                  <span className={cx("pn-orc-state", row.active && "on")}>{row.active ? "activ" : "inactiv"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pn-fh" role="status">Nu există linkuri sincronizate. Apasă „Sincronizează” ca să le citești din Discord.</p>
          )}
        </div>
      </Fields>
    </SectionCard>
  );
}

function InvitesModule() {
  const { tracking, setTracking } = useTracking();
  const { channels } = usePanel();
  return (
    <ModuleView module={MODULE.invites} icon={CONTROL_ICONS.invites} aside={(
      <HeadSwitch on={tracking.enabled} label="Urmărește invitațiile" testId="control-invites-switch" onChange={(next) => setTracking("enabled", next)} />
    )}>
      {!tracking.enabled ? (
        <OffNote testId="control-invites-off" text="Oprit: botul nu numără intrările pe linkuri, nu scrie jurnalul și nu trimite raportul." action="Pornește urmărirea" onTurnOn={() => setTracking("enabled", true)} />
      ) : null}
      <ModuleNotes><InviteNeeds /></ModuleNotes>
      <SectionCard title="Jurnalul intrărilor" testId="control-invites-log">
        <Fields>
          <ChannelField
            label="Canalul jurnalului" selectLabel="Canalul jurnalului de intrări" value={tracking.joinLogChannelId || null} channels={channels}
            hint="La fiecare intrare, botul scrie cine a intrat și cine l-a invitat. Fără canal, nu scrie jurnalul."
            onChange={(next) => setTracking("joinLogChannelId", next ?? "")}
          />
        </Fields>
      </SectionCard>
      <ReportCard />
      <InviteStats />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Recrutare                                                           */
/* ------------------------------------------------------------------ */

function RecruitmentPreview() {
  const { config } = usePanel();
  const recruitment = config.inviteTracking.recruitment;
  return (
    <div className="pn-dc" data-testid="control-recruitment-preview">
      <p className="pn-dc-k">Ce primește membrul la /invita</p>
      <p className="pn-orc-cmd"><Ico name="slash" /><span>Membru a folosit <b>/invita</b></span></p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <p className="pn-dc-text pn-orc-plain">
            Invitația ta personală:{"\n"}<span className="pn-ctl-link">https://discord.gg/aB3cD9</span>{"\n\n"}
            Expiră în {recruitment.maxAgeDays} zile sau după {recruitment.maxUses} utilizări. Poți crea cel mult {recruitment.dailyInviteLimit} invitații în 24 de ore.
            Primești {recruitment.rewardPoints} puncte de recrutare când un membru invitat se verifică.
          </p>
          <small className="pn-orc-eph">Doar tu poți vedea acest mesaj</small>
        </div>
      </div>
    </div>
  );
}

function MilestonesCard() {
  const { config, set, roles } = usePanel();
  const recruitment = config.inviteTracking.recruitment;
  const options = (roles ?? []).filter((role) => !role.managed).sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
  const id = useId();
  return (
    <SectionCard title="Praguri" small="trei, în ordine" testId="control-recruitment-milestones">
      <ol className="pn-ctl-steps">
        {recruitment.milestones.map((milestone: { requiredInvites: number; roleId: string }, index: number) => (
          <li key={index}>
            <span className="pn-ctl-step" aria-hidden="true">{index + 1}</span>
            <label className="pn-ctl-steplbl" htmlFor={`${id}-${index}`}>Recomandări confirmate</label>
            <input
              id={`${id}-${index}`} className="pn-inp pn-ctl-num" type="number" min={1} max={100_000} value={Number.isFinite(milestone.requiredInvites) ? milestone.requiredInvites : ""}
              data-testid={`control-recruitment-milestone-${index + 1}`}
              onChange={(event) => set(["inviteTracking", "recruitment", "milestones", index, "requiredInvites"], event.target.value === "" ? Number.NaN : Number(event.target.value))}
            />
            <select
              className="pn-inp" aria-label={`Rolul pentru pragul ${index + 1}`} value={milestone.roleId}
              onChange={(event) => set(["inviteTracking", "recruitment", "milestones", index, "roleId"], event.target.value)}
            >
              <option value="">Fără rol</option>
              {milestone.roleId && !options.some((role) => role.id === milestone.roleId) ? <option value={milestone.roleId}>Rol salvat ({milestone.roleId})</option> : null}
              {options.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
            </select>
          </li>
        ))}
      </ol>
      <Fields>
        <NoteRow tone="plain">Când un membru atinge un prag, botul îi dă rolul ales (dacă e ales). Rolul trebuie să fie sub rolul botului.</NoteRow>
      </Fields>
    </SectionCard>
  );
}

type RecruitmentPanel = { channelId: string; title: string; description: string; buttonLabel: string; color: string; imageUrl: string; messageId: string };
const PANEL_LIMITS = { title: 256, description: 2_000, buttonLabel: 80 } as const;

function recruitmentPanelProblem(panel: RecruitmentPanel): string | null {
  if (!panel.channelId) return "Alege canalul în care apare panoul.";
  for (const [key, label] of [["title", "Titlul"], ["description", "Textul"], ["buttonLabel", "Textul butonului"]] as const) {
    const value = panel[key].trim();
    if (!value) return `${label} nu poate fi gol.`;
    if (value.length > PANEL_LIMITS[key]) return `${label} are prea multe caractere (cel mult ${PANEL_LIMITS[key]}).`;
  }
  if (panel.imageUrl && !/^https:\/\/\S+$/i.test(panel.imageUrl)) return "Imaginea trebuie să fie un link HTTPS.";
  return null;
}

/** The bot's message with the "make my invite" button: its texts, a preview and „Salvează și publică”. */
function RecruitmentPanelCard() {
  const { channels, config } = usePanel();
  const draft = useBotDraft();
  const { guildId } = useActiveGuild();
  const { toast } = useToast();
  const [panel, setPanel] = useState<RecruitmentPanel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const recruitment = config.inviteTracking.recruitment;
  const savedOn = Boolean(draft.saved?.inviteTracking?.recruitment?.enabled);

  useEffect(() => {
    if (!guildId) return;
    let live = true;
    setPanel(null); setLoadError("");
    void apiFetchWithMeta<{ config: RecruitmentPanel }>(`/guilds/${guildId}/recruitment-panel`)
      .then(({ data }) => { if (live) setPanel(data.config); })
      .catch((error: unknown) => { if (live) setLoadError(error instanceof Error ? error.message : "Panoul nu a putut fi încărcat."); });
    return () => { live = false; };
  }, [guildId]);

  if (loadError) return <SectionCard title="Panoul cu buton" testId="control-recruitment-panel"><Fields><NoteRow tone="bad">{loadError}</NoteRow></Fields></SectionCard>;
  if (!panel) return <SectionCard title="Panoul cu buton" testId="control-recruitment-panel"><Fields><NoteRow tone="plain"><Spinner /> Se încarcă…</NoteRow></Fields></SectionCard>;

  const edit = (key: keyof RecruitmentPanel, value: string) => setPanel({ ...panel, [key]: value });
  const problem = recruitmentPanelProblem(panel);
  const publish = async () => {
    if (!guildId || problem) return;
    setBusy(true);
    try {
      const { channelId, title, description, buttonLabel, color, imageUrl } = panel;
      await apiFetchWithMeta(`/guilds/${guildId}/recruitment-panel`, { method: "PUT", body: JSON.stringify({ channelId, title, description, buttonLabel, color, imageUrl }) });
      const { data } = await apiFetchWithMeta<{ config: RecruitmentPanel; edited: boolean }>(`/guilds/${guildId}/recruitment-panel/publish`, { method: "POST", body: "{}" });
      setPanel(data.config);
      toast({ title: data.edited ? "Panoul a fost actualizat" : "Panoul a fost publicat", description: "Membrii își pot face invitația cu un click." });
    } catch (error) {
      toast({ variant: "destructive", title: "Panoul nu a fost publicat", description: error instanceof Error ? error.message : "Încearcă din nou." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Panoul cu buton" small={panel.messageId ? "publicat" : "nepublicat"} testId="control-recruitment-panel">
      <Fields>
        <NoteRow tone="plain">Botul postează un mesaj cu butonul „{panel.buttonLabel || "Generează invitația mea"}”. Cine apasă primește invitația personală, la fel ca la /invita, vizibilă doar pentru el.</NoteRow>
        <ChannelField
          label="Canalul panoului" selectLabel="Canalul panoului de recrutare" value={panel.channelId || null} channels={channels} wide
          hint="Un canal în care membrii pot vedea mesajele botului, de exemplu #recrutare."
          onChange={(next) => edit("channelId", next ?? "")}
        />
        <EmojiTextField label="Titlul" value={panel.title} onChange={(next) => edit("title", next)} max={PANEL_LIMITS.title} testId="control-recruitment-panel-title" />
        <EmojiTextField label="Textul" value={panel.description} onChange={(next) => edit("description", next)} max={PANEL_LIMITS.description} multiline rows={4} testId="control-recruitment-panel-description" />
        <EmojiTextField label="Textul butonului" value={panel.buttonLabel} onChange={(next) => edit("buttonLabel", next)} max={PANEL_LIMITS.buttonLabel} testId="control-recruitment-panel-button" />
        <Fld label="Culoarea">
          <div className="pn-set-colors">
            <label className="pn-set-picker" aria-label="Culoarea panoului de recrutare">
              <input type="color" value={panel.color} onChange={(event) => edit("color", event.target.value)} />
            </label>
            <span className="pn-inp pn-inp-mono pn-set-hex">{panel.color.toUpperCase()}</span>
          </div>
        </Fld>
        <ImageUrlField label="Imaginea" hint="Opțional: apare mare, sub text." value={panel.imageUrl} onChange={(next) => edit("imageUrl", next)} testId="control-recruitment-panel-image" />
        {!savedOn ? <NoteRow tone="warn">Pornește programul de recrutare și salvează, apoi publică panoul.</NoteRow> : null}
        {problem ? <NoteRow tone="bad" testId="control-recruitment-panel-problem">{problem}</NoteRow> : null}
        <div className="pn-fld pn-wide">
          <button type="button" className="pn-btn" disabled={busy || Boolean(problem) || !savedOn} onClick={() => void publish()} data-testid="control-recruitment-panel-publish">
            {busy ? <Spinner /> : <Ico name="send" />}{panel.messageId ? "Salvează și actualizează panoul" : "Salvează și publică panoul"}
          </button>
        </div>
      </Fields>
      <div className="pn-dc pn-rec-prev" data-testid="control-recruitment-panel-preview">
        <p className="pn-dc-k">Așa apare în Discord</p>
        <div className="pn-dc-msg">
          <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
          <div className="pn-dc-body">
            <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
            <div className="pn-dc-embed" style={{ borderLeftColor: panel.color }}>
              <p className="pn-dc-title"><DiscordEmojiText>{panel.title || "Titlul panoului"}</DiscordEmojiText></p>
              <p className="pn-dc-text"><DiscordEmojiText>{panel.description || "Textul panoului"}</DiscordEmojiText></p>
              <p className="pn-dc-text"><b>Cum merge invitația</b>{"\n"}⏳ ține {recruitment.maxAgeDays} {recruitment.maxAgeDays === 1 ? "zi" : "zile"} · 👥 până la {recruitment.maxUses} {recruitment.maxUses === 1 ? "membru" : "membri"} · 🎟️ {recruitment.dailyInviteLimit} pe zi · ⭐ {recruitment.rewardPoints} puncte pe fiecare verificat</p>
              {panel.imageUrl && /^https:\/\//.test(panel.imageUrl) ? <img src={panel.imageUrl} alt="" className="pn-dc-image" /> : null}
            </div>
            <span className="pn-dc-btn pn-rec-btn">🔗 {panel.buttonLabel || "Generează invitația mea"}</span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function RecruitmentModule() {
  const { config, set, channels } = usePanel();
  const recruitment = config.inviteTracking.recruitment;
  const problem = recruitmentProblem(recruitment);
  const verificationReady = Boolean(config.verification?.enabled && config.verification?.roleId);
  const setField = (key: string, value: unknown) => set(["inviteTracking", "recruitment", key], value);
  return (
    <ModuleView module={MODULE.recruitment} icon={CONTROL_ICONS.recruitment} aside={(
      <HeadSwitch on={recruitment.enabled} label="Programul de recrutare" testId="control-recruitment-switch" onChange={(next) => setField("enabled", next)} />
    )}>
      {!recruitment.enabled ? (
        <OffNote testId="control-recruitment-off" text="Oprit: /invita nu creează invitații personale." action="Pornește programul" onTurnOn={() => setField("enabled", true)} />
      ) : null}
      <ModuleNotes>
        {!verificationReady ? (
          <Note tone="warn" testId="control-recruitment-verification">
            O recomandare se confirmă când cel adus se verifică. Verificarea e oprită sau nu are rol, deci nu se confirmă nimic: pornește-o din <Link href="/verificare/setari">Verificare</Link>.
          </Note>
        ) : null}
        {problem ? <Note tone="bad" role="alert" testId="control-recruitment-problem">{problem}</Note> : null}
      </ModuleNotes>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <SectionCard title="Invitațiile personale" testId="control-recruitment-invites">
            <Fields>
              <ChannelField
                label="Canalul" selectLabel="Canalul invitațiilor personale" value={recruitment.inviteChannelId || null} channels={channels} wide
                hint="Invitațiile duc în acest canal. Botul are nevoie aici de Create Invite."
                onChange={(next) => setField("inviteChannelId", next ?? "")}
              />
              {RECRUITMENT_FIELDS.map((field) => (
                <NumField
                  key={field.key} label={field.label} hint={field.hint} unit={field.unit} min={field.min} max={field.max} testId={`control-recruitment-${field.key}`}
                  value={Number.isFinite(recruitment[field.key]) ? recruitment[field.key] : undefined}
                  onChange={(next) => setField(field.key, next ?? Number.NaN)}
                />
              ))}
            </Fields>
          </SectionCard>
          <MilestonesCard />
          <RecruitmentPanelCard />
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><RecruitmentPreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Raport zilnic                                                       */
/* ------------------------------------------------------------------ */

/** The day's card as the bot draws it, with the example numbers. */
function DailyCardPreview({ color }: { color: string }) {
  const { config } = usePanel();
  const daily = config.dailyStats;
  const values: readonly number[] = DAILY_PREVIEW_ACTIVITY;
  const peak = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const label = (key: keyof typeof daily.metricLabels, fallback: string) => dailyCardText(renderDailyText(daily.metricLabels[key] ?? "")) || fallback;
  const days = dailyInterval(daily);
  return (
    <div className="pn-ctl-cardbox" data-testid="control-daily-card">
      <div className="pn-ctl-card" style={{ "--card": color } as React.CSSProperties} role="img"
        aria-label="Graficul zilei: cele șase cifre cu schimbarea față de ieri, ultimele 7 zile și bilanțul membrilor">
        <p className="pn-ctl-card-k">{days === 1 ? "RAPORT ZILNIC" : `RAPORT PE ${days} ZILE`}</p>
        <p className="pn-ctl-card-g">Regatul Cenușii</p>
        <p className="pn-ctl-card-d">{days === 1 ? "joi, 29 octombrie 2026" : renderDailyText("{date}", days)}</p>
        <div className="pn-ctl-card-tiles">
          {DAILY_METRICS.map(([key, fallback, value, delta]) => {
            const better = key === "leaves" ? delta < 0 : delta > 0;
            return (
              <div key={key} className="pn-ctl-card-tile">
                <span>{label(key, fallback)}</span>
                <b>{value.toLocaleString("ro-RO")}</b>
                <i data-tone={delta === 0 ? "same" : better ? "good" : "bad"}>{dailyCardDelta(delta, days)}</i>
              </div>
            );
          })}
        </div>
        <div className="pn-ctl-card-chart">
          <p className="pn-ctl-card-head">
            <span>{dailyCardText(renderDailyText(daily.activityTitle)) || "Activitate · ultimele 7 zile"}</span>
            <span>media {Math.round(average)}/zi</span>
          </p>
          <div className="pn-ctl-card-plot">
            <span className="pn-ctl-card-avg" style={{ bottom: `${(average / peak) * 100}%` }} />
            {values.map((value, index) => (
              <div key={DAILY_PREVIEW_DAYS[index]} className="pn-ctl-card-col" data-current={index === values.length - 1 || undefined}>
                <em>{value}</em>
                <span style={{ height: `${(value / peak) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="pn-ctl-card-days">
            {DAILY_PREVIEW_DAYS.map((day, index) => <span key={day} data-current={index === DAILY_PREVIEW_DAYS.length - 1 || undefined}>{day}</span>)}
          </div>
        </div>
        <p className="pn-ctl-card-sum">Bilanț: +3 membri · {DAILY_PREVIEW_MEMBERS.toLocaleString("ro-RO")} pe server acum</p>
      </div>
    </div>
  );
}

function DailyPreview() {
  const draft = useBotDraft();
  const { config } = usePanel();
  const daily = config.dailyStats;
  const emojis = draft.metadata?.emojis;
  // Bold (**…**) the way Discord shows it, with the server's emojis in the rest.
  const days = dailyInterval(daily);
  const text = (value: string) => renderDailyText(value, days).split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => /^\*\*[^*]+\*\*$/.test(part)
    ? <b key={index}><DiscordEmojiText emojis={emojis}>{part.slice(2, -2)}</DiscordEmojiText></b>
    : <DiscordEmojiText key={index} emojis={emojis}>{part}</DiscordEmojiText>);
  const color = /^#[0-9a-f]{6}$/i.test(daily.color) ? daily.color : "#5865F2";
  const chart = dailyChartOn(daily);
  const image = !chart && isMessageImageUrl(daily.imageUrl.trim()) ? daily.imageUrl.trim() : "";
  const thumbnail = isMessageImageUrl(daily.thumbnailUrl.trim()) ? daily.thumbnailUrl.trim() : "";
  const week = dailyPreviewWeek(chart);
  return (
    <div className="pn-dc" data-testid="control-daily-preview">
      <p className="pn-dc-k">Așa apare în Discord</p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <div className="pn-dc-embed" style={{ borderLeftColor: color }}>
            {thumbnail ? <img src={thumbnail} alt="" className="pn-dc-thumb" /> : null}
            <p className="pn-dc-title">{text(dailyTitleFor(daily.title, days))}</p>
            <p className="pn-dc-text">{text(daily.description)}</p>
            <div className="pn-dc-field" data-testid="control-daily-summary"><b>📊 Rezumat</b>
              {DAILY_METRICS.map(([key, , value, delta]) => (
                <span key={key} className="pn-ctl-metric">{text(daily.metricLabels[key])}: <b>{value.toLocaleString("ro-RO")}</b> · {dailyDeltaText(delta)}</span>
              ))}
              <span className="pn-ctl-metric">Bilanț: <b>+3</b> membri · <b>{DAILY_PREVIEW_MEMBERS.toLocaleString("ro-RO")}</b> pe server acum</span>
              <span className="pn-ctl-metric"><i>▲ ▼ arată schimbarea față de {days === 1 ? "ziua dinainte" : `cele ${days} zile dinainte`}.</i></span>
            </div>
            <div className="pn-dc-field" data-testid="control-daily-week"><b>{text(daily.activityTitle)}</b>
              {week.days ? (
                <span className="pn-ctl-metric">
                  {week.days.slice(0, -1).join(" · ")} · <b>{week.days.at(-1)}</b>
                </span>
              ) : null}
              <span className="pn-ctl-metric">Media: <b>{week.average}</b> mesaje/zi · {days === 1 ? "ziua raportului a fost cea mai activă" : "cea mai activă: Jo 29 (307)"}</span>
            </div>
            <div className="pn-dc-field" data-testid="control-daily-channels"><b>{text(daily.channelsTitle)}</b>
              {dailyPreviewChannels().map((channel) => (
                <span key={channel.name} className="pn-ctl-metric">
                  {channel.place} <span className="pn-dc-mention">#{channel.name}</span> · <b>{channel.messages}</b> mesaje · {channel.share}%
                </span>
              ))}
            </div>
            {dailyInviteTopOn(daily) ? (
              <div className="pn-dc-field" data-testid="control-daily-invites"><b>{days === 1 ? "🎟️ Top invitații" : `🎟️ Top invitații · ${days} zile`}</b>
                {DAILY_PREVIEW_INVITERS.map(([name, joins], index) => (
                  <span key={name} className="pn-ctl-metric">
                    {["🥇", "🥈", "🥉"][index]} <span className="pn-dc-mention">@{name}</span> · <b>{joins}</b> membri noi
                  </span>
                ))}
              </div>
            ) : null}
            {chart ? <DailyCardPreview color={color} /> : null}
            {image ? <img src={image} alt="" className="pn-dc-image" /> : null}
            <p className="pn-set-foot">{text(daily.footer)} · 29 octombrie 2026</p>
          </div>
        </div>
      </div>
      <p className="pn-orc-fine">
        Cifrele sunt inventate. Săgețile apar doar când botul a urmărit {dailyInterval(daily) === 1 ? "toată ziua dinainte" : "toată perioada dinainte"}. Într-o zi fără mesaje, în locul canalelor active apare: „{renderDailyText(daily.emptyChannelsText)}”
      </p>
    </div>
  );
}

function NextDailyReport({ days, on, what = "raport", siteNote = true }: { days: number; on: boolean; what?: string; siteNote?: boolean }) {
  const next = nextDailyReport(new Date(), days);
  return (
    <NoteRow tone="plain" testId="control-daily-next">
      {on
        ? <>Următorul {what}: <b>{longDayName(next.postDay)}</b>, imediat după miezul nopții (ora României), cu {days === 1 ? <>ziua de <b>{shortPeriod(next.endDay, next.endDay)}</b></> : <>zilele <b>{shortPeriod(next.startDay, next.endDay)}</b></>}.{siteNote ? " Raportul de pe site rămâne pe zile." : ""}</>
        : `Pornește-l și alege un canal ca ${what === "raport" ? "raportul" : "topul"} să se posteze.`}
    </NoteRow>
  );
}

function DailyModule() {
  const { config, set, channels } = usePanel();
  const daily = config.dailyStats;
  const chestId = config.channels?.main ?? "";
  const target = daily.channelId === chestId ? "" : daily.channelId;
  const available = useMemo(() => channels?.filter((channel) => channel.id !== chestId), [channels, chestId]);
  const problem = dailyProblem(daily);
  const id = useId();
  const setDaily = (key: string, value: unknown) => set(["dailyStats", key], value);
  return (
    <ModuleView module={MODULE.daily} icon={CONTROL_ICONS.daily}>
      <ModuleNotes>{problem ? <Note tone="bad" role="alert">{problem}</Note> : null}</ModuleNotes>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <SectionCard title="Unde și când" small={target ? dailyIntervalText(dailyInterval(daily)) : "nu se postează"} testId="control-daily-where">
            <Fields>
              <ChannelField
                label="Canalul" selectLabel="Canalul raportului zilnic" value={target || null} channels={available} wide
                hint="Fără canal, raportul nu se postează. Canalul Cufere e al jocului, deci nu poate fi ales."
                onChange={(next) => setDaily("channelId", next ?? "")}
              />
              <Seg
                label="La câte zile" testId="control-daily-interval" value={String(dailyInterval(daily))}
                hint="1 zi: raportul zilei trecute, în fiecare noapte. Mai multe zile: un singur raport care adună toate zilele perioadei. La 7 zile, perioada e de luni până duminică."
                options={DAILY_INTERVALS.map((value) => [String(value), value === 1 ? "1 zi" : `${value} zile`] as const)}
                onChange={(next) => setDaily("intervalDays", Number(next))}
              />
              <NextDailyReport days={dailyInterval(daily)} on={Boolean(target)} />
              <SwitchField
                label="Topul invitațiilor" testId="control-daily-invite-top" checked={dailyInviteTopOn(daily)}
                hint="Cine a adus cei mai mulți membri noi prin invitații în perioada raportului. Apare doar când urmărirea invitațiilor e pornită (Control bot → Invitații)."
                onChange={(next) => setDaily("inviteTop", next)}
              />
            </Fields>
          </SectionCard>
          <SectionCard title="Aspect" testId="control-daily-look">
            <Fields>
              <Fld label="Culoarea" htmlFor={`${id}-c`} hint="Banda din stânga raportului.">
                <div className="pn-set-colors">
                  <label className="pn-set-picker" aria-label="Alege culoarea">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(daily.color) ? daily.color.toLowerCase() : "#5865f2"} onChange={(event) => setDaily("color", event.target.value)} />
                  </label>
                  <input id={`${id}-c`} className="pn-inp pn-inp-mono pn-set-hex" maxLength={7} value={daily.color} data-testid="control-daily-color" onChange={(event) => setDaily("color", event.target.value.trim())} />
                </div>
              </Fld>
              <SwitchField
                label="Graficul zilei" testId="control-daily-chart" checked={dailyChartOn(daily)}
                hint="O imagine cu cele șase cifre, schimbarea față de ieri, ultimele 7 zile și bilanțul membrilor. Botul o desenează la fiecare raport."
                onChange={(next) => setDaily("chart", next)}
              />
              <ImageUrlField
                label="Imaginea mare" value={daily.imageUrl} onChange={(next) => setDaily("imageUrl", next)}
                hint={dailyChartOn(daily)
                  ? "Cât graficul e pornit, locul ei îl ia graficul. O folosește doar dacă graficul nu poate fi desenat."
                  : "Sub raport."}
              />
              <ImageUrlField label="Imaginea mică" hint="În colțul din dreapta sus." value={daily.thumbnailUrl} onChange={(next) => setDaily("thumbnailUrl", next)} />
            </Fields>
          </SectionCard>
          <SectionCard title="Texte" testId="control-daily-texts">
            <Fields>
              <NoteRow tone="plain">
                Valori pe care le poți folosi:{" "}
                {DAILY_TOKENS.flatMap((token, index) => [index ? " " : null, <code key={token} className="pn-set-code">{`{${token}}`}</code>])}
              </NoteRow>
              {DAILY_TEXTS.map((field) => (
                <EmojiTextField
                  key={field.key} label={field.label} max={field.max} multiline={"multiline" in field} rows={3} value={String(daily[field.key] ?? "")}
                  testId={`control-daily-${field.key}`} onChange={(next) => setDaily(field.key, next)}
                />
              ))}
              {DAILY_METRICS.map(([key, label]) => (
                <EmojiTextField
                  key={key} label={`Eticheta: ${label}`} max={256} value={String(daily.metricLabels?.[key] ?? "")}
                  onChange={(next) => set(["dailyStats", "metricLabels", key], next)}
                />
              ))}
            </Fields>
          </SectionCard>
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><DailyPreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Canale și acces                                                     */
/* ------------------------------------------------------------------ */

const ACCESS_KEYS: ReadonlyArray<readonly [keyof RoleAccess, string]> = [["viewChannel", "Vede"], ["readMessageHistory", "Istoric"], ["sendMessages", "Scrie"]];

function CategoryAccess({ categoryKey }: { categoryKey: ProvisionKey }) {
  const { config, set, roles } = usePanel();
  const draft = useBotDraft();
  const { toast } = useToast();
  const everyoneId = draft.metadata?.guild?.id;
  const permission = permissionOf(config, categoryKey, everyoneId);
  const setPermission = (next: ChannelPermissionConfig) => set(["provisioningPermissions", categoryKey], next);
  const allRoles = draft.metadata?.roles;
  const list = useMemo(() => (allRoles ?? [])
    .filter((role) => !role.managed || role.id === everyoneId)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0)), [allRoles, everyoneId]);
  const name = (roleId: string) => roleId === everyoneId ? "@everyone" : `@${list.find((role) => role.id === roleId)?.name ?? roleId}`;
  const applyPreset = (preset: (typeof ROLE_PRESETS)[number]) => {
    const role = presetRole(preset, allRoles, everyoneId);
    if (!role) {
      toast({ variant: "destructive", title: `Nu am găsit rolul pentru ${preset.label}`, description: "Alege rolul din listă sau creează-l în Discord și reîncarcă pagina." });
      return;
    }
    setPermission(withRole(permission, role.id, true, { ...preset.access }));
  };
  return (
    <div className="pn-ctl-access" data-testid={`control-access-${categoryKey}`}>
      <div className="pn-multi">
        <span className="pn-fh">Rapid:</span>
        {ROLE_PRESETS.map((preset) => (
          <button key={preset.key} type="button" className="pn-set-token" aria-label={`Adaugă rolul ${preset.label}`} onClick={() => applyPreset(preset)}>
            <small>+</small>{preset.label}
          </button>
        ))}
      </div>
      <div className="pn-multi pn-scroll">
        {list.map((role) => (
          <Pill key={role.id} checked={permission.roleIds.includes(role.id)} label={`Acces pentru ${name(role.id)}`} onChange={(next) => setPermission(withRole(permission, role.id, next))}>
            {role.id === everyoneId ? "@everyone" : `@${role.name}`}
          </Pill>
        ))}
        {roles === undefined ? <p className="pn-fh">Lista rolurilor nu e disponibilă acum.</p> : null}
      </div>
      {permission.roleIds.length ? (
        <ul className="pn-ctl-roles">
          {permission.roleIds.map((roleId) => {
            const access = roleAccessOf(permission, roleId);
            return (
              <li key={roleId}>
                <b>{name(roleId)}</b>
                <span className="pn-ctl-ticks">
                  {ACCESS_KEYS.map(([key, label]) => (
                    <Pill key={key} checked={access[key]} label={`${name(roleId)}: ${label.toLowerCase()}`} onChange={(next) => setPermission(withRoleAccess(permission, roleId, { [key]: next }))}>{label}</Pill>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pn-fh">Niciun rol ales: canalele le văd doar botul și administratorii.</p>
      )}
    </div>
  );
}

/** The names the panel gives the channels it creates, in the server's theme (with the AI's help). */
function ThemedNamesCard({ guildId }: { guildId: string | null }) {
  const { state, error, loading, save, suggest } = useChannelNames(guildId);
  const [theme, setTheme] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  useEffect(() => {
    setTheme(state?.theme ?? "");
    setNames(state?.names ?? {});
  }, [state]);
  if (!guildId) return null;
  const changed = Boolean(state) && (theme.trim() !== state!.theme || JSON.stringify(names) !== JSON.stringify(state!.names));
  const groups = [...new Set((state?.catalog ?? []).map((entry) => entry.group))];
  const generate = async () => {
    setBusy("ai");
    setMessage(null);
    try {
      const proposed = await suggest(theme);
      if (proposed) {
        setNames(proposed);
        setMessage({ tone: "ok", text: `AI-ul a propus ${Object.keys(proposed).length} nume. Verifică-le, schimbă ce vrei, apoi salvează.` });
      }
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "AI-ul nu a răspuns." });
    } finally {
      setBusy(null);
    }
  };
  const store = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const clean = Object.fromEntries(Object.entries(names).filter(([, value]) => value.trim()));
      await save(theme.trim(), clean);
      setMessage({ tone: "ok", text: "Numele s-au salvat. Canalele create de acum încolo le vor folosi." });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Numele nu s-au putut salva." });
    } finally {
      setBusy(null);
    }
  };
  return (
    <SectionCard title="Nume tematice" small="doar pentru canalele noi" testId="control-names">
      <Fields>
        <NoteRow tone="plain">
          Canalele și categoriile pe care le creează panoul primesc numele de aici. Cele care există deja nu se redenumesc,
          iar un canal cu numele de bază e recunoscut în continuare, deci nu se dublează nimic.
        </NoteRow>
        {loading ? <NoteRow tone="plain">Se încarcă…</NoteRow> : null}
        {error ? <NoteRow tone="bad" role="alert">{error}</NoteRow> : null}
        {state ? (
          <>
            <Fld wide label="Tema serverului" hint="De exemplu: „regat medieval, cenușă și foc” sau „stație spațială”.">
              <div className="pn-set-colors">
                <input className="pn-inp" maxLength={300} value={theme} data-testid="control-names-theme" aria-label="Tema serverului"
                  onChange={(event) => setTheme(event.target.value)} placeholder="regat medieval, cenușă și foc" />
                <button type="button" className="pn-btn pn-btn-sm" data-testid="control-names-ai" disabled={!theme.trim() || !state.aiAvailable || busy !== null}
                  onClick={() => void generate()}>
                  <Ico name="orb" />{busy === "ai" ? "Se generează…" : "Generează cu AI"}
                </button>
              </div>
            </Fld>
            {!state.aiAvailable ? <NoteRow tone="plain">AI-ul nu e configurat pe bot (lipsește cheia OpenAI), dar poți scrie numele de mână.</NoteRow> : null}
            {groups.map((group) => (
              <div key={group} className="pn-names-group" data-testid={`control-names-group-${group}`}>
                <p className="pn-names-title">{group}</p>
                {state.catalog.filter((entry) => entry.group === group).map((entry) => (
                  <label key={entry.key} className="pn-names-row">
                    <span className="pn-names-purpose">{entry.purpose}</span>
                    <input
                      className="pn-inp pn-inp-mono" value={names[entry.key] ?? ""} placeholder={entry.defaultName} maxLength={100}
                      aria-label={`Numele pentru ${entry.purpose}`} data-testid={`control-names-${entry.key}`}
                      onChange={(event) => setNames((current) => ({ ...current, [entry.key]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
            ))}
            {message ? <NoteRow tone={message.tone === "ok" ? "info" : "bad"} role={message.tone === "bad" ? "alert" : undefined}>{message.text}</NoteRow> : null}
            <div className="pn-names-actions">
              <button type="button" className="pn-btn-ghost pn-btn-sm" data-testid="control-names-reset" disabled={busy !== null || !Object.keys(names).length}
                onClick={() => setNames({})}>Înapoi la numele de bază</button>
              <button type="button" className="pn-btn pn-btn-sm" data-testid="control-names-save" disabled={!changed || busy !== null}
                onClick={() => void store()}><Ico name="check" />{busy === "save" ? "Se salvează…" : "Salvează numele"}</button>
            </div>
          </>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

function ChannelsModule() {
  const draft = useBotDraft();
  const { config, saved, capabilities } = usePanel();
  const everyoneId = draft.metadata?.guild?.id;
  const [selected, setSelected] = useState<ProvisionKey[]>([]);
  const [open, setOpen] = useState<ProvisionKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const unsaved = draft.changed.length > 0;
  const offline = saved?.discordLive === false || capabilities?.online === false;
  const blocked = capabilities?.canManageChannels !== true
    ? "Botului îi lipsește permisiunea Manage Channels."
    : offline ? "Botul e offline." : unsaved ? "Salvează întâi modificările (bara de jos), apoi creează canalele." : !selected.length ? "Bifează cel puțin o categorie." : null;
  const toggle = (key: ProvisionKey, on: boolean) => setSelected((current) => on ? [...new Set([...current, key])] : current.filter((item) => item !== key));
  const run = async () => {
    setConfirming(false);
    const permissions = Object.fromEntries(selected.map((key) => [key, permissionOf(config, key, everyoneId)]));
    const done = await draft.provision(selected, permissions);
    if (!done) return;
    const created = done.provisioning?.created.length ?? 0;
    const reused = done.provisioning?.reused.length ?? 0;
    const panel = done.provisioning?.verificationPanel;
    setResult([
      `${countText(created, "canal creat", "canale create")}, ${countText(reused, "reutilizat", "reutilizate")}.`,
      panel === "published" ? "Panoul de verificare a fost publicat." : panel === "needs_role" ? "Panoul de verificare nu s-a publicat: alege rolul în Verificare."
        : panel === "disabled" ? "Panoul de verificare nu s-a publicat: verificarea e oprită." : panel === "failed" ? "Canalele sunt gata, dar panoul de verificare nu s-a putut publica."
          : panel === "published_not_saved" ? "Panoul a fost publicat, dar ID-ul lui nu s-a salvat; reîncearcă." : "",
    ].filter(Boolean).join(" "));
    setSelected([]);
  };
  return (
    <ModuleView module={MODULE.channels} icon={CONTROL_ICONS.channels}>
      <ModuleNotes>
        <Note tone="plain">
          Pentru fiecare categorie bifată, botul creează canalele care lipsesc și le reutilizează pe cele cu același nume. Le salvează ca destinații și le dă acces doar rolurilor alese aici. Accesul celorlalte roluri, pus de mână în Discord, rămâne cum e.
        </Note>
        {result ? <Note tone="info" role="status" testId="control-provision-result">{result}</Note> : null}
      </ModuleNotes>
      <ul className="pn-ctl-cats">
        {PROVISION_CATEGORIES.map((category) => {
          const permission = permissionOf(config, category.key, everyoneId);
          const isOpen = open === category.key;
          return (
            <li key={category.key} className={cx("pn-ctl-cat", selected.includes(category.key) && "is-sel")} data-testid={`control-category-${category.key}`}>
              <div className="pn-ctl-cat-h">
                <Pill checked={selected.includes(category.key)} label={`Creează ${category.label}`} onChange={(next) => toggle(category.key, next)}>{category.label}</Pill>
                <span className="pn-ctl-cat-t"><small>{category.text}</small></span>
                <button type="button" className="pn-btn-ghost pn-btn-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : category.key)} data-testid={`control-category-${category.key}-access`}>
                  <Ico name="lock" />{accessSummary(permission, everyoneId)}
                </button>
              </div>
              <div className="pn-multi pn-ctl-items">{category.items.map((item) => <span key={item}>{item}</span>)}</div>
              {isOpen ? <CategoryAccess categoryKey={category.key} /> : null}
            </li>
          );
        })}
      </ul>
      <div className="pn-ctl-run">
        <div className="pn-multi">
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setSelected(PROVISION_CATEGORIES.map((category) => category.key))}>Toate</button>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setSelected([])}>Niciuna</button>
        </div>
        {blocked ? <p className="pn-fh" role="status">{blocked}</p> : null}
        <button type="button" className="pn-btn" disabled={Boolean(blocked) || draft.saving} onClick={() => setConfirming(true)} data-testid="control-provision">
          {draft.saving ? <Spinner /> : <Ico name="plus" />}Creează ce lipsește ({selected.length})
        </button>
      </div>
      {confirming ? (
        <div className="pn-ctl-confirm" role="dialog" aria-label="Confirmă crearea canalelor" data-testid="control-provision-confirm">
          <p><b>Botul va crea în Discord ce lipsește pentru:</b></p>
          <ul>
            {selected.map((key) => {
              const category = PROVISION_CATEGORIES.find((item) => item.key === key)!;
              const permission = permissionOf(config, key, everyoneId);
              return <li key={key}><b>{category.label}</b> · acces: {accessSummary(permission, everyoneId)}</li>;
            })}
          </ul>
          <div className="pn-multi">
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setConfirming(false)}>Înapoi</button>
            <button type="button" className="pn-btn pn-btn-sm" onClick={() => void run()} data-testid="control-provision-go"><Ico name="check" />Creează</button>
          </div>
        </div>
      ) : null}
      <ThemedNamesCard guildId={draft.guildId ?? null} />
    </ModuleView>
  );
}

function countText(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/* ------------------------------------------------------------------ */
/* Botul pe server                                                     */
/* ------------------------------------------------------------------ */

const CHECKS = BOT_CHECKS;

function LeaveCard() {
  const draft = useBotDraft();
  const { setGuildId } = useActiveGuild();
  const { retry } = useSession();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "confirm" | "leaving">("idle");
  if (!draft.isBotOwner || !draft.guildId) return null;
  const leave = async () => {
    setStep("leaving");
    try {
      const result = await draft.leaveServer(draft.guildId!);
      toast({ title: "Botul a părăsit serverul", description: `A ieșit de pe „${result.guildName}”. Setările salvate rămân.` });
      setGuildId(null);
      await retry().catch(() => undefined);
    } catch (failure) {
      toast({ variant: "destructive", title: "Botul nu a putut ieși", description: failure instanceof Error ? failure.message : "Încearcă din nou." });
      setStep("idle");
    }
  };
  return (
    <SectionCard title="Scoate botul de pe server" small="doar pentru proprietarul botului" testId="control-leave">
      <Fields>
        <Fld label={draft.guildName} hint="Moderarea, jocul și restul botului se opresc pe acest server. Setările și datele salvate pe site rămân.">
          {step === "idle" ? (
            <button type="button" className="pn-btn-ghost pn-btn-sm pn-ctl-danger" onClick={() => setStep("confirm")} disabled={draft.saved?.discordLive === false}>
              <Ico name="leave" />Scoate botul
            </button>
          ) : (
            <span className="pn-multi">
              <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setStep("idle")} disabled={step === "leaving"}>Renunță</button>
              <button type="button" className="pn-btn pn-btn-sm pn-ctl-danger-fill" onClick={() => void leave()} disabled={step === "leaving"} data-testid="control-leave-go">
                {step === "leaving" ? <Spinner /> : <Ico name="leave" />}Da, scoate-l
              </button>
            </span>
          )}
        </Fld>
      </Fields>
    </SectionCard>
  );
}

function ServerModule() {
  const { saved, capabilities } = usePanel();
  const online = saved?.discordLive !== false && capabilities?.online !== false;
  return (
    <ModuleView module={MODULE.server} icon={CONTROL_ICONS.server}>
      <SectionCard title="Starea" testId="control-status">
        <Fields>
          <Fld label={online ? "Botul e conectat" : "Botul e offline"} hint={online ? "Setările salvate se aplică pe loc." : "Poți salva setările; botul le aplică după ce revine."}>
            <span className={cx("pn-orc-state", online && "on")}>{online ? "online" : "offline"}</span>
          </Fld>
        </Fields>
      </SectionCard>
      <SectionCard title="Ce poate face" small="permisiuni și intenții Discord" testId="control-checks">
        <ul className="pn-ctl-checks">
          {CHECKS.map((check) => {
            const value = (capabilities as Record<string, boolean | undefined> | undefined)?.[check.key];
            return (
              <li key={check.key} className={cx(value === true && "is-ok", value === false && "is-bad")}>
                <span className="pn-ctl-check" aria-hidden="true"><Ico name={value === true ? "check" : value === false ? "x" : "info"} /></span>
                <span className="pn-set-t"><b>{check.label}</b><small>{check.needed}</small></span>
                <span className={cx("pn-orc-state", value === true && "on")}>{value === true ? "are" : value === false ? "lipsește" : "necunoscut"}</span>
              </li>
            );
          })}
        </ul>
        <Fields>
          <NoteRow tone="plain">Intențiile se pornesc din Discord Developer Portal, iar permisiunile din rolul botului, în setările serverului.</NoteRow>
        </Fields>
      </SectionCard>
      <LeaveCard />
    </ModuleView>
  );
}

function ActiveTopPreview({ top }: { top: ActiveTop }) {
  const color = /^#[0-9a-f]{6}$/i.test(top.color) ? top.color : "#d8a964";
  const medal = (index: number) => ["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`;
  const period = top.intervalDays === 1 ? "29 octombrie 2026" : top.intervalDays === 7 ? "23 – 29 octombrie 2026" : `${30 - top.intervalDays} – 29 octombrie 2026`;
  const count = Math.min(top.limit, ACTIVE_TOP_PREVIEW_CHAT.length);
  return (
    <div className="pn-dc" data-testid="control-top-preview">
      <p className="pn-dc-k">Așa apare în Discord</p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <div className="pn-dc-embed" style={{ borderLeftColor: color }}>
            <p className="pn-dc-title">🏆 Cei mai activi membri</p>
            <p className="pn-dc-text">Perioada: <b>{period}</b></p>
            <div className="pn-dc-field" data-testid="control-top-chat"><b>💬 În chat</b>
              {ACTIVE_TOP_PREVIEW_CHAT.slice(0, count).map(([name, messages], index) => (
                <span key={name} className="pn-ctl-metric">{medal(index)} <span className="pn-dc-mention">@{name}</span> · <b>{messages}</b> mesaje</span>
              ))}
              {top.limit > ACTIVE_TOP_PREVIEW_CHAT.length ? <span className="pn-ctl-metric">… până la locul {top.limit}</span> : null}
            </div>
            {top.includeVoice ? (
              <div className="pn-dc-field" data-testid="control-top-voice"><b>🎙️ Pe voce</b>
                {ACTIVE_TOP_PREVIEW_VOICE.slice(0, count).map(([name, minutes], index) => (
                  <span key={name} className="pn-ctl-metric">{medal(index)} <span className="pn-dc-mention">@{name}</span> · <b>{activeTopVoiceTime(minutes)}</b></span>
                ))}
              </div>
            ) : null}
            <div className="pn-dc-field"><b>📊 Pe scurt</b>
              <span className="pn-ctl-metric"><b>2.410</b> mesaje de la <b>38</b> membri</span>
              {top.includeVoice ? <span className="pn-ctl-metric"><b>15 h</b> pe voce, <b>12</b> membri</span> : null}
            </div>
            <p className="pn-set-foot">🏆 Topul activității · botul numără mesajele și minutele pe voce</p>
          </div>
        </div>
      </div>
      <p className="pn-orc-fine">
        Cifrele sunt inventate. {top.mention ? "Membrii din top primesc ping." : "Numele apar ca mențiuni, dar nimeni nu primește ping."}
      </p>
    </div>
  );
}

function ActiveTopModule() {
  const { config, set, channels } = usePanel();
  const top = activeTopOf(config);
  // The whole section is sent, so a server that never saved it gets every field at once.
  const setTop = (key: keyof ActiveTop, value: unknown) => set(["activeTop"], { ...top, [key]: value });
  const problem = activeTopProblem(top);
  const id = useId();
  return (
    <ModuleView module={MODULE.activeTop} icon={CONTROL_ICONS.activeTop} aside={(
      <HeadSwitch on={top.enabled} label="Topul membrilor activi" testId="control-top-switch" onChange={(next) => setTop("enabled", next)} />
    )}>
      {!top.enabled ? (
        <OffNote testId="control-top-off" text="Oprit: topul nu se postează singur. /topactivi merge oricum, pentru oricine." action="Pornește topul" onTurnOn={() => setTop("enabled", true)} />
      ) : null}
      <ModuleNotes>{problem ? <Note tone="bad" role="alert">{problem}</Note> : null}</ModuleNotes>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <SectionCard title="Unde și când" small={top.enabled && top.channelId ? dailyIntervalText(top.intervalDays) : "nu se postează"} testId="control-top-where">
            <Fields>
              <ChannelField
                label="Canalul" selectLabel="Canalul topului membrilor activi" value={top.channelId || null} channels={channels} wide
                hint="Poate fi alt canal decât cel al statisticilor."
                onChange={(next) => setTop("channelId", next ?? "")}
              />
              <Seg
                label="La câte zile" testId="control-top-interval" value={String(top.intervalDays)}
                hint="Topul adună zilele perioadei. La 7 zile, perioada e de luni până duminică și topul pleacă luni după miezul nopții."
                options={DAILY_INTERVALS.map((value) => [String(value), value === 1 ? "1 zi" : `${value} zile`] as const)}
                onChange={(next) => setTop("intervalDays", Number(next))}
              />
              <NextDailyReport days={top.intervalDays} on={Boolean(top.enabled && top.channelId)} what="top" siteNote={false} />
            </Fields>
          </SectionCard>
          <SectionCard title="Ce arată" testId="control-top-what">
            <Fields>
              <Seg
                label="Câți membri" testId="control-top-limit" value={String(top.limit)}
                options={ACTIVE_TOP_LIMITS.map((value) => [String(value), `Top ${value}`] as const)}
                onChange={(next) => setTop("limit", Number(next))}
              />
              <SwitchField
                label="Și timpul pe voce" testId="control-top-voice-switch" checked={top.includeVoice}
                hint="O a doua listă: cine a stat cel mai mult pe voce. Se numără minutele cu cel puțin încă un om pe canal, nu în AFK."
                onChange={(next) => setTop("includeVoice", next)}
              />
              <SwitchField
                label="Ping pentru cei din top" testId="control-top-mention" checked={top.mention}
                hint="Membrii din top primesc notificare. Oprit, numele apar fără să deranjeze pe nimeni."
                onChange={(next) => setTop("mention", next)}
              />
              <Fld label="Culoarea" htmlFor={`${id}-c`} hint="Banda din stânga mesajului.">
                <div className="pn-set-colors">
                  <label className="pn-set-picker" aria-label="Alege culoarea">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(top.color) ? top.color.toLowerCase() : "#d8a964"} onChange={(event) => setTop("color", event.target.value)} />
                  </label>
                  <input id={`${id}-c`} className="pn-inp pn-inp-mono pn-set-hex" maxLength={7} value={top.color} data-testid="control-top-color" onChange={(event) => setTop("color", event.target.value.trim())} />
                </div>
              </Fld>
              <NoteRow tone="plain">Botul numără mesajele fiecărui membru de la această versiune încolo; zilele de dinainte nu au cifre pe membru.</NoteRow>
            </Fields>
          </SectionCard>
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><ActiveTopPreview top={top} /></aside>
      </div>
    </ModuleView>
  );
}

export const CONTROL_VIEWS: Record<ControlModuleId, () => React.JSX.Element> = {
  invites: InvitesModule,
  recruitment: RecruitmentModule,
  daily: DailyModule,
  activeTop: ActiveTopModule,
  channels: ChannelsModule,
  server: ServerModule,
};

