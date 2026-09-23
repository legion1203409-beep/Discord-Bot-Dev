import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Loader2, Save } from "lucide-react";
import { Link } from "wouter";
import { useActiveGuild, useModerationConfig } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { ConfigEditor, type ConfigSection } from "./ConfigEditor";

const DETAILS: Record<ConfigSection, { title: string; description: string }> = {
  automod: { title: "AutoMod", description: "Filtre clasice pentru cuvinte, linkuri, emoji, majuscule și repetări." },
  "anti-raid": { title: "Anti-Raid", description: "Detectează valurile de intrări și conturile prea noi." },
  "anti-spam": { title: "Anti-Spam", description: "Limite pentru mesaje, editări, ștergeri, mențiuni și emoji." },
  "anti-flood": { title: "Anti-Flood", description: "Controlează mesajele foarte lungi și șirurile excesive." },
  suspicious: { title: "Comportament suspect", description: "Alerte pentru activitate și schimbări neobișnuite." },
  ai: { title: "Moderare AI", description: "Analiză inteligentă, categorii, sensibilitate și jurnalizare." },
  tools: { title: "Unelte staff", description: "Comenzi manuale și rolurile care le pot folosi." },
  "cases-audit": { title: "Cazuri și audit", description: "Păstrarea cazurilor, drepturile staff și jurnalul de audit." },
  "roles-channels": { title: "Roluri și canale", description: "Excluderi, protecții și politici speciale." },
  time: { title: "Profile de timp", description: "Reguli programate pentru noapte, zi, weekend și evenimente." },
  escalation: { title: "Escaladare", description: "Sancțiuni progresive după încălcări repetate." },
  embeds: { title: "Embed-uri și aspect", description: "Mesajele de moderare, media și animațiile." },
  permissions: { title: "Permisiuni", description: "Acces staff și izolare multi-server." },
};

export function CategorySettingsPage({ section }: { section: ConfigSection }) {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const initializedGuild = useRef<string | null>(null);

  useEffect(() => {
    if (!guildId) {
      initializedGuild.current = null;
      setDraft(null);
    } else if (data && initializedGuild.current !== guildId) {
      initializedGuild.current = guildId;
      setDraft(structuredClone(data));
    }
  }, [data, guildId]);

  if (loading && !draft) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!draft) return <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-destructive">{error?.message || "Configurația nu a putut fi încărcată."}</div>;

  const detail = DETAILS[section];
  const changed = Boolean(data && JSON.stringify(data) !== JSON.stringify(draft));
  const save = async () => {
    setSaving(true);
    try {
      const result = await update(draft);
      if (result?.config) setDraft(structuredClone(result.config));
      toast({ title: `${detail.title} salvat`, description: "Setările au fost actualizate pentru serverul selectat." });
    } catch (saveError: any) {
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message || "Draftul a fost păstrat." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-5xl space-y-6 ${changed ? "pb-28" : ""}`}>
      <header>
        <p className="mb-2 text-sm"><Link href="/config" className="text-primary hover:underline">← Configurare</Link></p>
        <h1 className="flex items-center gap-3 text-3xl font-bold"><Bot className="h-8 w-8 text-primary" />{detail.title}</h1>
        <p className="mt-2 text-muted-foreground">{detail.description}</p>
      </header>
      {section === "automod" && (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
          <p><strong>Discord AutoMod nativ:</strong> regulile compatibile sunt sincronizate de integrare după salvare. Nu există un comutator nativ separat; starea este controlată de AutoMod și regulile sale.</p>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-destructive">{error.message}</div>}
      <ConfigEditor value={draft} onChange={setDraft} sections={[section]} />
      {changed && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex items-center justify-between gap-3">
          <span>{saving ? "Se salvează…" : "Ai modificări nesalvate."}</span>
          <Button onClick={() => void save()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează
          </Button>
        </div>
      )}
      <Button variant="ghost" onClick={() => void refetch()} className="sr-only">Reîncarcă</Button>
    </div>
  );
}