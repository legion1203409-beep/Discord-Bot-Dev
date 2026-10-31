/**
 * Pagina Jocul: Stare și pauză, Canale, Evenimente, Misiuni și Economie, cu
 * meniul modulelor în stânga și o singură ciornă peste setările botului.
 * Jocul în sine rămâne în Discord; aici doar se configurează.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { PageHead, PanelState, SaveBar } from "./draft";
import { Ico, cx } from "./fields";
import { GAME_MODULES, changedGameParts, gameDraftError, gameModuleForRoute, gameModuleSummary, isGameModuleChanged, isGameModuleOn } from "./game-model";
import { GAME_ICONS, GAME_VIEWS } from "./game";

export function GameGroupPage() {
  const [location] = useLocation();
  const active = gameModuleForRoute(location);
  const draft = useBotControlDraft({
    changedParts: changedGameParts,
    validate: gameDraftError,
    savedText: (saved) => saved?.gameplayConfig?.paused === false ? "Jocul folosește noile setări." : "Setările jocului au fost salvate. Jocul e oprit.",
  });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările jocului…"
      />
    );
  }

  const running = current.gameplayConfig?.paused === false;
  const View = GAME_VIEWS[active.id];
  return (
    <BotDraftContext.Provider value={draft}>
      <PanelContext.Provider value={api}>
        <div className="pn" data-testid="game-page" style={{ "--tc": "#FF8A4C" } as React.CSSProperties}>
          <PageHead
            icon={<Ico name="star" />} guildName={draft.guildName} title="Jocul"
            lede="Regatul Cenușii pe serverul tău: pornit sau oprit, canalele, cât de des vin evenimentele și boșii, misiunile zilnice și cât dau monștrii."
            summary={(
              <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="game-summary">
                <span className={cx("pn-nav-st", running && "on")} aria-hidden="true" />
                <b>{running ? "Pornit" : "Oprit"}</b>
                <span>jocul<br />pe server</span>
              </div>
            )}
          />
          <div className="pn-grid">
            <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele jocului">
              {GAME_MODULES.map((module) => (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-game-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={GAME_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{gameModuleSummary(module.id, current)}</small>
                  </span>
                  {isGameModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", isGameModuleOn(module.id, current) && "on")} aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <div className="pn-main"><View key={active.id} /></div>
          </div>
          <SaveBar
            changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="game"
            blocked={Boolean(draft.panelRecovery?.requiresManualReconciliation)}
          />
        </div>
      </PanelContext.Provider>
    </BotDraftContext.Provider>
  );
}
