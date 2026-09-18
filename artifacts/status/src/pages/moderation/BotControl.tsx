import React, { useEffect, useState } from "react";
import { Bot, Loader2, Save, Radio, Megaphone, Ticket, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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

const TICKET_CATEGORIES = [
  ["staff", "Aplicare staff"],
  ["partnership", "Parteneriate"],
  ["help_report", "Ajutor / raportare"],
] as const;

function isCategory(type: number | string): boolean {
  return String(type) === "4" || type === "GuildCategory";
}

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

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
      channels: { ...current.channels, [key]: value === "__none__" ? "" : value },
    } : current);
  };

  const setTicket = (path: string[], value: string | number) => {
    setDraft((current) => {
      if (!current) return current;
      const tickets = JSON.parse(JSON.stringify(current.tickets));
      let target: any = tickets;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return { ...current, tickets };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
      });
      toast({ title: "Setările botului au fost salvate", description: "Canalele, tichetele și mesajul de alianță sunt persistente." });
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

  const categories = metadata?.channels.filter((channel) => isCategory(channel.type)) ?? [];
  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Bot className="h-8 w-8 text-primary" /> Control bot
        </h1>
        <p className="text-muted-foreground">Gestionează infrastructura botului dintr-un singur loc. Accesul la această pagină este limitat la owner.</p>
      </header>

      <Tabs defaultValue="channels" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl border border-border bg-card p-1">
          <TabsTrigger value="channels" className="gap-2 py-2.5"><Radio className="h-4 w-4" /> Canale</TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2 py-2.5"><Ticket className="h-4 w-4" /> Tichete</TabsTrigger>
          <TabsTrigger value="messages" className="gap-2 py-2.5"><Megaphone className="h-4 w-4" /> Mesaje</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-0">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Radio className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Canale Discord</h2>
                <p className="text-xs text-muted-foreground">Alege un canal din lista live sau introdu manual ID-ul. Fiecare sistem folosește destinația asociată.</p>
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
                        {metadata?.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={current} placeholder="ID canal Discord" aria-label={`${label} ID`} onChange={(event) => setChannel(key, event.target.value.trim())} />
                  </div>
                );
              })}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="tickets" className="mt-0 space-y-5">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Ticket className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Rutarea tichetelor</h2>
                <p className="text-xs text-muted-foreground">Alege categoriile Discord în care botul recunoaște și gestionează tichetele.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {TICKET_CATEGORIES.map(([key, label]) => {
                const current = draft.tickets.categories[key];
                const selected = categories.some((channel) => channel.id === current) ? current : "__manual__";
                return (
                  <div key={key} className="space-y-2">
                    <label className="text-sm font-medium">{label}</label>
                    <Select value={selected} onValueChange={(value) => setTicket(["categories", key], value === "__manual__" ? current : value)}>
                      <SelectTrigger><SelectValue placeholder="Alege categorie" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">ID introdus manual</SelectItem>
                        {categories.map((category) => <SelectItem key={category.id} value={category.id}>▰ {category.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={current} aria-label={`${label} ID`} placeholder="ID categorie Discord" onChange={(event) => setTicket(["categories", key], event.target.value.trim())} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Staff și publicarea alianțelor</h2>
                <p className="text-xs text-muted-foreground">Rolul care poate confirma sau refuza parteneriatele și canalul public pentru alianțele aprobate.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol staff alianțe</label>
                <Select value={metadata?.roles.some((role) => role.id === draft.tickets.staffReviewRoleId) ? draft.tickets.staffReviewRoleId : "__manual__"} onValueChange={(value) => setTicket(["staffReviewRoleId"], value === "__manual__" ? draft.tickets.staffReviewRoleId : value)}>
                  <SelectTrigger><SelectValue placeholder="Alege rol" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {metadata?.roles.filter((role) => !role.managed).map((role) => <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.staffReviewRoleId} placeholder="ID rol Discord" onChange={(event) => setTicket(["staffReviewRoleId"], event.target.value.trim())} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Canal public alianțe</label>
                <Select value={textChannels.some((channel) => channel.id === draft.tickets.alliancePublicChannelId) ? draft.tickets.alliancePublicChannelId : "__manual__"} onValueChange={(value) => setTicket(["alliancePublicChannelId"], value === "__manual__" ? draft.tickets.alliancePublicChannelId : value)}>
                  <SelectTrigger><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.alliancePublicChannelId} placeholder="ID canal Discord" onChange={(event) => setTicket(["alliancePublicChannelId"], event.target.value.trim())} />
              </div>
            </div>
            <Input value={draft.tickets.allianceOwnerGuildId} placeholder="ID server owner pentru publicarea alianțelor" aria-label="ID server alianțe" onChange={(event) => setTicket(["allianceOwnerGuildId"], event.target.value.trim())} />
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <h2 className="font-medium">Termene pentru tichete incomplete</h2>
              <p className="text-xs text-muted-foreground">Minute de la crearea canalului: avertisment 1, avertisment 2 și ștergere automată.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["firstWarningMinutes", "Primul avertisment", 1, 180],
                ["secondWarningMinutes", "Al doilea avertisment", 2, 239],
                ["incompleteTimeoutMinutes", "Ștergere automată", 10, 240],
              ].map(([key, label, min, max]) => (
                <div key={String(key)} className="space-y-2">
                  <label className="text-sm font-medium">{label}</label>
                  <Input type="number" min={Number(min)} max={Number(max)} value={draft.tickets[key as keyof typeof draft.tickets] as number} onChange={(event) => setTicket([String(key)], Number(event.target.value))} />
                  <p className="text-xs text-muted-foreground">{min}–{max} minute</p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="messages" className="mt-0">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Textul mesajului de alianță</h2>
                <p className="text-xs text-muted-foreground">Textul este folosit la următoarea publicare a anunțului de recrutare. Discord limitează mesajul la 2.000 de caractere.</p>
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
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-3 flex justify-end border-t border-border bg-background/95 py-4 backdrop-blur">
        <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Se salvează…" : "Salvează controlul botului"}
        </Button>
      </div>
    </div>
  );
}