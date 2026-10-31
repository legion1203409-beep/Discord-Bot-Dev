import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CircleHelp, Clock3, Folder, Loader2, LockKeyhole, Megaphone, Radio, RotateCcw, Save, Settings2, ShieldCheck, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent } from "../../components/ui/tabs";
import { ImageField } from "../../components/moderation/ImageField";
import { EmojiField } from "../../components/moderation/EmojiField";
import { BotControlPartialApplyError, useActiveGuild, useBotControl, useModerationMetadata, useSession, type BotControlConfig } from "../../hooks/use-moderation-api";
import { clearBotControlDestinations, DESTINATION_CLEAR_CATEGORIES, type DestinationClearScope } from "../../lib/bot-control-destinations";
import { rebaseDraftChanges } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";
import { Link, useLocation, useSearch } from "wouter";

/*
 * What is left of the old "Control bot" page until the RPG page: the game's
 * channel destinations (/canale) and the message for the paused game
 * (/bot?tab=messages). Invitations, recruitment, the daily report, channel
 * creation and the bot's permissions are on /control.
 */
type BotControlTab = "channels" | "messages";

const channelFields: { key: string; label: string; description: string; icon: any }[] = [
  { key: "main", label: "Cufere", description: "Cufere, recompense și chei", icon: Radio },
  { key: "event", label: "Ora Umbrelor", description: "Anunțuri și rezultate pentru eveniment", icon: Clock3 },
  { key: "boss", label: "Dragonul Stins", description: "Lupte, damage și clasament de boss", icon: ShieldCheck },
  { key: "trader", label: "Negustorul", description: "Oferte și rotația comerciantului", icon: Settings2 },
  { key: "eventTop", label: "Top Ora Umbrelor", description: "Clasamentul ultimului eveniment", icon: Activity },
  { key: "bossTop", label: "Top Dragonul Stins", description: "Clasamentul permanent de boss", icon: Activity },
  { key: "council", label: "Consiliul Umbrelor", description: "Comenzi administrative și audit", icon: LockKeyhole },
  { key: "fratia", label: "Chivotul Frăției", description: "Mesaje și alerte pentru frăție", icon: Users },
];

const DEFAULT_GAME_PAUSED = "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.";

function isCategory(type: number | string): boolean {
  return String(type) === "4" || type === "GuildCategory";
}

/** Where the old tabs live now. */
const MOVED_TABS: Record<string, string> = {
  roles: "/control/canale",
  statistics: "/control/invitatii",
  verification: "/verificare",
  tickets: "/tichete",
};

export function BotControlPage({ channelsOnly = false }: { channelsOnly?: boolean }) {
  const [location, setLocation] = useLocation();
  const { guildId } = useActiveGuild();
  const { data, loading, error, update, panelRecovery, confirmPanelReconciliation } = useBotControl(guildId);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const { session } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [partialApplyError, setPartialApplyError] = useState<{ guildId: string; message: string } | null>(null);
  const [clearCategoryDialogOpen, setClearCategoryDialogOpen] = useState(false);
  const searchString = useSearch();
  const requestedTab = new URLSearchParams(searchString || location.split("?")[1] || "").get("tab");
  const activeTab: BotControlTab = channelsOnly ? "channels" : "messages";
  const initializedGuild = React.useRef<string | null>(null);
  const currentGuild = React.useRef(guildId);
  currentGuild.current = guildId;

  useEffect(() => {
    if (!guildId) {
      initializedGuild.current = null;
      setDraft(null);
      return;
    }
    if (initializedGuild.current && initializedGuild.current !== guildId && !data) {
      initializedGuild.current = null;
      setDraft(null);
    }
    if (data && initializedGuild.current !== guildId) {
      initializedGuild.current = guildId;
      const nextDraft = structuredClone(data);
      if (panelRecovery?.panelMessageId) nextDraft.verification.panelMessageId = panelRecovery.panelMessageId;
      setDraft(nextDraft);
    }
  }, [data, guildId, panelRecovery]);

  useEffect(() => {
    if (channelsOnly) return;
    if (requestedTab === "channels") {
      setLocation("/canale");
      return;
    }
    if (requestedTab !== "messages") setLocation(requestedTab && MOVED_TABS[requestedTab] ? MOVED_TABS[requestedTab]! : "/control");
  }, [channelsOnly, requestedTab, setLocation]);

  const currentDraft = initializedGuild.current === guildId && data ? draft : null;
  const hasUnsavedChanges = Boolean(data && currentDraft && JSON.stringify(currentDraft) !== JSON.stringify(data));

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? { ...current, channels: { ...current.channels, [key]: value === "__none__" ? "" : value } } : current);
  };

  const setGamePaused = (field: "gamePaused" | "gamePausedImageUrl" | "gamePausedThumbnailUrl", value: string) => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: { ...current.gameplayConfig, messages: { ...current.gameplayConfig.messages, [field]: value } },
    } : current);
  };

  const clearDestinations = (scope: DestinationClearScope) => {
    if (!currentDraft) return;
    const category = DESTINATION_CLEAR_CATEGORIES.find((entry) => entry.key === scope);
    const categoryLabel = category?.label ?? "toate destinațiile";
    const confirmationMessage = scope === "all"
      ? "Golești toate destinațiile? Verificarea, mesajele de bun venit/plecare și urmărirea invitațiilor vor fi dezactivate până configurezi din nou destinații. Canalele și mesajele Discord nu vor fi șterse."
      : `Golești destinațiile din categoria „${categoryLabel}”? ${category?.confirmationDetails ?? ""} Canalele și mesajele Discord nu vor fi șterse.`;
    if (!window.confirm(confirmationMessage)) return;
    setDraft((current) => current ? clearBotControlDestinations(current, scope) : current);
    setClearCategoryDialogOpen(false);
    toast({
      title: scope === "all" ? "Destinațiile au fost golite" : `Destinațiile din „${categoryLabel}” au fost golite`,
      description: "Setările sunt în draft. Apasă Salvează pentru a le aplica; canalele Discord rămân neschimbate.",
    });
  };

  const save = async () => {
    if (!guildId || !currentDraft || !hasUnsavedChanges || saving) return;
    if (panelRecovery?.requiresManualReconciliation) {
      toast({
        variant: "destructive",
        title: "Salvarea este blocată",
        description: "Identificatorul panoului publicat nu este disponibil. Reconciliază manual panoul din Discord înainte de a reîncerca.",
      });
      return;
    }
    const submittedGuild = guildId;
    const submittedDraft = currentDraft;
    setSaving(true);
    try {
      const saved = await update({
        ...submittedDraft,
        channels: Object.fromEntries(Object.entries(submittedDraft.channels).filter(([, value]) => typeof value === "string")),
      });
      if (currentGuild.current !== submittedGuild || initializedGuild.current !== submittedGuild) return;
      setDraft((current) => rebaseDraftChanges(structuredClone(saved), submittedDraft, current));
      setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
      toast(saved.discordLive
        ? { title: "Setările au fost salvate", description: "Botul este conectat și folosește noile destinații." }
        : { variant: "destructive", title: "Salvate, dar botul Discord este offline", description: "Valorile sunt persistente și vor fi încărcate când botul se reconectează." });
    } catch (saveError: any) {
      if (currentGuild.current !== submittedGuild) return;
      if (saveError instanceof BotControlPartialApplyError) {
        setPartialApplyError(saveError.verificationPanelPublished ? null : { guildId: submittedGuild, message: saveError.message });
        toast({
          variant: "destructive",
          title: saveError.verificationPanelPublished ? "Salvare parțială: panoul a fost publicat" : "Rezultat parțial; efectele Discord nu sunt confirmate",
          description: saveError.message,
        });
      } else {
        toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
      }
    } finally {
      setSaving(false);
    }
  };

  if ((loading || (data && initializedGuild.current !== guildId)) && !currentDraft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft || !currentDraft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  const categoryNames = new Map((metadata?.channels ?? []).filter((channel) => isCategory(channel.type)).map((category) => [category.id, category.name]));

  return (
    <div className={`bot-control-page max-w-5xl space-y-6 animate-stagger-1 ${channelsOnly ? "channels-only-page" : ""}`}>
      <header className="bot-control-hero animate-stagger-2">
        <div>
          <div className="bot-control-brand-row">
            <span className="bot-control-brand-mark"><Bot className="h-4 w-4" /></span>
            <p className="mod-eyebrow">JOCUL · PÂNĂ LA PAGINA RPG</p>
          </div>
          <h1 className="mod-heading text-4xl">{channelsOnly ? "Canale Discord" : "Mesajele jocului"}</h1>
          <p>
            {channelsOnly
              ? "Canalele în care botul postează jocul, Consiliul și Frăția. Canalele noi le creezi din Control bot → Canale și acces."
              : "Mesajul pe care îl primesc membrii când jocul e oprit."}
          </p>
        </div>
        <div className="bot-control-status" data-state={draft.discordLive === true ? "online" : "offline"}>
          <span className="bot-control-status-dot" />
          <div>
            <strong>{draft.discordLive === true ? "Bot conectat" : "Bot deconectat"}</strong>
            <small>{draft.discordLive === true ? "Setările se aplică pe loc" : "Salvarea rămâne disponibilă"}</small>
          </div>
        </div>
      </header>

      {draft.discordLive === false && (
        <div className="bot-control-banner animate-stagger-3" role="status">
          <AlertTriangle className="shrink-0" size={15} />
          <div>
            <strong>Modificările rămân în așteptare.</strong>{" "}
            Botul Discord nu este conectat. Poți salva acum, iar setările devin active după reconectare.
          </div>
          <button
            type="button"
            onClick={() => toast({ title: "Botul este offline", description: "Poți salva setările acum; botul le va aplica după reconectare." })}
            className="bot-control-banner-help"
            data-testid="button-view-connection-help"
          >
            <CircleHelp size={13} /> Detalii
          </button>
        </div>
      )}
      {(panelRecovery || partialApplyError?.guildId === guildId) && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>
            {panelRecovery
              ? "Panoul a fost publicat, dar salvarea configurației a fost parțială."
              : "Serverul a raportat un rezultat parțial; efectele Discord nu sunt confirmate."}
          </strong>
          <p className="mt-1">{panelRecovery?.message ?? partialApplyError?.message}</p>
          {panelRecovery?.requiresManualReconciliation && (
            <div className="mt-2 space-y-2">
              <p>ID-ul panoului de verificare nu s-a întors. Verifică panoul din Discord înainte de o nouă salvare.</p>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => {
                  if (!window.confirm("Ai verificat panoul din Discord și se poate salva din nou?")) return;
                  confirmPanelReconciliation();
                }}
              >
                Confirmă reconcilierea manuală
              </Button>
            </div>
          )}
        </div>
      )}
      {hasUnsavedChanges && (
        <div className="bot-control-toolbar">
          <div className="bot-control-toolbar-actions">
            <div className="bot-control-toolbar-save">
              <div className="bot-control-save-state">
                <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
                <span>{saving ? "Se salvează setările…" : "Ai modificări nesalvate."}</span>
              </div>
              <div className="mod-save-actions">
                <Button onClick={() => void save()} disabled={saving || panelRecovery?.requiresManualReconciliation} size="sm" className="gap-2 font-semibold tracking-wide">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Se salvează…" : "Salvează"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="animate-stagger-4">
        <Tabs value={activeTab} className="bot-control-tabs space-y-5">
          <TabsContent value="channels" className="mod-tab-content mt-0">
            <section className="surface channel-list">
              <div className="section-head">
                <div>
                  <h2 className="font-medium text-foreground">Identifică destinațiile pe Discord</h2>
                  <p className="text-xs text-muted-foreground">
                    Selectează canale din server pentru fiecare funcție a botului. „Neconfigurat” oprește rutarea botului; canalul Discord nu este șters.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="gap-2 h-8 text-xs" onClick={() => setClearCategoryDialogOpen(true)}>
                    <Folder className="h-3 w-3" /> Golește pe categorii
                  </Button>
                  <Button type="button" variant="destructive" className="h-8 text-xs" onClick={() => clearDestinations("all")}>
                    Golește toate destinațiile
                  </Button>
                  <Button type="button" variant="outline" className="gap-2 h-8 text-xs" onClick={() => void refetchMetadata()}>
                    <Radio className="h-3 w-3" /> Reîmprospătează
                  </Button>
                </div>
              </div>
              <div className="channel-grid">
                {channelFields.map(({ key, label, description, icon: Icon }) => {
                  const current = draft.channels[key] ?? "";
                  const selected = metadata?.channels.some((channel) => channel.id === current) ? current : "__none__";
                  return (
                    <article className="channel-card" key={key}>
                      <div className="channel-card-head">
                        <Icon size={14} />
                        <div>
                          <h3>{label}</h3>
                          <p>{description}</p>
                        </div>
                      </div>
                      <div className="channel-input">
                        <Select value={selected} onValueChange={(value) => setChannel(key, value)}>
                          <SelectTrigger className="mod-select-trigger h-8 w-auto text-xs">
                            <SelectValue placeholder="Alege canal" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                            <SelectItem value="__none__">Neconfigurat</SelectItem>
                            {metadata?.channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {isCategory(channel.type) ? "▰" : "#"} {channel.name}
                                {channel.parentId && categoryNames.get(channel.parentId) ? ` · ${categoryNames.get(channel.parentId)}` : ""}
                                {" "}({channel.id})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input
                          type="text" value={current} onChange={(event) => setChannel(key, event.target.value.trim())}
                          placeholder="ID canal Discord" aria-label={`${label} ID`}
                        />
                        <span>{current ? `#${metadata?.channels.find((channel) => channel.id === current)?.name ?? "Manual"}` : "ID manual"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Canalele lipsă, cu accesul pe roluri, le creezi din <Link href="/control/canale" className="underline">Control bot → Canale și acces</Link>.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="messages" className="mt-0 space-y-5">
            <section className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="flex items-start gap-3">
                <Users className="mt-1 h-5 w-5 text-primary" />
                <p className="text-muted-foreground">
                  Mesajele de bun venit și plecare sunt în <Link href="/setari/bun-venit" className="underline">Setări bot → Bun venit și plecare</Link>,
                  iar mesajul pentru Oracolul oprit în <Link href="/oracol/pornire" className="underline">Oracol</Link>.
                </p>
              </div>
            </section>
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-1 h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">Jocul oprit</h2>
                  <p className="text-xs text-muted-foreground">Mesajul trimis când jocul e oprit.</p>
                </div>
                <Button
                  type="button" variant="ghost" size="sm" className="shrink-0 gap-1"
                  onClick={() => { setGamePaused("gamePaused", DEFAULT_GAME_PAUSED); setGamePaused("gamePausedImageUrl", ""); setGamePaused("gamePausedThumbnailUrl", ""); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Implicit
                </Button>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium">Joc oprit</span>
                <EmojiField multiline rows={4} maxLength={2000} value={draft.gameplayConfig.messages.gamePaused} onChange={(value) => setGamePaused("gamePaused", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                <ImageField label="Imagine pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGamePaused("gamePausedImageUrl", value)} />
                <ImageField label="Thumbnail pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGamePaused("gamePausedThumbnailUrl", value)} />
              </label>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={clearCategoryDialogOpen} onOpenChange={setClearCategoryDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Golește destinațiile pe categorie</DialogTitle>
            <DialogDescription>
              Alege grupul de destinații de golit. Modificările rămân în draft până apeși Salvează; canalele și mesajele Discord nu sunt șterse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {DESTINATION_CLEAR_CATEGORIES.map((category) => (
              <article key={category.key} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{category.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>
                </div>
                <Button type="button" variant="destructive" className="h-8 shrink-0 text-xs" onClick={() => clearDestinations(category.key)}>
                  Golește
                </Button>
              </article>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearCategoryDialogOpen(false)}>Închide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
