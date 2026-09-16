import { 
  Shield, Activity, AlertTriangle, Loader2, 
  Bot, Zap, BookOpen, ShieldAlert, CheckCircle2, 
  XCircle, Clock, ChevronRight, Settings, History
} from "lucide-react";
import { Link } from "wouter";
import { useModerationConfig, useCases, useActiveGuild, useAuditLogs } from "../../hooks/use-moderation-api";

export function DashboardOverview() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading: configLoading } = useModerationConfig(guildId);
  const { data: casesData, loading: casesLoading } = useCases(guildId, { limit: 10 });
  const { data: auditLogs, loading: auditLoading } = useAuditLogs(guildId);

  const activeGuild = guilds.find(g => g.id === guildId);

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground border border-dashed border-border/50 rounded-xl bg-card/20">
        <Shield className="w-12 h-12 mb-4 opacity-20" />
        <p className="font-mono text-sm tracking-wide">SELECTEAZĂ UN SERVER PENTRU A ÎNCEPE</p>
      </div>
    );
  }

  if (configLoading || casesLoading || auditLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="font-mono text-xs tracking-widest opacity-80 animate-pulse">SE INIȚIALIZEAZĂ DATELE...</p>
      </div>
    );
  }

  const openCases = (casesData || []).filter(c => c.status === "open").length;
  const recentLogs = (auditLogs || []).slice(0, 7);

  const modules = [
    { name: "Filtru Cuvinte", active: config?.autoMod?.enabled && config?.autoMod?.wordFilter?.enabled, icon: BookOpen },
    { name: "Blocare Linkuri", active: config?.autoMod?.enabled && config?.autoMod?.linkBlock?.enabled, icon: Zap },
    { name: "Anti-Raid", active: config?.antiRaid?.enabled, icon: ShieldAlert },
    { name: "Anti-Spam", active: config?.antiSpam?.enabled, icon: Activity },
    { name: "Anti-Flood", active: config?.antiFlood?.enabled, icon: Activity },
    { name: "Inteligență AI", active: config?.ai?.enabled, icon: Bot },
  ];

  return (
    <div className="space-y-8 pb-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <div className="w-2 h-2 rounded-full bg-primary ring-4 ring-primary/20 animate-pulse" />
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase">Sesiune autentificată</span>
          </div>
          <h1 className="text-4xl font-display font-semibold tracking-tight text-foreground">
            {activeGuild?.name || "Dashboard"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xl leading-relaxed">
            Consola operatorului pentru gestionarea securității. Orice modificare se aplică instantaneu în regat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/config" className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-md hover:bg-secondary/80 transition-colors inline-flex items-center gap-2 border border-border/50">
            <Settings className="w-4 h-4" /> Configurare
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="mod-card rounded-xl p-6">
          <div className="mod-card-glow" />
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase">Cazuri Deschise</span>
            <div className={`p-2 rounded-md ${openCases > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-5xl font-display font-semibold mb-3">{openCases}</div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Necesită revizuire manuală
          </p>
        </div>
        
        <div className="mod-card rounded-xl p-6">
          <div className="mod-card-glow" />
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase">Scut AutoMod</span>
            <div className={`p-2 rounded-md ${config?.autoMod?.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-5xl font-display font-semibold mb-3">
            {config?.autoMod?.enabled ? "Activ" : "Oprit"}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
             Monitorizare trafic în timp real
          </p>
        </div>

        <div className="mod-card rounded-xl p-6">
          <div className="mod-card-glow" />
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono text-muted-foreground tracking-[0.15em] uppercase">Loguri Audit (Azi)</span>
            <div className="p-2 rounded-md bg-secondary text-foreground">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-5xl font-display font-semibold mb-3">
            {auditLogs?.length || 0}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
             Evenimente înregistrate de sistem
          </p>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Modules status */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <h2 className="text-xl font-display font-medium">Module de Protecție</h2>
            <Link href="/protectie" className="text-xs font-mono tracking-widest text-primary hover:text-primary/80 flex items-center gap-1">
              GESTIONEAZĂ <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modules.map((mod, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-colors">
                <div className={`p-2.5 rounded-lg ${mod.active ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary text-muted-foreground border border-transparent'}`}>
                  <mod.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate mb-1">{mod.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {mod.active ? (
                      <span className="text-primary flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> ACTIV</span>
                    ) : (
                      <span className="flex items-center gap-1 opacity-70"><XCircle className="w-3 h-3" /> INACTIV</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Audit */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
             <h2 className="text-xl font-display font-medium">Activitate Recentă</h2>
             <Link href="/audit" className="text-xs font-mono tracking-widest text-primary hover:text-primary/80 flex items-center gap-1">
              VEZI TOT <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-1.5 shadow-sm">
            {recentLogs.length > 0 ? (
              <div className="divide-y divide-border/30">
                {recentLogs.map((log: any, i: number) => (
                  <div key={i} className="p-3.5 hover:bg-secondary/40 transition-colors rounded-lg flex gap-4">
                    <div className="mt-1.5">
                      <div className="w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">
                        <strong className="text-foreground font-semibold">{log.actorId || "Sistem"}</strong>
                        <span className="text-muted-foreground mx-1">a declanșat</span>
                        <span className="text-primary font-medium">{log.action || log.type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {log.reason || log.details || "Fără detalii suplimentare"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap font-mono mt-0.5">
                      {new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                <History className="w-8 h-8 opacity-20" />
                <span className="font-mono tracking-wider">NICIO ACTIVITATE ÎNREGISTRATĂ RECENT.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
