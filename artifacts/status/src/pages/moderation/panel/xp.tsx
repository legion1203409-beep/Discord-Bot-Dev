/**
 * Niveluri și XP, în designul panoului: cardul /rank viu sus, „Cum
 * funcționează” explicat cu cifrele reale ale botului (și un calculator), apoi
 * anunțul de nivel, aspectul cardului și rolurile pe niveluri. Folosește
 * aceleași rute ca pagina veche (/guilds/:id/activity-ranks și accesul botului
 * la canal), deci nu schimbă nimic în bot.
 */
import "./panel.css";
import "./xp.css";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiFetchWithMeta, useActiveGuild, useModerationMetadata, useSession } from "../../../hooks/use-moderation-api";
import { uploadMessageImage } from "../../../components/moderation/ImageField";
import {
  activityRankBarMaxY,
  activityRankLayoutForBanner,
  activityRankMemberHeightPercent,
  activityRankMemberMaxY,
  activityRankMemberScale,
  type ActivityRankLayout,
} from "../../../lib/activity-rank-layout";
import type { ActivityRoleReward } from "../../../lib/activity-role-rewards";
import { PageHead, PanelState } from "./draft";
import { Fields, Fld, Ico, Note, Spinner, Switch, cx } from "./fields";
import {
  DEFAULT_XP_CONFIG, XP_AUTO_LEVELS, XP_BAR_STYLES, XP_CHAT, XP_CHAT_COOLDOWN_SECONDS, XP_LADDER, XP_MAX_LEVEL, XP_MAX_LEVEL_ROLE,
  XP_VOICE_PER_MINUTE, boldParts, changedXpParts, effortFor, formatXp, nextRewardLevel, normalizeXpConfig, renderRankUpMessage,
  rewardRoleUsable, xpDraftError, xpForStep, type XpBarStyle, type XpConfig, type XpRole,
} from "./xp-model";

type BotAccess = { channelId: string; channelName: string; canManageChannels: boolean; viewChannel: boolean; sendMessages: boolean };

const TEXT_TYPES: Array<number | string> = [0, 5, "GuildText", "GuildAnnouncement"];
const DEFAULT_BANNER = "/api/assets/activity-rank-default.png?v=thin-xp";
const barGif = (style: XpBarStyle) => `${import.meta.env.BASE_URL}activity-bars/${style}.gif?v=${import.meta.env.VITE_ACTIVITY_BAR_PREVIEW_VERSION}`;
const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/* ------------------------------------------------------------------ */
/* Cardul /rank                                                         */
/* ------------------------------------------------------------------ */

function RankCard({ draft, memberName = "Membrul care folosește /rank", level = 5 }: { draft: XpConfig; memberName?: string; level?: number }) {
  const custom = Boolean(draft.bannerImageUrl);
  const layout = activityRankLayoutForBanner(draft.layout, custom);
  const scale = activityRankMemberScale(layout.member.width, custom);
  return (
    <div className="xp-card" style={{ containerType: "inline-size" }} data-testid="xp-rank-card">
      <img className="xp-card-bg" src={draft.bannerImageUrl || DEFAULT_BANNER} alt="" />
      <img
        className="xp-card-bar" src={barGif(draft.barStyle)} alt="Bara XP la 62%"
        style={{ left: `${layout.bar.x}%`, top: `${layout.bar.y}%`, width: `${layout.bar.width}%` }}
      />
      <div
        className="xp-card-member"
        style={{
          left: `${layout.member.x}%`, top: `${layout.member.y}%`, width: `${layout.member.width}%`,
          height: `${activityRankMemberHeightPercent(layout.member.width, custom)}%`,
          gap: `${1.75 * scale}cqw`, paddingInline: `${1.5 * scale}cqw`,
        }}
      >
        <span className="xp-card-av" style={{ fontSize: `${3.75 * scale}cqw` }}>{memberName.slice(0, 1)}</span>
        <span className="xp-card-who">
          <b style={{ fontSize: `${3.75 * scale}cqw` }}>{memberName}</b>
          <small style={{ fontSize: `${2.5 * scale}cqw` }}>Rang {level} · XP de activitate</small>
        </span>
      </div>
    </div>
  );
}

function LevelUpPreview({ draft, guildName, channelName }: { draft: XpConfig; guildName: string; channelName: string | null }) {
  const text = renderRankUpMessage(draft.rankUpMessage, guildName);
  return (
    <div className="xp-msg" data-testid="xp-levelup-preview">
      <div className="xp-msg-top">
        <span className="xp-msg-bot" aria-hidden="true"><Ico name="orb" /></span>
        <b>Oracolul Cenușii</b><span className="xp-msg-tag">BOT</span>
        <small>{channelName ? `în #${channelName}` : "fără canal: nu se trimite"}</small>
      </div>
      <div className="xp-msg-embed" style={css({ "--xc": draft.color })}>
        <small>Rang de activitate · {guildName}</small>
        <b style={{ color: draft.color }}>Rang 5</b>
        <p>{boldParts(text).map((part, index) => part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cum funcționează                                                     */
/* ------------------------------------------------------------------ */

function HowItWorks({ channelName }: { channelName: string | null }) {
  const steps = [
    { icon: "message" as const, title: "Scrie pe chat", big: `+${XP_CHAT} XP`, unit: "pe mesaj", text: `Contează un mesaj la ${XP_CHAT_COOLDOWN_SECONDS} de secunde, ca spamul să nu aducă nimic.` },
    { icon: "waves" as const, title: "Stai pe voce", big: `+${XP_VOICE_PER_MINUTE} XP`, unit: "pe minut", text: "Doar cu cel puțin încă un membru real în canal. Singur sau cu boți nu primești nimic." },
    { icon: "stairs" as const, title: "Urcă nivelul", big: `1 → ${XP_MAX_LEVEL}`, unit: "niveluri", text: channelName ? `Fiecare nivel nou e anunțat în #${channelName}; la praguri primești și un rol.` : "Fiecare nivel nou poate fi anunțat într-un canal; la praguri primești și un rol." },
    { icon: "star" as const, title: "Intră în top", big: "/rank", unit: "și /toplvl", text: "/rank arată cardul tău. /toplvl arată clasamentul lunii, care o ia de la zero pe 1 ale lunii." },
  ];
  return (
    <section className="xp-how pn-rv" style={css({ "--i": 5 })} aria-labelledby="xp-how-t" data-testid="xp-how">
      <div className="xp-sec-head">
        <span className="xp-sec-kick">Pe înțelesul tuturor</span>
        <h2 id="xp-how-t">Cum funcționează</h2>
        <p>Membrii strâng XP vorbind pe server. XP-ul aduce niveluri, nivelurile aduc roluri. Totul e automat, tu alegi doar cum arată.</p>
      </div>
      <ol className="xp-steps">
        {steps.map((step, index) => (
          <li key={step.title} className="xp-step" style={css({ "--i": index })}>
            <span className="xp-step-n" aria-hidden="true">{index + 1}</span>
            <span className="xp-step-ic" aria-hidden="true"><Ico name={step.icon} /></span>
            <b className="xp-step-t">{step.title}</b>
            <span className="xp-step-big">{step.big}<small>{step.unit}</small></span>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="xp-how-grid">
        <Ladder />
        <Calculator />
      </div>
      <ul className="xp-facts">
        <li><Ico name="lock" /><span><b>XP-ul nu se pierde.</b> Schimbi canalul, aspectul sau rolurile oricând: nivelurile strânse rămân.</span></li>
        <li><Ico name="calendar" /><span><b>Două numărători.</b> XP-ul total urcă mereu; cel lunar e doar pentru clasamentul lunii.</span></li>
        <li><Ico name="shield" /><span><b>Separat de RPG.</b> XP-ul jocului și luptele nu se amestecă cu nivelurile de activitate.</span></li>
        <li><Ico name="eye" /><span><b>Pentru chat</b>, botul are nevoie de „Message Content” pornit în Developer Portal. Fără el merge doar vocea.</span></li>
      </ul>
    </section>
  );
}

function Ladder() {
  const max = effortFor(XP_MAX_LEVEL).xp;
  return (
    <div className="xp-ladder" data-testid="xp-ladder">
      <h3>Drumul până la nivelul {XP_MAX_LEVEL}</h3>
      <p className="xp-sub">Fiecare nivel cere cu 100 XP mai mult decât cel dinainte (nivelul 2 cere 100, nivelul 3 încă 200…).</p>
      <ul>
        {XP_LADDER.map((level) => {
          const effort = effortFor(level);
          return (
            <li key={level} className={cx(XP_AUTO_LEVELS.includes(level as never) && "is-reward")}>
              <span className="xp-lv">{level}</span>
              <span className="xp-rung">
                <span className="xp-rung-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.sqrt(effort.xp / max) * 100)}%` }} /></span>
                <span className="xp-rung-t"><b>{formatXp(effort.xp)} XP</b> · ≈ {formatXp(effort.messages)} mesaje sau {effort.voice} pe voce</span>
              </span>
              {XP_AUTO_LEVELS.includes(level as never) ? <span className="xp-rung-tag">{level === XP_MAX_LEVEL ? "👑 rol final" : "🎖️ rol"}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Calculator() {
  const id = useId();
  const [level, setLevel] = useState(10);
  const effort = effortFor(level);
  return (
    <div className="xp-calc" data-testid="xp-calc">
      <h3>Calculator</h3>
      <p className="xp-sub">Cât îi trebuie unui membru nou ca să ajungă la un nivel.</p>
      <label className="xp-calc-l" htmlFor={id}>Nivelul <b>{level}</b></label>
      <input
        id={id} className="xp-range" type="range" min={2} max={XP_MAX_LEVEL} value={level}
        onChange={(event) => setLevel(Number(event.target.value))} style={css({ "--p": `${((level - 2) / (XP_MAX_LEVEL - 2)) * 100}%` })}
      />
      <input
        className="pn-inp xp-calc-n" type="number" min={2} max={XP_MAX_LEVEL} value={level} aria-label="Nivelul, scris" data-testid="xp-calc-level"
        onChange={(event) => { const next = Math.round(Number(event.target.value)); if (Number.isFinite(next)) setLevel(Math.max(2, Math.min(XP_MAX_LEVEL, next))); }}
      />
      <div className="xp-calc-out" data-testid="xp-calc-out" aria-live="polite">
        <span><b>{formatXp(effort.xp)}</b><small>XP în total</small></span>
        <span><b>≈ {formatXp(effort.messages)}</b><small>mesaje (minim {effort.chatTime} de chat)</small></span>
        <span><b>≈ {effort.voice}</b><small>pe voce, cu prietenii</small></span>
      </div>
      <p className="xp-sub">Doar pasul de la {level - 1} la {level}: {formatXp(xpForStep(level))} XP.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bucăți de formular                                                   */
/* ------------------------------------------------------------------ */

function Card({ title, small, icon, children, testId, index }: { title: string; small?: React.ReactNode; icon: Parameters<typeof Ico>[0]["name"]; children: React.ReactNode; testId?: string; index: number }) {
  const id = useId();
  return (
    <section className="pn-card xp-set pn-rv" aria-labelledby={id} data-testid={testId} style={css({ "--i": index })}>
      <h3 className="pn-card-t" id={id}><span className="xp-set-t"><span className="xp-set-ic" aria-hidden="true"><Ico name={icon} /></span>{title}</span>{small ? <small>{small}</small> : null}</h3>
      {children}
    </section>
  );
}

function Range({ label, value, max, onChange, testId }: { label: string; value: number; max: number; onChange: (value: number) => void; testId: string }) {
  const id = useId();
  return (
    <div className="xp-rg">
      <label htmlFor={id}>{label}<b>{value.toFixed(1)}%</b></label>
      <input
        id={id} className="xp-range" type="range" min={0} max={max} step={0.5} value={Math.min(value, max)} data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))} style={css({ "--p": `${max ? (Math.min(value, max) / max) * 100 : 0}%` })}
      />
    </div>
  );
}

function LayoutEditor({ value, custom, onChange }: { value: ActivityRankLayout | null; custom: boolean; onChange: (next: ActivityRankLayout | null) => void }) {
  const layout = activityRankLayoutForBanner(value, custom);
  const bar = (patch: Partial<ActivityRankLayout["bar"]>) => {
    const next = { ...layout.bar, ...patch };
    next.x = Math.min(next.x, 100 - next.width);
    next.y = Math.min(next.y, activityRankBarMaxY(next.width));
    onChange({ ...layout, bar: next });
  };
  const member = (patch: Partial<ActivityRankLayout["member"]>) => {
    const next = { ...layout.member, ...patch };
    next.x = Math.min(next.x, 100 - next.width);
    next.y = Math.min(next.y, activityRankMemberMaxY(next.width, custom));
    onChange({ ...layout, member: next });
  };
  return (
    <div className="xp-layout" data-testid="xp-layout">
      <div className="xp-layout-g">
        <b>Bara XP</b>
        <Range label="De la stânga" value={layout.bar.x} max={100 - layout.bar.width} onChange={(x) => bar({ x })} testId="slider-layout-bar-x" />
        <Range label="De sus" value={layout.bar.y} max={activityRankBarMaxY(layout.bar.width)} onChange={(y) => bar({ y })} testId="slider-layout-bar-y" />
        <Range label="Mărime" value={layout.bar.width} max={100} onChange={(width) => bar({ width })} testId="slider-layout-bar-width" />
      </div>
      <div className="xp-layout-g">
        <b>Avatar, nume și nivel</b>
        <Range label="De la stânga" value={layout.member.x} max={100 - layout.member.width} onChange={(x) => member({ x })} testId="slider-layout-member-x" />
        <Range label="De sus" value={layout.member.y} max={activityRankMemberMaxY(layout.member.width, custom)} onChange={(y) => member({ y })} testId="slider-layout-member-y" />
        <Range label="Mărime" value={layout.member.width} max={100} onChange={(width) => member({ width })} testId="slider-layout-member-width" />
      </div>
      <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={value === null} onClick={() => onChange(null)} data-testid="button-layout-reset">
        <Ico name="refresh" />Poziție automată
      </button>
    </div>
  );
}

function RewardsEditor({ value, onChange, roles, guildId }: { value: ActivityRoleReward[] | null; onChange: (next: ActivityRoleReward[] | null) => void; roles: XpRole[]; guildId: string }) {
  const custom = value !== null;
  const rows = value ?? [];
  const usable = roles.filter((role) => rewardRoleUsable(role, guildId));
  const levelCount = new Map<number, number>();
  const roleCount = new Map<string, number>();
  for (const row of rows) {
    levelCount.set(row.level, (levelCount.get(row.level) ?? 0) + 1);
    if (row.roleId) roleCount.set(row.roleId, (roleCount.get(row.roleId) ?? 0) + 1);
  }
  const rowError = (row: ActivityRoleReward) => {
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > XP_MAX_LEVEL) return "Nivel între 1 și 100.";
    if (!row.roleId) return "Alege un rol.";
    if ((levelCount.get(row.level) ?? 0) > 1) return "Nivelul e deja folosit.";
    if ((roleCount.get(row.roleId) ?? 0) > 1) return "Rolul e deja la alt nivel.";
    if (!rewardRoleUsable(roles.find((role) => role.id === row.roleId), guildId)) return "Rolul nu mai poate fi dat. Alege altul.";
    return "";
  };
  const patch = (index: number, next: Partial<ActivityRoleReward>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)));
  const sorted = rows.map((row, index) => ({ row, index })).sort((a, b) => (a.row.level || 0) - (b.row.level || 0));
  return (
    <div className="xp-rw" data-testid="editor-activity-role-rewards">
      <div className="xp-rw-mode" role="radiogroup" aria-label="Sursa rolurilor de nivel">
        {[
          { id: "auto", on: !custom, title: "Automate", text: `Botul face singur rolurile la nivelurile ${XP_AUTO_LEVELS.join(", ")}.` },
          { id: "custom", on: custom, title: "Alese de tine", text: "Folosești rolurile tale de pe server, la ce niveluri vrei." },
        ].map((option) => (
          <button
            key={option.id} type="button" role="radio" aria-checked={option.on} data-testid={`radio-rewards-${option.id}`}
            onClick={() => (option.id === "auto" ? onChange(null) : !custom && onChange([]))}
          >
            <i aria-hidden="true" /><b>{option.title}</b><small>{option.text}</small>
          </button>
        ))}
      </div>
      {!custom ? (
        <ul className="xp-rw-auto" data-testid="text-rewards-auto">
          {XP_AUTO_LEVELS.map((level) => (
            <li key={level} className={cx(level === XP_MAX_LEVEL && "is-max")}>
              <span className="xp-lv">{level}</span>
              <span>@{level === XP_MAX_LEVEL ? XP_MAX_LEVEL_ROLE : `Oracolul · Rang Activitate ${level}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {rows.length === 0 ? <p className="xp-rw-empty" data-testid="text-rewards-empty">Niciun rol încă. Fără roluri, membrii doar urcă în nivel.</p> : null}
          <ul className="xp-rw-list">
            {sorted.map(({ row, index }) => {
              const error = rowError(row);
              const known = roles.find((role) => role.id === row.roleId);
              return (
                <li key={index} className={cx("xp-rw-row", error && "is-bad")} data-testid={`row-reward-${index}`}>
                  <label className="xp-rw-lv">
                    <span>Nivel</span>
                    <input
                      className="pn-inp" type="number" min={1} max={XP_MAX_LEVEL} inputMode="numeric" data-testid={`input-reward-level-${index}`}
                      value={Number.isFinite(row.level) ? row.level : ""} aria-invalid={Boolean(error)}
                      onChange={(event) => patch(index, { level: event.target.value === "" ? Number.NaN : Number(event.target.value) })}
                    />
                  </label>
                  <span className="xp-rw-arrow" aria-hidden="true">→</span>
                  <select
                    className="pn-inp" value={row.roleId} data-testid={`select-reward-role-${index}`} aria-invalid={Boolean(error)}
                    aria-label={`Rol pentru nivelul ${Number.isFinite(row.level) ? row.level : index + 1}`}
                    onChange={(event) => patch(index, { roleId: event.target.value })}
                  >
                    <option value="">Alege un rol</option>
                    {row.roleId && !rewardRoleUsable(known, guildId) ? <option value={row.roleId} disabled>Indisponibil · {known?.name ?? row.roleId}</option> : null}
                    {usable.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
                  </select>
                  <button type="button" className="xp-rw-del" aria-label={`Șterge recompensa ${index + 1}`} data-testid={`button-reward-delete-${index}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                    <Ico name="trash" />
                  </button>
                  {error ? <p className="pn-err" role="alert">{error}</p> : null}
                </li>
              );
            })}
          </ul>
          <button
            type="button" className="pn-btn-ghost pn-btn-sm" data-testid="button-reward-add" disabled={nextRewardLevel(rows) === null}
            onClick={() => { const level = nextRewardLevel(rows); if (level !== null) onChange([...rows, { level, roleId: "" }]); }}
          >
            <Ico name="plus" />Adaugă un prag
          </button>
          {usable.length === 0 ? <p className="pn-fh">Nu sunt roluri pe care botul să le poată da. Mută rolul botului mai sus decât ele și dă-i Manage Roles.</p> : null}
        </>
      )}
      <p className="pn-fh">La un prag nou, membrul primește rolul nou și pierde doar rolul de nivel de dinainte. Botul are nevoie de Manage Roles, cu rolul lui deasupra celor date.</p>
    </div>
  );
}

function BotAccessPanel({ guildId, channelId, onClose }: { guildId: string; channelId: string; onClose: () => void }) {
  const [access, setAccess] = useState<BotAccess | null>(null);
  const [draft, setDraft] = useState<{ viewChannel: boolean; sendMessages: boolean } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    setAccess(null); setDraft(null); setError(""); setDone(false);
    void apiFetchWithMeta<BotAccess>(`/guilds/${guildId}/channels/${encodeURIComponent(channelId)}/bot-access`)
      .then(({ data }) => { if (live) { setAccess(data); setDraft({ viewChannel: data.viewChannel, sendMessages: data.sendMessages }); } })
      .catch((loadError: unknown) => { if (live) setError(loadError instanceof Error ? loadError.message : "Accesul botului nu a putut fi verificat."); });
    return () => { live = false; };
  }, [guildId, channelId]);
  const changed = Boolean(access && draft && (access.viewChannel !== draft.viewChannel || access.sendMessages !== draft.sendMessages));
  const apply = async () => {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const { data } = await apiFetchWithMeta<BotAccess>(`/guilds/${guildId}/channels/${encodeURIComponent(channelId)}/bot-access`, { method: "PUT", body: JSON.stringify(draft) });
      setAccess(data); setDraft({ viewChannel: data.viewChannel, sendMessages: data.sendMessages }); setDone(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Accesul botului nu a putut fi schimbat.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="xp-access" role="region" aria-label="Accesul botului la canal" data-testid="xp-access">
      <div className="xp-access-h">
        <b>Botul în #{access?.channelName ?? channelId}</b>
        <button type="button" className="xp-x" aria-label="Închide" onClick={onClose}><Ico name="x" /></button>
      </div>
      {error ? <Note tone="bad" role="alert">{error}</Note> : !access || !draft ? <div className="xp-access-wait"><Spinner />Se verifică…</div> : (
        <>
          {!access.canManageChannels ? <Note tone="warn">Botul are nevoie de Manage Channels pe server ca să-și schimbe accesul aici.</Note> : null}
          <div className="xp-access-row"><span>Vede canalul</span><Switch checked={draft.viewChannel} disabled={!access.canManageChannels || saving} label="Botul vede canalul" onChange={(viewChannel) => setDraft({ ...draft, viewChannel })} /></div>
          <div className="xp-access-row"><span>Poate scrie anunțuri</span><Switch checked={draft.sendMessages} disabled={!access.canManageChannels || saving} label="Botul poate trimite mesaje" onChange={(sendMessages) => setDraft({ ...draft, sendMessages })} /></div>
          <div className="xp-access-f">
            <small>{done ? "✓ Gata, accesul e aplicat." : "Se schimbă doar accesul botului; celelalte roluri rămân cum sunt."}</small>
            <button type="button" className="pn-btn pn-btn-sm" disabled={!access.canManageChannels || !changed || saving} onClick={() => void apply()}>{saving ? <Spinner /> : <Ico name="check" />}Aplică</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagina                                                               */
/* ------------------------------------------------------------------ */

const VARIABLES = [["{user}", "numele membrului"], ["{level}", "nivelul nou"], ["{guild}", "numele serverului"]] as const;

export function XpPage() {
  const { guildId } = useActiveGuild();
  const { session } = useSession();
  const { data: metadata, loading: metadataLoading } = useModerationMetadata(guildId);
  const activeGuild = useRef(guildId);
  activeGuild.current = guildId;
  const [draft, setDraft] = useState<XpConfig>(DEFAULT_XP_CONFIG);
  const [saved, setSaved] = useState<XpConfig>(DEFAULT_XP_CONFIG);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAccessOpen(false);
    setSaveState(null);
    if (!guildId) return;
    const controller = new AbortController();
    setStatus("loading");
    void apiFetchWithMeta<{ config: XpConfig }>(`/guilds/${guildId}/activity-ranks`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const config = normalizeXpConfig(data.config);
        setDraft(config); setSaved(config); setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error : new Error("Setările nivelurilor nu au putut fi încărcate."));
        setStatus("error");
      });
    return () => controller.abort();
  }, [guildId, reload]);

  const roles = (metadata?.roles ?? []) as XpRole[];
  const textChannels = useMemo(() => (metadata?.channels ?? []).filter((channel) => TEXT_TYPES.includes(channel.type)), [metadata]);
  const channel = textChannels.find((item) => item.id === draft.notificationChannelId) ?? null;
  const guildName = metadata?.guild.name ?? "Serverul meu";
  const changed = changedXpParts(saved, draft);
  const problem = guildId ? xpDraftError(draft, metadata ? roles : undefined, guildId) : "";
  const set = <K extends keyof XpConfig>(key: K, value: XpConfig[K]) => { setSaveState(null); setDraft((current) => ({ ...current, [key]: value })); };

  if (!guildId) return <div className="pn"><p className="pn-fh">Alege un server ca să setezi nivelurile.</p></div>;
  if (status !== "ready") {
    return <PanelState status={status} error={loadError} onRetry={() => setReload((value) => value + 1)} loadingText="Se încarcă nivelurile…" />;
  }

  const save = async () => {
    if (saving || problem) return;
    const savingGuild = guildId;
    setSaving(true); setSaveState(null);
    try {
      const { data } = await apiFetchWithMeta<{ config: XpConfig }>(`/guilds/${savingGuild}/activity-ranks`, { method: "PUT", body: JSON.stringify(draft) });
      if (activeGuild.current !== savingGuild) return;
      const config = normalizeXpConfig(data.config);
      setDraft(config); setSaved(config);
      setSaveState({ tone: "info", text: "Salvat. Botul folosește noile setări." });
    } catch (error) {
      if (activeGuild.current === savingGuild) setSaveState({ tone: "bad", text: error instanceof Error ? error.message : "Setările nu au putut fi salvate." });
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable: string) => {
    const box = messageRef.current;
    const start = box?.selectionStart ?? draft.rankUpMessage.length;
    const end = box?.selectionEnd ?? start;
    const next = `${draft.rankUpMessage.slice(0, start)}${variable}${draft.rankUpMessage.slice(end)}`.slice(0, 1_800);
    set("rankUpMessage", next);
    requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(start + variable.length, start + variable.length); });
  };

  const upload = async (file: File) => {
    setUploading(true); setUploadError("");
    try {
      set("bannerImageUrl", await uploadMessageImage(file, guildId, session?.csrfToken, "/storage/activity-ranks/uploads/request-url"));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Imaginea nu a putut fi încărcată.");
    } finally {
      setUploading(false);
    }
  };

  const custom = Boolean(draft.bannerImageUrl);
  return (
    <div className="pn xp" data-testid="xp-page" style={css({ "--tc": "#e2b467" })}>
      <PageHead
        icon={<Ico name="stairs" />} guildName={guildName} title="Niveluri și XP"
        lede="Membrii strâng XP când scriu și când stau pe voce, urcă în nivel și primesc roluri. Aici alegi cum arată cardul /rank, unde apare anunțul și ce roluri se dau."
        summary={(
          <div className={cx("pn-sum pn-rv xp-power", draft.enabled && "is-on")} style={css({ "--i": 3 })} data-testid="xp-summary">
            <Switch large checked={draft.enabled} onChange={(enabled) => set("enabled", enabled)} label="Pornește nivelurile" testId="xp-enabled" />
            <span><b>{draft.enabled ? "Pornit" : "Oprit"}</b><br />{draft.enabled ? "botul dă XP" : "XP-ul strâns rămâne"}</span>
          </div>
        )}
      />

      <section className="xp-hero pn-rv" style={css({ "--i": 4 })} aria-label="Previzualizare">
        <div className="xp-hero-card">
          <span className="xp-hero-k">Așa arată /rank</span>
          <RankCard draft={draft} />
        </div>
        <div className="xp-hero-side">
          <span className="xp-hero-k">Și anunțul de nivel nou</span>
          <LevelUpPreview draft={draft} guildName={guildName} channelName={channel?.name ?? null} />
          <div className="xp-hero-stats">
            <span><b>+{XP_CHAT}</b><small>XP / mesaj</small></span>
            <span><b>+{XP_VOICE_PER_MINUTE}</b><small>XP / minut voce</small></span>
            <span><b>{XP_MAX_LEVEL}</b><small>nivel maxim</small></span>
          </div>
        </div>
      </section>

      <HowItWorks channelName={channel?.name ?? null} />

      <div className="xp-sets">
        <Card title="Anunțul de nivel nou" icon="mega" index={6} testId="xp-announce" small={channel ? `#${channel.name}` : "fără canal"}>
          <Fields>
            <Fld label="Canalul anunțurilor" hint="Golește-l ca să nu mai anunțe nicăieri. Botul nu trimite niciodată în alt canal.">
              <div className="xp-chan">
                <select className="pn-inp" aria-label="Canal pentru creșterea rangului" value={draft.notificationChannelId} onChange={(event) => { set("notificationChannelId", event.target.value); setAccessOpen(false); }}>
                  <option value="">Fără anunțuri</option>
                  {draft.notificationChannelId && !channel ? <option value={draft.notificationChannelId}>Canal indisponibil · {draft.notificationChannelId}</option> : null}
                  {textChannels.map((item) => <option key={item.id} value={item.id}>#{item.name}</option>)}
                </select>
                <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={!channel || metadataLoading} onClick={() => setAccessOpen((open) => !open)} aria-expanded={accessOpen} data-testid="xp-access-open">
                  <Ico name="key" />Accesul botului
                </button>
              </div>
            </Fld>
            {accessOpen && channel ? <div className="pn-fld pn-wide"><BotAccessPanel guildId={guildId} channelId={channel.id} onClose={() => setAccessOpen(false)} /></div> : null}
            <Fld wide label="Mesajul" hint="Apasă pe o variabilă ca s-o pui unde e cursorul. **text** se vede îngroșat.">
              <div className="xp-text">
                <textarea
                  ref={messageRef} className="pn-inp" rows={3} maxLength={1_800} value={draft.rankUpMessage} aria-label="Mesajul de rang nou"
                  onChange={(event) => set("rankUpMessage", event.target.value)}
                />
                <div className="xp-vars">
                  {VARIABLES.map(([variable, text]) => (
                    <button key={variable} type="button" className="xp-var" onClick={() => insertVariable(variable)} title={text}><code>{variable}</code><small>{text}</small></button>
                  ))}
                  <span className="xp-count">{draft.rankUpMessage.length}/1800</span>
                </div>
              </div>
            </Fld>
          </Fields>
        </Card>

        <Card title="Cardul /rank" icon="image" index={7} testId="xp-look" small="se vede sus, live">
          <Fields>
            <Fld wide label="Stilul barei" hint="Șapte bare animate. Se umplu până la progresul real al membrului.">
              <div className="xp-styles" role="radiogroup" aria-label="Stilul barei XP">
                {XP_BAR_STYLES.map(([id, name, text]) => (
                  <button key={id} type="button" role="radio" aria-checked={draft.barStyle === id} className="xp-style" data-testid={`xp-style-${id}`} onClick={() => set("barStyle", id)}>
                    <span className="xp-style-img"><img src={barGif(id)} alt="" /></span>
                    <b>{name}</b><small>{text}</small>
                  </button>
                ))}
              </div>
            </Fld>
            <Fld wide label="Bannerul" hint="Gol = imaginea Regatul Cenușii. Merg imagini încărcate aici, Discord CDN, i.imgur.com și images.unsplash.com.">
              <div className="xp-banner">
                <input className="pn-inp" value={draft.bannerImageUrl} placeholder="Link imagine (sau încarcă una)" aria-label="Banner comun pentru cardurile de rang" onChange={(event) => set("bannerImageUrl", event.target.value.trim())} />
                <label className={cx("pn-btn-ghost pn-btn-sm xp-up", uploading && "is-busy")}>
                  {uploading ? <Spinner /> : <Ico name="image" />}{uploading ? "Se încarcă…" : "Încarcă"}
                  <input type="file" className="pn-sr" accept="image/png,image/jpeg,image/gif,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
                </label>
                {custom ? <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => set("bannerImageUrl", "")}><Ico name="x" />Implicit</button> : null}
              </div>
              {uploadError ? <p className="pn-err" role="alert">{uploadError}</p> : null}
            </Fld>
            <Fld label="Culoarea" hint="Pentru titlul anunțului și accentele cardului.">
              <label className="xp-color">
                <input type="color" value={draft.color} onChange={(event) => set("color", event.target.value)} aria-label="Culoarea cardului de rang" />
                <code>{draft.color.toUpperCase()}</code>
              </label>
            </Fld>
            <Fld wide label="Poziția pe banner" hint="Mută bara și cardul membrului; previzualizarea de sus se schimbă pe loc.">
              <LayoutEditor value={draft.layout} custom={custom} onChange={(layout) => set("layout", layout)} />
            </Fld>
          </Fields>
        </Card>

        <Card title="Roluri pe niveluri" icon="star" index={8} testId="xp-rewards" small={draft.roleRewards === null ? "automate" : `${draft.roleRewards.length} praguri`}>
          <RewardsEditor value={draft.roleRewards} onChange={(roleRewards) => set("roleRewards", roleRewards)} roles={roles} guildId={guildId} />
        </Card>
      </div>

      {problem && changed.length ? <div className="xp-problem"><Note tone="bad" role="alert" testId="xp-problem">{problem}</Note></div> : null}
      {saveState && !changed.length ? <div className="xp-problem"><Note tone={saveState.tone === "bad" ? "bad" : "plain"} role="status" testId="xp-saved">{saveState.text}</Note></div> : null}

      {changed.length ? (
        <div className="pn-save" role="region" aria-label="Modificări nesalvate" data-testid="xp-save-bar">
          <div className={cx("pn-save-st", saving && "is-saving")} role="status">
            <i aria-hidden="true" />
            <span>{saving ? "Se salvează…" : saveState?.tone === "bad" ? saveState.text : <>Modificări nesalvate în <b>{changed.join(", ")}</b>.</>}</span>
          </div>
          <div className="pn-save-act">
            <button type="button" className="pn-btn-ghost" onClick={() => { setDraft(saved); setSaveState(null); }} disabled={saving}>Renunță</button>
            <button type="button" className="pn-btn" onClick={() => void save()} disabled={saving || Boolean(problem) || metadataLoading} data-testid="xp-save">
              {saving ? <Spinner /> : <Ico name="check" />}Salvează
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
