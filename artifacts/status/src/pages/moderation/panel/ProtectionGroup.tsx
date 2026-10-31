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
import React from "react";
import { Link, useLocation } from "wouter";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import { Ico, Switch, cx, type IconName } from "./fields";
import {
  MODULES, PROTECTION_SECTIONS, moduleForRoute, moduleNavSummary, moduleStatus, protectionDraftError, type ModuleId,
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
  const draft = useConfigDraft({ sections: PROTECTION_SECTIONS, validate: protectionDraftError });
  const { api, config: current } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările de protecție…"
      />
    );
  }

  const changedKeys = new Set<string>(draft.changed.map((section) => section.key));
  const enabledModules = MODULES.filter((module) => moduleStatus(current, module) !== "off").length;
  const masterOn = current.protection?.enabled !== false;
  const View = MODULE_VIEWS[active.id];

  return (
    <PanelContext.Provider value={api}>
      <div className="pn" data-testid="protection-page">
        <PageHead
          icon={<Ico name="shield" />} guildName={draft.guildName} title="Protecție"
          lede={<>
            AutoMod, anti-spam, anti-flood, anti-raid și comportament suspect. Pentru fiecare regulă bifezi ce face botul: șterge mesajul,
            avertizează, dă mute, kick sau ban și anunță staff-ul.
          </>}
          summary={<CountSummary on={enabledModules} total={MODULES.length} label={<>module<br />pornite</>} testId="protection-summary" />}
        />

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
              onChange={(next) => api.set(["protection", "enabled"], next)}
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

        <SaveBar changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="protection" />
      </div>
    </PanelContext.Provider>
  );
}
