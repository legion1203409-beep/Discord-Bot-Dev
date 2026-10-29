/**
 * Pagina grupului Protecție: AutoMod, Anti-spam, Anti-flood, Anti-raid și
 * Comportament suspect, cu meniul modulelor în stânga și o singură ciornă.
 *
 * Toate cele șase rute (/protectie și cele cinci module) afișează aceeași
 * componentă, așa că modificările nesalvate rămân când treci de la un modul la
 * altul. La salvare se trimit doar secțiunile schimbate efectiv; restul
 * configurației este citit proaspăt de pe server, deci nu se suprascrie nimic
 * modificat între timp din altă parte.
 */
import "./panel.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useActiveGuild, useModerationConfig, useModerationMetadata } from "../../../hooks/use-moderation-api";
import { useToast } from "../../../hooks/use-toast";
import { configSaveToastOptions } from "../../../lib/protection-toggle-feedback";
import { rebaseDraftChanges } from "../../../lib/utils";
import { PanelContext, type PanelApi } from "./context";
import { Ico, Spinner, Switch, cx, type IconName } from "./fields";
import {
  MODULES, changedSections, getAt, moduleForRoute, moduleNavSummary, moduleStatus, protectionDraftError, setAt, type ModuleId, type Path,
} from "./model";
import { MODULE_VIEWS } from "./modules";

const MODULE_ICONS: Record<ModuleId, IconName> = {
  automod: "filter",
  antispam: "msgx",
  antiflood: "waves",
  antiraid: "raid",
  suspect: "scan",
};

export function ProtectionGroupPage() {
  const [location] = useLocation();
  const active = moduleForRoute(location);
  const { guildId, guilds } = useActiveGuild();
  const { data, updateSection, createChannel, loading, error, refetch } = useModerationConfig(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [openRules, setOpenRules] = useState<Record<string, boolean>>({});
  // Which server the draft belongs to; null until its configuration arrived.
  const initialized = useRef<string | null>(null);
  // Bumped on every edit, so a save can tell whether the draft changed meanwhile.
  const revision = useRef(0);
  // The newest draft, also between a change and the next render.
  const latest = useRef<any>(null);
  const editorKey = guildId ?? null;

  useEffect(() => {
    if (!editorKey) {
      initialized.current = null;
      latest.current = null;
      setDraft(null);
    } else if (initialized.current && initialized.current !== editorKey && !data) {
      initialized.current = null;
      latest.current = null;
      setDraft(null);
    } else if (data && initialized.current !== editorKey) {
      initialized.current = editorKey;
      revision.current += 1;
      const fresh = structuredClone(data);
      latest.current = fresh;
      setDraft(fresh);
    }
  }, [data, editorKey]);

  const current = initialized.current === editorKey && data ? draft : null;

  const editDraft = useCallback((next: any) => {
    revision.current += 1;
    latest.current = next;
    setDraft(next);
  }, []);
  const set = useCallback((path: Path, value: unknown) => {
    if (latest.current) editDraft(setAt(latest.current, path, value));
  }, [editDraft]);
  const update = useCallback((path: Path, change: (value: any) => any) => {
    if (latest.current) editDraft(setAt(latest.current, path, change(getAt(latest.current, path))));
  }, [editDraft]);

  const capabilities = metadata?.botCapabilities;
  const createDisabled = capabilities?.online === false || capabilities?.canManageChannels === false || capabilities?.canManageRoles === false;
  const handleCreateChannel = useCallback(async (destination: string, path: Path) => {
    setCreating(destination);
    try {
      const result = await createChannel(destination);
      set(path, result.channel.id);
      toast({
        title: result.created ? "Canal creat și salvat" : "Canal existent reutilizat",
        description: `#${result.channel.name} este configurat pentru această destinație.`,
      });
    } catch (createError: any) {
      toast({ variant: "destructive", title: "Crearea canalului a eșuat", description: createError?.message || "Canalul nu a putut fi creat." });
    } finally {
      setCreating(null);
    }
  }, [createChannel, set, toast]);

  const api = useMemo<PanelApi | null>(() => current ? {
    config: current,
    set,
    update,
    channels: metadata?.channels,
    createChannel: (destination, path) => { if (!creating) void handleCreateChannel(destination, path); },
    creating,
    createDisabled,
    isOpen: (key) => openRules[key] === true,
    toggleOpen: (key) => setOpenRules((open) => ({ ...open, [key]: !open[key] })),
  } : null, [current, set, update, metadata?.channels, creating, createDisabled, handleCreateChannel, openRules]);

  if (!current || !api) {
    if (loading || (data && initialized.current !== editorKey)) {
      return <div className="pn"><div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă setările de protecție…</span></div></div>;
    }
    return (
      <div className="pn">
        <div className="pn-fail" role="alert">
          <p>{error?.message || "Configurația nu a putut fi încărcată."}</p>
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void refetch()}>Reîncearcă</button>
        </div>
      </div>
    );
  }

  const sections = changedSections(data, current);
  const changedKeys = new Set<string>(sections.map((section) => section.key));
  const enabledModules = MODULES.filter((module) => moduleStatus(current, module) !== "off").length;
  const masterOn = current.protection?.enabled !== false;
  const guildName = guilds.find((guild) => guild.id === guildId)?.name || "Serverul selectat";
  const View = MODULE_VIEWS[active.id];

  const save = async () => {
    if (saving || !editorKey || !sections.length) return;
    const keys = sections.map((section) => section.key);
    const problem = protectionDraftError(current, keys);
    if (problem) {
      toast({ variant: "destructive", title: "Verifică setările înainte de salvare", description: problem });
      return;
    }
    const savingKey = editorKey;
    const savingRevision = revision.current;
    const submitted = current;
    setSaving(true);
    try {
      const result = await updateSection(keys, submitted);
      if (initialized.current !== savingKey) return;
      if (result?.config) {
        const canonical = structuredClone(result.config);
        // Keep what was changed while the request was on its way, on top of what the server saved.
        const next = revision.current === savingRevision ? canonical : rebaseDraftChanges(canonical, submitted, latest.current);
        latest.current = next;
        setDraft(next);
      }
      toast(configSaveToastOptions(
        result?.notification?.status,
        "Setări salvate",
        `Au fost salvate: ${sections.map((section) => section.label).join(", ")}.`,
        result?.nativeAutoMod?.status,
      ));
    } catch (saveError: any) {
      if (initialized.current !== savingKey) return;
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message || "Modificările nu au fost salvate; rămân în formular." });
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    if (!saving && data) editDraft(structuredClone(data));
  };

  return (
    <PanelContext.Provider value={api}>
      <div className="pn" data-testid="protection-page">
        <header className="pn-head">
          <div>
            <span className="pn-kick pn-rv" style={{ "--i": 0 } as React.CSSProperties}><span aria-hidden="true"><Ico name="shield" /></span>{guildName}</span>
            <h1 className="pn-h1 pn-rv" style={{ "--i": 1 } as React.CSSProperties}>Protecție</h1>
            <p className="pn-lede pn-rv" style={{ "--i": 2 } as React.CSSProperties}>
              AutoMod, anti-spam, anti-flood, anti-raid și comportament suspect. Pentru fiecare regulă bifezi ce face botul: șterge mesajul, avertizează,
              dă mute, kick sau ban și anunță staff-ul.
            </p>
          </div>
          <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="protection-summary">
            <b>{enabledModules}/{MODULES.length}</b>
            <span>module<br />pornite</span>
            <span className="pn-bar" aria-hidden="true"><i style={{ "--p": `${(enabledModules / MODULES.length) * 100}%` } as React.CSSProperties} /></span>
          </div>
        </header>

        <section className={cx("pn-master pn-rv", masterOn && "is-on")} style={{ "--i": 3 } as React.CSSProperties} data-testid="protection-master">
          <span className="pn-master-ic" aria-hidden="true"><Ico name="shield" /></span>
          <div className="pn-master-t">
            <b>Protecția serverului</b>
            <span>
              {masterOn
                ? "Pornită: modulele pornite de mai jos rulează."
                : "Oprită: niciun modul nu rulează, dar toate regulile rămân salvate pentru când o pornești."}
            </span>
          </div>
          <div className="pn-master-sw">
            <span aria-hidden="true">{masterOn ? "Pornită" : "Oprită"}</span>
            <Switch
              large checked={masterOn} label="Activează sau oprește toate modulele de protecție" testId="switch-protection-master"
              onChange={(next) => set(["protection", "enabled"], next)}
            />
          </div>
        </section>

        <div className="pn-grid">
          <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele de protecție">
            {MODULES.map((module) => {
              const status = moduleStatus(current, module);
              return (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-module-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={MODULE_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{moduleNavSummary(current, module)}</small>
                  </span>
                  {changedKeys.has(module.configKey) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", status === "on" && "on", status === "paused" && "paused")} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
          <div className="pn-main">
            <View key={active.id} />
          </div>
        </div>

        {sections.length > 0 ? (
          <div className="pn-save" role="region" aria-label="Modificări nesalvate" data-testid="protection-save-bar">
            <div className={cx("pn-save-st", saving && "is-saving")} role="status">
              <i aria-hidden="true" />
              <span>
                {saving ? "Se salvează…" : <>Modificări nesalvate în <b>{sections.map((section) => section.label).join(", ")}</b>.</>}
              </span>
            </div>
            <div className="pn-save-act">
              <button type="button" className="pn-btn-ghost" onClick={discard} disabled={saving}>Renunță</button>
              <button type="button" className="pn-btn" onClick={() => void save()} disabled={saving} data-testid="button-save-protection">
                {saving ? <Spinner /> : <Ico name="check" />}Salvează
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </PanelContext.Provider>
  );
}
