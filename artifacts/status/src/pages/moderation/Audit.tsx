import { useState } from "react";
import { History, Search, ShieldCheck, Loader2 } from "lucide-react";
import { Input } from "../../components/ui/input";
import { useAuditLogs, useActiveGuild, useActionLedger, useReconcileAction } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { AlertTriangle, ShieldAlert } from "lucide-react";

function ReconcileDialog({ actionId, open, onOpenChange, onReconciled }: { actionId: string | null, open: boolean, onOpenChange: (o: boolean) => void, onReconciled: () => void }) {
  const { guildId } = useActiveGuild();
  const reconcile = useReconcileAction(guildId);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReconcile = async (status: "applied" | "failed") => {
    if (!actionId) return;
    if (!note.trim()) {
      toast({ variant: "destructive", title: "Eroare", description: "Notița este obligatorie pentru reconciliere." });
      return;
    }
    
    setLoading(true);
    try {
      await reconcile(actionId, status, note);
      toast({ title: "Acțiune reconciliată", description: "Registrul a fost actualizat cu succes." });
      onReconciled();
      onOpenChange(false);
      setNote("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare la reconciliere", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Reconciliere Acțiune Discord</DialogTitle>
          <DialogDescription>
            Această acțiune este marcată ca "pending" (în așteptare) sau "uncertain" (incertă). 
            Verifică manual în Discord dacă a fost aplicată cu succes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-amber-500/10 text-amber-500 border border-amber-500/20 p-3 rounded-md text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p><strong>Nu reîncerca acțiunea</strong> înainte să fii sigur că a eșuat. Discord ar putea să o aplice cu întârziere (ex: rate limits).</p>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivul reconcilierii / Notiță staff</label>
            <Textarea 
              placeholder="Ex: Confirmat pe server că utilizatorul a primit mute..." 
              value={note}
              onChange={e => setNote(e.target.value)}
              className="resize-none h-24"
            />
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => handleReconcile("failed")} disabled={loading} className="text-destructive hover:bg-destructive/10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Marchează Eșuată
          </Button>
          <Button onClick={() => handleReconcile("applied")} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirmă Aplicarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AuditPage() {
  const [search, setSearch] = useState("");
  const { guildId } = useActiveGuild();
  const { data: auditEvents, loading } = useAuditLogs(guildId);
  
  // Pending actions ledger
  const { data: pendingActions, refetch: refetchPending } = useActionLedger(guildId, { status: "pending" });
  const { data: uncertainActions, refetch: refetchUncertain } = useActionLedger(guildId, { status: "uncertain" });
  const activeLedger = [...(pendingActions || []), ...(uncertainActions || [])];
  
  const [reconcileId, setReconcileId] = useState<string | null>(null);

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  const filtered = search ? (auditEvents || []).filter(e => 
    e.action?.toLowerCase().includes(search.toLowerCase()) || 
    e.actorId?.toLowerCase().includes(search.toLowerCase()) || 
    e.details?.toLowerCase().includes(search.toLowerCase())
  ) : (auditEvents || []);

  return (
    <div className="space-y-6">
      {activeLedger.length > 0 && (
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-xl space-y-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <h2 className="font-bold text-lg">Atenție: Acțiuni neconfirmate în așteptare</h2>
              <p className="text-sm opacity-90">Unele acțiuni manuale sau automate necesită reconciliere (verificare manuală în Discord).</p>
            </div>
          </div>
          
          <div className="space-y-2 mt-2">
            {activeLedger.map((action: any) => (
              <div key={action.id} className="bg-background/80 border border-destructive/30 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-destructive text-white">{action.status}</span>
                    <span className="font-bold uppercase text-foreground">{action.actionType}</span>
                    <span className="text-xs font-mono text-muted-foreground">{action.id.substring(0,8)}</span>
                  </div>
                  <div className="text-sm text-foreground mt-1">
                    Intent: <code>{JSON.stringify(action.input)}</code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Actor: {action.actorId} • Creat: {new Date(action.createdAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/20 border-destructive/50" onClick={() => setReconcileId(action.id)}>
                  Reconciliază
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <ReconcileDialog 
        actionId={reconcileId} 
        open={reconcileId !== null} 
        onOpenChange={(open) => !open && setReconcileId(null)}
        onReconciled={() => { refetchPending(); refetchUncertain(); }}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <History className="w-8 h-8 text-primary" /> Jurnal de Audit & Loguri
        </h1>
        <p className="text-muted-foreground">Monitorizare strictă pentru acțiunile staff-ului și evenimente AutoMod.</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-4 bg-secondary/30">
          <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm text-muted-foreground">Logurile sunt imuabile (nu pot fi șterse sau modificate).</p>
        </div>
        <div className="p-4 border-b border-border bg-background">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Caută în audit (acțiune, actor)..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-48 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((ev: any, i: number) => (
                <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/20 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{ev.id ? ev.id.substring(0,8) : 'SISTEM'}</span>
                      <span className="text-sm font-semibold uppercase">{ev.action || ev.type}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Actor: <span className="text-foreground">{ev.actorId || "AutoMod"}</span>
                      {ev.targetId && <span> → Țintă: <span className="text-foreground">{ev.targetId}</span></span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {ev.details || ev.reason || "Fără detalii"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-background border border-border px-2 py-1 rounded whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <History className="w-8 h-8 mb-2 opacity-20" />
              <p>Niciun eveniment găsit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
