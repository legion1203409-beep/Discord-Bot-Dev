/**
 * Pagina Setări bot: Acces staff, Notificări, Mesaje în privat și Bun venit și
 * plecare, cu meniul modulelor în stânga. Primele trei sunt setări de
 * moderare, ultimul e în setările botului; pagina ține câte o ciornă pentru
 * fiecare și le salvează pe amândouă din aceeași bară.
 */
import "./panel.css";
import React from "react";
import { Link, useLocation } from "wouter";
import { BotDraftContext, useBotControlDraft } from "./bot-draft";
import { PanelContext } from "./context";
import { CountSummary, PageHead, PanelState, SaveBar, useConfigDraft } from "./draft";
import { Ico, cx } from "./fields";
import {
  SETTINGS_MODULES, SETTINGS_SECTIONS, changedWelcomeParts, dmOf, isSettingsModuleChanged, isSettingsModuleOn, memberMessagesOf,
  settingsDraftError, settingsModuleForRoute, settingsModuleSummary, welcomeDraftError,
} from "./settings-model";
import { GuildNameContext, SETTINGS_ICONS, SETTINGS_VIEWS } from "./settings";

export function SettingsGroupPage() {
  const [location] = useLocation();
  const active = settingsModuleForRoute(location);
  const moderation = useConfigDraft({ sections: SETTINGS_SECTIONS, validate: settingsDraftError });
  const bot = useBotControlDraft({
    changedParts: changedWelcomeParts,
    validate: welcomeDraftError,
    savedText: () => "Mesajele de bun venit și plecare au fost salvate.",
  });

  if (moderation.status !== "ready" || !moderation.api || !moderation.config) {
    return (
      <PanelState
        status={moderation.status === "ready" ? "loading" : moderation.status} error={moderation.error}
        onRetry={() => void moderation.refetch()} loadingText="Se încarcă setările botului…"
      >
        <p className="pn-fh" style={{ marginTop: 14 }}>Setările botului le schimbă proprietarul serverului și administratorii.</p>
      </PanelState>
    );
  }

  const botReady = bot.status === "ready" && bot.api && bot.config ? bot : null;
  const config = moderation.config;
  const botConfig = botReady?.config ?? null;
  const messages = memberMessagesOf(botConfig);
  const on = [dmOf(config).enabled, Boolean(botConfig) && messages.welcomeEnabled, Boolean(botConfig) && messages.leaveEnabled].filter(Boolean).length;
  const changed = [...moderation.changed, ...bot.changed];
  const saving = moderation.saving || bot.saving;
  const save = async () => {
    if (moderation.changed.length) await moderation.save();
    if (bot.changed.length) await bot.save();
  };
  const discard = () => {
    moderation.discard();
    bot.discard();
  };

  const View = SETTINGS_VIEWS[active.id];
  const view = active.source === "config" ? (
    <PanelContext.Provider value={moderation.api}><View key={active.id} /></PanelContext.Provider>
  ) : botReady ? (
    <BotDraftContext.Provider value={botReady}>
      <PanelContext.Provider value={botReady.api!}><View key={active.id} /></PanelContext.Provider>
    </BotDraftContext.Provider>
  ) : (
    <PanelState
      status={bot.status === "ready" ? "loading" : bot.status} error={bot.error}
      onRetry={() => void bot.refetch()} loadingText="Se încarcă mesajele de bun venit…"
    />
  );

  return (
    <GuildNameContext.Provider value={moderation.guildName}>
      <div className="pn" data-testid="settings-page" style={{ "--tc": "#E2B467" } as React.CSSProperties}>
        <PageHead
          icon={<Ico name="bot" />} guildName={moderation.guildName} title="Setări bot"
          lede="Cine are acces la panou, cum arată notificările de moderare și ce primesc membrii: un mesaj în privat la o sancțiune și unul în canal când intră sau pleacă."
          summary={<CountSummary on={on} total={3} label={<>mesaje către<br />membri pornite</>} testId="settings-summary" />}
        />

        <div className="pn-grid">
          <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Modulele setărilor">
            {SETTINGS_MODULES.map((module) => {
              const saved = module.source === "config" ? moderation.saved : botReady?.saved;
              const current = module.source === "config" ? config : botConfig;
              return (
                <Link
                  key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-settings-${module.id}`}
                  aria-current={module.id === active.id ? "page" : undefined}
                >
                  <span className="pn-nav-ic" aria-hidden="true"><Ico name={SETTINGS_ICONS[module.id]} /></span>
                  <span className="pn-nav-t">
                    <b>{module.short}</b>
                    <small>{settingsModuleSummary(module.id, config, botConfig)}</small>
                  </span>
                  {isSettingsModuleChanged(module, saved, current) ? <span className="pn-nav-dirty" role="img" aria-label="are modificări nesalvate" /> : null}
                  <span className={cx("pn-nav-st", isSettingsModuleOn(module.id, config, botConfig) && "on")} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
          <div className="pn-main">{view}</div>
        </div>

        <SaveBar
          changed={changed} saving={saving} onSave={() => void save()} onDiscard={discard} testId="settings"
          blocked={bot.changed.length > 0 && Boolean(bot.panelRecovery?.requiresManualReconciliation)}
        />
      </div>
    </GuildNameContext.Provider>
  );
}
