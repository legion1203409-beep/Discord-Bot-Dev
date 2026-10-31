/**
 * Pagina grupului Cazuri și jurnale: Cazuri, Audit și Jurnale de activitate,
 * cu meniul modulelor în stânga și o singură ciornă, ca la Protecție și
 * Sancțiuni. Listele de lucru (cazurile și jurnalul de audit) rămân în paginile
 * lor, la un clic de aici.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import { Ico, cx, type IconName } from "./fields";
import {
  ACTIVITY_CATEGORIES, LOGS_MODULES, LOGS_SECTIONS, activitySummary, auditSummary, casesSummary, enabledCategoryCount, isLogsModuleChanged,
  logsDraftError, logsModuleForRoute, type LogsModuleId,
} from "./logs-model";
import { LOGS_VIEWS } from "./logs";

const MODULE_ICONS: Record<LogsModuleId, IconName> = { cases: "folder", audit: "scroll", activity: "list" };

function moduleState(config: any, id: LogsModuleId): "on" | "off" {
  switch (id) {
    case "cases": return "on";
    case "audit": return config?.audit?.enabled ? "on" : "off";
    case "activity": return config?.activityLog?.enabled ? "on" : "off";
  }
}

function moduleSummary(config: any, id: LogsModuleId): string {
  switch (id) {
    case "cases": return casesSummary(config);
    case "audit": return auditSummary(config);
    case "activity": return activitySummary(config);
  }
}

/** Where the work lists are, shown under the head and when the settings cannot be opened. */
function QuickLinks() {
  return (
    <div className="pn-quick" role="navigation" aria-label="Listele de lucru">
      <Link href="/cazuri" className="pn-quick-i" data-testid="quick-cases">
        <span className="pn-nav-ic" aria-hidden="true"><Ico name="folder" /></span>
        <span><b>Cazurile</b><small>Caută, închide și adaugă note</small></span>
        <Ico name="arrow" />
      </Link>
      <Link href="/audit" className="pn-quick-i" data-testid="quick-audit">
        <span className="pn-nav-ic" aria-hidden="true"><Ico name="scroll" /></span>
        <span><b>Jurnalul de audit</b><small>Evenimentele, pe categorii și date</small></span>
        <Ico name="arrow" />
      </Link>
    </div>
  );
}

export function LogsGroupPage() {
  const [location] = useLocation();
  const active = logsModuleForRoute(location);
  const draft = useConfigDraft({ sections: LOGS_SECTIONS, validate: logsDraftError });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările cazurilor și jurnalelor…"
      >
        <div style={{ marginTop: 16, "--tc": "#E2B467" } as React.CSSProperties}>
          <p className="pn-fh" style={{ marginBottom: 10 }}>Setările le schimbă proprietarul serverului și administratorii. Cazurile le poate deschide și staff-ul:</p>
          <QuickLinks />
        </div>
      </PanelState>
    );
  }

  const View = LOGS_VIEWS[active.id];
  return (
    <PanelContext.Provider value={api}>
      <div className="pn" data-testid="logs-page" style={{ "--tc": "#E2B467" } as React.CSSProperties}>
        <PageHead
          icon={<Ico name="folder" />} guildName={draft.guildName} title="Cazuri și jurnale"
          lede="Cât se păstrează cazurile și ce poate face staff-ul cu ele, auditul și unde scrie fiecare modul, plus jurnalele de activitate din Discord."
          summary={(
            <CountSummary
              on={current.activityLog?.enabled ? enabledCategoryCount(current) : 0} total={ACTIVITY_CATEGORIES.length}
              label={<>jurnale<br />pornite</>} testId="logs-summary"
            />
          )}
        />
        <QuickLinks />

        <div className="pn-grid">
          <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele cazurilor și jurnalelor">
            {LOGS_MODULES.map((module) => {
              const state = moduleState(current, module.id);
              return (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-logs-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={MODULE_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{moduleSummary(current, module.id)}</small>
                  </span>
                  {isLogsModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", state === "on" && "on")} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
          <div className="pn-main">
            <View key={active.id} />
          </div>
        </div>

        <SaveBar changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="logs" />
      </div>
    </PanelContext.Provider>
  );
}
