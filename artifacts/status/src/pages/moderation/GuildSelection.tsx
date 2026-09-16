import { ArrowRight, LogOut, Server, ShieldCheck, Users } from "lucide-react";
import type { ModerationGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";

interface GuildSelectionProps {
  guilds: ModerationGuild[];
  onSelect: (guildId: string) => void;
  onLogout: () => void | Promise<void>;
  onSwitchAccount?: () => void | Promise<void>;
}

function guildIconUrl(guild: ModerationGuild): string | null {
  if (!guild.icon) return null;
  if (/^https?:\/\//i.test(guild.icon)) return guild.icon;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function GuildIcon({ guild }: { guild: ModerationGuild }) {
  const iconUrl = guildIconUrl(guild);

  return (
    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 overflow-hidden">
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Server className="w-6 h-6" aria-hidden="true" />
      )}
    </div>
  );
}

export function GuildSelection({
  guilds,
  onSelect,
  onLogout,
  onSwitchAccount,
}: GuildSelectionProps) {
  const hasEligibleGuilds = guilds.length > 0;

  return (
    <div className="mod-shell dark mod-login-bg flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-card border border-border p-6 sm:p-10 rounded-xl relative overflow-hidden mod-card shadow-2xl">
        <div className="mod-card-glow" />
        <div className="relative">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              {hasEligibleGuilds ? (
                <ShieldCheck className="w-8 h-8" aria-hidden="true" />
              ) : (
                <Server className="w-8 h-8" aria-hidden="true" />
              )}
            </div>
          </div>

          {hasEligibleGuilds ? (
            <>
              <p className="text-primary text-center text-[10px] font-mono font-bold tracking-[0.22em] uppercase mb-3">
                Sesiune Discord activă
              </p>
              <h1 className="text-3xl sm:text-4xl font-display font-semibold text-center mb-3 text-foreground">
                Alege serverul
              </h1>
              <p className="text-muted-foreground text-center text-sm mb-8 leading-relaxed max-w-xl mx-auto">
                Selectează serverul pe care vrei să-l gestionezi. Sunt afișate doar serverele în care Oracolul este prezent și tu ai permisiuni de administrare sau moderare.
              </p>

              <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="Servere eligibile">
                {guilds.map((guild) => (
                  <div key={guild.id} role="listitem">
                    <button
                      type="button"
                      onClick={() => onSelect(guild.id)}
                      className="group w-full flex items-center gap-4 rounded-xl border border-border/70 bg-background/60 px-4 py-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <GuildIcon guild={guild} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{guild.name}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                          <Users className="w-3 h-3" aria-hidden="true" />
                          Server eligibil
                        </span>
                      </span>
                      <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-destructive text-center text-[10px] font-mono font-bold tracking-[0.22em] uppercase mb-3">
                Niciun server eligibil
              </p>
              <h1 className="text-3xl sm:text-4xl font-display font-semibold text-center mb-3 text-foreground">
                Nu ai servere de gestionat
              </h1>
              <p className="text-muted-foreground text-center text-sm leading-relaxed max-w-xl mx-auto">
                Pentru a gestiona un server, botul trebuie să fie prezent, iar contul tău să aibă permisiuni de administrare sau moderare. Adaugă botul într-un server pe care îl administrezi sau schimbă contul Discord.
              </p>
              <div className="mt-8 rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground leading-relaxed">
                Serverele sunt încărcate direct din Discord după autentificare. Nu putem afișa sau selecta servere care nu apar în sesiunea ta.
              </div>
              <div className="mt-8 flex flex-col-reverse sm:flex-row justify-center gap-3">
                <Button type="button" variant="outline" onClick={() => void onLogout()} className="gap-2">
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  Deconectează-te
                </Button>
                {onSwitchAccount && (
                  <Button type="button" onClick={() => void onSwitchAccount()} className="gap-2">
                    <Users className="w-4 h-4" aria-hidden="true" />
                    Schimbă contul
                  </Button>
                )}
              </div>
            </>
          )}

          {hasEligibleGuilds && (
            <div className="mt-8 pt-6 border-t border-border/50 flex justify-center">
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex items-center gap-2 text-xs font-mono tracking-widest text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                DECONECTEAZĂ-TE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}