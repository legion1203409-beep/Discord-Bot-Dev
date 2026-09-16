import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, Settings } from "lucide-react";
import { ConfigEditor } from "./ConfigEditor";
import { useModerationConfig, useActiveGuild, useModerationMetadata } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../../components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";

type BotCapabilities = { messageContent: boolean; guildMembers: boolean };

export function SettingsPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { data: metadata, error: metadataError } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<BotCapabilities | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [conflictPending, setConflictPending] = useState(false);
  const initializedForId = React.useRef<string | null>(null);

  useEffect(() => {
    if (!guildId) {
      initializedForId.current = null;
      setLocalData(null);
      return;
    }
    // The config hook intentionally returns null while the selected guild is
    // loading. Do not mark that guild initialized until canonical data exists,
    // otherwise the arriving response can never seed the draft.
    if (initializedForId.current !== guildId && data) {
      initializedForId.current = guildId;
      setLocalData(JSON.parse(JSON.stringify(data)));
    }
  }, [data, guildId]);

  useEffect(() => {
    const next = metadata?.botCapabilities;
    setCapabilities(next ? {
      messageContent: next.messageContent === true,
      guildMembers: next.guildMembers === true,
    } : null);
  }, [metadata]);

  const discardDraftAndRefetch = () => {
    if (!window.confirm("Conflict de versiune: renunți la draftul local și reîncarci configurația canonicală?")) return;
    // Reset before refetch. The config hook clears its canonical snapshot at
    // request start, so an old config cannot win the initialization effect.
    initializedForId.current = null;
    setLocalData(null);
    setSaveError(null);
    setSaveSuccess(false);
    setConflictPending(false);
    void refetch();
  };

  const handleSave = async () => {
    if (!localData || !guildId) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setConflictPending(false);
    try {
      const saved = await update(localData);
      if (saved?.config) setLocalData(JSON.parse(JSON.stringify(saved.config)));
      setSaveSuccess(true);
      toast({ title: "Configurație salvată", description: "Toate setările de moderare au fost aplicate." });
    } catch (saveError: any) {
      const message = saveError?.message || "Configurația nu a putut fi salvată.";
      setSaveError(message);
      if (saveError.message?.includes("Conflict")) {
        setConflictPending(true);
        toast({
          variant: "destructive",
          title: "Conflict de versiune",
          description: "Setările au fost modificate în altă parte. Draftul rămâne păstrat până confirmi renunțarea.",
          action: <ToastAction altText="Renunță la draft și reîncarcă" onClick={discardDraftAndRefetch}>Renunță la draft și reîncarcă</ToastAction>,
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

  const updateChannel = (path: string[], value: string | null) => {
    setLocalData((current: any) => {
      const next = JSON.parse(JSON.stringify(current));
      let target = next;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return next;
    });
  };
  const configuredChannels = [
    { label: "Canal alerte raid", path: ["antiRaid", "alertChannelId"] },
    { label: "Canal jurnal anti-spam", path: ["antiSpam", "logChannelId"] },
    { label: "Canal audit", path: ["audit", "channelId"] },
    { label: "Canal comportament suspect", path: ["suspiciousBehavior", "alertChannelId"] },
    { label: "Canal jurnal AI", path: ["ai", "logChannelId"] },
  ];
  const staffRoleId = localData.permissions?.staffRoleIds?.[0] || "";
  const selectedStaffRole = metadata?.roles.some((role) => role.id === staffRoleId) ? staffRoleId : "__none__";

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Settings className="h-8 w-8 text-primary" /> Configurare completă
        </h1>
        <p className="text-muted-foreground">Editează toate regulile de moderare ale serverului. Modificările rămân în draft până la salvare.</p>
      </div>

      {capabilities && (!capabilities.messageContent || !capabilities.guildMembers) && (
          <div className="flex gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Capabilități Discord lipsă</p>
            {!capabilities.messageContent && <p className="text-muted-foreground">Intentul privilegiat <strong>Message Content</strong> este dezactivat: filtrele de conținut, anti-flood și moderarea AI nu pot analiza mesajele.</p>}
            {!capabilities.guildMembers && <p className="text-muted-foreground">Intentul privilegiat <strong>Guild Members</strong> este dezactivat: verificările anti-raid și evenimentele bazate pe membri pot să nu funcționeze.</p>}
            <p className="mt-1 text-muted-foreground">Configurarea unei reguli nu activează aceste intenții; activează-le în Discord Developer Portal și în bot.</p>
          </div>
        </div>
      )}
      {metadataError && (
        <div role="alert" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
          Metadatele Discord nu au putut fi încărcate ({metadataError.message}). Câmpurile complete de mai jos păstrează fallback-ul pentru ID-uri introduse manual.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Configurația de pe server nu a putut fi reîmprospătată: {error.message}. Draftul curent nu a fost șters.
        </div>
      )}
      {saveError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {saveError}
          {conflictPending && (
            <Button type="button" variant="outline" className="mt-3 border-destructive/40 text-destructive" onClick={discardDraftAndRefetch}>
              Renunță la draft și reîncarcă
            </Button>
          )}
        </div>
      )}
      {saveSuccess && (
        <div role="status" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
          Configurație salvată. Versiunea ETag a fost actualizată.
        </div>
      )}
      {metadata && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="font-medium">Ținte Discord din metadate live</h2>
            <p className="text-xs text-muted-foreground">Alege canale și roluri reale din server. ID-urile pot fi completate manual ca fallback.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {configuredChannels.map(({ label, path }) => {
              const current = path.reduce((value: any, key) => value?.[key], localData) || "";
              const selected = metadata.channels.some((channel) => channel.id === current) ? current : "__none__";
              return (
                <div key={path.join(".")} className="space-y-2">
                  <label className="text-sm font-medium">{label}</label>
                  <Select value={selected} onValueChange={(value) => updateChannel(path, value === "__none__" ? null : value)}>
                    <SelectTrigger><SelectValue placeholder="Alege canal" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Neconfigurat</SelectItem>
                      {metadata.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input aria-label={`${label} ID fallback`} value={current} placeholder="ID canal Discord" onChange={(event) => updateChannel(path, event.target.value.trim() || null)} />
                </div>
              );
            })}
            <div className="space-y-2">
              <label className="text-sm font-medium">Rol staff (primul ID)</label>
              <Select value={selectedStaffRole} onValueChange={(value) => setLocalData((current: any) => ({ ...current, permissions: { ...current.permissions, staffRoleIds: value === "__none__" ? [] : [value] } }))}>
                <SelectTrigger><SelectValue placeholder="Alege rol" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Neconfigurat</SelectItem>
                  {metadata.roles.filter((role) => !role.managed).map((role) => <SelectItem key={role.id} value={role.id}>@{role.name} ({role.id})</SelectItem>)}
                </SelectContent>
              </Select>
              <Input aria-label="Rol staff ID fallback" value={staffRoleId} placeholder="ID rol Discord" onChange={(event) => setLocalData((current: any) => ({ ...current, permissions: { ...current.permissions, staffRoleIds: event.target.value.trim() ? [event.target.value.trim()] : [] } }))} />
            </div>
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