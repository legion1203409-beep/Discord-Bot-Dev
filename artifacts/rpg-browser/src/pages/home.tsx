import { Link } from "wouter";
import { useGameAuthConfig, useGetGameSession, useHealthCheck } from "@workspace/api-client-react";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { ArrowUpRight, Flame, Shield, Users } from "lucide-react";
import { EmptyState, GuildMark, LoadingState, Notice, PageFrame } from "@/components/game-ui";

export default function HomePage() {
  const sessionQuery = useGetGameSession();
  const authConfigQuery = useGameAuthConfig();
  const healthQuery = useHealthCheck();
  const session = sessionQuery.data;
  const config = authConfigQuery.data;
  const authError = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("auth_error");
  const authErrorMessage = authError === "cancelled"
    ? { title: "Conectarea a fost anulată", detail: "Poți porni din nou conectarea Discord când ești gata." }
    : authError === "no_eligible_guild"
      ? { title: "Nicio breaslă de joc disponibilă", detail: "Ai nevoie de acces la un server în care botul este prezent pentru a deschide cronica." }
      : authError === "state_mismatch"
        ? { title: "Conectarea nu a putut fi verificată", detail: "Pornește din nou conectarea Discord pentru a crea o sesiune sigură." }
        : authError
          ? { title: "Conectarea Discord a eșuat", detail: "Sesiunea nu a fost creată. Încearcă din nou." }
          : null;

  if (sessionQuery.isLoading || authConfigQuery.isLoading) {
    return <PageFrame><LoadingState label="Verificăm sesiunea și legătura cu breasla..." /></PageFrame>;
  }

  if (sessionQuery.isError && !sessionQuery.data) {
    return <PageFrame><div className="mx-auto max-w-2xl pt-16"><Notice title="Nu putem citi sesiunea" detail="Conexiunea cu cronica nu este disponibilă momentan. Încearcă din nou." retry={() => { void sessionQuery.refetch(); void authConfigQuery.refetch(); }} /></div></PageFrame>;
  }

  const authenticated = session?.authenticated === true;
  return (
    <PageFrame>
      <header className="flex items-center justify-between border-b border-border pb-5">
        <Link href="/" className="flex items-center gap-3 text-foreground no-underline" data-testid="link-home">
          <span className="grid size-11 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary"><Flame className="size-5" /></span>
          <span><span className="block font-serif text-xl">Oracolul Cenușii</span><span className="block font-mono text-xs uppercase tracking-widest text-muted-foreground">RPG în browser</span></span>
        </Link>
        <span className={`rounded-full border px-3 py-1 text-xs ${healthQuery.data?.botOnline ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-card text-muted-foreground"}`} data-testid="status-world">{healthQuery.isLoading ? "Se verifică lumea" : healthQuery.data?.botOnline ? "Lumea este conectată" : "Lumea Discord"}</span>
      </header>
      <main className="grid items-center gap-12 py-12 lg:grid-cols-2">
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Aceeași breaslă. Aceeași călătorie.</p>
          <h1 className="mt-4 max-w-2xl font-serif text-5xl leading-tight sm:text-6xl">Cenușa păstrează <span className="text-primary">urmele</span> aventurilor tale.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">Intră în cronica breslei tale, continuă cu același personaj și urmărește întâlnirile, misiunile și obiectele legate de jocul din Discord.</p>
          {!authenticated ? (
            <div className="mt-8">
              {authErrorMessage && <div className="mb-4"><Notice title={authErrorMessage.title} detail={authErrorMessage.detail} /></div>}
              {authConfigQuery.isError ? <Notice title="Autentificarea nu este disponibilă" detail="Nu am putut încărca setările de conectare Discord." retry={() => void authConfigQuery.refetch()} /> : config?.discordOAuthConfigured ? <Button asChild size="lg" data-testid="button-discord-signin"><a href={config.authorizationUrl} className="no-underline"><Users /> Continuă cu Discord <ArrowUpRight /></a></Button> : <Button size="lg" disabled data-testid="button-discord-signin"><Users /> Conectarea Discord nu este configurată</Button>}
              <p className="mt-3 text-xs text-muted-foreground">Autentificarea de aici este separată de permisiunile de moderare.</p>
            </div>
          ) : (
            <div className="mt-8">
              <p className="mb-4 text-sm text-muted-foreground" data-testid="text-username">Bine ai revenit, <span className="font-medium text-foreground">{session?.username}</span>. Alege o breaslă pentru a continua.</p>
              {session?.guilds.length ? <div className="grid max-w-xl gap-3 md:grid-cols-2">{session.guilds.map((guild) => <Link href={`/guild/${guild.id}`} key={guild.id} className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-foreground no-underline transition-colors hover:border-primary/50 hover:bg-secondary" data-testid={`link-guild-${guild.id}`}><GuildMark name={guild.name} iconUrl={guild.iconUrl} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{guild.name}</span><span className="mt-1 block text-xs text-muted-foreground">Deschide cronica</span></span><ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary" /></Link>)}</div> : <EmptyState title="Nicio breaslă disponibilă" detail="Contul Discord nu are în prezent o breaslă de joc disponibilă pentru această cronica." />}
            </div>
          )}
        </section>
        <aside className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-border pb-5"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">Legământul cenușii</p><h2 className="mt-2 font-serif text-3xl">Fără lumi paralele</h2></div><Shield className="size-7 text-primary" /></div>
          <div className="space-y-5 pt-6">
            <p className="text-sm leading-relaxed text-muted-foreground">Browserul este o fereastră către RPG-ul existent al serverului tău. Starea personajului și progresul rămân în aceeași breaslă și urmează regulile jocului Discord.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-secondary p-4"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Identitate</span><p className="mt-2 font-serif text-xl">Personajul tău</p></div>
              <div className="rounded-md bg-secondary p-4"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Progres</span><p className="mt-2 font-serif text-xl">Împărtășit cu Discord</p></div>
            </div>
          </div>
        </aside>
      </main>
      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">O continuare a lumii pe care breasla ta a clădit-o deja.</footer>
    </PageFrame>
  );
}
