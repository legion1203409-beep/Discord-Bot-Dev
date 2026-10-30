/**
 * Pagina Verificare: Setări, Mesaje și Membri, cu meniul modulelor în stânga
 * și o singură ciornă, ca la celelalte pagini din panou. E separată de
 * tichete: are setările ei, lista membrilor și verificarea manuală.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { PageHead, PanelState, SaveBar } from "./draft";
import { Ico, cx, type IconName } from "./fields";
import {
  VERIFICATION_MODULES, changedVerificationParts, isVerificationModuleChanged, messagesSummary, rolesSummary, settingsSummary,
  verificationDraftError, verificationModuleForRoute, type VerificationModuleId,
} from "./verification-model";
import { VERIFICATION_VIEWS, VerificationDraftContext } from "./verification";

const MODULE_ICONS: Record<VerificationModuleId, IconName> = { settings: "verified", messages: "message", members: "userCheck" };

function moduleSummary(config: any, id: VerificationModuleId): string {
  switch (id) {
    case "settings": return settingsSummary(config);
    case "messages": return messagesSummary(config);
    case "members": return rolesSummary(config);
  }
}

export function VerificationGroupPage() {
  const [location] = useLocation();
  const active = verificationModuleForRoute(location);
  const draft = useBotControlDraft({
    changedParts: changedVerificationParts,
    validate: verificationDraftError,
    savedText: (saved) => saved.verification.enabled
      ? "Verificarea e salvată, iar panoul din Discord a fost actualizat."
      : "Setările verificării au fost salvate.",
  });
  const { api, config: current, saved } = draft;

  if (draft.status !== "ready" || !api || !current) {
    return (
      <PanelState
        status={draft.status === "ready" ? "loading" : draft.status} error={draft.error}
        onRetry={() => void draft.refetch()} loadingText="Se încarcă verificarea…"
      >
        <p className="pn-fh" style={{ marginTop: 14 }}>Verificarea o configurează proprietarul serverului și administratorii.</p>
      </PanelState>
    );
  }

  const enabled = Boolean(current.verification?.enabled);
  const View = VERIFICATION_VIEWS[active.id];
  return (
    <VerificationDraftContext.Provider value={draft}>
      <PanelContext.Provider value={api}>
        <div className="pn" data-testid="verification-page" style={{ "--tc": "#2FCB8C" } as React.CSSProperties}>
          <PageHead
            icon={<Ico name="verified" />} guildName={draft.guildName} title="Verificare"
            lede="Membrii noi apasă butonul din Discord și primesc rolurile alese. Tu vezi cine e verificat și îi poți verifica direct, cu rolurile care le lipsesc."
            summary={(
              <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="verification-summary">
                <span className={cx("pn-nav-st", enabled && "on")} aria-hidden="true" />
                <b>{enabled ? "Pornită" : "Oprită"}</b>
                <span>verificarea<br />membrilor</span>
              </div>
            )}
          />

          <div className="pn-grid">
            <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele verificării">
              {VERIFICATION_MODULES.map((module) => {
                const on = module.id === "settings" ? enabled : module.id === "members" ? Boolean(current.verification?.roleId) : true;
                return (
                  <Link
                    key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-verification-${module.id}`}
                    aria-current={module.id === active.id ? "page" : undefined}
                  >
                    <span className="pn-nav-ic" aria-hidden="true"><Ico name={MODULE_ICONS[module.id]} /></span>
                    <span className="pn-nav-t">
                      <b>{module.short}</b>
                      <small>{moduleSummary(current, module.id)}</small>
                    </span>
                    {isVerificationModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                    <span className={cx("pn-nav-st", on && "on")} aria-hidden="true" />
                  </Link>
                );
              })}
            </nav>
            <div className="pn-main">
              <View key={active.id} />
            </div>
          </div>

          <SaveBar
            changed={draft.changed} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} testId="verification"
            blocked={Boolean(draft.panelRecovery?.requiresManualReconciliation)}
          />
        </div>
      </PanelContext.Provider>
    </VerificationDraftContext.Provider>
  );
}
