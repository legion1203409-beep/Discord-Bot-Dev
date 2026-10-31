/**
 * Pagina Oracol: Pornire, Conversație, Ton și lungime și Profeții, cu meniul
 * modulelor în stânga și o singură ciornă, ca Verificare și Tichete. Salvează
 * setările botului întregi; setările Oracolului pleacă doar când le schimbi.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { PageHead, PanelState, SaveBar } from "./draft";
import { Ico, cx } from "./fields";
import {
  ORACLE_MODULES, changedOracleParts, isOracleModuleChanged, isOracleModuleOn, oracleDraftError, oracleModuleForRoute, oracleModuleSummary, oracleOf,
} from "./oracle-model";
import { ORACLE_ICONS, ORACLE_VIEWS } from "./oracle";

export function OracleGroupPage() {
  const [location] = useLocation();
  const active = oracleModuleForRoute(location);
  const draft = useBotControlDraft({
    changedParts: changedOracleParts,
    validate: oracleDraftError,
    savedText: (saved) => oracleOf(saved).enabled
      ? "Oracolul folosește noile setări de acum."
      : "Setările sunt salvate; Oracolul rămâne oprit până îl pornești.",
  });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă Oracolul…"
      >
        <p className="pn-fh" style={{ marginTop: 14 }}>Oracolul îl configurează proprietarul serverului și administratorii.</p>
      </PanelState>
    );
  }

  const enabled = oracleOf(current).enabled;
  const View = ORACLE_VIEWS[active.id];
  return (
    <BotDraftContext.Provider value={draft}>
      <PanelContext.Provider value={api}>
        <div className="pn" data-testid="oracle-page" style={{ "--tc": "#A98BFF" } as React.CSSProperties}>
          <PageHead
            icon={<Ico name="eye" />} guildName={draft.guildName} title="Oracol"
            lede="Vocea AI a Regatului: unde și cum răspunde în chat, cu ce ton, și profețiile pe care le dă membrilor și întregului server."
            summary={(
              <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="oracle-summary">
                <span className={cx("pn-nav-st", enabled && "on")} aria-hidden="true" />
                <b>{enabled ? "Pornit" : "Oprit"}</b>
                <span>Oracolul<br />pe server</span>
              </div>
            )}
          />

          <div className="pn-grid">
            <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele Oracolului">
              {ORACLE_MODULES.map((module) => (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-oracle-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={ORACLE_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{oracleModuleSummary(current, module.id)}</small>
                  </span>
                  {isOracleModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", isOracleModuleOn(current, module.id) && "on")} aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <div className="pn-main">
              <View key={active.id} />
            </div>
          </div>

          <SaveBar
            changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="oracle"
            blocked={Boolean(draft.panelRecovery?.requiresManualReconciliation)}
          />
        </div>
      </PanelContext.Provider>
    </BotDraftContext.Provider>
  );
}
