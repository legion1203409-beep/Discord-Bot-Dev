import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, Settings } from "lucide-react";
import { ConfigEditor } from "./ConfigEditor";
import { useModerationConfig, useActiveGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../../components/ui/toast";

type BotCapabilities = { messageContent: boolean; guildMembers: boolean };

export function SettingsPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<BotCapabilities | null>(null);
  const initializedForId = React.useRef<string | null>(null);

  useEffect(() => {
    if (data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      setLocalData(JSON.parse(JSON.stringify(data)));
    }
  }, [data, guildId]);

  useEffect(() => {
    if (!guildId) {
      setCapabilities(null);
      return;
    }
    const controller = new AbortController();
    setCapabilities(null);
    fetch(`/api/moderation/guilds/${guildId}/metadata`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Metadata indisponibilă");
        return response.json();
      })
      .then((metadata) => {
        if (!controller.signal.aborted && metadata?.botCapabilities) {
          setCapabilities({
            messageContent: metadata.botCapabilities.messageContent === true,
            guildMembers: metadata.botCapabilities.guildMembers === true,
          });
        }
      })
      .catch(() => {
        // Capability status is intentionally left unknown when the gateway is offline
        // or metadata is unavailable; never claim that a detector is functioning.
      });
    return () => controller.abort();
  }, [guildId]);

  const handleSave = async () => {
    if (!localData || !guildId) return;
    setSaving(true);
    try {
      await update(localData);
      toast({ title: "Configurație salvată", description: "Toate setările de moderare au fost aplicate." });
    } catch (saveError: any) {
      if (saveError.message?.includes("Conflict")) {
        toast({
          variant: "destructive",
          title: "Conflict de versiune",
          description: "Setările au fost modificate în altă parte. Draftul tău a fost păstrat.",
          action: <ToastAction altText="Reîncarcă" onClick={() => { initializedForId.current = null; window.location.reload(); }}>Reîncarcă</ToastAction>,
        });
      } else {
        toast({ variant: "destructive", title: "Eroare la salvare", description: saveError.message || "Configurația nu a putut fi salvată. Draftul a fost păstrat." });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !localData) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!localData) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">{error?.message || "Configurația nu a putut fi încărcată. Reîncearcă după autentificare."}</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Settings className="h-8 w-8 text-primary" /> Configurare completă
        </h1>
        <p className="text-muted-foreground">Editează toate regulile de moderare ale serverului. Modificările rămân în draft până la salvare.</p>
      </div>

      {capabilities && (!capabilities.messageContent || !capabilities.guildMembers) && (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Capabilități Discord lipsă</p>
            {!capabilities.messageContent && <p className="text-muted-foreground">Intentul privilegiat <strong>Message Content</strong> este dezactivat: filtrele de conținut, anti-flood și moderarea AI nu pot analiza mesajele.</p>}
            {!capabilities.guildMembers && <p className="text-muted-foreground">Intentul privilegiat <strong>Guild Members</strong> este dezactivat: verificările anti-raid și evenimentele bazate pe membri pot să nu funcționeze.</p>}
            <p className="mt-1 text-muted-foreground">Configurarea unei reguli nu activează aceste intenții; activează-le în Discord Developer Portal și în bot.</p>
          </div>
        </div>
      )}

      <ConfigEditor value={localData} onChange={setLocalData} />

      <div className="sticky bottom-3 flex justify-end border-t border-border bg-background/95 py-4 backdrop-blur">
        <Button onClick={handleSave} disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Se salvează…" : "Salvează configurația"}
        </Button>
      </div>
    </div>
  );
}