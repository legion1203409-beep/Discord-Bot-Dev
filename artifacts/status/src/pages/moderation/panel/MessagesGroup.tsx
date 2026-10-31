/**
 * Pagina Personalizare mesaje: catalogul tuturor mesajelor botului (cu linkuri
 * spre locul unde se schimbă fiecare), textele jurnalelor de activitate și
 * anunțul alianței. Jurnalele sunt în setările de moderare, anunțul în
 * setările botului; pagina ține câte o ciornă și le salvează din aceeași bară.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import { Ico } from "./fields";
import { deepEqual } from "./model";
import {
  MESSAGES_MODULES, MESSAGES_SECTIONS, allianceDraftError, allianceTemplateOf, changedAllianceParts, customLogCount,
  messageCatalog, messagesDraftError, messagesModuleForRoute, DEFAULT_ALLIANCE,
} from "./messages-model";
import { AllianceModule, CatalogModule, LogsModule, MESSAGES_ICONS } from "./messages";

export function MessagesGroupPage() {
  const [location] = useLocation();
  const active = messagesModuleForRoute(location);
  const moderation = useConfigDraft({ sections: MESSAGES_SECTIONS, validate: messagesDraftError });
  const bot = useBotControlDraft({
    changedParts: changedAllianceParts,
    validate: allianceDraftError,
    savedText: () => "Anunțul alianței a fost salvat.",
  });

  if (moderation.status !== "ready" || !moderation.api || !moderation.config) {
    return (
      <PanelState
        status={moderation.status === "ready" ? "loading" : moderation.status} error={moderation.error}
        onRetry={() => void moderation.refetch()} loadingText="Se încarcă mesajele botului…"
      />
    );
  }

  const botReady = bot.status === "ready" && bot.api && bot.config ? bot : null;
  const config = moderation.config;
  const botConfig = botReady?.config ?? null;
  const catalog = messageCatalog(config, botConfig);
  const changed = [...moderation.changed, ...bot.changed];
  const save = async () => {
    if (moderation.changed.length) await moderation.save();
    if (bot.changed.length) await bot.save();
  };
  const discard = () => {
    moderation.discard();
    bot.discard();
  };
  const summary = (id: string): string => {
    if (id === "catalog") return `${catalog.length} mesaje, cu locul fiecăruia`;
    if (id === "logs") return `${customLogCount(config)} personalizate`;
    if (!botConfig) return "Se încarcă…";
    return allianceTemplateOf(botConfig) === DEFAULT_ALLIANCE ? "Textul de bază" : "Text personalizat";
  };
  const dirty = (id: string): boolean => {
    if (id === "logs") return !deepEqual(moderation.saved?.activityLog?.templates, config.activityLog?.templates);
    if (id === "alliance") return Boolean(botReady) && changedAllianceParts(botReady!.saved, botConfig).length > 0;
    return false;
  };

  let view: React.ReactNode;
  if (active.id === "catalog") {
    view = <PanelContext.Provider value={moderation.api}><CatalogModule bot={botConfig} /></PanelContext.Provider>;
  } else if (active.id === "logs") {
    view = <PanelContext.Provider value={moderation.api}><LogsModule /></PanelContext.Provider>;
  } else if (botReady) {
    view = (
      <BotDraftContext.Provider value={botReady}>
        <PanelContext.Provider value={botReady.api!}><AllianceModule /></PanelContext.Provider>
      </BotDraftContext.Provider>
    );
  } else {
    view = (
      <PanelState
        status={bot.status === "ready" ? "loading" : bot.status} error={bot.error}
        onRetry={() => void bot.refetch()} loadingText="Se încarcă anunțul alianței…"
      />
    );
  }

  const on = catalog.filter((entry) => entry.on === true).length;
  const known = catalog.filter((entry) => entry.on !== null).length;
  return (
    <div className="pn" data-testid="messages-page" style={{ "--tc": "#E2B467" } as React.CSSProperties}>
      <PageHead
        icon={<Ico name="message" />} guildName={moderation.guildName} title="Personalizare mesaje"
        lede="Tot ce scrie botul pe server, într-un singur loc: de unde îl schimbi și, pentru jurnale și anunțul alianței, editorul lor."
        summary={<CountSummary on={on} total={known} label={<>mesaje<br />pornite</>} testId="messages-summary" />}
      />
      <div className="pn-grid">
        <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele mesajelor">
          {MESSAGES_MODULES.map((module) => (
            <Link
              key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-messages-${module.id}`}
              aria-current={module.id === active.id ? "page" : undefined}
            >
              <span className="pn-nav-ic" aria-hidden="true"><Ico name={MESSAGES_ICONS[module.id]} /></span>
              <span className="pn-nav-t">
                <b>{module.short}</b>
                <small>{summary(module.id)}</small>
              </span>
              {dirty(module.id) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
            </Link>
          ))}
        </nav>
        <div className="pn-main">{view}</div>
      </div>
      <SaveBar
        changed={changed} saving={moderation.saving || bot.saving} onSave={() => void save()} onDiscard={discard} testId="messages"
        blocked={bot.changed.length > 0 && Boolean(bot.panelRecovery?.requiresManualReconciliation)}
      />
    </div>
  );
}
