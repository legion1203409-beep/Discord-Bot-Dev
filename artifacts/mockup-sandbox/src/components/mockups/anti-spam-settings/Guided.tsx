import "./_group.css";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, Check, ChevronDown, CircleHelp, Save, Shield, ShieldCheck, ShieldOff } from "lucide-react";

type Rule = {
  enabled: boolean;
  action: string;
  severity: string;
  thresholds: Record<string, number>;
};

type AntiSpam = {
  enabled: boolean;
  logChannelId: string | null;
  message: Rule;
  edit: Rule;
  delete: Rule;
  mention: Rule;
  emoji: Rule;
};

type Threshold = {
  key: string;
  label: string;
  help: string;
  min: number;
  max: number;
  aliases: string[];
};

const ACTIONS = [
  ["none", "Nicio acțiune"],
  ["warn", "Avertisment"],
  ["mute", "Restricționează (mute)"],
  ["kick", "Elimină (kick)"],
  ["ban", "Blochează (ban)"],
  ["delete", "Șterge mesajul"],
] as const;
const SEVERITIES = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]] as const;

const INITIAL_ANTI_SPAM: AntiSpam = {
  enabled: true,
  logChannelId: "128745903217654784",
  message: { enabled: true, action: "mute", severity: "normal", thresholds: { messages: 5, windowMs: 5 } },
  edit: { enabled: true, action: "warn", severity: "soft", thresholds: { edits: 5, windowMs: 10 } },
  delete: { enabled: false, action: "none", severity: "normal", thresholds: { deletes: 5, windowMs: 10 } },
  mention: { enabled: true, action: "warn", severity: "normal", thresholds: { mentions: 5 } },
  emoji: { enabled: false, action: "none", severity: "soft", thresholds: { emoji: 10 } },
};

const MESSAGE_THRESHOLDS: Threshold[] = [
  { key: "messages", label: "Mesaje", help: "Mesaje până la declanșare.", min: 1, max: 1000, aliases: ["messages", "limit", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const EDIT_THRESHOLDS: Threshold[] = [
  { key: "edits", label: "Editări", help: "Editări până la declanșare.", min: 1, max: 1000, aliases: ["limit", "edits", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const DELETE_THRESHOLDS: Threshold[] = [
  { key: "deletes", label: "Ștergeri", help: "Ștergeri până la declanșare.", min: 1, max: 1000, aliases: ["limit", "deletes", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const MENTION_THRESHOLDS: Threshold[] = [
  { key: "mentions", label: "Mențiuni", help: "Mențiuni într-un mesaj până la declanșare.", min: 1, max: 100, aliases: ["mentions", "limit", "max"] },
];
const EMOJI_THRESHOLDS: Threshold[] = [
  { key: "emoji", label: "Emoji", help: "Număr maxim de emoji.", min: 1, max: 200, aliases: ["emoji", "limit", "max"] },
];

const RULES = [
  { key: "message", title: "Spam de mesaje", description: "Mesaje repetate într-o fereastră de timp.", thresholds: MESSAGE_THRESHOLDS },
  { key: "edit", title: "Spam de editări", description: "Editări repetate într-o fereastră de timp.", thresholds: EDIT_THRESHOLDS },
  { key: "delete", title: "Spam de ștergeri", description: "Ștergeri repetate într-o fereastră de timp.", thresholds: DELETE_THRESHOLDS },
  { key: "mention", title: "Spam de mențiuni", description: "Mențiuni într-un singur mesaj.", thresholds: MENTION_THRESHOLDS },
  { key: "emoji", title: "Spam de emoji", description: "Numărul maxim de emoji într-un mesaj.", thresholds: EMOJI_THRESHOLDS },
] as const;

type RuleKey = (typeof RULES)[number]["key"];
type RuleField = "message" | "edit" | "delete" | "mention" | "emoji";
type ValidationIssue = { rule: RuleKey; field: string; message: string };

function readThreshold(rule: Rule, field: Threshold) {
  return field.aliases.map((key) => rule.thresholds[key]).find((value) => value !== undefined);
}

function thresholdIssue(rule: Rule, field: Threshold) {
  const value = readThreshold(rule, field);
  if (value === undefined || !Number.isFinite(value)) return `${field.label}: completează o valoare între ${field.min} și ${field.max}.`;
  if (!Number.isInteger(value)) return `${field.label}: introdu un număr întreg între ${field.min} și ${field.max}.`;
  if (value < field.min || value > field.max) return `${field.label}: valoarea trebuie să fie între ${field.min} și ${field.max}.`;
  return "";
}

export function Guided() {
  const [antiSpam, setAntiSpam] = useState<AntiSpam>(INITIAL_ANTI_SPAM);
  const [saved, setSaved] = useState(true);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState("Salvat");
  const protectionEnabled = false;

  const update = (next: AntiSpam) => {
    setAntiSpam(next);
    setSaved(false);
  };
  const updateRule = (key: RuleField, rule: Rule) => update({ ...antiSpam, [key]: rule });
  const enabledRules = RULES.filter(({ key }) => antiSpam[key].enabled).length;
  const validationIssues: ValidationIssue[] = RULES.flatMap(({ key, thresholds }) =>
    thresholds.flatMap((field) => {
      const message = thresholdIssue(antiSpam[key], field);
      return message ? [{ rule: key, field: field.key, message }] : [];
    }),
  );
  const issueFor = (rule: RuleKey, field: string) =>
    validationIssues.find((issue) => issue.rule === rule && issue.field === field)?.message;

  const saveDraft = () => {
    setSaveAttempted(true);
    if (validationIssues.length) return;
    setSaved(true);
    setSavedAt("Salvat acum");
  };

  const updateThreshold = (ruleKey: RuleKey, field: Threshold, event: ChangeEvent<HTMLInputElement>) => {
    const rule = antiSpam[ruleKey];
    const thresholds = { ...rule.thresholds };
    field.aliases.forEach((key) => delete thresholds[key]);
    if (event.target.value !== "") thresholds[field.key] = Number(event.target.value);
    updateRule(ruleKey, { ...rule, thresholds });
  };

  return (
    <main className="anti-spam-settings guided min-h-[100dvh]">
      <style>{`
        .guided { --g-bg:#121212; --g-card:#1e1e1e; --g-border:rgba(255,255,255,.11); --g-muted:#b0b0b0; --g-micro:#7e7e7e; --g-red:#d94a2b; --g-red-hover:#b33c24; --g-green:#92d8a8; --g-amber:#f0bb69; color:#fff; background:var(--g-bg); }
        .guided * { box-sizing:border-box; }
        .guided .g-shell { width:min(100%,1120px); margin:0 auto; padding:34px 28px 116px; }
        .guided .g-topline { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid var(--g-border); padding-bottom:20px; }
        .guided .g-brand { display:flex; align-items:center; gap:11px; color:#fff; font-size:13px; font-weight:700; letter-spacing:.025em; }
        .guided .g-brand-mark { display:grid; place-items:center; height:34px; width:34px; border:1px solid rgba(217,74,43,.45); border-radius:10px; color:var(--g-red); background:rgba(217,74,43,.09); }
        .guided .g-crumb { color:var(--g-micro); font-size:12px; }
        .guided .g-unsaved { display:inline-flex; align-items:center; gap:7px; color:var(--g-amber); font-size:12px; font-weight:600; }
        .guided .g-intro { padding:31px 0 22px; display:flex; align-items:flex-end; justify-content:space-between; gap:24px; }
        .guided .g-kicker { margin:0 0 10px; color:#d77a63; font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
        .guided h1 { margin:0; font-size:clamp(30px,4vw,40px); line-height:1.05; letter-spacing:-.04em; font-weight:700; }
        .guided .g-subtitle { max-width:600px; margin:12px 0 0; color:var(--g-muted); font-size:14px; line-height:1.65; }
        .guided .g-health { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:11px 13px; border:1px solid var(--g-border); border-radius:12px; background:#191919; }
        .guided .g-health-icon { color:var(--g-amber); }
        .guided .g-health strong { display:block; font-size:12px; font-weight:700; }
        .guided .g-health span { display:block; margin-top:3px; color:var(--g-micro); font-size:11px; }
        .guided .g-warning { display:flex; align-items:flex-start; gap:12px; border:1px solid rgba(240,187,105,.25); border-radius:12px; padding:14px 16px; color:#f0bb69; background:rgba(240,187,105,.07); font-size:13px; line-height:1.55; }
        .guided .g-warning svg { flex:none; margin-top:1px; }
        .guided .g-warning strong { color:#f3d7a8; }
        .guided .g-overview { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:24px; align-items:center; margin-top:20px; padding:18px 20px; background:var(--g-card); border:1px solid var(--g-border); border-radius:14px; }
        .guided .g-overview-main { display:flex; align-items:center; gap:15px; }
        .guided .g-master-toggle { flex:none; display:grid; place-items:center; width:40px; height:40px; border-radius:12px; color:#fff; background:rgba(217,74,43,.16); }
        .guided .g-overview-title { font-weight:700; font-size:14px; }
        .guided .g-overview-help { margin-top:4px; color:var(--g-muted); font-size:12px; line-height:1.45; }
        .guided .g-switch { position:relative; display:inline-flex; flex:none; width:42px; height:24px; }
        .guided .g-switch input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; margin:0; z-index:1; }
        .guided .g-switch-track { display:block; width:42px; height:24px; background:#444; border:1px solid #585858; border-radius:999px; transition:background .18s ease; }
        .guided .g-switch-track::after { content:""; position:absolute; width:16px; height:16px; left:4px; top:4px; border-radius:50%; background:#d0d0d0; transition:transform .18s ease, background .18s ease; }
        .guided .g-switch input:checked + .g-switch-track { background:var(--g-red); border-color:var(--g-red); }
        .guided .g-switch input:checked + .g-switch-track::after { transform:translateX(18px); background:#fff; }
        .guided .g-switch input:focus-visible + .g-switch-track { outline:2px solid #fff; outline-offset:3px; }
        .guided .g-overview-state { text-align:right; }
        .guided .g-state-pill { display:inline-flex; align-items:center; gap:7px; padding:6px 9px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
        .guided .g-state-pill.on { color:var(--g-green); background:rgba(69,153,91,.14); }
        .guided .g-state-pill.off { color:var(--g-micro); background:rgba(255,255,255,.07); }
        .guided .g-state-caption { display:block; margin-top:5px; color:var(--g-micro); font-size:11px; }
        .guided .g-section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin:31px 1px 12px; }
        .guided .g-section-heading h2 { margin:0; font-size:16px; letter-spacing:-.015em; }
        .guided .g-section-heading p { margin:5px 0 0; color:var(--g-muted); font-size:12px; }
        .guided .g-count { color:var(--g-micro); font-size:11px; font-family:var(--mono); white-space:nowrap; }
        .guided .g-rules { display:flex; flex-direction:column; gap:9px; }
        .guided .g-rule { overflow:hidden; border:1px solid var(--g-border); border-radius:12px; background:var(--g-card); transition:border-color .16s ease, opacity .16s ease; }
        .guided .g-rule.is-off { border-color:rgba(255,255,255,.075); }
        .guided .g-rule summary { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; min-height:76px; padding:14px 17px; cursor:pointer; list-style:none; }
        .guided .g-rule summary::-webkit-details-marker { display:none; }
        .guided .g-rule-lead { display:flex; align-items:center; gap:13px; min-width:0; }
        .guided .g-rule-status { flex:none; width:9px; height:9px; border-radius:50%; background:var(--g-green); box-shadow:0 0 0 4px rgba(146,216,168,.1); }
        .guided .g-rule.is-off .g-rule-status { background:#686868; box-shadow:0 0 0 4px rgba(255,255,255,.045); }
        .guided .g-rule-title { display:block; font-size:13px; font-weight:700; }
        .guided .g-rule-description { display:block; margin-top:4px; color:var(--g-micro); font-size:11px; }
        .guided .g-rule-trailing { display:flex; align-items:center; gap:15px; }
        .guided .g-rule-status-text { color:var(--g-green); font-size:11px; font-weight:700; }
        .guided .g-rule.is-off .g-rule-status-text { color:var(--g-micro); }
        .guided .g-chevron { color:var(--g-micro); transition:transform .18s ease; }
        .guided details[open] .g-chevron { transform:rotate(180deg); }
        .guided .g-rule-controls { border-top:1px solid var(--g-border); padding:18px 18px 20px; }
        .guided .g-control-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        .guided .g-control-grid.thresholds { grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:18px; }
        .guided .g-field label { display:block; margin-bottom:7px; color:#e4e4e4; font-size:12px; font-weight:600; }
        .guided .g-field select, .guided .g-field input { display:block; width:100%; min-height:42px; border:1px solid rgba(255,255,255,.14); border-radius:8px; padding:0 11px; color:#fff; background:#141414; font:inherit; font-size:13px; outline:none; }
        .guided .g-field select { padding-right:30px; }
        .guided .g-field input:focus, .guided .g-field select:focus { border-color:rgba(217,74,43,.9); box-shadow:0 0 0 3px rgba(217,74,43,.14); }
        .guided .g-help { display:block; margin-top:6px; color:var(--g-micro); font-size:11px; line-height:1.45; }
        .guided .g-inline-switch { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:66px; border:1px solid var(--g-border); border-radius:9px; padding:11px 12px; background:rgba(255,255,255,.018); }
        .guided .g-inline-switch strong { display:block; font-size:12px; }
        .guided .g-inline-switch span:not(.g-switch-track) { display:block; margin-top:4px; color:var(--g-micro); font-size:11px; }
        .guided .g-validation { margin:6px 0 0; color:#ff8c73; font-size:11px; line-height:1.4; }
        .guided .g-threshold-wrap { min-width:0; }
        .guided .g-channel { margin-top:15px; padding:18px; border:1px solid var(--g-border); border-radius:12px; background:#181818; }
        .guided .g-channel-head { display:flex; align-items:flex-start; gap:11px; margin-bottom:13px; }
        .guided .g-channel-icon { display:grid; place-items:center; width:30px; height:30px; flex:none; border-radius:8px; color:#e49a87; background:rgba(217,74,43,.11); }
        .guided .g-channel-head strong { display:block; font-size:13px; }
        .guided .g-channel-head span { display:block; margin-top:4px; color:var(--g-muted); font-size:11px; line-height:1.45; }
        .guided .g-channel-input { max-width:500px; }
        .guided .g-channel-input input { font-family:var(--mono); letter-spacing:.015em; }
        .guided .g-logic-note { display:flex; align-items:flex-start; gap:10px; margin-top:15px; padding:13px 14px; border:1px solid rgba(217,74,43,.23); border-radius:10px; color:#e9a08f; background:rgba(217,74,43,.055); font-size:12px; line-height:1.55; }
        .guided .g-logic-note svg { flex:none; margin-top:1px; }
        .guided .g-footnote { margin:10px 2px 0; color:var(--g-micro); font-size:11px; line-height:1.6; }
        .guided .g-footer { position:fixed; z-index:10; inset:auto 0 0; border-top:1px solid rgba(255,255,255,.1); background:rgba(18,18,18,.94); backdrop-filter:blur(12px); }
        .guided .g-footer-inner { width:min(100%,1120px); min-height:72px; margin:0 auto; padding:12px 28px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .guided .g-save-state { display:flex; align-items:center; gap:9px; color:var(--g-muted); font-size:12px; }
        .guided .g-save-state svg { color:var(--g-green); }
        .guided .g-save-state.dirty svg { color:var(--g-amber); }
        .guided .g-save-state small { display:block; margin-top:3px; color:var(--g-micro); font-size:10px; }
        .guided .g-save-button { display:inline-flex; justify-content:center; align-items:center; gap:9px; min-height:42px; border:0; border-radius:9px; padding:0 17px; color:#fff; background:var(--g-red); font:inherit; font-size:12px; font-weight:700; cursor:pointer; transition:background .16s ease, transform .16s ease; }
        .guided .g-save-button:hover { background:var(--g-red-hover); transform:translateY(-1px); }
        .guided .g-save-button:focus-visible { outline:2px solid #fff; outline-offset:3px; }
        .guided .g-save-button:disabled { cursor:not-allowed; opacity:.56; transform:none; }
        .guided .g-validation-summary { color:#ff8c73; font-size:11px; margin-right:auto; }
        .guided .g-quiet { color:var(--g-micro); font-size:10px; }
        @media (max-width:700px) {
          .guided .g-shell { padding:21px 15px 113px; }
          .guided .g-topline { padding-bottom:16px; }
          .guided .g-intro { display:block; padding:25px 0 18px; }
          .guided .g-health { margin-top:16px; width:100%; }
          .guided .g-overview { grid-template-columns:minmax(0,1fr); gap:15px; padding:15px; }
          .guided .g-overview-state { display:flex; align-items:center; justify-content:space-between; padding-left:55px; text-align:left; }
          .guided .g-state-caption { margin:0; }
          .guided .g-section-heading { align-items:flex-start; }
          .guided .g-rule summary { min-height:72px; padding:12px; gap:8px; }
          .guided .g-rule-lead { gap:10px; }
          .guided .g-rule-description { max-width:240px; line-height:1.4; }
          .guided .g-rule-trailing { gap:9px; }
          .guided .g-rule-controls { padding:15px 12px 17px; }
          .guided .g-control-grid { grid-template-columns:minmax(0,1fr); }
          .guided .g-control-grid.thresholds { grid-template-columns:minmax(0,1fr); margin-top:14px; }
          .guided .g-channel { padding:15px 12px; }
          .guided .g-footer-inner { padding:11px 15px; min-height:68px; }
          .guided .g-save-button { padding:0 13px; }
          .guided .g-validation-summary { max-width:110px; line-height:1.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          .guided *, .guided *::before, .guided *::after { scroll-behavior:auto !important; transition-duration:.01ms !important; }
        }
      `}</style>

      <div className="g-shell">
        <div className="g-topline">
          <div className="g-brand">
            <span className="g-brand-mark"><Shield size={17} /></span>
            <span>MODERARE SERVER</span>
          </div>
          <span className="g-crumb">Configurare / Protecție</span>
        </div>

        <header className="g-intro">
          <div>
            <p className="g-kicker">Configurare</p>
            <h1>Anti-Spam</h1>
            <p className="g-subtitle">Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.</p>
          </div>
          <div className="g-health" aria-label="Starea protecției generale">
            {protectionEnabled ? <ShieldCheck className="g-health-icon" size={19} /> : <ShieldOff className="g-health-icon" size={19} />}
            <div>
              <strong>Protecție generală</strong>
              <span>{protectionEnabled ? "Activă" : "Inactivă"}</span>
            </div>
          </div>
        </header>

        {antiSpam.enabled && !protectionEnabled && (
          <div className="g-warning" role="status">
            <AlertTriangle size={17} />
            <div><strong>Anti-spam este activ, dar regulile nu vor rula.</strong> Activează și Protecția generală; altfel regulile anti-spam nu rulează.</div>
          </div>
        )}

        <section className="g-overview" aria-label="Starea anti-spam">
          <div className="g-overview-main">
            <div className="g-master-toggle">{antiSpam.enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}</div>
            <div>
              <div className="g-overview-title">Anti-spam</div>
              <div className="g-overview-help">Controlează toate regulile de mai jos.</div>
            </div>
          </div>
          <div className="g-overview-state">
            <label className="g-switch">
              <input
                type="checkbox"
                aria-label="Activează anti-spam"
                checked={antiSpam.enabled}
                onChange={(event) => update({ ...antiSpam, enabled: event.target.checked })}
              />
              <span className="g-switch-track" />
            </label>
            <span>
              <span className={`g-state-pill ${antiSpam.enabled ? "on" : "off"}`}>
                {antiSpam.enabled ? <><Check size={12} /> Activ</> : <><ShieldOff size={12} /> Inactiv</>}
              </span>
              <span className="g-state-caption">{enabledRules} din 5 reguli active</span>
            </span>
          </div>
        </section>

        <div className="g-section-heading">
          <div>
            <h2>Reguli anti-spam</h2>
            <p>Deschide o regulă pentru a-i ajusta acțiunea, severitatea și limitele.</p>
          </div>
          <span className="g-count">{String(enabledRules).padStart(2, "0")} / 05 ACTIVE</span>
        </div>

        <section className="g-rules" aria-label="Reguli anti-spam">
          {RULES.map(({ key, title, description, thresholds }) => {
            const rule = antiSpam[key];
            const actions = key === "delete" ? ACTIONS.filter(([action]) => action !== "delete") : ACTIONS;
            const ineffectiveEdit = key === "edit" && antiSpam.enabled && rule.enabled && rule.action === "none";
            const deleteWarning = key === "delete" && antiSpam.enabled && rule.enabled;
            return (
              <details key={key} className={`g-rule ${rule.enabled ? "is-on" : "is-off"}`}>
                <summary>
                  <span className="g-rule-lead">
                    <span className="g-rule-status" aria-hidden="true" />
                    <span>
                      <span className="g-rule-title">{title}</span>
                      <span className="g-rule-description">{description}</span>
                    </span>
                  </span>
                  <span className="g-rule-trailing">
                    <span className="g-rule-status-text">{rule.enabled ? "Activă" : "Inactivă"}</span>
                    <ChevronDown className="g-chevron" size={17} />
                  </span>
                </summary>
                <div className="g-rule-controls">
                  <div className="g-control-grid">
                    <div className="g-inline-switch">
                      <div>
                        <strong>Regulă activă</strong>
                        <span>Include această regulă în protecție.</span>
                      </div>
                      <label className="g-switch">
                        <input
                          type="checkbox"
                          aria-label={`${title}: Regulă activă`}
                          checked={rule.enabled}
                          onChange={(event) => updateRule(key, { ...rule, enabled: event.target.checked })}
                        />
                        <span className="g-switch-track" />
                      </label>
                    </div>
                    <div className="g-field">
                      <label htmlFor={`action-${key}`}>Acțiune</label>
                      <select
                        id={`action-${key}`}
                        value={rule.action}
                        onChange={(event) => updateRule(key, { ...rule, action: event.target.value })}
                      >
                        {actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="g-field">
                      <label htmlFor={`severity-${key}`}>Severitate</label>
                      <select
                        id={`severity-${key}`}
                        value={rule.severity}
                        onChange={(event) => updateRule(key, { ...rule, severity: event.target.value })}
                      >
                        {SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="g-control-grid thresholds">
                    {thresholds.map((field) => {
                      const issue = issueFor(key, field.key);
                      const value = readThreshold(rule, field);
                      return (
                        <div className="g-threshold-wrap" key={field.key}>
                          <div className="g-field">
                            <label htmlFor={`threshold-${key}-${field.key}`}>{field.label}</label>
                            <input
                              id={`threshold-${key}-${field.key}`}
                              type="number"
                              min={field.min}
                              max={field.max}
                              step="1"
                              value={value ?? ""}
                              aria-invalid={Boolean(issue && (saveAttempted || value !== undefined))}
                              aria-describedby={`help-${key}-${field.key}${issue && (saveAttempted || value !== undefined) ? ` error-${key}-${field.key}` : ""}`}
                              onChange={(event) => updateThreshold(key, field, event)}
                            />
                            <span id={`help-${key}-${field.key}`} className="g-help">{field.help} Valori acceptate: {field.min}–{field.max}.</span>
                          </div>
                          {issue && (saveAttempted || value !== undefined) && (
                            <p className="g-validation" id={`error-${key}-${field.key}`} role="alert">{issue}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {ineffectiveEdit && (
                    <div className="g-logic-note" role="status">
                      <AlertTriangle size={15} />
                      <span>Regula de editări nu va sancționa: acțiunea este „Nicio acțiune”.</span>
                    </div>
                  )}
                  {deleteWarning && (
                    <p className="g-footnote">Sancțiunile pentru ștergeri necesită „Vezi jurnalul de audit” și un operator identificat acolo. Pentru ștergeri fără autor verificabil, botul doar alertează; un mesaj deja șters nu poate fi șters din nou.</p>
                  )}
                </div>
              </details>
            );
          })}
        </section>

        <section className="g-channel">
          <div className="g-channel-head">
            <span className="g-channel-icon"><CircleHelp size={16} /></span>
            <div>
              <strong>Canal jurnal anti-spam</strong>
              <span>ID canal Discord (Developer Mode); lasă gol pentru neconfigurat.</span>
            </div>
          </div>
          <div className="g-field g-channel-input">
            <label htmlFor="log-channel-id">ID canal</label>
            <input
              id="log-channel-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={antiSpam.logChannelId ?? ""}
              placeholder="123456789012345678"
              onChange={(event) => update({ ...antiSpam, logChannelId: event.target.value.trim() || null })}
            />
            <span className="g-help">Introdu ID-ul snowflake ca text. Câmpul poate rămâne neconfigurat.</span>
          </div>
        </section>

        <p className="g-quiet" style={{ margin: "15px 2px 0", lineHeight: 1.6 }}>
          Setările sunt păstrate ca schiță locală în acest prototip.
        </p>
      </div>

      <footer className="g-footer">
        <div className="g-footer-inner">
          <div className={`g-save-state ${saved ? "" : "dirty"}`}>
            {saved ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>
              {saved ? savedAt : "Ai modificări nesalvate."}
              <small>{validationIssues.length > 0 ? `${validationIssues.length} câmpuri necesită corectare` : "Salvează pentru a păstra schița locală."}</small>
            </span>
          </div>
          {saveAttempted && validationIssues.length > 0 && (
            <span className="g-validation-summary" role="status">Corectează valorile evidențiate.</span>
          )}
          <button className="g-save-button" type="button" onClick={saveDraft}>
            <Save size={15} />
            Salvează schița
          </button>
        </div>
      </footer>
    </main>
  );
}