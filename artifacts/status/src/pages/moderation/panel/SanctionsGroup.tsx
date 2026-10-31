/**
 * Pagina grupului Sancțiuni: Escaladare, Comenzi, Roluri și canale și Program,
 * cu meniul modulelor în stânga și o singură ciornă.
 *
 * Toate cele cinci rute (/sanctiuni și cele patru module) afișează aceeași
 * componentă, deci modificările nesalvate rămân când treci de la un modul la
 * altul. La salvare se trimit doar secțiunile schimbate efectiv (escalation,
 * manualTools, roles, channels, timeProfiles), peste setările citite proaspăt de
 * pe server.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import { Ico, cx, type IconName } from "./fields";
import {
  SANCTIONS_MODULES, SANCTIONS_SECTIONS, STAFF_COMMANDS, availableCommandCount, commandsSummary, enabledProfiles, escalationSummary,
  isModuleChanged, policySummary, sanctionsDraftError, sanctionsModuleForRoute, scheduleSummary, CHANNEL_POLICIES, ROLE_POLICIES,
  policyList, appealsSummary, appealSettings, type SanctionsModuleId,
} from "./sanctions-model";
import { SANCTIONS_VIEWS } from "./sanctions";

const MODULE_ICONS: Record<SanctionsModuleId, IconName> = {
  escalation: "stairs",
  commands: "slash",
  policies: "users",
  schedule: "clock",
  appeals: "scale",
};

/** The dot next to a module in the menu: on, on but not running, or off. */
function moduleState(config: any, id: SanctionsModuleId): "on" | "paused" | "off" {
  switch (id) {
    case "escalation":
      if (!config?.escalation?.enabled) return "off";
      // Escalation acts on automatic moderation, which stops with the server's protection.
      return config?.protection?.enabled === false ? "paused" : "on";
    case "commands":
      return config?.manualTools?.enabled ? "on" : "off";
    case "policies":
      return [...ROLE_POLICIES, ...CHANNEL_POLICIES].some((def) => policyList(config, def).length > 0) ? "on" : "off";
    case "schedule":
      return enabledProfiles(config?.timeProfiles).length > 0 ? "on" : "off";
    case "appeals": {
      const settings = appealSettings(config);
      return settings.enabled ? (settings.channelId ? "on" : "paused") : "off";
    }
  }
}

function moduleSummary(config: any, id: SanctionsModuleId): string {
  switch (id) {
    case "escalation": return moduleState(config, id) === "paused" ? "Pornită, dar protecția e oprită" : escalationSummary(config);
    case "commands": return commandsSummary(config);
    case "policies": return policySummary(config);
    case "schedule": return scheduleSummary(config);
    case "appeals": return appealsSummary(config);
  }
}

export function SanctionsGroupPage() {
  const [location] = useLocation();
  const active = sanctionsModuleForRoute(location);
  const draft = useConfigDraft({ sections: SANCTIONS_SECTIONS, validate: sanctionsDraftError });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările pentru sancțiuni…"
      />
    );
  }

  const View = SANCTIONS_VIEWS[active.id];
  return (
    <PanelContext.Provider value={api}>
      <div className="pn" data-testid="sanctions-page" style={{ "--tc": "#FF7A9A" } as React.CSSProperties}>
        <PageHead
          icon={<Ico name="scale" />} guildName={draft.guildName} title="Sancțiuni"
          lede={<>
            Cum crește pedeapsa la abateri repetate, ce comenzi poate folosi staff-ul, pe cine și unde moderează botul și cât de strict
            e în funcție de oră.
          </>}
          summary={(
            <CountSummary
              on={availableCommandCount(current)} total={STAFF_COMMANDS.length} label={<>comenzi<br />disponibile</>} testId="sanctions-summary"
            />
          )}
        />

        <div className="pn-grid">
          <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele sancțiunilor">
            {SANCTIONS_MODULES.map((module) => {
              const state = moduleState(current, module.id);
              return (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-sanctions-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={MODULE_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{moduleSummary(current, module.id)}</small>
                  </span>
                  {isModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", state === "on" && "on", state === "paused" && "paused")} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
          <div className="pn-main">
            <View key={active.id} />
          </div>
        </div>

        <SaveBar changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="sanctions" />
      </div>
    </PanelContext.Provider>
  );
}
