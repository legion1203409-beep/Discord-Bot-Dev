import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Activity, Bot, BookOpen, Check, ChevronLeft, ChevronRight, Command,
  Download, FileDown, Gavel, History, Home, LogOut, MessageCircle, RefreshCw, Search,
  Server, Settings2, Shield, ShieldAlert, SlidersHorizontal, Sparkles, Ticket,
  Trophy, Upload,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { useActiveGuild, useModerationConfig, useSession } from "../../hooks/use-moderation-api";

type NavigationItem = { id: string; label: string; description: string; href: string; icon: typeof Home; tint: string; keywords?: string };

const primaryItems: NavigationItem[] = [
  { id: "overview", label: "Privire generală", description: "Centrul de comandă al serverului", href: "/", icon: Home, tint: "ember", keywords: "overview dashboard" },
  { id: "protection", label: "Protecție", description: "AutoMod, spam, raid și comportament", href: "/protectie", icon: Shield, tint: "blue", keywords: "automod anti spam flood raid" },
  { id: "judge", label: "Judecător AI", description: "Moderare AI și criteriile de analiză", href: "/ai", icon: Sparkles, tint: "violet", keywords: "ai judecator" },
  { id: "sanctions", label: "Sancțiuni", description: "Politici și intervenții manuale", href: "/politici", icon: Gavel, tint: "gold", keywords: "sanctiuni comenzi staff" },
  { id: "cases", label: "Cazuri și jurnale", description: "Dosare și jurnal de audit", href: "/cazuri", icon: History, tint: "blue", keywords: "cazuri logs audit" },
  { id: "verification", label: "Verificare și tichete", description: "Membri noi și fluxuri de suport", href: "/verificare", icon: Ticket, tint: "green", keywords: "verification tickets" },
  { id: "rpg", label: "RPG", description: "Ranguri și progresul comunității", href: "/ranguri-activitate", icon: Trophy, tint: "gold", keywords: "ranguri activitate joc" },
  { id: "oracle", label: "Oracol", description: "Mesaje și servicii ale botului", href: "/bot?tab=messages", icon: MessageCircle, tint: "violet", keywords: "oracle mesaje bot" },
  { id: "settings", label: "Setări bot", description: "Module, configurare și canale", href: "/config", icon: Settings2, tint: "ember", keywords: "config settings" },
  { id: "assistant", label: "Asistent", description: "Ajutor offline și navigare în panou", href: "/asistent", icon: Bot, tint: "gold", keywords: "assistant help cauta" },
];

const allItems: Array<{ heading: string; items: NavigationItem[] }> = [
  { heading: "Centru de comandă", items: [primaryItems[0]!, { id: "manual-actions", label: "Acțiuni manuale", description: "Comenzi pentru staff", href: "/comenzi", icon: ShieldAlert, tint: "ember" }] },
  { heading: "Apărare", items: [
    primaryItems[1]!, { id: "automod", label: "AutoMod", description: "Filtre și reguli native", href: "/automod", icon: Bot, tint: "blue" },
    primaryItems[2]!, { id: "anti-spam", label: "Anti-Spam", description: "Limite pentru mesaje", href: "/anti-spam", icon: Activity, tint: "blue" },
    { id: "anti-flood", label: "Anti-Flood", description: "Mesaje foarte lungi și repetări", href: "/anti-flood", icon: Activity, tint: "blue" },
    { id: "anti-raid", label: "Anti-Raid", description: "Protecție la valuri de intrări", href: "/anti-raid", icon: ShieldAlert, tint: "blue" },
    { id: "suspicious", label: "Comportament suspect", description: "Alerte pentru activitate neobișnuită", href: "/comportament-suspect", icon: Search, tint: "blue" },
  ] },
  { heading: "Intervenții și evidențe", items: [
    primaryItems[3]!, primaryItems[4]!, { id: "audit", label: "Jurnal de audit", description: "Evenimente și modificări", href: "/audit", icon: History, tint: "gold" },
  ] },
  { heading: "Configurare", items: [
    primaryItems[8]!, { id: "policies", label: "Politici", description: "Roluri și canale protejate", href: "/politici", icon: BookOpen, tint: "gold" },
    { id: "config-messages", label: "Mesaje de moderare", description: "Șabloane și răspunsuri", href: "/config/mesaje", icon: MessageCircle, tint: "gold" },
    { id: "config-advanced", label: "Setări avansate", description: "Configurare avansată", href: "/config/avansat", icon: SlidersHorizontal, tint: "gold" },
    { id: "config-tools", label: "Unelte staff", description: "Permisiuni pentru unelte", href: "/config/unelte", icon: Shield, tint: "gold" },
    { id: "config-cases", label: "Cazuri și audit", description: "Păstrare și jurnale", href: "/config/cazuri-audit", icon: History, tint: "gold" },
    { id: "config-escalation", label: "Escaladare", description: "Sancțiuni progresive", href: "/config/escaladare", icon: Gavel, tint: "gold" },
    { id: "config-embeds", label: "Embed-uri", description: "Aspectul mesajelor", href: "/config/embeduri", icon: Sparkles, tint: "gold" },
    { id: "server-setup", label: "Pornire server", description: "Ghid de configurare", href: "/pornire-server", icon: BookOpen, tint: "gold" },
  ] },
  { heading: "Servicii Discord", items: [
    { id: "channels", label: "Canale și destinații", description: "Panouri și destinații bot", href: "/canale", icon: Server, tint: "violet" },
    { id: "provisioning", label: "Provisioning", description: "Canale și permisiuni", href: "/provisioning", icon: SlidersHorizontal, tint: "violet" },
    { id: "roles", label: "Roluri", description: "Roluri și acces", href: "/bot?tab=roles", icon: Shield, tint: "violet" },
    { id: "tickets", label: "Tichete", description: "Fluxuri pentru cereri", href: "/bot?tab=tickets", icon: Ticket, tint: "violet" },
    primaryItems[7]!,
    { id: "bot-statistics", label: "Statistici bot", description: "Statistici și invitații", href: "/bot?tab=statistics", icon: Activity, tint: "violet" },
  ] },
  { heading: "Membri și progres", items: [
    primaryItems[5]!, { id: "rank-settings", label: "Ranguri de activitate", description: "Configurarea progresului", href: "/ranguri-activitate", icon: Trophy, tint: "green" },
  ] },
  { heading: "Ajutor", items: [primaryItems[9]!] },
];

type Preferences = { accent: string; dock: "bottom" | "left"; labels: boolean; motion: boolean; order: string[] };
type ConfigRecord = Record<string, unknown>;
type ActionStatus = { kind: "info" | "error" | "success"; text: string };
type OperationPreview = {
  kind: "import" | "copy";
  targetGuildId: string;
  targetGuildName: string;
  sourceGuildId?: string;
  sourceGuildName?: string;
  importedConfig: ConfigRecord;
  changedKeys: string[];
};
const PREF_KEY = "oracol.panel.preferences.v1";
const defaultPrefs: Preferences = { accent: "ember", dock: "bottom", labels: false, motion: true, order: primaryItems.map((item) => item.id) };
const accents = [
  { id: "ember", label: "Jăratic", color: "#FF6B3D" },
  { id: "gold", label: "Aur", color: "#E2B467" },
  { id: "green", label: "Smarald", color: "#2FCB8C" },
  { id: "violet", label: "Ametist", color: "#B28CFF" },
  { id: "blue", label: "Gheață", color: "#4FB6FF" },
];

const envelopeKeys = new Set(["format", "version", "config", "server", "exportedAt"]);
const sectionLabels: Record<string, string> = {
  protection: "Protecție",
  autoMod: "AutoMod",
  wordFilter: "Filtru de cuvinte",
  linkBlock: "Blocare linkuri",
  antiRaid: "Anti-Raid",
  antiSpam: "Anti-Spam",
  antiFlood: "Anti-Flood",
  suspiciousBehavior: "Comportament suspect",
  ai: "Moderare AI",
  manualTools: "Unelte staff",
  cases: "Cazuri",
  audit: "Audit",
  escalation: "Escaladare",
  embeds: "Embed-uri",
  channels: "Canale",
  verification: "Verificare",
  tickets: "Tichete",
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sectionLabel(key: string): string {
  return sectionLabels[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toLocaleUpperCase("ro"));
}

function parseCanonicalConfig(text: string, allowedKeys: string[]): ConfigRecord {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON-ul trebuie să conțină o configurație obiect.");
  }
  const source = parsed as Record<string, unknown>;
  let candidate: unknown = source;
  if (Object.hasOwn(source, "format") || (Object.hasOwn(source, "version") && Object.hasOwn(source, "config"))) {
    const unknownEnvelopeKeys = Object.keys(source).filter((key) => !envelopeKeys.has(key));
    if (unknownEnvelopeKeys.length) throw new Error(`Câmpuri necunoscute în export: ${unknownEnvelopeKeys.join(", ")}.`);
    if (source.format !== "oracol-cenusii-config" || source.version !== 1 || !Object.hasOwn(source, "config")) {
      throw new Error("Export necunoscut. Folosește un JSON Oracol format/version 1.");
    }
    candidate = source.config;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Câmpul config trebuie să fie un obiect.");
  }
  const config = candidate as ConfigRecord;
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknownKeys.length) throw new Error(`Secțiuni necunoscute în configurație: ${unknownKeys.join(", ")}.`);
  return JSON.parse(JSON.stringify(config)) as ConfigRecord;
}

function changedTopLevelSections(current: ConfigRecord, incoming: ConfigRecord): string[] {
  return Object.keys(incoming).filter((key) => stableJson(current[key]) !== stableJson(incoming[key]));
}

function readPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || "null") as Partial<Preferences> | null;
    const order = Array.isArray(parsed?.order)
      ? [...new Set(parsed.order.filter((id): id is string => typeof id === "string" && primaryItems.some((item) => item.id === id)))]
      : defaultPrefs.order;
    return {
      ...defaultPrefs,
      ...parsed,
      accent: accents.some((accent) => accent.id === parsed?.accent) ? parsed!.accent! : defaultPrefs.accent,
      dock: parsed?.dock === "left" ? "left" : "bottom",
      labels: parsed?.labels === true,
      motion: parsed?.motion !== false,
      order,
    };
  } catch { return defaultPrefs; }
}

function EmberField({ motionEnabled }: { motionEnabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let width = 0;
    let height = 0;
    let particles: Array<{ x: number; y: number; r: number; speed: number; drift: number; alpha: number }> = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.min(54, Math.floor(width / 26)) }, () => ({
        x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.6 + .45,
        speed: Math.random() * .32 + .12, drift: (Math.random() - .5) * .22, alpha: Math.random() * .45 + .16,
      }));
    };
    const paint = () => {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        context.beginPath();
        context.fillStyle = `rgba(255, ${Math.floor(115 + particle.alpha * 130)}, 68, ${particle.alpha})`;
        context.shadowColor = "rgba(255, 107, 61, .55)";
        context.shadowBlur = 10;
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        context.fill();
        particle.y -= particle.speed; particle.x += particle.drift;
        if (particle.y < -5) { particle.y = height + 5; particle.x = Math.random() * width; }
        if (particle.x < -4 || particle.x > width + 4) particle.drift *= -1;
      });
      context.shadowBlur = 0;
      if (!reduced.matches && motionEnabled) frame = requestAnimationFrame(paint);
    };
    resize();
    if (!reduced.matches && motionEnabled) frame = requestAnimationFrame(paint);
    const onMotion = () => { cancelAnimationFrame(frame); if (!reduced.matches && motionEnabled) frame = requestAnimationFrame(paint); };
    reduced.addEventListener("change", onMotion);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); reduced.removeEventListener("change", onMotion); window.removeEventListener("resize", resize); };
  }, [motionEnabled]);
  return <div className="oracle-ambient" aria-hidden="true"><div className="oracle-aurora oracle-aurora--one" /><div className="oracle-aurora oracle-aurora--two" /><div className="oracle-aurora oracle-aurora--three" /><canvas ref={canvasRef} className="oracle-embers" /></div>;
}

function routeIsActive(href: string, location: string) {
  const [path, query] = href.split("?");
  if (location.split("?")[0] !== path) return false;
  return !query || new URLSearchParams(location.split("?")[1] || "").get("tab") === new URLSearchParams(query).get("tab");
}

export function ModerationChrome({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const navLocation = `${location.split("?")[0]}${search ? `?${search.replace(/^\?/, "")}` : location.includes("?") ? `?${location.split("?")[1]}` : ""}`;
  const { guildId, setGuildId, guilds } = useActiveGuild();
  const { logout } = useSession();
  const activeGuild = guilds.find((item) => item.id === guildId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState(readPreferences);
  const [actionDialog, setActionDialog] = useState<"import" | "copy" | "reset" | null>(null);
  const [importText, setImportText] = useState("");
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [operationPreview, setOperationPreview] = useState<OperationPreview | null>(null);
  const [copySourceGuildId, setCopySourceGuildId] = useState<string | null>(null);
  const [resetTargetGuildId, setResetTargetGuildId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const { data: config, loading: configLoading, error: configError, refetch: reloadConfig, update, updateSection } = useModerationConfig(guildId);
  const { data: copySourceConfig, loading: copySourceLoading, error: copySourceError, refetch: reloadCopySource } = useModerationConfig(copySourceGuildId);
  const activePrimary = primaryItems.find((item) => routeIsActive(item.href, navLocation)) || primaryItems[0]!;
  const orderedPrimary = useMemo(() => {
    const byId = new Map(primaryItems.map((item) => [item.id, item]));
    return [...preferences.order.map((id) => byId.get(id)).filter((item): item is NavigationItem => Boolean(item)),
      ...primaryItems.filter((item) => !preferences.order.includes(item.id))];
  }, [preferences.order]);
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ro");
    const items = allItems.flatMap((group) => group.items.map((item) => ({ ...item, heading: group.heading })));
    if (!needle) return items.slice(0, 10);
    return items.filter((item) => `${item.label} ${item.description} ${item.keywords || ""} ${item.heading}`.toLocaleLowerCase("ro").includes(needle)).slice(0, 16);
  }, [query]);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { /* UI preference is optional */ }
    const root = document.documentElement;
    root.dataset.acc = preferences.accent;
    root.dataset.dock = preferences.dock;
    root.dataset.labels = preferences.labels ? "always" : "hover";
    root.dataset.motion = preferences.motion ? "full" : "reduced";
    return () => {
      delete root.dataset.acc;
      delete root.dataset.dock;
      delete root.dataset.labels;
      delete root.dataset.motion;
    };
  }, [preferences]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") { setSearchOpen(false); setSheetOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const updatePreference = (patch: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...patch }));
  const moveItem = (index: number, direction: -1 | 1) => {
    const next = [...orderedPrimary];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    updatePreference({ order: next.map((item) => item.id) });
  };
  const json = config ? JSON.stringify({ format: "oracol-cenusii-config", version: 1, server: { id: guildId, name: activeGuild?.name }, exportedAt: new Date().toISOString(), config }, null, 2) : "";
  const copyConfig = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setActionStatus({ kind: "success", text: "Snapshot-ul serverului selectat a fost copiat." });
    } catch {
      setActionStatus({ kind: "error", text: "Clipboard-ul nu este disponibil în acest browser." });
    }
  };
  const downloadConfig = () => {
    if (!json || !guildId) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `oracol-${guildId}-config.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openImport = () => {
    setImportText("");
    setOperationPreview(null);
    setActionStatus(null);
    setActionDialog("import");
  };
  const openCopy = () => {
    setOperationPreview(null);
    setActionStatus(null);
    setCopySourceGuildId(guilds.find((guild) => guild.id !== guildId)?.id ?? null);
    setActionDialog("copy");
  };
  const openReset = () => {
    setOperationPreview(null);
    setActionStatus(null);
    setResetTargetGuildId(guildId);
    setActionDialog("reset");
  };
  const previewImport = () => {
    setActionStatus(null);
    setOperationPreview(null);
    try {
      if (!guildId || !config) throw new Error("Setările serverului țintă nu sunt încărcate.");
      const importedConfig = parseCanonicalConfig(importText, Object.keys(config as ConfigRecord));
      const changedKeys = changedTopLevelSections(config as ConfigRecord, importedConfig);
      setOperationPreview({
        kind: "import",
        targetGuildId: guildId,
        targetGuildName: activeGuild?.name || guildId,
        importedConfig,
        changedKeys,
      });
      setActionStatus({ kind: "info", text: changedKeys.length ? `Previzualizare pregătită pentru ${activeGuild?.name || "serverul selectat"}. Confirmă explicit aplicarea.` : "Nu au fost găsite secțiuni diferite. Nu există modificări de aplicat." });
    } catch (error) {
      setActionStatus({ kind: "error", text: error instanceof Error ? error.message : "Configurația nu a putut fi previzualizată." });
    }
  };
  const previewCopy = () => {
    setActionStatus(null);
    setOperationPreview(null);
    try {
      if (!guildId || !config) throw new Error("Setările serverului țintă nu sunt încărcate.");
      if (!copySourceGuildId || copySourceGuildId === guildId) throw new Error("Alege un alt server autorizat ca sursă.");
      if (!copySourceConfig) throw new Error("Setările serverului sursă nu sunt disponibile.");
      const targetConfig = config as ConfigRecord;
      const sourceConfig = copySourceConfig as ConfigRecord;
      const sourceGuild = guilds.find((guild) => guild.id === copySourceGuildId);
      if (!sourceGuild) throw new Error("Serverul sursă nu mai este autorizat în sesiunea curentă.");
      const targetKeys = Object.keys(targetConfig);
      const unknownKeys = Object.keys(sourceConfig).filter((key) => !targetKeys.includes(key));
      if (unknownKeys.length) throw new Error(`Serverul sursă conține secțiuni necunoscute pentru țintă: ${unknownKeys.join(", ")}.`);
      const missingKeys = targetKeys.filter((key) => !Object.hasOwn(sourceConfig, key));
      if (missingKeys.length) throw new Error(`Configurația sursă este incompletă; lipsesc secțiunile ${missingKeys.map(sectionLabel).join(", ")}.`);
      const changedKeys = changedTopLevelSections(targetConfig, sourceConfig);
      setOperationPreview({
        kind: "copy",
        targetGuildId: guildId,
        targetGuildName: activeGuild?.name || guildId,
        sourceGuildId: copySourceGuildId,
        sourceGuildName: sourceGuild?.name || copySourceGuildId,
        importedConfig: JSON.parse(JSON.stringify(sourceConfig)) as ConfigRecord,
        changedKeys,
      });
      setActionStatus({ kind: "info", text: changedKeys.length ? `Previzualizare pregătită. Numai secțiunile afișate vor fi copiate către țintă.` : "Serverele au aceleași valori. Nu există modificări de aplicat." });
    } catch (error) {
      setActionStatus({ kind: "error", text: error instanceof Error ? error.message : "Configurația sursă nu a putut fi previzualizată." });
    }
  };
  const applyPreview = async () => {
    const preview = operationPreview;
    if (!preview) return;
    if (guildId !== preview.targetGuildId) {
      setActionStatus({ kind: "error", text: "Serverul țintă s-a schimbat după previzualizare. Creează o previzualizare nouă înainte de aplicare." });
      return;
    }
    if (preview.kind === "copy" && copySourceGuildId !== preview.sourceGuildId) {
      setActionStatus({ kind: "error", text: "Serverul sursă s-a schimbat după previzualizare. Creează o previzualizare nouă înainte de aplicare." });
      return;
    }
    if (preview.kind === "copy" && (!guilds.some((guild) => guild.id === preview.sourceGuildId) || preview.sourceGuildId === guildId)) {
      setActionStatus({ kind: "error", text: "Serverul sursă nu mai este autorizat sau este acum ținta activă. Nu s-a trimis nicio modificare." });
      return;
    }
    if (!preview.changedKeys.length) return;
    setActionBusy(true);
    setActionStatus({ kind: "info", text: `Se aplică secțiunile către ${preview.targetGuildName}…` });
    try {
      await updateSection(preview.changedKeys, preview.importedConfig);
      setOperationPreview(null);
      setActionStatus({
        kind: "success",
        text: `${preview.changedKeys.length} secțiune/secțiuni aplicate cu succes către ${preview.targetGuildName}.`,
      });
    } catch (error) {
      setActionStatus({ kind: "error", text: error instanceof Error ? error.message : "Aplicarea a eșuat. Configurația nu este confirmată ca salvată." });
    } finally {
      setActionBusy(false);
    }
  };
  const applyReset = async () => {
    const targetId = resetTargetGuildId;
    const targetName = guilds.find((guild) => guild.id === targetId)?.name || targetId;
    if (!targetId || !config) {
      setActionStatus({ kind: "error", text: "Setările serverului țintă nu sunt încărcate; resetarea nu a fost trimisă." });
      return;
    }
    if (guildId !== targetId) {
      setActionStatus({ kind: "error", text: "Serverul selectat s-a schimbat. Redeschide confirmarea pentru serverul țintă corect." });
      return;
    }
    setActionBusy(true);
    setActionStatus({ kind: "info", text: "Se solicită resetarea setărilor serverului…" });
    try {
      await update({});
      setActionStatus({ kind: "success", text: `Configurația de moderare pentru ${targetName} a fost resetată la valorile implicite ale serverului.` });
    } catch (error) {
      setActionStatus({ kind: "error", text: error instanceof Error ? error.message : "Resetarea a eșuat. Configurația nu este confirmată ca resetată." });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="mod-shell dark oracle-console">
      <EmberField motionEnabled={preferences.motion} />
      <header className="oracle-top">
        <div className="oracle-top-inner">
          <Link className="oracle-brand" href="/" aria-label="Panoul Oracolului — privire generală">
            <span className="oracle-eye" aria-hidden="true"><span /></span>
            <span><b>Panoul Oracolului</b><small>Oracolul Cenușii</small></span>
          </Link>
          <div className="oracle-server-select">
            <Select value={guildId || ""} onValueChange={setGuildId}>
              <SelectTrigger aria-label="Serverul curent" data-testid="select-active-guild" className="oracle-guild-trigger">
                <span className="oracle-guild-avatar">{activeGuild?.icon ? <img src={/^https?:\/\//i.test(activeGuild.icon) ? activeGuild.icon : `https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.png?size=64`} alt="" /> : <Server aria-hidden="true" />}</span>
                <span className="oracle-guild-copy"><b>{activeGuild?.name || "Alege serverul"}</b><small>Setări separate pentru server</small></span>
                <SelectValue className="sr-only" />
              </SelectTrigger>
              <SelectContent>{guilds.map((guild) => <SelectItem key={guild.id} value={guild.id}>{guild.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="oracle-top-actions">
            <span className={`oracle-save-state ${configLoading ? "is-loading" : config ? "is-ready" : "is-error"}`} role="status" title={configError?.message} data-testid="status-config-source">
              <i /> <span>{configLoading ? "Se citesc setările" : config ? "Server selectat" : "Setări indisponibile"}</span>
              {configError && <Button variant="ghost" size="icon" className="oracle-retry" aria-label="Reîncarcă setările serverului" data-testid="button-retry-config" onClick={() => void reloadConfig()}><RefreshCw aria-hidden="true" /></Button>}
            </span>
            <Button variant="outline" size="sm" className="oracle-search-button" data-testid="button-open-search" onClick={() => setSearchOpen(true)}>
              <Search aria-hidden="true" /><span>Caută o setare</span><kbd>Ctrl K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="oracle-logout" data-testid="button-logout" aria-label="Deconectare" onClick={() => void logout()}><LogOut aria-hidden="true" /></Button>
          </div>
        </div>
      </header>

      <main className="oracle-main" id="main">
        <div className="oracle-page-view mod-page" key={`${guildId}:${navLocation}`}>
          <div className="max-w-5xl mx-auto w-full">{children}</div>
        </div>
        <footer className="oracle-footer"><span>CONSOLĂ DE MODERARE</span><span>{activePrimary.label} · {activeGuild?.name || "Server neselectat"}</span></footer>
      </main>

      <div className="oracle-dock-wrap">
        <nav className="oracle-dock" aria-label="Navigare rapidă">
          <div className="oracle-dock-items">
            {orderedPrimary.map((item, index) => {
              const Icon = item.icon;
              const active = routeIsActive(item.href, navLocation);
              return <Link href={item.href} key={item.id} aria-current={active ? "page" : undefined} title={item.label} data-testid={`dock-${item.id}`} className={`oracle-dock-item tint-${item.tint}`} style={{ "--dock-index": index } as CSSProperties}>
                <span className="oracle-dock-tile"><Icon aria-hidden="true" /></span><span className="oracle-dock-tooltip">{item.label}</span><span className="oracle-dock-label">{item.label}</span><i className="oracle-dock-dot" />
              </Link>;
            })}
          </div>
          <span className="oracle-dock-separator" aria-hidden="true" />
          <Button variant="ghost" size="icon" className="oracle-customize" aria-label="Personalizează panoul" aria-expanded={sheetOpen} data-testid="button-open-customization" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal aria-hidden="true" />
          </Button>
        </nav>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="oracle-sheet">
          <SheetHeader className="oracle-sheet-header">
            <div><SheetTitle>Personalizează panoul</SheetTitle><SheetDescription>Preferințele interfeței sunt salvate doar în acest browser.</SheetDescription></div>
          </SheetHeader>
          <div className="oracle-sheet-body">
            <h3 className="oracle-setting-label">Navigare și aspect</h3>
            <div className="oracle-pref-row"><div><b>Dock vertical</b><small>Mută navigarea în partea stângă pe ecrane mari.</small></div><Switch checked={preferences.dock === "left"} onCheckedChange={(checked) => updatePreference({ dock: checked ? "left" : "bottom" })} aria-label="Dock vertical" data-testid="switch-dock-position" /></div>
            <div className="oracle-pref-row"><div><b>Etichete mereu vizibile</b><small>Afișează numele tuturor modulelor sub pictograme.</small></div><Switch checked={preferences.labels} onCheckedChange={(labels) => updatePreference({ labels })} aria-label="Etichete mereu vizibile" data-testid="switch-dock-labels" /></div>
            <div className="oracle-pref-row"><div><b>Mișcare și animații</b><small>Respectă și setarea reduced motion a sistemului.</small></div><Switch checked={preferences.motion} onCheckedChange={(motion) => updatePreference({ motion })} aria-label="Mișcare și animații" data-testid="switch-motion" /></div>
            <div className="oracle-pref-row oracle-accent-row"><div><b>Culoare de accent</b><small>Aplicată exclusiv interfeței, nu configurării botului.</small></div><div className="oracle-swatches" role="radiogroup" aria-label="Culoare de accent">{accents.map((accent) => <button key={accent.id} type="button" className="oracle-swatch" style={{ "--swatch": accent.color } as CSSProperties} aria-label={accent.label} aria-checked={preferences.accent === accent.id} role="radio" data-testid={`accent-${accent.id}`} onClick={() => updatePreference({ accent: accent.id })}><span>{preferences.accent === accent.id ? <Check /> : null}</span></button>)}</div></div>
            <h3 className="oracle-setting-label">Ordinea dock-ului</h3>
            <ol className="oracle-order-list">{orderedPrimary.map((item, index) => {
              const Icon = item.icon;
              return <li key={item.id}><span className={`oracle-order-icon tint-${item.tint}`}><Icon aria-hidden="true" /></span><b>{item.label}</b><div><Button variant="outline" size="icon" aria-label={`Mută ${item.label} în sus`} data-testid={`order-up-${item.id}`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ChevronLeft className="oracle-up-icon" /></Button><Button variant="outline" size="icon" aria-label={`Mută ${item.label} în jos`} data-testid={`order-down-${item.id}`} disabled={index === orderedPrimary.length - 1} onClick={() => moveItem(index, 1)}><ChevronRight className="oracle-down-icon" /></Button></div></li>;
            })}</ol>
            <h3 className="oracle-setting-label">Instrumente de configurare</h3>
            <div className="oracle-action-grid">
              <Button variant="outline" data-testid="button-export-config" disabled={!config} onClick={() => void copyConfig()}><FileDown /> Copiază configurarea</Button>
              <Button variant="outline" data-testid="button-download-config" disabled={!config} onClick={downloadConfig}><Download /> Descarcă JSON</Button>
              <Button variant="outline" data-testid="button-import-config" disabled={actionBusy} onClick={openImport}><Upload /> Importă</Button>
              <Button variant="outline" data-testid="button-copy-server-config" disabled={actionBusy} onClick={openCopy}><Server /> Copiază de pe alt server</Button>
              <Button variant="outline" data-testid="button-reset-config" disabled={actionBusy || !guildId} onClick={openReset}><Settings2 /> Revino la implicite</Button>
            </div>
            <p className="oracle-safety-note" role="status" data-state={actionStatus?.kind || "idle"}>{actionStatus?.text || "Exportul descarcă numai snapshot-ul serverului selectat. Preferințele vizuale nu modifică setările operaționale."}</p>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="oracle-palette">
          <DialogHeader><DialogTitle className="sr-only">Caută setări și pagini</DialogTitle><DialogDescription className="sr-only">Navighează la o pagină sau categorie din consolă.</DialogDescription></DialogHeader>
          <div className="oracle-palette-input"><Search aria-hidden="true" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caută setări, module sau pagini..." aria-label="Caută setări" data-testid="input-settings-search" /><kbd>ESC</kbd></div>
          <div className="oracle-palette-results" role="listbox" aria-label="Rezultate căutare">
            {results.map((item) => {
              const Icon = item.icon;
              return <Link key={`${item.id}-${item.href}`} href={item.href} className={`oracle-palette-item tint-${item.tint}`} role="option" aria-selected={routeIsActive(item.href, navLocation)} data-testid={`search-result-${item.id}`} onClick={() => { setSearchOpen(false); setQuery(""); }}>
                <span className="oracle-result-icon"><Icon aria-hidden="true" /></span><span><b>{item.label}</b><small>{item.heading} · {item.description}</small></span><ChevronRight aria-hidden="true" />
              </Link>;
            })}
            {!results.length && <p className="oracle-search-empty">Nicio pagină găsită. Încearcă „raid”, „audit” sau „roluri”.</p>}
          </div>
          <div className="oracle-palette-foot"><span><kbd>Ctrl</kbd> + <kbd>K</kbd> caută</span><span><Command /> Navigare sigură · date live</span></div>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialog !== null} onOpenChange={(open) => { if (!open && !actionBusy) setActionDialog(null); }}>
        <DialogContent className="oracle-action-dialog">
          <DialogHeader>
            <DialogTitle>{actionDialog === "import" ? "Importă o configurare" : actionDialog === "copy" ? "Copiază de pe alt server" : "Revino la setările implicite?"}</DialogTitle>
            <DialogDescription>
              {actionDialog === "import"
                ? "Alege exportul Oracol format/version 1 sau lipește un obiect de configurare canonical. Previzualizarea nu scrie nimic până la confirmare."
                : actionDialog === "copy"
                  ? "Alege o sursă din serverele autorizate ale sesiunii. Configurația sursă este doar citită; numai secțiunile diferite se vor scrie către serverul țintă."
                  : `Se vor reseta numai configurația și modulele de moderare stocate pentru ${guilds.find((guild) => guild.id === resetTargetGuildId)?.name || "serverul selectat"} la valorile implicite ale serverului. Istoricul cazurilor/auditului și celelalte servere nu vor fi șterse sau afectate.`}
            </DialogDescription>
          </DialogHeader>
          {(actionDialog === "import" || actionDialog === "copy") && configLoading && <p className="oracle-import-status" role="status">Se citește configurația serverului țintă…</p>}
          {(actionDialog === "import" || actionDialog === "copy") && configError && <div className="oracle-action-error" role="alert"><span>{configError.message}</span><Button variant="outline" size="sm" data-testid="button-retry-target-config" onClick={() => void reloadConfig()}>Reîncearcă citirea țintei</Button></div>}
          {(actionDialog === "import" || actionDialog === "copy") && !configLoading && !configError && !config && <p className="oracle-action-error" role="alert">Configurația serverului țintă nu este disponibilă. Nu se poate previzualiza sau aplica.</p>}
          {actionDialog === "import" && <div className="oracle-import-content">
            <label className="oracle-file-input"><span>Încarcă un fișier JSON</span><Input type="file" accept="application/json,.json" aria-label="Alege un fișier JSON" data-testid="input-import-file" onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              try {
                setImportText(await file.text());
                setOperationPreview(null);
                setActionStatus({ kind: "info", text: `${file.name} încărcat. Verifică previzualizarea înainte de aplicare.` });
              } catch {
                setActionStatus({ kind: "error", text: "Fișierul JSON nu a putut fi citit." });
              }
            }} /></label>
            <Textarea value={importText} onChange={(event) => { setImportText(event.target.value); setOperationPreview(null); setActionStatus(null); }} placeholder='{"format":"oracol-cenusii-config","version":1,"config":{...}}' aria-label="JSON de importat" data-testid="textarea-import-config" />
          </div>}
          {actionDialog === "copy" && <div className="oracle-copy-content">
            <label className="oracle-file-input"><span>Server sursă (doar citire)</span>
              <Select value={copySourceGuildId || ""} onValueChange={(value) => { setCopySourceGuildId(value); setOperationPreview(null); setActionStatus(null); }}>
                <SelectTrigger aria-label="Server sursă" data-testid="select-copy-source-guild"><SelectValue placeholder="Alege un server autorizat" /></SelectTrigger>
                <SelectContent>{guilds.filter((guild) => guild.id !== guildId).map((guild) => <SelectItem key={guild.id} value={guild.id}>{guild.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {!guilds.some((guild) => guild.id !== guildId) && <p className="oracle-import-status" role="status">Sesiunea nu are un alt server autorizat disponibil ca sursă.</p>}
            {copySourceGuildId && <p className="oracle-copy-target" data-testid="text-copy-guild-pair"><span>Sursă: {guilds.find((guild) => guild.id === copySourceGuildId)?.name || copySourceGuildId}</span><span>Țintă: {activeGuild?.name || guildId}</span></p>}
            {copySourceLoading && <p className="oracle-import-status" role="status">Se citește configurația sursă…</p>}
            {copySourceError && <div className="oracle-action-error" role="alert"><span>{copySourceError.message}</span><Button variant="outline" size="sm" data-testid="button-retry-copy-source" onClick={() => void reloadCopySource()}>Reîncearcă citirea</Button></div>}
          </div>}
          {actionDialog === "reset" && resetTargetGuildId !== guildId && <p className="oracle-action-error" role="alert">Serverul activ s-a schimbat de la deschiderea confirmării. Închide și redeschide resetarea pentru ținta curentă.</p>}
          {operationPreview && operationPreview.kind === actionDialog && <section className="oracle-operation-preview" aria-label="Previzualizare secțiuni" data-testid="preview-changed-sections">
            {operationPreview.kind === "copy" && <p className="oracle-copy-target"><span>Sursă: {operationPreview.sourceGuildName}</span><span>→</span><span>Țintă: {operationPreview.targetGuildName}</span></p>}
            {operationPreview.kind === "import" && <p className="oracle-copy-target"><span>Țintă: {operationPreview.targetGuildName}</span></p>}
            <h3>Secțiuni modificate ({operationPreview.changedKeys.length})</h3>
            {operationPreview.changedKeys.length
              ? <ul>{operationPreview.changedKeys.map((key) => <li key={key}>{sectionLabel(key)}</li>)}</ul>
              : <p>Nu sunt diferențe de aplicat.</p>}
            {operationPreview.targetGuildId !== guildId && <p className="oracle-action-error" role="alert">Ținta s-a schimbat după previzualizare. Creează o previzualizare nouă.</p>}
            {operationPreview.kind === "copy" && operationPreview.sourceGuildId !== copySourceGuildId && <p className="oracle-action-error" role="alert">Sursa s-a schimbat după previzualizare. Creează o previzualizare nouă.</p>}
          </section>}
          {actionStatus && <p aria-live="polite" role={actionStatus.kind === "error" ? "alert" : "status"} className={`oracle-import-status is-${actionStatus.kind}`} data-testid="text-action-status">{actionBusy ? "Se procesează…" : actionStatus.text}</p>}
          <DialogFooter>
            <Button variant="outline" data-testid="button-close-action-dialog" disabled={actionBusy} onClick={() => setActionDialog(null)}>Închide</Button>
            {actionDialog === "import" && <Button variant="outline" data-testid="button-preview-import" onClick={previewImport} disabled={actionBusy || !importText.trim() || !config || configLoading}>Previzualizează diferențele</Button>}
            {actionDialog === "copy" && <Button variant="outline" data-testid="button-preview-copy" onClick={previewCopy} disabled={actionBusy || !copySourceGuildId || !config || configLoading || !copySourceConfig || copySourceLoading || Boolean(copySourceError)}>Previzualizează copierea</Button>}
            {operationPreview && operationPreview.kind === actionDialog && <Button data-testid="button-confirm-operation" onClick={() => void applyPreview()} disabled={actionBusy || !operationPreview.changedKeys.length || operationPreview.targetGuildId !== guildId || (operationPreview.kind === "copy" && operationPreview.sourceGuildId !== copySourceGuildId)}>
              {actionBusy ? "Se aplică…" : operationPreview.kind === "import" ? "Confirmă și aplică importul" : "Confirmă și copiază secțiunile"}
            </Button>}
            {actionDialog === "reset" && <Button variant="destructive" data-testid="button-confirm-reset" onClick={() => void applyReset()} disabled={actionBusy || configLoading || !config || !resetTargetGuildId || resetTargetGuildId !== guildId}>{actionBusy ? "Se resetează…" : "Confirmă resetarea serverului"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
