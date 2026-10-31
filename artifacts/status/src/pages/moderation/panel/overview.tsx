/**
 * Pagina Privire generală (/moderare): ce face botul acum pe serverul ales.
 * Sus e lista cu ce trebuie verificat, apoi protecția globală, cazurile,
 * acțiunile neconfirmate și jocul, modulele de protecție cu comutatoarele lor,
 * activitatea recentă și harta tuturor paginilor.
 *
 * Comutatoarele se salvează pe loc, fiecare separat (protection-toggle);
 * schimbarea se vede imediat și revine dacă serverul o refuză.
 */
import "./panel.css";
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useActiveGuild, useBotControl, useGameplayState, useModerationConfig, useModerationMetadata,
} from "../../../hooks/use-moderation-api";
import { presentAuditActor, presentAuditLog } from "../../../lib/moderation-audit";
import { DISCORD_INVITE } from "../../../lib/public-constants";
import { CountSummary, PageHead } from "./draft";
import { Ico, Note, Spinner, Switch, cx } from "./fields";
import { countLabel, isDiscordId } from "./model";
import {
  PROTECTION_CARDS, activeCards, attentionItems, cardEnabled, cardState, pageMap, protectionOn, withToggle, type ToggleKey,
} from "./overview-model";
import { AUDIT_CATEGORY_ICONS, auditCategory, clockTime, fullTime, relativeTime } from "./records-model";
import { errorText, useAuditPage, useCaseCounts, useLedger, usePeople } from "./records-data";

const NO_AUDIT_FILTERS = { search: "", category: "all", start: "", end: "", page: 0 };

export function OverviewPage() {
  const { guildId, guilds } = useActiveGuild();
  if (!guildId) {
    return <div className="pn"><div className="pn-fail" role="status"><p>Alege un server ca să vezi ce face botul pe el.</p></div></div>;
  }
  const guild = guilds.find((item) => item.id === guildId);
  return <Overview key={guildId} guildId={guildId} guildName={guild?.name || "Serverul selectat"} guildIcon={guild?.icon ?? null} />;
}

function Overview({ guildId, guildName, guildIcon }: { guildId: string; guildName: string; guildIcon: string | null }) {
  const config = useModerationConfig(guildId);
  const metadata = useModerationMetadata(guildId);
  const bot = useBotControl(guildId);
  const counts = useCaseCounts(guildId);
  const ledger = useLedger(guildId);
  const audit = useAuditPage(guildId, NO_AUDIT_FILTERS, true);
  const recent = audit.data?.items.slice(0, 7) ?? [];
  const person = usePeople(guildId, recent.map((event) => event.actorId ?? "").filter(isDiscordId));
  const [pending, setPending] = useState<Partial<Record<ToggleKey, boolean>>>({});
  const [toggleError, setToggleError] = useState<string | null>(null);
  // What the switches show: the saved settings with the changes still on their way.
  const shown = (Object.entries(pending) as Array<[ToggleKey, boolean]>).reduce((current, [key, value]) => withToggle(current, key, value), config.data);
  const capabilities = metadata.data?.botCapabilities as Record<string, boolean | undefined> | undefined;

  const toggle = async (key: ToggleKey, enabled: boolean) => {
    setPending((current) => ({ ...current, [key]: enabled }));
    setToggleError(null);
    try {
      await config.updateProtectionToggle(key, enabled);
    } catch (error) {
      setToggleError(errorText(error, "Schimbarea nu a putut fi salvată."));
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const attention = attentionItems({
    config: config.data, bot: bot.data, capabilities: capabilities ?? null, openCases: counts?.open ?? null, unconfirmed: ledger.data?.length ?? null,
  });
  const iconUrl = guildIcon ? (/^https?:\/\//i.test(guildIcon) ? guildIcon : `https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.png?size=128`) : null;

  return (
    <div className="pn" data-testid="overview-page" style={{ "--tc": "#E2B467" } as React.CSSProperties}>
      <PageHead
        icon={<Ico name="eye" />} guildName="Privire generală" title={guildName}
        lede="Ce face botul acum pe server, ce trebuie verificat și drumul scurt spre fiecare setare."
        summary={shown ? <CountSummary on={activeCards(shown)} total={PROTECTION_CARDS.length} label={<>module de<br />protecție active</>} testId="overview-summary" /> : null}
      />

      <div className="pn-ov-top pn-rv" style={{ "--i": 3 } as React.CSSProperties}>
        <section className="pn-card pn-ov-att" aria-labelledby="ov-att" data-testid="overview-attention">
          <h2 className="pn-card-t" id="ov-att">De verificat acum<small>{config.data ? (attention.length ? countLabel(attention.length, "lucru", "lucruri") : "nimic") : ""}</small></h2>
          {!config.data && config.loading ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă…</span></div> : null}
          {config.error && !config.data ? <Note tone="bad" role="alert">{errorText(config.error, "Setările nu au putut fi încărcate.")}</Note> : null}
          {config.data && !attention.length ? (
            <p className="pn-ov-ok" data-testid="overview-all-good"><Ico name="check" />Totul e în regulă. Botul are ce îi trebuie și nimic nu așteaptă după tine.</p>
          ) : null}
          {attention.length ? (
            <ul className="pn-ov-att-l">
              {attention.map((item) => (
                <li key={item.key} className={`is-${item.tone}`} data-testid={`attention-${item.key}`}>
                  <span className="pn-ov-dot" aria-hidden="true" />
                  <p>{item.text}</p>
                  <Link href={item.href} className="pn-btn-ghost pn-btn-sm">{item.cta}<Ico name="arrow" /></Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside className="pn-card pn-ov-server" aria-label="Serverul">
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="pn-ov-invite" data-testid="link-dashboard-server-invite" title={`Deschide invitația ${guildName}`}>
            <span className="pn-ov-gicon" aria-hidden="true">
              {iconUrl ? <img src={iconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Ico name="star" />}
            </span>
            <span className="pn-ov-gname"><small>Serverul oficial</small><b>{guildName}</b><span>{DISCORD_INVITE.replace(/^https?:\/\//, "")}</span></span>
            <Ico name="arrow" />
          </a>
          <p className={cx("pn-ov-bot", capabilities?.online === false ? "is-off" : capabilities ? "is-on" : null)} data-testid="overview-bot">
            <span className="pn-ov-dot" aria-hidden="true" />
            {capabilities ? capabilities.online === false ? "Botul e offline" : "Botul e online" : "Se verifică botul…"}
          </p>
          <nav className="pn-ov-quick" aria-label="Scurtături">
            <Link href="/comenzi" className="pn-ov-q" data-testid="quick-command"><Ico name="slash" /><span>Dă o comandă</span></Link>
            <Link href="/cazuri" className="pn-ov-q" data-testid="quick-cases"><Ico name="gavel" /><span>Caută un caz</span></Link>
            <Link href="/audit" className="pn-ov-q" data-testid="quick-audit"><Ico name="scroll" /><span>Jurnal de audit</span></Link>
            <Link href="/config" className="pn-ov-q" data-testid="link-dashboard-settings"><Ico name="list" /><span>Toate modulele</span></Link>
          </nav>
        </aside>
      </div>

      <div className="pn-ov-tiles pn-rv" style={{ "--i": 4 } as React.CSSProperties}>
        <section className={cx("pn-ov-tile", shown && (protectionOn(shown) ? "is-on" : "is-warn"))} aria-labelledby="ov-prot" data-testid="overview-protection">
          <div className="pn-ov-tile-h">
            <span className="pn-ov-tile-ic" aria-hidden="true"><Ico name="shield" /></span>
            {shown ? (
              <Switch checked={protectionOn(shown)} label="Activează sau oprește toată protecția" disabled={"protection" in pending} onChange={(next) => void toggle("protection", next)} />
            ) : null}
          </div>
          <h3 id="ov-prot">Protecția automată</h3>
          <p className="pn-ov-tile-v">{shown ? (protectionOn(shown) ? "Pornită" : "Oprită") : "–"}</p>
          <Link href="/protectie" className="pn-ov-tile-a" data-testid="link-dashboard-global-protection">Gestionează protecția<Ico name="arrow" /></Link>
        </section>
        <Link href="/cazuri" className={cx("pn-ov-tile", counts?.open ? "is-warn" : "is-on")} data-testid="overview-cases">
          <div className="pn-ov-tile-h"><span className="pn-ov-tile-ic" aria-hidden="true"><Ico name="gavel" /></span></div>
          <h3>Cazuri deschise</h3>
          <p className="pn-ov-tile-v">{counts ? counts.open : "–"}</p>
          <span className="pn-ov-tile-a">{counts ? `${countLabel(counts.closed, "închis", "închise")} în total` : "Se încarcă…"}<Ico name="arrow" /></span>
        </Link>
        <Link href="/audit" className={cx("pn-ov-tile", ledger.data?.length ? "is-bad" : "is-on")} data-testid="overview-ledger">
          <div className="pn-ov-tile-h"><span className="pn-ov-tile-ic" aria-hidden="true"><Ico name="alert" /></span></div>
          <h3>De verificat în audit</h3>
          <p className="pn-ov-tile-v">{ledger.data ? ledger.data.length : "–"}</p>
          <span className="pn-ov-tile-a">{ledger.data?.length ? "Acțiuni neconfirmate de Discord" : "Nicio acțiune neconfirmată"}<Ico name="arrow" /></span>
        </Link>
        <GameTile guildId={guildId} />
      </div>

      <div className="pn-ov-cols" data-testid="dashboard-columns">
        <section className="pn-ov-sec" aria-labelledby="ov-mods">
          <div className="pn-ov-sh">
            <h2 id="ov-mods">Module de protecție</h2>
            <Link href="/protectie" className="pn-lnk" data-testid="link-dashboard-protection">Toate setările</Link>
          </div>
          {toggleError ? <Note tone="bad" role="alert" testId="overview-toggle-error">{toggleError}</Note> : null}
          {shown ? (
            <div className="pn-ov-mods">
              {PROTECTION_CARDS.map((card) => {
                const state = cardState(shown, card);
                const enabled = cardEnabled(shown, card);
                return (
                  <article key={card.key} className={cx("pn-ov-mod", `is-${state.tone}`)} data-testid={`card-module-${card.key}`}>
                    <span className="pn-ov-mod-ic" aria-hidden="true"><Ico name={card.icon} /></span>
                    <Link href={card.route} className="pn-ov-mod-t" data-testid={`link-module-${card.key}`}>
                      <b>{card.label}<Ico name="arrow" /></b>
                      <small>{card.description}</small>
                      <em>{state.text}</em>
                    </Link>
                    <Switch
                      checked={enabled} label={`${enabled ? "Dezactivează" : "Activează"} ${card.label}`} disabled={card.key in pending}
                      onChange={(next) => void toggle(card.key, next)}
                    />
                  </article>
                );
              })}
            </div>
          ) : config.loading ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă modulele…</span></div> : null}
        </section>

        <section className="pn-ov-sec" aria-labelledby="ov-act">
          <div className="pn-ov-sh">
            <h2 id="ov-act">Activitate recentă</h2>
            <Link href="/audit" className="pn-lnk" data-testid="link-dashboard-audit">Vezi tot jurnalul</Link>
          </div>
          <div className="pn-card pn-ov-act">
            {audit.loading && !audit.data ? <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă activitatea…</span></div> : null}
            {audit.error && !audit.data ? <p className="pn-fh">{errorText(audit.error, "Jurnalul nu a putut fi încărcat.")}</p> : null}
            {audit.data && !audit.data.items.length ? <p className="pn-ov-empty"><Ico name="scroll" />Nicio activitate încă.</p> : null}
            {audit.data?.items.length ? (
              <ol className="pn-ov-act-l">
                {recent.map((event, index) => {
                  const view = presentAuditLog(event);
                  const category = auditCategory(event);
                  return (
                    <li key={event.id} data-testid={`row-dashboard-audit-${index}`}>
                      <span className={cx("pn-aud-ic", `is-${category}`)} aria-hidden="true"><Ico name={AUDIT_CATEGORY_ICONS[category]} /></span>
                      <div>
                        <p className="pn-ov-act-t"><b>{view.title}</b><span>{person(event.actorId)?.name ?? presentAuditActor(event)}</span></p>
                        <p className="pn-ov-act-d">{view.details}</p>
                      </div>
                      <time dateTime={event.createdAt} title={fullTime(event.createdAt)}>{relativeTime(event.createdAt).startsWith("azi") ? clockTime(event.createdAt) : relativeTime(event.createdAt)}</time>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        </section>
      </div>

      <section className="pn-ov-map" aria-labelledby="ov-map" data-testid="dashboard-capability-directory">
        <div className="pn-ov-sh"><h2 id="ov-map">Toate paginile</h2></div>
        <div className="pn-ov-groups">
          {pageMap(config.data, bot.data).map((group) => (
            <section key={group.key} className="pn-card pn-ov-group" aria-label={group.title} data-testid={`directory-group-${group.key}`}>
              <h3 className="pn-card-t"><span className="pn-ov-gi" aria-hidden="true"><Ico name={group.icon} /></span>{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="pn-ov-link">
                      <span>{link.title}</span>
                      <em className={`is-${link.tone}`}>{link.state}</em>
                      <Ico name="arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jocul                                                               */
/* ------------------------------------------------------------------ */

function GameTile({ guildId }: { guildId: string }) {
  const game = useGameplayState(guildId);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setConfirming(false); }, [game.paused]);
  const paused = game.paused;
  const set = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await game.update(next);
      setConfirming(false);
    } catch (failure) {
      setError(errorText(failure, "Starea jocului nu a putut fi schimbată."));
    } finally {
      setSaving(false);
    }
  };
  const title = paused === null ? "Starea jocului nu este confirmată" : paused ? "Activitățile sunt oprite" : "Regatul rulează normal";
  return (
    <section className={cx("pn-ov-tile", paused === null ? "is-warn" : paused ? "is-bad" : "is-on")} aria-labelledby="ov-game" data-testid="overview-game">
      <div className="pn-ov-tile-h">
        <span className="pn-ov-tile-ic" aria-hidden="true"><Ico name="power" /></span>
        {paused !== null && !confirming ? (
          <button
            type="button" className={paused ? "pn-btn pn-btn-sm" : "pn-btn-ghost pn-btn-sm"} disabled={saving || game.loading}
            onClick={() => (paused ? void set(false) : setConfirming(true))} data-testid="button-gameplay-state-toggle"
          >
            {saving ? <Spinner /> : null}{paused ? "Pornește jocul" : "Oprește jocul"}
          </button>
        ) : paused === null ? (
          <button type="button" className="pn-btn-ghost pn-btn-sm" disabled data-testid="button-gameplay-state-toggle">{game.loading ? "Se încarcă…" : "Stare necunoscută"}</button>
        ) : null}
      </div>
      <h3 id="ov-game">{title}</h3>
      <p className="pn-ov-tile-v pn-ov-tile-s">{paused === null ? "Jocul" : paused ? "Jocul e oprit" : "Jocul merge"}</p>
      {confirming ? (
        <div className="pn-ov-confirm" data-testid="game-confirm">
          <p>Evenimentele, luptele, cuferele și recompensele se opresc până pornești jocul. Moderarea și Oracolul merg mai departe.</p>
          <div>
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setConfirming(false)} disabled={saving}>Renunță</button>
            <button type="button" className="pn-btn pn-btn-sm pn-ctl-danger-fill" onClick={() => void set(true)} disabled={saving} data-testid="button-gameplay-state-confirm">
              {saving ? <Spinner /> : null}Da, oprește jocul
            </button>
          </div>
        </div>
      ) : (
        <span className="pn-ov-tile-a">{paused ? "Moderarea și Oracolul merg mai departe" : "Îl poți opri fără să oprești moderarea"}</span>
      )}
      {game.error ? (
        <div className="pn-ov-err" role="alert">
          <span>Nu am putut confirma starea jocului.</span>
          <button type="button" className="pn-lnk" onClick={() => void game.refetch()} disabled={game.loading} data-testid="button-gameplay-state-retry">
            {game.loading ? "Se reîncarcă…" : "Reîncearcă"}
          </button>
        </div>
      ) : null}
      {error ? <p className="pn-err" role="alert">{error}</p> : null}
    </section>
  );
}
