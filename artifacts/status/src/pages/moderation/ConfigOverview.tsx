import { Activity, Bot, ChevronRight, FileText, Gavel, Loader2, MessageSquareWarning, Settings, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import { Link } from "wouter";
import { useActiveGuild, useModerationConfig } from "../../hooks/use-moderation-api";

type ToggleKey = "autoMod" | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai" | "manualTools" | "cases" | "audit" | "activityLog" | "escalation" | "embeds";

export function ConfigOverviewPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error } = useModerationConfig(guildId);
  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!data) return <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-destructive">{error?.message || "Configurația nu a putut fi încărcată."}</div>;

  const master = Boolean(data.protection?.enabled);
  const modules: Array<{ key: ToggleKey; title: string; description: string; href: string; enabled: boolean; dependent: boolean; icon: typeof Bot }> = [
    { key: "autoMod", title: "AutoMod", description: "Filtre clasice și sincronizare Discord AutoMod nativ.", href: "/automod", enabled: Boolean(data.autoMod?.enabled), dependent: true, icon: Bot },
    { key: "antiRaid", title: "Anti-Raid", description: "Valuri de intrări și conturi noi.", href: "/anti-raid", enabled: Boolean(data.antiRaid?.enabled), dependent: true, icon: ShieldAlert },
    { key: "antiSpam", title: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji.", href: "/anti-spam", enabled: Boolean(data.antiSpam?.enabled), dependent: true, icon: MessageSquareWarning },
    { key: "antiFlood", title: "Anti-Flood", description: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", enabled: Boolean(data.antiFlood?.enabled), dependent: true, icon: Activity },
    { key: "suspiciousBehavior", title: "Comportament suspect", description: "Alerte pentru activitate neobișnuită.", href: "/comportament-suspect", enabled: Boolean(data.suspiciousBehavior?.enabled), dependent: true, icon: Sparkles },
    { key: "ai", title: "Moderare AI", description: "Analiză inteligentă separată de AutoMod.", href: "/ai", enabled: Boolean(data.ai?.enabled), dependent: true, icon: Sparkles },
    { key: "manualTools", title: "Comenzi staff", description: "Comenzile pornite și cine le poate folosi.", href: "/sanctiuni/comenzi", enabled: Boolean(data.manualTools?.enabled), dependent: false, icon: Wrench },
    // The bot makes a case for every action, so cases are always on.
    { key: "cases", title: "Cazuri", description: "Păstrarea cazurilor și ce poate face staff-ul.", href: "/jurnale/cazuri", enabled: true, dependent: false, icon: FileText },
    { key: "audit", title: "Audit", description: "Jurnalul acțiunilor de moderare.", href: "/jurnale/audit", enabled: Boolean(data.audit?.enabled), dependent: false, icon: FileText },
    { key: "activityLog", title: "Jurnale de activitate", description: "Canale private pe categorii, în Discord.", href: "/jurnale/activitate", enabled: Boolean(data.activityLog?.enabled), dependent: false, icon: FileText },
    { key: "escalation", title: "Escaladare", description: "Sancțiuni progresive.", href: "/sanctiuni/escaladare", enabled: Boolean(data.escalation?.enabled), dependent: false, icon: Gavel },
    { key: "embeds", title: "Embed-uri", description: "Aspect, media și animații.", href: "/config/embeduri", enabled: Boolean(data.embeds?.enabled), dependent: false, icon: Settings },
  ];

  return (
    <div className="max-w-6xl space-y-6 animate-stagger-1">
      <header className="animate-stagger-2"><h1 className="flex items-center gap-3 text-3xl font-bold mod-heading"><Settings className="h-8 w-8 text-primary" />Module și configurare</h1><p className="mt-2 max-w-3xl text-muted-foreground">Alege un modul pentru a-i modifica setările. Fiecare comutator de activare se află o singură dată, în pagina modulului; aici vezi doar starea curentă.</p></header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-stagger-3">
        {modules.map((module) => {
          const effective = module.enabled && (!module.dependent || master);
          const Icon = module.icon;
          return (
            <article key={module.key} className="mod-card mod-card-interactive flex flex-col p-5">
                <Link href={module.href} data-testid={`link-config-module-${module.key}`} className="flex min-w-0 flex-1 flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <div className={`mb-4 inline-flex rounded-lg border p-2.5 transition-colors ${module.enabled ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="flex items-center gap-2 font-semibold text-foreground">{module.title}<ChevronRight className="h-4 w-4 text-primary/70" /></h2>
                  <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                  <p className={`mt-auto pt-4 text-xs font-medium font-mono tracking-wider uppercase ${effective ? "text-primary" : module.enabled ? "text-amber-500" : "text-muted-foreground"}`}>
                    {effective ? "Activ" : module.enabled && module.dependent && !master ? "Activat, dar oprit de protecția globală" : "Inactiv"}
                  </p>
                </Link>
            </article>
          );
        })}
      </div>
      <div className="animate-stagger-4 pt-4">
        <Link href="/config/avansat" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium">Toate setările avansate <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}