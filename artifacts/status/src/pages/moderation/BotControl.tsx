import React, { useEffect, useState } from "react";
import { Bot, Loader2, Save, Radio, Megaphone } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useActiveGuild, useBotControl, useModerationMetadata, type BotControlConfig } from "../../hooks/use-moderation-api";
import { useToast } from "../../hooks/use-toast";

const CHANNELS = [
  ["main", "Cufere și Oracol"],
  ["event", "Ora Umbrelor"],
  ["boss", "Dragonul Stins"],
  ["trader", "Negustorul"],
  ["eventTop", "Top Ora Umbrelor"],
  ["bossTop", "Top Dragonul Stins"],
  ["council", "Consiliul Umbrelor"],
  ["fratia", "Chivotul Frăției"],
] as const;

export function BotControlPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, update } = useBotControl(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
  }, [data]);

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      channels: { ...current.channels, ...(value === "__none__" ? { [key]: "" } : { [key]: value }) },
    } : current);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
      });
      toast({ title: "Setările botului au fost salvate", description: "Canalele și textul de alianță sunt persistente." });
    } catch (saveError: any) {
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Bot className="h-8 w-8 text-primary" /> Control bot
        </h1>
        <p className="text-muted-foreground">Canalele și textele pe care botul le folosește pe server. Accesul la această pagină este limitat la owner.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Radio className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Canale Discord</h2>
            <p className="text-xs text-muted-foreground">Alege un canal din lista live sau introdu ID-ul manual. Setarea se aplică sistemului asociat.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {CHANNELS.map(([key, label]) => {
            const current = draft.channels[key] ?? "";
            const selected = metadata?.channels.some((channel) => channel.id === current) ? current : "__none__";
            return (
              <div key={key} className="space-y-2">
                <label className="text-sm font-medium">{label}</label>
                <Select value={selected} onValueChange={(value) => setChannel(key, value)}>
                  <SelectTrigger><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Neconfigurat</SelectItem>
                    {metadata?.channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={current} placeholder="ID canal Discord" aria-label={`${label} ID`} onChange={(event) => setChannel(key, event.target.value.trim())} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Textul mesajului de alianță</h2>
            <p className="text-xs text-muted-foreground">Acest text este folosit la următoarea publicare a anunțului de recrutare. Discord limitează mesajul la 2.000 de caractere.</p>
          </div>
        </div>
        <Textarea
          value={draft.allianceRecruitmentText}
          maxLength={2000}
          rows={16}
          placeholder="Scrie mesajul de recrutare..."
          onChange={(event) => setDraft({ ...draft, allianceRecruitmentText: event.target.value })}
        />
        <p className="text-right text-xs text-muted-foreground">{draft.allianceRecruitmentText.length}/2000</p>
      </section>

      <div className="sticky bottom-3 flex justify-end border-t border-border bg-background/95 py-4 backdrop-blur">
        <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Se salvează…" : "Salvează controlul botului"}
        </Button>
      </div>
    </div>
  );
}