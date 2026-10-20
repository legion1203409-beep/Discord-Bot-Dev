import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleHelp, Loader2, RefreshCw, RotateCcw, Save, Search, Send, ShieldCheck, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetVerificationMembersQueryKey,
  useGetVerificationMembers,
  useManuallyVerifyGuildMember,
} from "@workspace/api-client-react";
import { Button } from "../../components/ui/button";
import { ImageField } from "../../components/moderation/ImageField";
import { DiscordEmojiText, EmojiField } from "../../components/moderation/EmojiField";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { filterVerificationMembers, type VerificationMemberFilter } from "../../lib/verification-member-filter";
import {
  useActiveGuild,
  BotControlPartialApplyError,
  useBotControl,
  useModerationMetadata,
  useSession,
  type BotControlConfig,
} from "../../hooks/use-moderation-api";
import { useToast } from "../../hooks/use-toast";

const DEFAULT_VERIFICATION_TEXT = {
  title: "Verifică-ți contul",
  message: "Apasă butonul de mai jos pentru a confirma că deții contul Discord și pentru a primi rolul comunității.",
  buttonLabel: "Verifică-mă",
  buttonEmoji: "✅",
  successMessage: "Contul tău a fost verificat. Rolul a fost acordat.",
  alreadyVerifiedMessage: "Contul tău este deja verificat.",
  imageUrl: "",
  thumbnailUrl: "",
} as const;

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

export function VerificationAdminPage() {
  const { guildId } = useActiveGuild();
  const currentGuild = useRef(guildId);
  currentGuild.current = guildId;
  const {
    data,
    loading,
    error,
    update,
    publishVerification,
    panelRecovery,
    confirmPanelReconciliation,
  } = useBotControl(guildId);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const membersQuery = useGetVerificationMembers(guildId ?? "", {
    query: {
      enabled: Boolean(guildId),
      queryKey: getGetVerificationMembersQueryKey(guildId ?? ""),
    },
  });
  const manualVerification = useManuallyVerifyGuildMember();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { session } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishingPanel, setPublishingPanel] = useState(false);
  const [partialApplyError, setPartialApplyError] = useState<{ guildId: string; message: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [verificationSearch, setVerificationSearch] = useState("");
  const [verificationMemberFilter, setVerificationMemberFilter] = useState<VerificationMemberFilter>("all");

  useEffect(() => {
    if (!data) {
      setDraft(null);
      return;
    }
    // Do not replace an in-progress local draft when the save hook publishes
    // its new canonical snapshot; a guild switch clears it above.
    setDraft((current) => {
      if (current) return current;
      const nextDraft = JSON.parse(JSON.stringify(data)) as BotControlConfig;
      const retainedPanelId = panelRecovery?.panelMessageId;
      if (retainedPanelId) nextDraft.verification.panelMessageId = retainedPanelId;
      return nextDraft;
    });
  }, [data, guildId, panelRecovery]);

  const hasUnsavedChanges = Boolean(
    data && draft && JSON.stringify(draft) !== JSON.stringify(data),
  );

  const setVerification = (
    field: keyof BotControlConfig["verification"],
    value: string | boolean,
  ) => {
    setDraft((current) => current ? {
      ...current,
      verification: { ...current.verification, [field]: value },
    } : current);
  };

  const resetVerificationText = () => {
    setDraft((current) => current ? {
      ...current,
      verification: { ...current.verification, ...DEFAULT_VERIFICATION_TEXT },
    } : current);
  };

  const openBotInvite = async () => {
    if (!guildId) return;
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/moderation/guilds/${guildId}/verification/invite`, {
        credentials: "include",
      });
      const payload = await response.json() as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error ?? "Linkul de autorizare nu este disponibil.");
      }
      window.open(payload.inviteUrl, "_blank", "noopener,noreferrer");
    } catch (inviteError) {
      toast({
        variant: "destructive",
        title: "Autorizarea botului a eșuat",
        description: inviteError instanceof Error ? inviteError.message : "Încearcă din nou.",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const save = async () => {
    if (!draft || !hasUnsavedChanges || saving) return;
    if (panelRecovery?.requiresManualReconciliation) {
      toast({
        variant: "destructive",
        title: "Salvarea este blocată",
        description: "Identificatorul panoului publicat nu este disponibil. Reconciliază manual panoul din Discord înainte de a reîncerca.",
      });
      return;
    }
    const submittedDraft = JSON.parse(JSON.stringify(draft)) as BotControlConfig;
    const submittedGuild = guildId;
    if (!submittedGuild) return;
    setSaving(true);
    try {
      const saved = await update({
        ...submittedDraft,
        channels: Object.fromEntries(Object.entries(submittedDraft.channels).filter(([, value]) => value)),
      });
      setDraft((current) => {
        if (!current) return saved;
        // A user may continue editing while the request is in flight. Adopt
        // the server's canonical values, then keep only edits made since submit.
        const keepNewerEdits = (before: any, after: any, canonical: any): any => {
          if (JSON.stringify(before) === JSON.stringify(after)) return canonical;
          if (
            before && after && canonical &&
            typeof before === "object" && typeof after === "object" && typeof canonical === "object" &&
            !Array.isArray(before) && !Array.isArray(after) && !Array.isArray(canonical)
          ) {
            const merged = { ...canonical };
            for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
              if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
                merged[key] = keepNewerEdits(before[key], after[key], canonical[key]);
              }
            }
            return merged;
          }
          return after;
        };
        return keepNewerEdits(submittedDraft, current, saved);
      });
      setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
      toast({
        title: "Verificarea a fost salvată",
        description: "Configurația Discord și asocierea cu site-ul sunt persistente.",
      });
    } catch (saveError) {
      if (currentGuild.current !== submittedGuild) return;
      if (saveError instanceof BotControlPartialApplyError) {
        if (!saveError.verificationPanelPublished) {
          setPartialApplyError({ guildId: submittedGuild, message: saveError.message });
        } else {
          setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
        }
        toast({
          variant: "destructive",
          title: saveError.verificationPanelPublished
            ? "Salvare parțială: panoul a fost publicat"
            : "Rezultat parțial; efectele Discord nu sunt confirmate",
          description: saveError.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Salvarea a eșuat",
          description: saveError instanceof Error ? saveError.message : "Încearcă din nou.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const publishPanel = async () => {
    if (!draft || saving || !guildId) return;
    if (panelRecovery?.requiresManualReconciliation) {
      toast({
        variant: "destructive",
        title: "Publicarea este blocată",
        description: "Reconciliază manual în Discord panoul publicat fără ID înainte de a reîncerca.",
      });
      return;
    }
    const submittedVerification = { ...draft.verification };
    const submittedGuild = guildId;
    setSaving(true);
    setPublishingPanel(true);
    try {
      const published = await publishVerification(submittedVerification);
      if (currentGuild.current !== submittedGuild) return;
      setDraft((current) => {
        if (!current) return current;
        const merged = { ...published };
        for (const key of Object.keys(merged) as Array<keyof typeof merged>) {
          if (current.verification[key] !== submittedVerification[key]) {
            (merged as any)[key] = current.verification[key];
          }
        }
        return { ...current, verification: merged };
      });
      setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
      toast({
        title: "Panoul a fost publicat",
        description: "Setările de verificare au fost salvate. Celelalte modificări rămân nesalvate.",
      });
    } catch (publishError) {
      if (currentGuild.current !== submittedGuild) return;
      if (publishError instanceof BotControlPartialApplyError) {
        if (!publishError.verificationPanelPublished) {
          setPartialApplyError({ guildId: submittedGuild, message: publishError.message });
        } else {
          setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
        }
        toast({
          variant: "destructive",
          title: publishError.verificationPanelPublished
            ? "Panoul a fost publicat; salvarea configurației a fost parțială"
            : "Rezultat parțial; publicarea nu este confirmată",
          description: publishError.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Publicarea panoului a eșuat",
          description: publishError instanceof Error ? publishError.message : "Încearcă din nou.",
        });
      }
    } finally {
      setSaving(false);
      setPublishingPanel(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {error?.message ?? "Setările verificării nu au putut fi încărcate."}
      </div>
    );
  }

  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const filteredMembers = filterVerificationMembers(
    membersQuery.data?.members ?? [],
    verificationMemberFilter,
    verificationSearch,
  );
  const guildPartialApplyError = partialApplyError?.guildId === guildId ? partialApplyError : null;

  const manuallyVerifyMember = async (userId: string, displayName: string) => {
    if (!guildId || manualVerification.isPending) return;
    const submittedGuildId = guildId;
    try {
      const result = await manualVerification.mutateAsync({ guildId: submittedGuildId, userId });
      await queryClient.invalidateQueries({ queryKey: getGetVerificationMembersQueryKey(submittedGuildId) });
      toast({
        title: result.result === "already_verified" ? "Membrul era deja verificat" : "Membrul a fost verificat",
        description: result.displayName || displayName,
      });
    } catch (verifyError) {
      toast({
        variant: "destructive",
        title: "Verificarea manuală a eșuat",
        description: verifyError instanceof Error ? verifyError.message : "Încearcă din nou.",
      });
    }
  };

  return (
    <div className={`bot-control-page verification-admin-page max-w-5xl space-y-6 animate-stagger-1 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <header className="bot-control-hero animate-stagger-2">
        <div>
          <div className="bot-control-brand-row">
            <span className="bot-control-brand-mark"><ShieldCheck className="h-4 w-4" /></span>
            <p className="mod-eyebrow">MEMBER GATE</p>
          </div>
          <h1 className="mod-heading text-4xl">Verificare membri</h1>
          <p>Configurează verificarea Discord + site și urmărește membrii care au primit rolul.</p>
        </div>
        <div
          className="bot-control-status"
          data-state={data?.verification.enabled && data.discordLive !== false && !panelRecovery && !guildPartialApplyError ? "online" : "offline"}
        >
          <span className="bot-control-status-dot" />
          <div>
            <strong>
              {!data
                ? "Starea nu este confirmată"
                : panelRecovery
                  ? "Panou publicat; salvare parțială"
                  : guildPartialApplyError
                    ? "Aplicare parțială; efecte neconfirmate"
                  : !data.verification.enabled
                    ? "În configurare"
                    : data.discordLive === false
                      ? "Activată în configurație; botul Discord este offline"
                      : "Verificarea este activă"}
            </strong>
            <small>
              {!data
                ? "Se încarcă starea salvată"
                : panelRecovery || guildPartialApplyError
                  ? panelRecovery?.message ?? guildPartialApplyError?.message
                  : data.verification.enabled && data.discordLive === false
                    ? "Activarea este persistentă, dar nu este live până când botul se reconectează"
                    : draft.verification.enabled !== data.verification.enabled
                  ? "Modificarea stării este nesalvată; statusul arată configurația de pe server"
                  : data.verification.enabled
                    ? data.discordLive === true
                      ? "Panoul poate fi folosit pe Discord"
                      : "Activarea este salvată; starea conexiunii Discord nu este confirmată"
                    : "Activează și salvează configurația"}
            </small>
          </div>
        </div>
      </header>

      {(panelRecovery || guildPartialApplyError) && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>
            {panelRecovery
              ? "Panoul a fost publicat, dar salvarea configurației a fost parțială."
              : "Serverul a raportat un rezultat parțial; efectele Discord nu sunt confirmate."}
          </strong>
          <p className="mt-1">{panelRecovery?.message ?? guildPartialApplyError?.message}</p>
          {panelRecovery?.panelMessageId && !panelRecovery.storageUnavailable && (
            <p className="mt-1">ID-ul panoului publicat ({panelRecovery.panelMessageId}) a fost păstrat pentru acest server și va fi folosit la reîncercare, evitând publicarea unui duplicat.</p>
          )}
          {panelRecovery?.panelMessageId && panelRecovery.storageUnavailable && (
            <p className="mt-1">ID-ul panoului ({panelRecovery.panelMessageId}) este disponibil doar în memoria acestei pagini; stocarea sesiunii nu l-a putut păstra în siguranță după reîncărcare.</p>
          )}
          {panelRecovery?.requiresManualReconciliation && (
            <div className="mt-2 space-y-2">
              <p>
                {panelRecovery.storageUnavailable
                  ? "Stocarea sesiunii nu este disponibilă. Reconciliază manual panoul din Discord înainte de o nouă salvare; reîncărcarea poate pierde ID-ul de recuperare."
                  : "ID-ul panoului publicat nu a fost returnat. Elimină sau reconciliază manual panoul din Discord înainte de o nouă salvare."}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!window.confirm("Ai reconciliat manual panoul publicat în Discord și este sigur să permiți reîncercarea?")) return;
                  confirmPanelReconciliation();
                }}
              >
                Confirmă reconcilierea manuală
              </Button>
            </div>
          )}
          {panelRecovery?.manualReconciliationComplete && (
            <p className="mt-1">Reconcilierea manuală a fost confirmată; reîncercarea este permisă.</p>
          )}
          {!panelRecovery && guildPartialApplyError && (
            <p className="mt-1">Starea configurației și efectele Discord pot fi incomplete; verifică-le înainte de o nouă salvare.</p>
          )}
        </div>
      )}

      {data && !data.verification.enabled && (
        <div className="bot-control-banner animate-stagger-3" role="status">
          <AlertTriangle className="shrink-0" size={15} />
          <div>
            <strong>Fluxul nu este activ.</strong>{" "}
            Completează canalul și rolul, apoi salvează verificarea pentru a publica panoul pe Discord.
          </div>
          <button
            type="button"
            onClick={() => toast({ title: "Verificarea este în configurare", description: "Alege canalul și rolul, apoi apasă Salvează verificarea." })}
            className="bot-control-banner-help"
          >
            <CircleHelp size={13} /> Detalii
          </button>
        </div>
      )}

      <section className="mod-card space-y-5 p-5 animate-stagger-4">
        <div className="verification-section-head flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="mod-eyebrow">CONFIGURAȚIE</p>
              <h2 className="font-semibold text-foreground text-lg">Verificare Discord + site</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Membrul confirmă identitatea prin Discord, primește rolul ales și rămâne asociat cu sesiunea de verificare a site-ului.
              </p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Switch
              checked={draft.verification.enabled}
              aria-label="Activează sau dezactivează verificarea"
              onCheckedChange={(enabled) => setVerification("enabled", enabled)}
            />
            <span className="min-w-10 text-xs font-medium text-muted-foreground">
              {draft.verification.enabled ? "Activ" : "Oprit"}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Canalul panoului</label>
            <Select
              value={textChannels.some((channel) => channel.id === draft.verification.channelId)
                ? draft.verification.channelId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "channelId",
                value === "__manual__" ? draft.verification.channelId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.channelId}
              placeholder="ID canal Discord"
              onChange={(event) => setVerification("channelId", event.target.value.trim())}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rolul acordat</label>
            <Select
              value={metadata?.roles.some((role) => role.id === draft.verification.roleId && !role.managed)
                ? draft.verification.roleId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "roleId",
                value === "__manual__" ? draft.verification.roleId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege rol" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {metadata?.roles.filter((role) => !role.managed).map((role) => (
                  <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.roleId}
              placeholder="ID rol Discord"
              onChange={(event) => setVerification("roleId", event.target.value.trim())}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-border pt-5">
          <div>
            <h3 className="font-medium">Panoul de verificare</h3>
            <p className="text-xs text-muted-foreground">Publică sau actualizează separat panoul. Această acțiune salvează doar setările de verificare.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-2"
              onClick={() => void publishPanel()}
              disabled={
                saving ||
                !draft.verification.enabled ||
                !draft.verification.channelId ||
                !draft.verification.roleId ||
                data?.discordLive === false ||
                Boolean(panelRecovery?.requiresManualReconciliation)
              }
              title="Publică panoul sau actualizează mesajul existent fără să salvezi alte setări."
            >
              {publishingPanel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publishingPanel ? "Se publică…" : "Publică panoul"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetVerificationText}>
              <RotateCcw className="h-3.5 w-3.5" /> Implicit
            </Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Titlu</span>
              <EmojiField maxLength={256} value={draft.verification.title} onChange={(value) => setVerification("title", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Emoji buton</span>
              <EmojiField replacement maxLength={100} value={draft.verification.buttonEmoji} placeholder="✅" onChange={(value) => setVerification("buttonEmoji", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs font-medium">Descriere</span>
              <EmojiField multiline rows={5} maxLength={4000} value={draft.verification.message} onChange={(value) => setVerification("message", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <ImageField
              label="Thumbnail mic (dreapta sus)"
              value={draft.verification.thumbnailUrl}
              guildId={guildId}
              csrfToken={session?.csrfToken}
              onChange={(value) => setVerification("thumbnailUrl", value)}
            />
            <ImageField
              label="Imaginea panoului de verificare"
              value={draft.verification.imageUrl}
              guildId={guildId}
              csrfToken={session?.csrfToken}
              onChange={(value) => setVerification("imageUrl", value)}
            />
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Text buton</span>
              <EmojiField maxLength={80} value={draft.verification.buttonLabel} onChange={(value) => setVerification("buttonLabel", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Mesaj după verificare</span>
              <EmojiField maxLength={2000} value={draft.verification.successMessage} onChange={(value) => setVerification("successMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs font-medium">Mesaj dacă este deja verificat</span>
              <EmojiField multiline rows={3} maxLength={2000} value={draft.verification.alreadyVerifiedMessage} onChange={(value) => setVerification("alreadyVerifiedMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
          </div>
          <div className="self-start rounded-xl border border-[#5865f2]/40 bg-[#202225] p-4 text-[#f2f3f5] shadow-lg">
            <p className="mb-3 text-[10px] font-semibold tracking-[0.18em] text-[#949cf7]">PREVIZUALIZARE DISCORD</p>
            <div className="overflow-hidden rounded-lg border-l-4 border-[#5865f2] bg-[#2b2d31]">
              <div className="p-4">
                {draft.verification.thumbnailUrl && (
                  <img
                    src={draft.verification.thumbnailUrl}
                    alt="Previzualizarea thumbnail-ului panoului"
                    className="float-right ml-3 h-20 w-20 rounded object-cover"
                  />
                )}
                <h3 className="text-lg font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{draft.verification.title || "Titlul panoului"}</DiscordEmojiText></h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#b5bac1]"><DiscordEmojiText emojis={metadata?.emojis}>{draft.verification.message || "Descrierea panoului"}</DiscordEmojiText></p>
                {draft.verification.imageUrl && (
                  <img
                    src={draft.verification.imageUrl}
                    alt="Previzualizarea imaginii panoului"
                    className="mt-3 max-h-52 w-full rounded object-contain"
                  />
                )}
                <Button type="button" className="mt-4 bg-[#5865f2] text-white hover:bg-[#4752c4]">
                  <DiscordEmojiText emojis={metadata?.emojis}>{`${draft.verification.buttonEmoji} ${draft.verification.buttonLabel || "Verifică-mă"}`}</DiscordEmojiText>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
          <div>
            <p className="text-sm font-medium">Pasul administratorului</p>
            <p className="text-xs text-muted-foreground">Botul trebuie să fie instalat pe server și să aibă rolul botului deasupra rolului de verificare.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void openBotInvite()} disabled={inviteLoading}>
            {inviteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Autorizează / invită botul
          </Button>
        </div>
      </section>

      <section className="verification-surface verification-members-surface space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Users className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="mod-eyebrow">MEMBER DIRECTORY</p>
              <h2 className="font-medium">Membrii serverului</h2>
              <p className="text-xs text-muted-foreground">Statusul verificării pentru membrii serverului și acțiuni manuale disponibile staff-ului.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {membersQuery.data ? (
              <>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrează membrii după starea verificării">
                  <button
                    type="button"
                    aria-label={`Toți membrii, ${membersQuery.data.total}`}
                    aria-pressed={verificationMemberFilter === "all"}
                    onClick={() => setVerificationMemberFilter("all")}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${verificationMemberFilter === "all" ? "border-primary/50 bg-primary/15 text-foreground" : "border-primary/25 bg-primary/[0.06] text-foreground"}`}
                    data-testid="text-verification-total"
                  >
                    {membersQuery.data.total.toLocaleString("ro-RO")} membri
                  </button>
                  <button
                    type="button"
                    aria-label={`Membri verificați, ${membersQuery.data.verifiedTotal}`}
                    aria-pressed={verificationMemberFilter === "verified"}
                    onClick={() => setVerificationMemberFilter("verified")}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${verificationMemberFilter === "verified" ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400"}`}
                    data-testid="text-verification-verified-total"
                  >
                    {membersQuery.data.verifiedTotal.toLocaleString("ro-RO")} verificați
                  </button>
                  <button
                    type="button"
                    aria-label={`Membri neverificați, ${membersQuery.data.unverifiedTotal}`}
                    aria-pressed={verificationMemberFilter === "unverified"}
                    onClick={() => setVerificationMemberFilter("unverified")}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${verificationMemberFilter === "unverified" ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-amber-500/25 bg-amber-500/[0.06] text-amber-300"}`}
                    data-testid="text-verification-unverified-total"
                  >
                    {membersQuery.data.unverifiedTotal.toLocaleString("ro-RO")} neverificați
                  </button>
                </div>
              </>
            ) : (
              <span className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground" data-testid="text-verification-count-unavailable">
                {membersQuery.isLoading ? "Se încarcă membrii" : "Total indisponibil"}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void membersQuery.refetch()}
              disabled={membersQuery.isFetching}
              title="Reîncarcă lista"
              data-testid="button-refresh-verification-members"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${membersQuery.isFetching ? "animate-spin" : ""}`} />
              Reîncarcă
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={verificationSearch}
            onChange={(event) => setVerificationSearch(event.target.value)}
            placeholder="Caută după nume, username sau ID Discord"
            aria-label="Caută membri"
            data-testid="input-verification-member-search"
            className="pl-9"
          />
        </div>

        {membersQuery.isLoading && !membersQuery.data ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se încarcă membrii serverului…
          </div>
        ) : membersQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <span>{membersQuery.error instanceof Error ? membersQuery.error.message : "Lista membrilor nu a putut fi încărcată."}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void membersQuery.refetch()} data-testid="button-retry-verification-members">
              Încearcă din nou
            </Button>
          </div>
        ) : !data?.verification.roleId ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Configurează și salvează rolul de verificare pentru a vedea membrii.
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {verificationSearch.trim()
              ? "Nu există membri care corespund căutării."
              : verificationMemberFilter === "verified"
                ? "Nu există membri verificați pentru acest server."
                : verificationMemberFilter === "unverified"
                  ? "Nu există membri neverificați pentru acest server."
                  : "Nu există membri raportați pentru acest server."}
          </div>
        ) : (
          <div className="verification-table-wrap overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[790px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Membru</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">ID Discord</th>
                  <th className="px-4 py-3 font-medium">În server din</th>
                  <th className="px-4 py-3 font-medium">Verificare</th>
                  <th className="px-4 py-3 text-right font-medium">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-muted/20" data-testid={`row-verification-member-${member.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={member.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-muted object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                        <span className="font-medium">{member.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">@{member.username}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{member.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ro-RO") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${member.verified ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`} data-testid={`status-member-verification-${member.id}`}>
                        {member.verified ? "Verificat" : "În așteptare"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!member.verified && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void manuallyVerifyMember(member.id, member.displayName)}
                          disabled={manualVerification.isPending}
                          aria-label={`Verifică manual ${member.displayName}`}
                          data-testid={`button-manual-verify-${member.id}`}
                        >
                          {manualVerification.isPending && manualVerification.variables?.userId === member.id
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
                          Verifică manual
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hasUnsavedChanges && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground font-medium text-sm">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? publishingPanel ? "Se publică panoul…" : "Se salvează verificarea…" : (panelRecovery || guildPartialApplyError) ? "Rezultatul aplicării este parțial; verifică valorile serverului." : "Ai modificări nesalvate."}</span>
          </div>
          <div className="mod-save-actions ml-auto">
            <Button onClick={() => void save()} disabled={saving || Boolean(panelRecovery?.requiresManualReconciliation)} className="gap-2 px-8 font-semibold tracking-wide shadow-lg shadow-primary/20">
              {publishingPanel ? <Send className="h-4 w-4 animate-pulse" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {publishingPanel ? "Se publică panoul…" : saving ? "Se salvează…" : "Salvează verificarea"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}