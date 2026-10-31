/**
 * Pagina Cazuri și audit (/cazuri, /audit): lista cazurilor și jurnalul de
 * audit, cu meniul celor două în stânga. Nu are ciornă: ce schimbi aici
 * (închizi un caz, adaugi o notă, confirmi o acțiune) se salvează pe loc.
 * Setările lor rămân la /jurnale.
 */
import "./panel.css";
import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useActiveGuild, useModerationConfig, useModerationMetadata } from "../../../hooks/use-moderation-api";
import { PageHead } from "./draft";
import { Ico, cx } from "./fields";
import { RECORDS_MODULES, casesSummary, recordsModuleForRoute } from "./records-model";
import { useCaseCounts } from "./records-data";
import { RecordsContext, type RecordsApi } from "./records-ui";
import { CasesView } from "./cases";
import { AuditView } from "./audit";

export function RecordsGroupPage() {
  const [location] = useLocation();
  const active = recordsModuleForRoute(location);
  const { guildId, guilds } = useActiveGuild();
  const metadata = useModerationMetadata(guildId);
  const config = useModerationConfig(guildId);
  const [countsKey, setCountsKey] = useState(0);
  const counts = useCaseCounts(guildId, countsKey);
  const guildName = guilds.find((guild) => guild.id === guildId)?.name || "Serverul selectat";
  const channels = metadata.data?.channels;
  const api = useMemo<RecordsApi | null>(() => guildId ? {
    guildId,
    guildName,
    channelName: (id) => {
      const channel = id ? channels?.find((item) => item.id === id) : undefined;
      return channel ? `#${channel.name}` : null;
    },
    countsChanged: () => setCountsKey((value) => value + 1),
  } : null, [guildId, guildName, channels]);

  if (!api) {
    return <div className="pn"><div className="pn-fail" role="status"><p>Alege un server ca să vezi cazurile și jurnalul.</p></div></div>;
  }
  const auditEnabled = config.data ? config.data.audit?.enabled !== false : undefined;
  const summary = (id: (typeof RECORDS_MODULES)[number]["id"]) => id === "cases"
    ? casesSummary(counts)
    : auditEnabled === false ? "auditul e oprit" : "pe zile, cu filtre";

  return (
    <RecordsContext.Provider value={api}>
      <div className="pn" data-testid="records-page" style={{ "--tc": "#E2B467" } as React.CSSProperties}>
        <PageHead
          icon={<Ico name="gavel" />} guildName={guildName} title="Cazuri și audit"
          lede="Sancțiunile date pe server, cu motivul, dovezile, notele și contestațiile lor, și jurnalul a tot ce s-a schimbat."
          summary={(
            <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid="records-summary">
              <b>{counts ? counts.open : "–"}</b>
              <span>{counts?.open === 1 ? "caz" : "cazuri"}<br />deschise</span>
            </div>
          )}
        />
        <div className="pn-grid">
          <nav className="pn-nav pn-rv" style={{ "--i": 4 } as React.CSSProperties} aria-label="Cazuri și audit">
            {RECORDS_MODULES.map((module) => (
              <Link
                key={module.id} href={module.route} className="pn-nav-i" data-testid={`nav-records-${module.id}`}
                aria-current={module.id === active.id ? "page" : undefined}
              >
                <span className="pn-nav-ic" aria-hidden="true"><Ico name={module.icon} /></span>
                <span className="pn-nav-t"><b>{module.short}</b><small>{summary(module.id)}</small></span>
                <span className={cx("pn-nav-st", (module.id === "cases" ? Boolean(counts?.open) : auditEnabled !== false) && "on")} aria-hidden="true" />
              </Link>
            ))}
            <Link href="/jurnale/cazuri" className="pn-nav-i pn-nav-out" data-testid="nav-records-settings">
              <span className="pn-nav-ic" aria-hidden="true"><Ico name="filter" /></span>
              <span className="pn-nav-t"><b>Setări</b><small>păstrare, acces, canalul auditului</small></span>
              <Ico name="arrow" />
            </Link>
          </nav>
          <div className="pn-main">
            {active.id === "cases" ? <CasesView key={guildId} /> : <AuditView key={guildId} auditEnabled={auditEnabled} />}
          </div>
        </div>
      </div>
    </RecordsContext.Provider>
  );
}
