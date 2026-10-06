import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Loader2, Save, Trophy } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ImageField } from "../../components/moderation/ImageField";
import { ActivityRoleRewardsEditor } from "../../components/moderation/ActivityRoleRewardsEditor";
import { ActivityRankLayoutEditor } from "../../components/moderation/ActivityRankLayoutEditor";
import { activityRoleRewardsError, type ActivityRoleReward } from "../../lib/activity-role-rewards";
import {
  activityRankBarMaxY,
  activityRankLayoutForBanner,
  activityRankMemberHeightPercent,
  activityRankMemberScale,
  type ActivityRankLayout,
} from "../../lib/activity-rank-layout";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { apiFetchWithMeta, useActiveGuild, useModerationMetadata, useSession } from "../../hooks/use-moderation-api";

interface ActivityRankConfig {
  enabled: boolean;
  notificationChannelId: string;
  rankUpMessage: string;
  bannerImageUrl: string;
  barStyle: "discord" | "dungi" | "gradient" | "oblic" | "pixel" | "pro" | "sword";
  color: string;
  roleRewards: ActivityRoleReward[] | null;
  layout: ActivityRankLayout | null;
}

const DEFAULT_CONFIG: ActivityRankConfig = {
  enabled: true,
  notificationChannelId: "",
  rankUpMessage: "✨ {user} a ajuns la rangul de activitate **{level}** pe serverul **{guild}**!",
  bannerImageUrl: "",
  barStyle: "discord",
  color: "#a34b2b",
  roleRewards: null,
  layout: null,
};

function isTextChannel(type: number | string): boolean {
  return type === 0 || type === 5 || type === "GuildText" || type === "GuildAnnouncement";
}

export function ActivityRanksPage() {
  const { guildId } = useActiveGuild();
  const { session } = useSession();
  const { data: metadata, loading: metadataLoading } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const activeGuildRef = useRef(guildId);
  activeGuildRef.current = guildId;
  const [draft, setDraft] = useState<ActivityRankConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<ActivityRankConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guildId) {
      setDraft(DEFAULT_CONFIG);
      setSaved(DEFAULT_CONFIG);
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiFetchWithMeta<{ config: ActivityRankConfig }>(`/guilds/${guildId}/activity-ranks`, {
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const config = {
        ...data.config,
        roleRewards: data.config.roleRewards ?? null,
        layout: data.config.layout ?? null,
      };
      setDraft(config);
      setSaved(config);
    }).catch((loadError: unknown) => {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Setările rangurilor nu au putut fi încărcate.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [guildId]);

  const textChannels = useMemo(
    () => metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [],
    [metadata],
  );
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(saved);
  const rewardsError = activityRoleRewardsError(draft.roleRewards) ||
    (draft.roleRewards?.some((reward) => {
      const role = metadata?.roles.find((candidate) => candidate.id === reward.roleId);
      return !role || role.id === guildId || role.managed || role.activityRewardAssignable === false;
    }) ? "Înlocuiește sau șterge rolurile indisponibile înainte de salvare." : "");

  const update = <K extends keyof ActivityRankConfig>(key: K, value: ActivityRankConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!guildId || saving || rewardsError || loading || metadataLoading) return;
    const savingGuildId = guildId;
    setSaving(true);
    setError("");
    try {
      const { data } = await apiFetchWithMeta<{ config: ActivityRankConfig }>(
        `/guilds/${savingGuildId}/activity-ranks`,
        { method: "PUT", body: JSON.stringify(draft) },
      );
      if (activeGuildRef.current === savingGuildId) {
        const savedConfig = {
          ...data.config,
          roleRewards: data.config.roleRewards ?? null,
          layout: data.config.layout ?? null,
        };
        setDraft(savedConfig);
        setSaved(savedConfig);
        toast({ title: "Setările rangurilor au fost salvate." });
      }
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : "Setările nu au putut fi salvate.";
      if (activeGuildRef.current === savingGuildId) {
        setError(message);
        toast({ variant: "destructive", title: "Salvarea a eșuat", description: message });
      }
    } finally {
      setSaving(false);
    }
  };

  const previewMessage = draft.rankUpMessage
    .replaceAll("{user}", "@Membru")
    .replaceAll("{level}", "5")
    .replaceAll("{guild}", metadata?.guild.name ?? "Serverul meu");

  if (!guildId) {
    return <p className="text-muted-foreground">Selectează un server pentru a configura rangurile de activitate.</p>;
  }

  const customBanner = Boolean(draft.bannerImageUrl);
  const previewLayout = activityRankLayoutForBanner(draft.layout, customBanner);
  const memberScale = activityRankMemberScale(previewLayout.member.width, customBanner);

  return (
    <div className="max-w-5xl space-y-6 animate-stagger-1">
      <header className="space-y-2">
        <p className="mod-eyebrow">PROGRES SEPARAT DE RPG</p>
        <h1 className="mod-heading text-4xl">Ranguri de activitate</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Membrii primesc progres pentru conversații și timp petrecut în canale vocale. Rangul permanent și clasamentul lunar sunt separate de XP-ul, nivelurile și recompensele de luptă.
        </p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă setările rangurilor…
        </div>
      ) : (
        <>
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Activity className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-semibold">Progresul serverului</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Dezactivează colectarea fără să ștergi rangurile acumulate.</p>
                </div>
              </div>
              <Switch aria-label="Activează rangurile de activitate" checked={draft.enabled} onCheckedChange={(enabled) => update("enabled", enabled)} />
            </div>

            <div className="grid gap-3 rounded-lg border border-border/70 bg-background/50 p-4 text-sm sm:grid-cols-3">
              <p><strong>Chat:</strong> 10 XP pentru un mesaj valid, cu pauză de 30 de secunde și fără limită zilnică.</p>
              <p><strong>Voce:</strong> 5 XP pe minut într-un canal cu cel puțin doi membri reali, fără limită zilnică.</p>
              <p><strong>Nivel maxim:</strong> 100. XP-ul permanent și cel lunar continuă să crească. În modul automat, rolul final este „Legenda Cenușii”; în modul personalizat, alegi tu recompensele.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Modificarea setărilor, inclusiv a pragurilor și rolurilor, nu șterge XP-ul sau nivelul de activitate acumulat. XP-ul RPG rămâne separat.
            </p>
            <p className="text-xs text-muted-foreground">
              XP-ul din chat necesită „Message Content” activ atât în configurația botului, cât și în Discord Developer Portal. Fără el, progresul vocal continuă normal.
            </p>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Trophy className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold">Anunțuri și aspect</h2>
                <p className="mt-1 text-sm text-muted-foreground">Alege un canal dedicat; dacă îl golești sau devine invalid, rangurile nu trimit notificări în altă parte.</p>
              </div>
            </div>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">Canal pentru creșterea rangului</span>
              <Select
                value={draft.notificationChannelId || "none"}
                onValueChange={(value) => update("notificationChannelId", value === "none" ? "" : value)}
              >
                <SelectTrigger aria-label="Canal pentru creșterea rangului"><SelectValue placeholder="Alege un canal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fără notificări</SelectItem>
                  {draft.notificationChannelId && !textChannels.some((channel) => channel.id === draft.notificationChannelId) && (
                    <SelectItem value={draft.notificationChannelId}>Canal indisponibil · {draft.notificationChannelId}</SelectItem>
                  )}
                  {textChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {metadataLoading && <span className="block text-xs text-muted-foreground">Se încarcă lista canalelor…</span>}
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">Mesajul de rang nou</span>
              <Textarea
                rows={3}
                maxLength={1_800}
                value={draft.rankUpMessage}
                onChange={(event) => update("rankUpMessage", event.target.value)}
                aria-label="Mesajul de rang nou"
              />
              <span className="block text-xs text-muted-foreground">Variabile: {"{user}"}, {"{level}"}, {"{guild}"}.</span>
            </label>

            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <ImageField
                label="Banner comun pentru cardurile de rang"
                value={draft.bannerImageUrl}
                guildId={guildId}
                csrfToken={session?.csrfToken}
                uploadEndpoint="/storage/activity-ranks/uploads/request-url"
                onChange={(value) => update("bannerImageUrl", value)}
              />
              <label className="flex items-center gap-3 text-sm">
                <span className="font-medium">Culoare</span>
                <Input
                  type="color"
                  value={draft.color}
                  onChange={(event) => update("color", event.target.value)}
                  className="h-10 w-16 cursor-pointer p-1"
                  aria-label="Culoarea cardului de rang"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Dacă lași bannerul gol, se folosește imaginea implicită Regatul Cenușii. În /rank, avatarul și numele membrului apar sub bara animată.</p>
            <p className="text-xs text-muted-foreground">Poți încărca orice imagine acceptată. Pentru URL-uri externe sunt acceptate Discord CDN, Imgur (i.imgur.com) și Unsplash (images.unsplash.com).</p>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Stilul barei XP peste banner</span>
              <Select value={draft.barStyle} onValueChange={(value) => update("barStyle", value as ActivityRankConfig["barStyle"])}>
                <SelectTrigger aria-label="Stilul barei XP"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Clasică Discord</SelectItem>
                  <SelectItem value="dungi">Dungi</SelectItem>
                  <SelectItem value="gradient">Gradient</SelectItem>
                  <SelectItem value="oblic">Oblică</SelectItem>
                  <SelectItem value="pixel">Pixel</SelectItem>
                  <SelectItem value="pro">Pro · glow și scântei</SelectItem>
                  <SelectItem value="sword">Sabie · rune și forjă</SelectItem>
                </SelectContent>
              </Select>
              <span className="block text-xs text-muted-foreground">Șapte stiluri animate, toate cu bara subțire și fără fundal exterior. Emblema rotundă XP rămâne în bannerul implicit, iar bara se umple până la progresul real al membrului.</span>
            </label>
            <ActivityRankLayoutEditor
              value={draft.layout}
              hasCustomBanner={customBanner}
              onChange={(layout) => update("layout", layout)}
              disabled={saving}
            />
            <ActivityRoleRewardsEditor
              value={draft.roleRewards}
              onChange={(roleRewards) => update("roleRewards", roleRewards)}
              roles={metadata?.roles ?? []}
              guildId={guildId}
              disabled={saving || metadataLoading}
            />
            {rewardsError && <p role="alert" className="text-sm text-destructive">{rewardsError}</p>}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Previzualizare</h2>
            <div className="max-w-xl overflow-hidden rounded-xl border border-border bg-background">
              <div className="relative aspect-[800/534] w-full overflow-hidden bg-[#181e2b]" style={{ containerType: "inline-size" }}>
                  <img
                    src={draft.bannerImageUrl || "/api/assets/activity-rank-default.png?v=thin-xp"}
                    alt="Previzualizarea bannerului de rang"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                <img
                  src={`${import.meta.env.BASE_URL}activity-bars/${draft.barStyle}.gif?v=thin-xp`}
                  alt="Previzualizarea barei animate la 62% progres"
                  className="absolute"
                  style={{
                    left: `${previewLayout.bar.x}%`,
                    top: `${previewLayout.bar.y}%`,
                    width: `${previewLayout.bar.width}%`,
                  }}
                />
                <div
                  className="absolute flex items-center rounded-xl border border-amber-700/60 bg-[#0c0a0a]/90 text-amber-50"
                  style={{
                    left: `${previewLayout.member.x}%`,
                    top: `${previewLayout.member.y}%`,
                    width: `${previewLayout.member.width}%`,
                    height: `${activityRankMemberHeightPercent(previewLayout.member.width, customBanner)}%`,
                    gap: `${1.75 * memberScale}cqw`,
                    paddingInline: `${1.5 * memberScale}cqw`,
                  }}
                >
                  <span
                    className="flex aspect-square h-[68.3%] shrink-0 items-center justify-center rounded-full border border-amber-600 bg-amber-950 font-semibold"
                    style={{ fontSize: `${3.75 * memberScale}cqw` }}
                  >M</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold leading-tight" style={{ fontSize: `${3.75 * memberScale}cqw` }}>Membrul care folosește /rank</p>
                    <p className="truncate leading-tight text-amber-200/80" style={{ fontSize: `${2.5 * memberScale}cqw` }}>Rang 5 · XP de activitate</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Rang de activitate · {metadata?.guild.name ?? "Serverul meu"}</p>
                <p className="font-semibold" style={{ color: draft.color }}>Rang 5</p>
                <p className="whitespace-pre-wrap text-sm">
                  {previewMessage.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
                    part.startsWith("**") && part.endsWith("**") && part.length > 4
                      ? <strong key={index}>{part.slice(2, -2)}</strong>
                      : part,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Exemplu: 62% progres. În /rank, bara animată este compusă peste banner și arată XP-ul real.</p>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{hasChanges ? "Ai modificări nesalvate." : "Setările sunt salvate."}</p>
            <Button onClick={() => void save()} disabled={saving || !hasChanges || loading || metadataLoading || Boolean(rewardsError)} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Se salvează…" : "Salvează"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
