/**
 * Pagina Control bot: Invitații, Recrutare, Raport zilnic, Canale și acces și
 * Botul pe server, cu meniul modulelor în stânga și o singură ciornă. Canalele
 * jocului și mesajul pentru jocul oprit sunt în pagina Jocul (GameGroup.tsx).
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { PageHead, PanelState, SaveBar } from "./draft";
import { Ico, cx } from "./fields";
import {
  CONTROL_MODULES, changedControlParts, controlDraftError, controlModuleForRoute, controlModuleSummary, isControlModuleChanged, isControlModuleOn,
} from "./control-model";
import { CONTROL_ICONS, CONTROL_VIEWS } from "./control";

export function ControlGroupPage() {
  const [location] = useLocation();
  const active = controlModuleForRoute(location);
  const draft = useBotControlDraft({
    changedParts: changedControlParts,
    validate: controlDraftError,
    savedText: () => "Botul folosește noile setări.",
  });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă setările botului…"
      >
        <p className="pn-fh" style={{ marginTop: 14 }}>Controlul botului îl au proprietarul serverului și administratorii.</p>
      </PanelState>
    );
  }

  const online = current.discordLive !== false;
  const View = CONTROL_VIEWS[active.id];
  return (
    <BotDraftContext.Provider value={draft}>
      <PanelContext.Provider value={api}>
        <div className="pn" data-testid="control-page" style={{ "--tc": "#4FB6FF" } as React.CSSProperties}>
          <PageHead
            icon={<Ico name="bot" />} guildName={draft.guildName} title="Control bot"
            lede="Invitațiile și recrutarea, raportul zilnic, canalele pe care botul le creează pentru tine și ce poate face botul pe server."
            summary={(
              <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="control-summary">
                <span className={cx("pn-nav-st", online && "on")} aria-hidden="true" />
                <b>{online ? "Online" : "Offline"}</b>
                <span>botul<br />pe server</span>
              </div>
            )}
          />

          <div className="pn-grid">
            <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele controlului">
              {CONTROL_MODULES.map((module) => (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-control-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={CONTROL_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{controlModuleSummary(module.id, current)}</small>
                  </span>
                  {isControlModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", isControlModuleOn(module.id, current) && "on")} aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <div className="pn-main">
              <View key={active.id} />
            </div>
          </div>

          <SaveBar
            changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="control"
            blocked={Boolean(draft.panelRecovery?.requiresManualReconciliation)}
          />
        </div>
      </PanelContext.Provider>
    </BotDraftContext.Provider>
  );
}
