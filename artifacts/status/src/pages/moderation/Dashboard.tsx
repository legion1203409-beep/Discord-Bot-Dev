import { Shield, Activity, Users, AlertTriangle, Loader2 } from "lucide-react";
import { useModerationConfig, useCases, useActiveGuild, useAuditLogs } from "../../hooks/use-moderation-api";

export function DashboardOverview() {
  const { guildId } = useActiveGuild();
  const { data: config, loading: configLoading } = useModerationConfig(guildId);
  const { data: casesData, loading: casesLoading } = useCases(guildId, { limit: 10 });
  const { data: auditLogs, loading: auditLoading } = useAuditLogs(guildId);

  if (!guildId) {
    return <div className="text-center p-8">Selectează un server din meniu.</div>;
  }

  if (configLoading || casesLoading || auditLoading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const openCases = (casesData || []).filter(c => c.status === "open").length;
  const recentLogs = (auditLogs || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">O privire de ansamblu asupra securității serverului curent.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Stare AutoMod</span>
            <Shield className={`w-5 h-5 ${config?.autoMod?.enabled ? "text-green-500" : "text-muted-foreground"}`} />
          </div>
          <div className="text-2xl font-bold mb-1">{config?.autoMod?.enabled ? "Activ" : "Inactiv"}</div>
          <p className="text-xs text-muted-foreground">
            Filtru cuvinte: {config?.autoMod?.wordFilter?.enabled ? "ON" : "OFF"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Cazuri Deschise</span>
            <AlertTriangle className={`w-5 h-5 ${openCases > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </div>
          <div className="text-2xl font-bold mb-1">{openCases}</div>
          <p className="text-xs text-muted-foreground">
            Total cazuri înregistrate: {casesData?.length || 0}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Loguri Recente (Azi)</span>
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold mb-1">{auditLogs?.length || 0}</div>
          <p className="text-xs text-muted-foreground">Acțiuni înregistrate în audit</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Activitate Recentă</h2>
          <div className="space-y-4">
            {recentLogs.length > 0 ? recentLogs.map((log: any, i: number) => (
              <div key={i} className="flex items-start gap-4 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm">
                    <strong>{log.actorId || "Sistem"}</strong> a efectuat <strong className="text-foreground">{log.action || log.type}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{log.reason || log.details || "Fără detalii suplimentare"} • {new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nicio activitate recentă.</p>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Sănătate Module</h2>
          {config ? (
            <div className="space-y-3">
              {[
                { name: "Filtru Cuvinte", active: config.autoMod?.wordFilter?.enabled },
                { name: "Blocare Linkuri", active: config.autoMod?.linkBlock?.enabled },
                { name: "Anti-Raid", active: config.antiRaid?.enabled },
                { name: "Anti-Spam", active: config.antiSpam?.enabled },
                { name: "Anti-Flood", active: config.antiFlood?.enabled },
                { name: "AI Moderare", active: config.ai?.enabled },
                { name: "Comportament Suspect", active: config.suspiciousBehavior?.enabled },
              ].map((mod, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <span className="text-sm">{mod.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${mod.active ? "bg-green-500/10 text-green-500 font-medium" : "bg-muted text-muted-foreground"}`}>
                    {mod.active ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Setările nu sunt disponibile.</p>
          )}
        </div>
      </div>
    </div>
  );
}
