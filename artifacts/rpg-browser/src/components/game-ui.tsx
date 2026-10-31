import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Backpack, BookOpen, ChevronRight, Compass, Crown, LogOut, Shield, Swords, type LucideIcon } from "lucide-react";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import type { GameOverview } from "@workspace/api-client-react";

export function LoadingState({ label = "Se deschide cronica..." }: { label?: string }) {
  return (
    <div className="space-y-4" aria-label={label} data-testid="loading-state">
      <div className="h-8 w-48 animate-pulse rounded-md bg-secondary" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}

export function Notice({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6" role="status" data-testid="status-error">
      <p className="font-serif text-2xl text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      {retry && <Button className="mt-5" variant="outline" onClick={retry} data-testid="button-retry">Încearcă din nou</Button>}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/60 px-6 py-10 text-center" data-testid="empty-state">
      <Compass className="mx-auto size-8 text-muted-foreground" />
      <h2 className="mt-3 font-serif text-2xl text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function Meter({ value, max, label, tone = "primary" }: { value: number; max: number; label: string; tone?: "primary" | "accent" }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span><span className="font-mono text-foreground">{value} / {max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={`h-full rounded-full ${tone === "accent" ? "bg-accent" : "bg-primary"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="dark min-h-dvh bg-background text-foreground"><div className="mx-auto min-h-dvh w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-10">{children}</div></div>;
}

export function GuildShell({ overview, guildId, onLogout, logoutPending, logoutError, children }: { overview: GameOverview; guildId: string; onLogout: () => void; logoutPending: boolean; logoutError: boolean; children: ReactNode }) {
  const [location] = useLocation();
  const links = [
    { href: `/guild/${guildId}`, label: "Personaj", icon: Shield, exact: true },
    { href: `/guild/${guildId}/inventory`, label: "Inventar", icon: Backpack },
    { href: `/guild/${guildId}/missions`, label: "Misiuni", icon: BookOpen },
    { href: `/guild/${guildId}/combat`, label: "Înfruntare", icon: Swords },
  ];
  return (
    <PageFrame>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="group flex items-center gap-3 text-foreground no-underline" data-testid="link-home">
          <span className="grid size-11 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary"><span className="font-serif text-2xl">O</span></span>
          <span><span className="block font-serif text-xl leading-none">Oracolul Cenușii</span><span className="mt-1 block font-mono text-xs uppercase tracking-widest text-muted-foreground">Cronica breslei</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><p className="text-sm font-medium">{overview.player.username}</p><p className="text-xs text-muted-foreground">{overview.guild.name}</p></div>
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={logoutPending} data-testid="button-logout"><LogOut />{logoutPending ? "Ieșire..." : "Ieșire"}</Button>
        </div>
      </header>
      {logoutError && <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">Sesiunea nu a putut fi închisă. Încearcă din nou.</p>}
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Tărâmul breslei</p>
          <h1 className="mt-1 font-serif text-4xl text-foreground">{overview.guild.name}</h1>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Navigare guildă">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? location === href : location.startsWith(href);
            return <Link key={href} href={href} className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm no-underline transition-colors ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"}`} data-testid={`link-${label.toLowerCase()}`}><Icon className="size-4" />{label}</Link>;
          })}
        </nav>
      </div>
      <main>{children}</main>
      <footer className="mt-12 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Progresul tău rămâne legat de jocul din Discord.</span><span className="inline-flex items-center gap-1"><Activity className="size-3" /> {overview.player.class ?? "Călător"} · nivel {overview.player.classLevel}</span>
      </footer>
    </PageFrame>
  );
}

export function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="mb-6"><p className="font-mono text-xs uppercase tracking-widest text-accent">{eyebrow}</p><h2 className="mt-1 font-serif text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{detail}</p></div>;
}

export function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs uppercase tracking-wider">{label}</span><Icon className="size-4 text-accent" /></div><p className="mt-3 font-serif text-2xl text-foreground">{value}</p></div>;
}

export function GuildMark({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  return iconUrl ? <img src={iconUrl} alt="" className="size-12 rounded-md object-cover" /> : <span className="grid size-12 place-items-center rounded-md bg-secondary font-serif text-xl text-accent">{name.slice(0, 1).toUpperCase()}</span>;
}

export function Crumb({ guildId, guildName }: { guildId: string; guildName: string }) {
  return <Link href={`/guild/${guildId}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"><ChevronRight className="size-4 rotate-180" />{guildName}</Link>;
}

export function RankBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-accent"><Crown className="size-3" />{label}</span>;
}
