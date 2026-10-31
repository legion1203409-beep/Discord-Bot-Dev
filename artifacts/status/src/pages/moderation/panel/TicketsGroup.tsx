/**
 * Pagina Tichete: cele patru fluxuri (Aplicații staff, Parteneriate, Ajutor și
 * raportări, Contestații) și Setări comune, cu meniul modulelor în stânga și
 * o singură ciornă. E separată de verificare.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar } from "./draft";
import { Ico, cx } from "./fields";
import {
  FLOW_KINDS, TICKETS_MODULES, changedTicketParts, deadlinesSummary, flowSummary, isFlowOn, isTicketsModuleChanged, ticketsDraftError,
  ticketsModuleForRoute, type FlowKind,
} from "./tickets-model";
import { TICKET_ICONS, TICKET_VIEWS } from "./tickets";

export function TicketsGroupPage() {
  const [location] = useLocation();
  const active = ticketsModuleForRoute(location);
  const draft = useBotControlDraft({
    changedParts: changedTicketParts,
    validate: ticketsDraftError,
    savedText: () => "Tichetele au fost salvate; botul folosește noile setări la următorul ticket.",
  });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă tichetele…"
      >
        <p className="pn-fh" style={{ marginTop: 14 }}>Tichetele le configurează proprietarul serverului și administratorii.</p>
      </PanelState>
    );
  }

  const on = FLOW_KINDS.filter((kind) => isFlowOn(current, kind)).length;
  const View = TICKET_VIEWS[active.id];
  return (
    <BotDraftContext.Provider value={draft}>
      <PanelContext.Provider value={api}>
        <div className="pn" data-testid="tickets-page" style={{ "--tc": "#B28CFF" } as React.CSSProperties}>
          <PageHead
            icon={<Ico name="message" />} guildName={draft.guildName} title="Tichete"
            lede="Formularele pe care botul le cere în canalele de tichete: unde se deschid, ce întreabă, ce se întâmplă la final și cât timp are membrul să termine."
            summary={<CountSummary on={on} total={FLOW_KINDS.length} label={<>fluxuri<br />pornite</>} testId="tickets-summary" />}
          />

          <div className="pn-grid">
            <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele tichetelor">
              {TICKETS_MODULES.map((module) => {
                const isFlow = module.id !== "common";
                const lit = isFlow ? isFlowOn(current, module.id as FlowKind) : true;
                return (
                  <Link
                    key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-tickets-${module.id}`}
                    aria-current={module.id === active.id ? "page" : undefined}
                  >
                    <span className="pn-nav-ic" aria-hidden="true"><Ico name={TICKET_ICONS[module.id]} /></span>
                    <span className="pn-nav-t">
                      <b>{module.short}</b>
                      <small>{isFlow ? flowSummary(current, module.id as FlowKind) : deadlinesSummary(current)}</small>
                    </span>
                    {isTicketsModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                    <span className={cx("pn-nav-st", lit && "on")} aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>
            <div className="pn-main">
              <View key={active.id} />
            </div>
          </div>

          <SaveBar
            changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="tickets"
            blocked={Boolean(draft.panelRecovery?.requiresManualReconciliation)}
          />
        </div>
      </PanelContext.Provider>
    </BotDraftContext.Provider>
  );
}
