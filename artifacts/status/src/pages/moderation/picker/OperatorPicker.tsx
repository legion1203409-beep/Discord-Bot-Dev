/**
 * Pagina „Alege serverul”: după autentificarea cu Discord, operatorul alege
 * serverul pe care îl gestionează.
 *
 * Aspectul vine din designul „Alege serverul” (vezi `pick.css`). Lista,
 * alegerea, deconectarea și schimbarea contului sunt cele reale; serverul
 * oficial primește insigna „Oficial” și emblema Regatului.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getGetPublicServerProfileQueryKey, useGetPublicServerProfile } from "@workspace/api-client-react";
import type { ModerationGuild } from "../../../hooks/use-moderation-api";
import crest from "../../public/home/crest.webp";
import { buildGateAmbience } from "../gate/ambience";
import { useStageParallax } from "../useStageParallax";
import { guildIconUrl, guildInitials, guildTone, isOfficialGuild, orderGuilds } from "./guildDisplay";
import "./pick.css";

const TITLE = "Alege serverul | Regatul Cenușii";

/** Poziția scânteilor și a cenușii: aceeași la fiecare vizită, calculată o singură dată. */
const AMBIENCE = buildGateAmbience();

/** Titlul filei, cât timp pagina e pe ecran; la plecare se pune la loc. */
function usePageTitle() {
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);
}

/** Cât timp pagina e pe ecran, fundalul întregii file e cel din design. */
function useDocumentTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oc-pick-on");
    return () => root.classList.remove("oc-pick-on");
  }, []);
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className ? `ico ${className}` : "ico"} aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
      <rect x="4.5" y="8" width="15" height="11.5" rx="3.5" />
      <path d="M12 8V4.8M3 12.5v3M21 12.5v3M9.5 16.2h5" />
      <circle cx="12" cy="4" r=".9" />
      <path className="eye" d="M9.2 12.6h.01M14.8 12.6h.01" strokeWidth="2.6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
      <path d="M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4M12 17h.01" />
    </svg>
  );
}

/** Pictograma serverului; dacă nu există sau nu se încarcă, inițialele pe o culoare din design. */
function GuildAvatar({ guild, official }: { guild: ModerationGuild; official: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = official ? crest : guildIconUrl(guild);

  if (url && url !== failedUrl) {
    return (
      <span className="av">
        <img src={url} alt="" width="50" height="50" decoding="async" onError={() => setFailedUrl(url)} />
      </span>
    );
  }
  return (
    <span className={`av ${guildTone(guild.id)}`} aria-hidden="true">
      {guildInitials(guild.name)}
    </span>
  );
}

export interface OperatorPickerProps {
  /** Serverele în care botul este prezent și operatorul are drepturi. */
  guilds: ModerationGuild[];
  onSelect: (guildId: string) => void;
  onLogout: () => void | Promise<void>;
  /** Fără ea, butonul „Schimbă contul” nu apare. */
  onSwitchAccount?: () => void | Promise<void>;
  /** Invitația botului; fără ea, butonul de invitare nu apare. */
  botInviteUrl?: string | null;
}

export function OperatorPicker({ guilds, onSelect, onLogout, onSwitchAccount, botInviteUrl }: OperatorPickerProps) {
  const root = useRef<HTMLDivElement>(null);
  usePageTitle();
  useDocumentTheme();
  useStageParallax(root, "ocp");

  // Serverul oficial se află din profilul public al comunității. Dacă nu răspunde,
  // lista rămâne la fel, doar fără insignă.
  const profile = useGetPublicServerProfile({
    query: { queryKey: getGetPublicServerProfileQueryKey(), staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false },
  });
  const officialGuildId = profile.data?.guildId ?? null;

  const hasGuilds = guilds.length > 0;
  const ordered = orderGuilds(guilds, officialGuildId);

  return (
    <div className="oc-pick" ref={root} data-testid="operator-picker">
      <div className="bg" aria-hidden="true">
        <div className="px1">
          <i className="aur a1" />
          <i className="aur a2" />
          <i className="aur a3" />
        </div>
        <div className="fire" />
        <div className="px2">
          <i className="arc arcA" />
          <i className="arc arcB" />
          <i className="arc arcC" />
        </div>
        <i className="streak" style={{ left: "6%", top: "80%", animationDelay: "1.6s" }} />
        <i className="streak" style={{ left: "56%", top: "94%", animationDelay: "5.4s", animationDuration: "13s" }} />
        <i className="streak" style={{ left: "28%", top: "108%", animationDelay: "8.6s", animationDuration: "15s" }} />
        {AMBIENCE.ashes.map((a, i) => (
          <span
            key={i}
            className="ash"
            style={
              {
                left: a.left,
                top: a.top,
                width: a.size,
                height: a.size,
                animationDuration: a.dur,
                animationDelay: a.delay,
                "--ocp-sw": a.sw,
                "--ocp-o": a.o,
              } as CSSProperties
            }
          />
        ))}
        {AMBIENCE.embers.map((p, i) => (
          <span
            key={i}
            className={p.cls}
            style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>

      <a className="pkBrand" href="/" aria-label="Regatul Cenușii, pagina de start" data-testid="link-picker-brand">
        <img className="crestG" src={crest} alt="" width="38" height="38" />
        <span className="bw">
          <span className="bw1">REGATUL</span>
          <span className="bw2">CENUȘII</span>
        </span>
      </a>

      <main className="stage">
        <section className="gate" aria-labelledby="h-auth">
          <div className="seal" aria-hidden="true">
            <i className="sl sGlow" />
            <i className="sl sRays" />
            <i className="sl sTicks" />
            <i className="sl sMajor" />
            <i className="sl sRing" />
            <div className="sl sText">
              <svg viewBox="0 0 452 452">
                <defs>
                  <path id="pkSealArc" d="M226 226m-198 0a198 198 0 1 1 396 0a198 198 0 1 1-396 0" />
                </defs>
                <text>
                  <textPath href="#pkSealArc" textLength="1240" lengthAdjust="spacing">
                    ALEGE SERVERUL · SESIUNE DISCORD ACTIVĂ · ORACOLUL CENUȘII · TERITORIU DE LUCRU ·
                  </textPath>
                </text>
              </svg>
            </div>
            <i className="sl sDash" />
          </div>

          <div className="medal">
            <span className="halo" aria-hidden="true" />
            <span className="sonar" aria-hidden="true" />
            <span className="sonar s2" aria-hidden="true" />
            <span className="rune rune2" aria-hidden="true" />
            <span className="rune" aria-hidden="true" />
            <span className="flash" aria-hidden="true" />
            <img src={crest} alt="Emblema Oracolul Cenușii" width="124" height="124" />
          </div>

          <div className="cardWrap">
            <div className="tilt">
              <div className="gb">
                <div className="card">
                  <div className="cIn">
                    <span className="sysTag" aria-hidden="true">
                      Sistem / 02
                    </span>
                    <p className="lab rs e1">Oracolul Cenușii</p>
                    <p className="sub rs e2">Alege un teritoriu de lucru</p>
                    {hasGuilds ? (
                      <p className="chip pp e3">
                        <CheckIcon size={14} />
                        Sesiune Discord activă
                        <span className="dotE" aria-hidden="true" />
                      </p>
                    ) : (
                      <p className="chip warn pp e3">
                        <AlertIcon />
                        Niciun server eligibil
                        <span className="dotE" aria-hidden="true" />
                      </p>
                    )}
                    <h1 id="h-auth" className="ttl one">
                      <span className="mask">
                        <span className="up1">
                          {hasGuilds ? (
                            <>
                              Alege <span className="emberText">serverul</span>
                            </>
                          ) : (
                            <>
                              Nu ai <span className="emberText">servere</span> de gestionat
                            </>
                          )}
                        </span>
                      </span>
                    </h1>
                    <p className="lead rs e5">
                      {hasGuilds
                        ? "Selectează serverul pe care vrei să-l gestionezi. Sunt afișate doar serverele în care Oracolul este prezent și tu ai permisiuni de administrare sau moderare."
                        : "Pentru a gestiona un server, botul trebuie să fie prezent, iar contul tău să aibă permisiuni de administrare sau moderare. Adaugă botul într-un server pe care îl administrezi sau schimbă contul Discord."}
                    </p>

                    {hasGuilds ? (
                      <ul className="srvs" role="list" aria-label="Servere eligibile">
                        {ordered.map((guild, i) => {
                          const official = isOfficialGuild(guild, officialGuildId);
                          return (
                            <li key={guild.id}>
                              <button
                                type="button"
                                className="srv"
                                style={{ "--ocp-i": i } as CSSProperties}
                                onClick={() => onSelect(guild.id)}
                                data-testid={`button-select-guild-${guild.id}`}
                              >
                                {official ? <span className="ofc">Oficial</span> : null}
                                <GuildAvatar guild={guild} official={official} />
                                <span className="srvTx">
                                  <span className="srvN">{guild.name}</span>
                                  <span className="srvE">
                                    <CheckIcon size={13} />
                                    Server eligibil
                                  </span>
                                </span>
                                <ArrowIcon className="arr" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="note rs e7">
                        Serverele sunt încărcate direct din Discord după autentificare. Nu putem afișa sau selecta servere care nu apar în sesiunea ta.
                      </p>
                    )}

                    <div className="sep ln e8" aria-hidden="true" />
                    <div className="foot rs e9">
                      {botInviteUrl ? (
                        <a className="btnG inl" href={botInviteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-invite-bot">
                          <BotIcon />
                          {hasGuilds ? "Invită botul pe alt server" : "Invită botul pe server"}
                        </a>
                      ) : null}
                      {!hasGuilds && onSwitchAccount ? (
                        <button className="btnP inl" type="button" onClick={() => void onSwitchAccount()} data-testid="button-switch-discord-account">
                          <UsersIcon />
                          Schimbă contul
                        </button>
                      ) : null}
                      <button className="out" type="button" onClick={() => void onLogout()} data-testid="button-guild-logout">
                        <LogoutIcon />
                        Deconectează-te
                      </button>
                    </div>
                    {!hasGuilds && botInviteUrl ? (
                      <p className="hint rs e9">După ce inviți botul, conectează-te din nou pentru a vedea noul server.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="fg" aria-hidden="true">
        {AMBIENCE.foreground.map((p, i) => (
          <span
            key={i}
            className={p.cls}
            style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }}
          />
        ))}
      </div>
    </div>
  );
}
