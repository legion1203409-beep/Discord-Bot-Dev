import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CircleHelp, Loader2, Save, Radio, Megaphone, ShieldCheck, RotateCcw, ChevronDown, Clock3, Folder, Hash, LockKeyhole, Settings2, Users, Wrench, Link2, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent } from "../../components/ui/tabs";
import { ImageField } from "../../components/moderation/ImageField";
import { DiscordEmojiText, EmojiField } from "../../components/moderation/EmojiField";
import { BotControlPartialApplyError, useActiveGuild, useBotControl, useInviteStats, useModerationMetadata, useSession, type BotControlConfig, type ChannelPermissionConfig, type InviteRecruitmentConfig, type InviteStatsRange } from "../../hooks/use-moderation-api";
import { clearBotControlDestinations, DESTINATION_CLEAR_CATEGORIES, type DestinationClearScope } from "../../lib/bot-control-destinations";
import { rebaseDraftChanges } from "../../lib/utils";
import { useToast } from "../../hooks/use-toast";
import { useLocation, useSearch } from "wouter";

type BotControlTab = "channels" | "roles" | "messages" | "statistics";
const BOT_CONTROL_TABS: BotControlTab[] = ["channels", "roles", "messages", "statistics"];

function recruitmentValidationErrors(config: InviteRecruitmentConfig): string[] {
  const fields: Array<{ key: keyof InviteRecruitmentConfig; label: string; min: number; max: number }> = [
    { key: "maxUses", label: "Utilizări maxime per invitație", min: 1, max: 100 },
    { key: "maxAgeDays", label: "Valabilitate invitație", min: 1, max: 30 },
    { key: "dailyInviteLimit", label: "Limită zilnică de invitații", min: 1, max: 20 },
    { key: "verificationHours", label: "Fereastră de verificare", min: 1, max: 72 },
    { key: "rewardPoints", label: "Puncte de recrutare", min: 1, max: 100_000 },
  ];
  const errors = fields.flatMap(({ key, label, min, max }) => {
    const value = config[key];
    return typeof value !== "number" || !Number.isInteger(value) || value < min || value > max
      ? [`${label}: valoarea trebuie să fie un număr întreg între ${min} și ${max}.`]
      : [];
  });
  if (config.enabled && !config.inviteChannelId) {
    errors.unshift("Alege un canal text pentru invitațiile personale.");
  }
  config.milestones.forEach((milestone, index) => {
    if (!Number.isInteger(milestone.requiredInvites) || milestone.requiredInvites < 1 || milestone.requiredInvites > 100_000) {
      errors.push(`Pragul ${index + 1}: introdu un număr întreg între 1 și 100000.`);
    }
    if (index > 0 && milestone.requiredInvites <= config.milestones[index - 1]!.requiredInvites) {
      errors.push("Pragurile trebuie să fie strict crescătoare, în ordinea afișată.");
    }
  });
  return errors;
}

const CHANNELS = [
  ["main", "Cufere"],
  ["event", "Ora Umbrelor"],
  ["boss", "Dragonul Stins"],
  ["trader", "Negustorul"],
  ["eventTop", "Top Ora Umbrelor"],
  ["bossTop", "Top Dragonul Stins"],
  ["council", "Consiliul Umbrelor"],
  ["fratia", "Chivotul Frăției"],
] as const;

const channelFields: { key: string; label: string; description: string; icon: any }[] = [
  { key: 'main', label: 'Cufere', description: 'Cufere, recompense și chei', icon: Radio },
  { key: 'event', label: 'Ora Umbrelor', description: 'Anunțuri și rezultate pentru eveniment', icon: Clock3 },
  { key: 'boss', label: 'Dragonul Stins', description: 'Lupte, damage și clasament de boss', icon: ShieldCheck },
  { key: 'trader', label: 'Negustorul', description: 'Oferte și rotația comerciantului', icon: Settings2 },
  { key: 'eventTop', label: 'Top Ora Umbrelor', description: 'Clasamentul ultimului eveniment', icon: Activity },
  { key: 'bossTop', label: 'Top Dragonul Stins', description: 'Clasamentul permanent de boss', icon: Activity },
  { key: 'council', label: 'Consiliul Umbrelor', description: 'Comenzi administrative și audit', icon: LockKeyhole },
  { key: 'fratia', label: 'Chivotul Frăției', description: 'Mesaje și alerte pentru frăție', icon: Users },
];

const PROVISIONING_CATEGORIES = [
  {
    key: "gameplay",
    label: "Joc și evenimente",
    description: "Cufere, lupte, boss, negustor și clasamente.",
    items: ["Cufere", "Ora Umbrelor", "Dragonul Stins", "Negustorul", "Clasamente"],
  },
  {
    key: "reports",
    label: "Rapoarte",
    description: "Canal separat pentru raportul zilnic, vizibil tuturor și doar cu scrierea botului.",
    items: ["Categorie Rapoarte", "#statistici-zilnice"],
  },
  {
    key: "admin",
    label: "Administrator",
    description: "Consiliu, Frăție, audit și categoriile de tichete.",
    items: ["Consiliul Umbrelor", "Chivotul Frăției", "Tichete", "Audit"],
  },
  {
    key: "filtered",
    label: "Mesaje filtrate",
    description: "Jurnale pentru anti-spam și moderarea AI.",
    items: ["Jurnal anti-spam", "Jurnal moderare AI"],
  },
  {
    key: "links",
    label: "Linkuri",
    description: "Categorie pregătită pentru canalele de filtrare linkuri.",
    items: ["Categorie Linkuri"],
  },
  {
    key: "security",
    label: "Securitate",
    description: "Alerte anti-raid și comportament suspect.",
    items: ["Alerte anti-raid", "Alerte comportament suspect"],
  },
  {
    key: "verification",
    label: "Verificare",
    description: "Canalul pentru verificarea membrilor.",
    items: ["Canal verificare"],
  },
] as const;

const DEFAULT_CHANNEL_PERMISSION: ChannelPermissionConfig = {
  roleIds: [],
  readMessageHistory: true,
  sendMessages: true,
};

function defaultProvisioningPermission(categoryKey: string, guildId?: string): ChannelPermissionConfig {
  if (categoryKey === "reports" && guildId) {
    return {
      roleIds: [guildId],
      readMessageHistory: true,
      sendMessages: false,
      rolePermissions: {
        [guildId]: { viewChannel: true, readMessageHistory: true, sendMessages: false },
      },
    };
  }
  return { ...DEFAULT_CHANNEL_PERMISSION, roleIds: [] };
}
const ROLE_PRESETS = [
  { key: "visitor", label: "Vizitator", match: /vizitator|visitor/i, history: true, send: false },
  { key: "member", label: "Membru", match: /membru|member/i, history: true, send: true },
  { key: "moderator", label: "Moderator", match: /moderator|moderator/i, history: true, send: true },
  { key: "administrator", label: "Administrator", match: /administrator|admin/i, history: true, send: true },
] as const;

const DEFAULT_GAMEPLAY_MESSAGES = {
  gamePaused: "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.",
  oraclePaused: "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.",
  gamePausedImageUrl: "",
  gamePausedThumbnailUrl: "",
  oraclePausedImageUrl: "",
  oraclePausedThumbnailUrl: "",
} as const;

const DEFAULT_MEMBER_MESSAGES = {
  welcomeEnabled: false,
  leaveEnabled: false,
  channelId: "",
  style: "normal",
  customStyle: "",
} as const;

const MEMBER_MESSAGE_STYLES = [
  ["medieval", "Medieval"],
  ["normal", "Normal"],
  ["fantasy", "Fantasy"],
  ["sci_fi", "Science-fiction"],
  ["humorous", "Amuzant"],
  ["custom", "Temă personalizată"],
] as const;

const DEFAULT_DAILY_STATS = {
  channelId: "",
  title: "📊 Statistici Zilnice · {guild}",
  description: "O privire asupra comunității pentru **{date}**.\n\nDatele sunt colectate de Oracolul Cenușii și sunt aceleași cu raportul de pe site.",
  color: "#D94A2B",
  footer: "Oracolul Cenușii · Community Insights",
  activityTitle: "📈 Activitate · ultimele 7 zile",
  channelsTitle: "🔥 Top 5 canale active",
  emptyChannelsText: "Încă nu există mesaje înregistrate pentru această zi.",
  imageUrl: "",
  thumbnailUrl: "",
  metricLabels: {
    messages: "💬 Mesaje",
    uniqueUsers: "👥 Utilizatori unici",
    boosts: "🚀 Boost-uri",
    joins: "🟢 Intrări",
    leaves: "🔴 Ieșiri",
    peakVoice: "🔊 Vârf vocal",
  },
} as const;


const DAILY_STATS_PREVIEW_VALUES: Record<string, string> = {
  guild: "Regatul Cenușii",
  date: "18 septembrie 2026",
  year: "2026",
  month: "09",
  day: "18",
  timestamp: "18 septembrie 2026 · 12:00",
  timestamp_relative: "în ziua raportului",
  messages: "307",
  uniqueUsers: "13",
  boosts: "0",
  joins: "5",
  leaves: "5",
  peakVoice: "4",
};

const DAILY_STATS_PREVIEW_ACTIVITY = [
  { day: "2026-09-12", messages: 48 },
  { day: "2026-09-13", messages: 83 },
  { day: "2026-09-14", messages: 61 },
  { day: "2026-09-15", messages: 119 },
  { day: "2026-09-16", messages: 94 },
  { day: "2026-09-17", messages: 176 },
  { day: "2026-09-18", messages: 307 },
];

const DAILY_STATS_PREVIEW_CHANNELS = [
  { name: "general", messages: 124 },
  { name: "strategii", messages: 83 },
  { name: "raiduri", messages: 61 },
  { name: "ajutor", messages: 22 },
  { name: "off-topic", messages: 17 },
];

const DAILY_STATS_PREVIEW_METRIC_ROWS = [
  [["messages", 307], ["uniqueUsers", 13]],
  [["boosts", 0], ["joins", 5]],
  [["leaves", 5], ["peakVoice", 4]],
] as const;

function renderDailyStatsPreviewText(template: string): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => DAILY_STATS_PREVIEW_VALUES[key] ?? match);
}

function isCategory(type: number | string): boolean {
  return String(type) === "4" || type === "GuildCategory";
}

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

export function BotControlPage({
  channelsOnly = false,
  provisioningOnly = false,
}: {
  channelsOnly?: boolean;
  provisioningOnly?: boolean;
}) {
  const [location, setLocation] = useLocation();
  const { guildId, setGuildId } = useActiveGuild();
  const {
    data,
    loading,
    error,
    update,
    provisionChannels,
    leaveServer,
    panelRecovery,
    confirmPanelReconciliation,
  } = useBotControl(guildId);
  const [inviteRange, setInviteRange] = useState<InviteStatsRange>("7");
  const {
    data: inviteStats,
    loading: inviteStatsLoading,
    syncing: inviteStatsSyncing,
    error: inviteStatsError,
    sync: syncInviteStats,
  } = useInviteStats(guildId, inviteRange);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const { session, retry: refreshSession } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [partialApplyError, setPartialApplyError] = useState<{ guildId: string; message: string } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null);
  const [leavingServer, setLeavingServer] = useState(false);
  const [provisionConfirmOpen, setProvisionConfirmOpen] = useState(false);
  const [clearCategoryDialogOpen, setClearCategoryDialogOpen] = useState(false);
  const [selectedProvisioningCategories, setSelectedProvisioningCategories] = useState<string[]>(
    PROVISIONING_CATEGORIES.map((category) => category.key),
  );
  const [provisioningPermissions, setProvisioningPermissions] = useState<Record<string, ChannelPermissionConfig>>({});
  const searchString = useSearch();
  const requestedTab = new URLSearchParams(searchString || location.split("?")[1] || "").get("tab");
  const [activeTab, setActiveTab] = useState<BotControlTab>(
    requestedTab && BOT_CONTROL_TABS.includes(requestedTab as BotControlTab)
      ? requestedTab as BotControlTab
      : "roles",
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>("gameplay");
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
      const nextDraft = JSON.parse(JSON.stringify(data)) as BotControlConfig;
      const retainedPanelId = panelRecovery?.panelMessageId;
      if (retainedPanelId) nextDraft.verification.panelMessageId = retainedPanelId;
      setDraft(nextDraft);
      setProvisioningPermissions(JSON.parse(JSON.stringify(data.provisioningPermissions ?? {})));
    }
  }, [data, guildId, panelRecovery]);

  useEffect(() => {
    if (!channelsOnly && !provisioningOnly && requestedTab === "channels") {
      setLocation("/canale");
      return;
    }
    if (requestedTab === "verification") {
      setLocation("/verificare");
      return;
    }
    if (requestedTab === "tickets") {
      setLocation("/tichete");
      return;
    }
    if (requestedTab && BOT_CONTROL_TABS.includes(requestedTab as BotControlTab)) {
      setActiveTab(requestedTab as BotControlTab);
    }
  }, [channelsOnly, provisioningOnly, requestedTab, setLocation]);

  const currentDraft = initializedGuild.current === guildId && data ? draft : null;
  const hasUnsavedChanges = Boolean(
    data && currentDraft && (
      JSON.stringify(currentDraft) !== JSON.stringify(data) ||
      JSON.stringify(provisioningPermissions) !== JSON.stringify(data.provisioningPermissions ?? {})
    ),
  );
  const recruitmentErrors = currentDraft
    ? recruitmentValidationErrors(currentDraft.inviteTracking.recruitment)
    : [];

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      channels: { ...current.channels, [key]: value === "__none__" ? "" : value },
    } : current);
  };

  const setProvisioningPermission = (
    categoryKey: string,
    change: Partial<ChannelPermissionConfig>,
  ) => {
    setProvisioningPermissions((current) => ({
      ...current,
      [categoryKey]: {
        ...(current[categoryKey] ?? defaultProvisioningPermission(categoryKey, metadata?.guild.id)),
        ...change,
      },
    }));
  };

  const toggleProvisioningRole = (categoryKey: string, roleId: string, checked: boolean) => {
    const current = provisioningPermissions[categoryKey] ?? defaultProvisioningPermission(categoryKey, metadata?.guild.id);
    const roleIds = checked
      ? Array.from(new Set([...current.roleIds, roleId]))
      : current.roleIds.filter((id) => id !== roleId);
    const rolePermissions = { ...(current.rolePermissions ?? {}) };
    if (checked) {
      rolePermissions[roleId] ??= {
        viewChannel: true,
        readMessageHistory: current.readMessageHistory,
        sendMessages: current.sendMessages,
      };
    } else {
      delete rolePermissions[roleId];
    }
    setProvisioningPermission(categoryKey, { roleIds, rolePermissions });
  };

  const applyRolePreset = (categoryKey: string, presetKey: string) => {
    const preset = ROLE_PRESETS.find((candidate) => candidate.key === presetKey);
    if (!preset || !metadata) return;
    const role = preset.key === "visitor"
      ? metadata.roles.find((candidate) => candidate.id === metadata.guild.id)
      : metadata.roles.find((candidate) => preset.match.test(candidate.name));
    if (!role) {
      toast({
        variant: "destructive",
        title: `Nu am găsit rolul pentru ${preset.label}`,
        description: "Alege un rol existent din listă sau creează-l în Discord și reîncarcă pagina.",
      });
      return;
    }
    setProvisioningPermission(categoryKey, {
      roleIds: [role.id],
      readMessageHistory: preset.history,
      sendMessages: preset.send,
      rolePermissions: {
        [role.id]: {
          viewChannel: true,
          readMessageHistory: preset.history,
          sendMessages: preset.send,
        },
      },
    });
  };

  const setGameplayMessage = (field: keyof BotControlConfig["gameplayConfig"]["messages"], value: string) => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        messages: { ...current.gameplayConfig.messages, [field]: value },
      },
    } : current);
  };

  function setMemberMessage<K extends keyof BotControlConfig["gameplayConfig"]["memberMessages"]>(
    field: K,
    value: BotControlConfig["gameplayConfig"]["memberMessages"][K],
  ) {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        memberMessages: { ...current.gameplayConfig.memberMessages, [field]: value },
      },
    } : current);
  }

  const setDailyStats = (field: keyof Omit<BotControlConfig["dailyStats"], "metricLabels">, value: string) => {
    setDraft((current) => current ? {
      ...current,
      dailyStats: { ...current.dailyStats, [field]: value },
    } : current);
  };

  const setInviteTracking = <K extends keyof BotControlConfig["inviteTracking"]>(
    field: K,
    value: BotControlConfig["inviteTracking"][K],
  ) => {
    setDraft((current) => current ? {
      ...current,
      inviteTracking: { ...current.inviteTracking, [field]: value },
    } : current);
  };

  const setInviteRecruitment = <K extends keyof InviteRecruitmentConfig>(
    field: K,
    value: InviteRecruitmentConfig[K],
  ) => {
    setDraft((current) => current ? {
      ...current,
      inviteTracking: {
        ...current.inviteTracking,
        recruitment: {
          ...current.inviteTracking.recruitment,
          [field]: value,
        },
      },
    } : current);
  };

  const setRecruitmentMilestone = (
    index: 0 | 1 | 2,
    field: "requiredInvites" | "roleId",
    value: number | string,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const milestones = [...current.inviteTracking.recruitment.milestones] as InviteRecruitmentConfig["milestones"];
      milestones[index] = {
        ...milestones[index],
        [field]: value,
      };
      return {
        ...current,
        inviteTracking: {
          ...current.inviteTracking,
          recruitment: {
            ...current.inviteTracking.recruitment,
            milestones,
          },
        },
      };
    });
  };

  const clearDestinations = (scope: DestinationClearScope) => {
    if (!currentDraft) return;
    const category = DESTINATION_CLEAR_CATEGORIES.find((entry) => entry.key === scope);
    const categoryLabel = category?.label ?? "toate destinațiile";
    const confirmationMessage = scope === "all"
      ? "Golești toate destinațiile din Control bot? Verificarea, mesajele de bun venit/plecare și urmărirea invitațiilor vor fi dezactivate până configurezi din nou destinații. Canalele și mesajele Discord nu vor fi șterse."
      : `Golești destinațiile din categoria „${categoryLabel}”? ${category?.confirmationDetails ?? ""} Canalele și mesajele Discord nu vor fi șterse.`;
    if (!window.confirm(confirmationMessage)) return;

    setDraft((current) => current ? clearBotControlDestinations(current, scope) : current);
    setClearCategoryDialogOpen(false);
    toast({
      title: scope === "all"
        ? "Destinațiile au fost golite"
        : `Destinațiile din „${categoryLabel}” au fost golite`,
      description: "Setările sunt în draft. Apasă Salvează pentru a le aplica; canalele Discord rămân neschimbate.",
    });
  };

  const clearAllDestinations = () => clearDestinations("all");

  const resetGameplayMessages = () => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        messages: { ...DEFAULT_GAMEPLAY_MESSAGES },
      },
    } : current);
  };

  const resetMemberMessages = () => {
    setDraft((current) => current ? {
      ...current,
      gameplayConfig: {
        ...current.gameplayConfig,
        memberMessages: { ...DEFAULT_MEMBER_MESSAGES },
      },
    } : current);
  };

  const save = async () => {
    if (!guildId || !currentDraft || !hasUnsavedChanges || saving || provisioning) return;
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
    const submittedPermissions = provisioningPermissions;
    const recruitmentIssues = recruitmentValidationErrors(submittedDraft.inviteTracking.recruitment);
    if (recruitmentIssues.length) {
      toast({
        variant: "destructive",
        title: "Verifică setările recrutării",
        description: recruitmentIssues[0],
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await update({
        ...submittedDraft,
        provisioningPermissions: submittedPermissions,
        channels: Object.fromEntries(
          Object.entries(submittedDraft.channels).filter(([, value]) => typeof value === "string"),
        ),
      });
      if (currentGuild.current !== submittedGuild || initializedGuild.current !== submittedGuild) return;
      setDraft((current) => rebaseDraftChanges(structuredClone(saved), submittedDraft, current));
      setProvisioningPermissions((current) => rebaseDraftChanges(
        structuredClone(saved.provisioningPermissions ?? {}), submittedPermissions, current,
      ));
      setPartialApplyError((current) => current?.guildId === submittedGuild ? null : current);
      toast(saved.discordLive
        ? {
            title: "Setările au fost salvate",
            description: "Botul este conectat. Verifică destinațiile și postările Discord; conectarea nu confirmă livrarea fiecărui mesaj.",
          }
        : {
            variant: "destructive",
            title: "Salvate, dar botul Discord este offline",
            description: "Valorile sunt persistente și vor fi încărcate când botul se reconectează.",
          });
    } catch (saveError: any) {
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
        toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
      }
    } finally {
      setSaving(false);
    }
  };

  const provision = async () => {
    if (saving || provisioning) return;
    if (hasUnsavedChanges) {
      toast({
        variant: "destructive",
        title: "Salvează sau renunță mai întâi la draft",
        description: "Configurarea canalelor reîncarcă setările persistente și nu trebuie să suprascrie modificările nesalvate.",
      });
      return;
    }
    if (selectedProvisioningCategories.length === 0) {
      toast({
        variant: "destructive",
        title: "Alege cel puțin o categorie",
        description: "Bifează categoriile pe care vrei să le creezi.",
      });
      return;
    }
    const submittedGuild = guildId;
    setProvisionConfirmOpen(false);
    setProvisioning(true);
    try {
      const permissions = Object.fromEntries(
        selectedProvisioningCategories.map((key) => [
          key,
          provisioningPermissions[key] ?? defaultProvisioningPermission(key, metadata?.guild.id),
        ]),
      );
      const saved = await provisionChannels(selectedProvisioningCategories, permissions);
      if (currentGuild.current !== submittedGuild) return;
      setDraft(JSON.parse(JSON.stringify(saved)));
      setProvisioningPermissions(structuredClone(saved.provisioningPermissions ?? {}));
      await refetchMetadata();
      const created = saved.provisioning?.created.length ?? 0;
      const reused = saved.provisioning?.reused.length ?? 0;
      const panelStatus = saved.provisioning?.verificationPanel;
      const panelNotice = panelStatus === "published"
        ? " Panoul de verificare a fost publicat în canalul său."
        : panelStatus === "disabled"
          ? " Panoul nu a fost publicat: activează verificarea și salvează setările."
          : panelStatus === "needs_role"
            ? " Panoul nu a fost publicat: configurează rolul de verificare și activează verificarea."
            : panelStatus === "failed"
              ? " Canalele au fost salvate, dar panoul de verificare nu a putut fi publicat. Verifică permisiunile și reîncearcă."
              : panelStatus === "published_not_saved"
                ? " Panoul a fost publicat, dar ID-ul mesajului nu a putut fi salvat. Reîncearcă după verificarea conexiunii."
                : "";
      toast({
        variant: panelStatus === "failed" || panelStatus === "published_not_saved" ? "destructive" : undefined,
        title: panelStatus === "failed" || panelStatus === "published_not_saved" ? "Canale create, panou incomplet" : "Canalele au fost sincronizate",
        description: `${created} create, ${reused} reutilizate pentru ${selectedProvisioningCategories.length} categorii. Configurația a fost salvată pentru acest server.${panelNotice}${selectedProvisioningCategories.includes("gameplay") ? " Cuferele vor apărea la următorul interval programat în canalul de cufere." : ""}${selectedProvisioningCategories.includes("reports") ? " Canalul raportului zilnic a fost creat sau reutilizat și salvat ca destinație separată." : ""}`,
      });
    } catch (provisionError: any) {
      if (currentGuild.current !== submittedGuild) return;
      toast({
        variant: "destructive",
        title: "Configurarea canalelor a eșuat",
        description: provisionError?.message ?? "Verifică permisiunea Manage Channels și încearcă din nou.",
      });
    } finally {
      setProvisioning(false);
    }
  };

  if ((loading || (data && initializedGuild.current !== guildId)) && !currentDraft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft || !currentDraft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  const categories = metadata?.channels.filter((channel) => isCategory(channel.type)) ?? [];
  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const dailyStatsChestChannelId = draft.channels.main ?? "";
  const dailyStatsTargetChannelId = draft.dailyStats.channelId === dailyStatsChestChannelId
    ? ""
    : draft.dailyStats.channelId;
  const memberMessageChannelId = draft?.gameplayConfig.memberMessages.channelId ?? "";
  const selectedMemberMessageChannel = textChannels.some((channel) => channel.id === memberMessageChannelId)
    ? memberMessageChannelId
    : memberMessageChannelId ? "__manual__" : "__none__";
  const permissionRoles = (metadata?.roles ?? [])
    .filter((role) => !role.managed || role.id === metadata?.guild.id)
    .sort((left, right) => (right.position ?? 0) - (left.position ?? 0));
  const recruitment = draft.inviteTracking.recruitment;
  const recruitmentRoles = permissionRoles.filter((role) => !role.managed && role.id !== metadata?.guild.id);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const confirmLeaveServer = async () => {
    const target = leaveTarget;
    if (!target || !session?.isBotOwner || leavingServer) return;
    setLeavingServer(true);
    try {
      const result = await leaveServer(target.id);
      setLeaveTarget(null);
      toast({
        title: "Botul a părăsit serverul",
        description: `Botul a ieșit de pe „${result.guildName}”. Configurația și datele salvate au fost păstrate.`,
      });
      if (currentGuild.current === target.id) {
        setGuildId(null);
        try {
          await refreshSession();
        } catch {
          toast({
            variant: "destructive",
            title: "Lista serverelor nu s-a putut actualiza",
            description: "Botul a părăsit serverul; reîncarcă pagina pentru a actualiza lista.",
          });
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Botul nu a putut părăsi serverul",
        description: error instanceof Error ? error.message : "Încearcă din nou.",
      });
    } finally {
      setLeavingServer(false);
    }
  };

  return (
    <div className={`bot-control-page max-w-5xl space-y-6 animate-stagger-1 ${channelsOnly ? "channels-only-page" : ""} ${provisioningOnly ? "provisioning-only-page" : ""}`}>
      <header className="bot-control-hero animate-stagger-2">
        <div>
          <div className="bot-control-brand-row">
            <span className="bot-control-brand-mark"><Bot className="h-4 w-4" /></span>
            <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
          </div>
          <h1 className="mod-heading text-4xl">
            {provisioningOnly ? "Canale și permisiuni" : channelsOnly ? "Canale Discord" : "Control bot"}
          </h1>
          <p>
            {provisioningOnly
              ? "Alege categoriile Discord, configurează accesul și sincronizează doar ce ai nevoie."
              : channelsOnly
                ? "Configurează destinațiile folosite de bot. Lista completă este afișată aici."
              : "Configurează roluri, tichete, mesaje și statistici pentru botul Discord."}
          </p>
        </div>
        <div className="bot-control-status" data-state={draft.discordLive === true ? "online" : "offline"}>
          <span className="bot-control-status-dot" />
          <div>
            <strong>{draft.discordLive === true ? "Bot conectat" : "Bot deconectat"}</strong>
            <small>{draft.discordLive === true ? "Setările pot fi sincronizate pe Discord" : "Salvarea rămâne disponibilă local"}</small>
          </div>
        </div>
        {session?.isBotOwner && !channelsOnly && !provisioningOnly && guildId && (
          <Button
            type="button"
            variant="destructive"
            disabled={!draft.discordLive || leavingServer}
            onClick={() => setLeaveTarget({
              id: guildId,
              name: metadata?.guild.name ?? session.guilds?.find((guild) => guild.id === guildId)?.name ?? "serverul selectat",
            })}
          >
            {leavingServer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Scoate botul din server
          </Button>
        )}
      </header>

      <Dialog open={Boolean(leaveTarget)} onOpenChange={(open) => { if (!open && !leavingServer) setLeaveTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmă ieșirea botului</DialogTitle>
            <DialogDescription>
              Botul va părăsi serverul <strong>{leaveTarget?.name}</strong>. Moderarea, jocul și celelalte funcții ale botului se vor opri acolo.
              Configurația și datele salvate pe site nu vor fi șterse.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={leavingServer} onClick={() => setLeaveTarget(null)}>
              Anulează
            </Button>
            <Button type="button" variant="destructive" disabled={leavingServer} onClick={() => void confirmLeaveServer()}>
              {leavingServer ? "Se procesează…" : "Da, scoate botul"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {draft.discordLive === false && (
        <div className="bot-control-banner animate-stagger-3" role="status">
          <AlertTriangle className="shrink-0" size={15} />
          <div>
            <strong>Modificările rămân în așteptare.</strong>{" "}
            Botul Discord nu este conectat la această instanță. Salvarea este disponibilă acum, iar setările devin active după reconectare.
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
          {!panelRecovery && partialApplyError?.guildId === guildId && (
            <p className="mt-1">Starea configurației și efectele Discord pot fi incomplete; verifică-le înainte de o nouă salvare.</p>
          )}
        </div>
      )}
      {(hasUnsavedChanges || (!channelsOnly && !provisioningOnly && activeTab === "statistics")) && (
        <div className="bot-control-toolbar">
          <div className="bot-control-toolbar-actions">
            {!channelsOnly && !provisioningOnly && activeTab === "statistics" && (
              <div className="bot-control-toolbar-stat-actions">
                <Select value={inviteRange} onValueChange={(value) => setInviteRange(value as InviteStatsRange)}>
                  <SelectTrigger className="mod-select-trigger w-36" aria-label="Perioada statisticilor invitațiilor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Ultimele 7 zile</SelectItem>
                    <SelectItem value="30">Ultimele 30 zile</SelectItem>
                    <SelectItem value="90">Ultimele 90 zile</SelectItem>
                    <SelectItem value="all">Tot istoricul</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" disabled={inviteStatsSyncing} onClick={() => {
                  void syncInviteStats().then(() => {
                    toast({ title: "Invitațiile au fost sincronizate", description: "Lista și numărul curent de utilizări au fost reîmprospătate." });
                  }).catch((syncError: any) => {
                    toast({ variant: "destructive", title: "Sincronizarea a eșuat", description: syncError?.message ?? "Verifică permisiunea Manage Server a botului." });
                  });
                }}>
                  {inviteStatsSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sincronizează
                </Button>
              </div>
            )}
            {hasUnsavedChanges && (
              <div className="bot-control-toolbar-save">
                <div className="bot-control-save-state">
                  <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
                  <span>
                    {saving
                      ? "Se salvează setările…"
                      : (panelRecovery || partialApplyError?.guildId === guildId)
                        ? "Rezultatul aplicării este parțial; verifică valorile serverului."
                        : "Ai modificări nesalvate."}
                  </span>
                </div>
                <div className="mod-save-actions">
                  <Button onClick={() => void save()} disabled={saving || panelRecovery?.requiresManualReconciliation} size="sm" className="gap-2 font-semibold tracking-wide">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Se salvează…" : "Salvează"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="animate-stagger-4">
        <Tabs
          value={channelsOnly || provisioningOnly ? "channels" : activeTab}
          className="bot-control-tabs space-y-5"
        >
          <TabsContent value="roles" className="mod-tab-content mt-0">
            <section className="surface role-presets-surface space-y-4">
              <div className="section-head">
                <div>
                  <h2 className="font-medium text-foreground">Presetări de rol</h2>
                  <p className="text-xs text-muted-foreground">Pornește cu setări uzuale, apoi ajustează permisiunile fiecărui rol pe categorii în secțiunea Canale.</p>
                </div>
              </div>
              <div className="role-presets-grid">
                {ROLE_PRESETS.map((preset) => {
                  const role = preset.key === "visitor"
                    ? metadata?.roles.find((candidate) => candidate.id === metadata.guild.id)
                    : metadata?.roles.find((candidate) => preset.match.test(candidate.name));
                  const applyPreset = () => {
                    if (!role) return;
                    setProvisioningPermissions((current) => Object.fromEntries(
                      PROVISIONING_CATEGORIES.map(({ key }) => {
                        const permission = current[key] ?? DEFAULT_CHANNEL_PERMISSION;
                        const roleIds = Array.from(new Set([...permission.roleIds, role.id]));
                        return [key, {
                          ...permission,
                          roleIds,
                          rolePermissions: {
                            ...(permission.rolePermissions ?? {}),
                            [role.id]: {
                              viewChannel: true,
                              readMessageHistory: preset.history,
                              sendMessages: preset.send,
                            },
                          },
                        }];
                      }),
                    ));
                    toast({
                      title: `Presetarea ${preset.label} a fost aplicată`,
                      description: "Setările sunt pregătite pentru toate categoriile. Apasă Salvează controlul botului, apoi sincronizează categoriile dorite.",
                    });
                  };
                  return (
                    <article className="role-preset-card" key={preset.key}>
                      <div className="role-preset-heading">
                        <span className="icon-box amber"><Users size={15} /></span>
                        <div><h3>{preset.label}</h3><p>{role ? `Rol Discord: ${preset.key === "visitor" ? "@everyone" : `@${role.name}`}` : "Rolul nu a fost găsit pe server"}</p></div>
                      </div>
                      <ul>
                        <li>Poate vedea canalele: Da</li>
                        <li>Poate vedea istoricul: {preset.history ? "Da" : "Nu"}</li>
                        <li>Poate scrie mesaje: {preset.send ? "Da" : "Nu"}</li>
                      </ul>
                      <Button type="button" variant="outline" className="w-full" disabled={!role} onClick={applyPreset}>
                        Aplică pe toate categoriile
                      </Button>
                    </article>
                  );
                })}
              </div>
              <p className="role-presets-note">Presetările modifică doar draftul până îl salvezi. Pentru a activa accesul în Discord, sincronizează apoi categoriile din fila Canale.</p>
            </section>
          </TabsContent>

         <TabsContent value="channels" className="mod-tab-content mt-0">
 <div className={`content-grid ${channelsOnly ? "content-grid--full" : ""}`}>
            <div className="left-stack">
              <section className="surface channel-list">
                <div className="section-head">
                  <div>
                    <h2 className="font-medium text-foreground">Identifică destinațiile pe Discord</h2>
                    <p className="text-xs text-muted-foreground">
                      Selectează canale din server pentru fiecare funcție a botului. „Neconfigurat” oprește rutarea botului; canalul Discord nu este șters.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 h-8 text-xs"
                      onClick={() => setClearCategoryDialogOpen(true)}
                    >
                      <Folder className="h-3 w-3" /> Golește pe categorii
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={clearAllDestinations}
                    >
                      Golește toate destinațiile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 h-8 text-xs"
                      onClick={() => void refetchMetadata()}
                    >
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
                            type="text"
                            value={current}
                            onChange={(e) => setChannel(key, e.target.value.trim())}
                            placeholder="ID canal Discord"
                            aria-label={`${label} ID`}
                          />
                          <span>{current ? `#${metadata?.channels.find(c => c.id === current)?.name ?? "Manual"}` : 'ID manual'}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="surface permissions">
                <div className="section-title">
                  <span className="icon-box amber"><ShieldCheck size={16} /></span>
                  <div>
                    <h2>Permisiuni necesare</h2>
                    <p>Verifică accesul botului înainte de configurarea canalelor pentru a evita categorii create incomplet.</p>
                  </div>
                </div>
                <div className="permission-summary">
                  <span>Manage Channels {metadata?.botCapabilities?.canManageChannels ? <em>✓ Disponibilă</em> : <b>⚠ Necesară</b>}</span>
                  <span>Manage Messages {metadata?.botCapabilities?.canManageMessages ? <em>✓ Disponibilă</em> : <b>⚠ Necesară pentru ștergerea mesajelor</b>}</span>
                  <span>Suprascrieri de acces {metadata?.botCapabilities?.canManageChannels ? <em>✓ Se aplică automat</em> : <b>⚠ Necesită Manage Channels</b>}</span>
                   <span>Mesaje și istoric <em>Configurabile în Canale și permisiuni</em></span>
                </div>
                <p className="help">
                  <CircleHelp size={13} />
                  <span>
                      <strong>Manage Permissions</strong> nu este o permisiune Discord separată. Botul folosește <strong>Manage Channels</strong> pentru a crea canalele și a aplica accesul, iar <strong>Manage Messages</strong> pentru a șterge mesajele. Vizibilitatea, trimiterea și istoricul se configurează în pagina Canale și permisiuni pentru fiecare categorie și rol.
                  </span>
                </p>
              </section>
            </div>

            <aside className="provision-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CONFIGURARE CANALE</span>
                  <h2>Alege ce pregătim</h2>
                </div>
                <span className="count-pill">
                  <strong>{selectedProvisioningCategories.length}</strong>
                  <span>/{PROVISIONING_CATEGORIES.length} selectate</span>
                </span>
              </div>
              <p>Doar categoriile selectate vor fi create. Celelalte setări rămân neschimbate.</p>
              <div
                className="provision-progress"
                role="progressbar"
                aria-label="Categorii selectate"
                aria-valuemin={0}
                aria-valuemax={PROVISIONING_CATEGORIES.length}
                aria-valuenow={selectedProvisioningCategories.length}
              >
                <span style={{ width: `${(selectedProvisioningCategories.length / PROVISIONING_CATEGORIES.length) * 100}%` }} />
              </div>
              <div className="category-list">
                {PROVISIONING_CATEGORIES.map((category) => {
                  const isSelected = selectedProvisioningCategories.includes(category.key);
                  const open = expandedCategory === category.key;
                  const permission = provisioningPermissions[category.key] ?? defaultProvisioningPermission(category.key, metadata?.guild.id);
                  return (
                    <div className={`category-row ${isSelected ? 'selected' : ''}`} key={category.key}>
                      <div className="category-top">
                        <Checkbox
                          checked={isSelected}
                          aria-label={`Selectează categoria ${category.label}`}
                          onCheckedChange={(checked) => {
                            const isChecked = checked === true;
                            setSelectedProvisioningCategories(isChecked
                              ? [...selectedProvisioningCategories, category.key]
                              : selectedProvisioningCategories.filter((k) => k !== category.key));
                            if (isChecked) setExpandedCategory(category.key);
                          }}
                        />
                        <button
                          type="button"
                          className="category-main-button"
                          aria-expanded={open && isSelected}
                          onClick={() => setExpandedCategory(open ? null : category.key)}
                        >
                          <span className="category-icon"><Folder size={16} aria-hidden="true" /></span>
                          <span className="category-copy">
                            <strong>{category.label}</strong>
                            <span className="category-meta">{category.items.length} destinații</span>
                            <small>{category.description}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`category-expand ${open && isSelected ? "is-open" : ""}`}
                          aria-label={`${open && isSelected ? "Restrânge" : "Extinde"} categoria ${category.label}`}
                          aria-expanded={open && isSelected}
                          onClick={() => setExpandedCategory(open ? null : category.key)}
                        >
                          <ChevronDown size={15} aria-hidden="true" />
                        </button>
                      </div>
                      {open && isSelected && (
                        <div className="category-details" id={`provision-category-${category.key}`}>
                          <div className="item-tags">
                            {category.items.map((item) => <span key={item}>{item}</span>)}
                          </div>

                          <div className="permission-panel">
                            <div className="permission-title">
                              <LockKeyhole size={15} />
                              <div>
                                <strong>Permisiuni pentru {category.label}</strong>
                                <p>Permisiunile de mai jos se aplică rolurilor alese; suprascrierile Discord pentru celelalte roluri sunt păstrate.</p>
                              </div>
                            </div>
                            <div className="role-grid">
                              {permissionRoles.length > 0 ? permissionRoles.map((role) => {
                                const roleAccess = permission.rolePermissions?.[role.id] ?? {
                                  viewChannel: permission.roleIds.includes(role.id),
                                  readMessageHistory: permission.readMessageHistory,
                                  sendMessages: permission.sendMessages,
                                };
                                return (
                                <div className="permission-role-row" key={role.id}>
                                  <label className="permission-check">
                                    <Checkbox
                                      checked={permission.roleIds.includes(role.id)}
                                      aria-label={`Acordă acces rolului ${role.name} la ${category.label}`}
                                      onCheckedChange={(checked) => toggleProvisioningRole(category.key, role.id, checked === true)}
                                    />
                                    <Users size={12} /> <span className="truncate">{role.id === metadata?.guild.id ? "@everyone · implicit" : `@${role.name}`}</span>
                                  </label>
                                  {permission.roleIds.includes(role.id) && (
                                    <div className="permission-role-options">
                                      <label><Checkbox aria-label={`${role.name}: poate vedea`} checked={roleAccess.viewChannel} onCheckedChange={(checked) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, viewChannel: checked === true } } })} /> Vede</label>
                                      <label><Checkbox aria-label={`${role.name}: poate vedea istoricul`} checked={roleAccess.readMessageHistory} onCheckedChange={(checked) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, readMessageHistory: checked === true } } })} /> Istoric</label>
                                      <label><Checkbox aria-label={`${role.name}: poate scrie`} checked={roleAccess.sendMessages} onCheckedChange={(checked) => setProvisioningPermission(category.key, { rolePermissions: { ...(permission.rolePermissions ?? {}), [role.id]: { ...roleAccess, sendMessages: checked === true } } })} /> Scrie</label>
                                    </div>
                                  )}
                                </div>
                                );
                              }) : (
                                <p className="text-xs text-muted-foreground col-span-2">Nu există roluri Discord disponibile.</p>
                              )}
                            </div>
                            <div className="permission-presets" aria-label={`Presetări roluri ${category.label}`}>
                              <span>Presetare rapidă</span>
                              {ROLE_PRESETS.map((preset) => (
                                <Button
                                  key={preset.key}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => applyRolePreset(category.key, preset.key)}
                                >
                                  {preset.label}
                                </Button>
                              ))}
                            </div>
                            <div className="permission-options">
                              <label>
                                <Checkbox
                                  checked={permission.readMessageHistory}
                                  onCheckedChange={(checked) => setProvisioningPermission(category.key, { readMessageHistory: checked === true })}
                                />
                                Pot vedea istoricul
                              </label>
                              <label>
                                <Checkbox
                                  checked={permission.sendMessages}
                                  onCheckedChange={(checked) => setProvisioningPermission(category.key, { sendMessages: checked === true })}
                                />
                                Pot scrie mesaje
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="panel-actions gap-2 flex-col">
                <div className="flex gap-2 w-full">
                  <Button type="button" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setSelectedProvisioningCategories(PROVISIONING_CATEGORIES.map((c) => c.key))}>Toate</Button>
                  <Button type="button" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setSelectedProvisioningCategories([])}>Niciuna</Button>
                </div>
                <Button
                  type="button"
                  variant="default"
                  className="w-full gap-2 mt-2"
                  onClick={() => {
                    if (hasUnsavedChanges) {
                      toast({
                        variant: "destructive",
                        title: "Salvează sau renunță mai întâi la draft",
                        description: "Setările nesalvate nu se aplică pe Discord.",
                      });
                      return;
                    }
                    if (selectedProvisioningCategories.length === 0) {
                      toast({
                        variant: "destructive",
                        title: "Alege cel puțin o categorie",
                        description: "Bifează categoriile pe care vrei să le sincronizezi.",
                      });
                      return;
                    }
                    setProvisionConfirmOpen(true);
                  }}
                  disabled={provisioning || metadata?.botCapabilities?.canManageChannels !== true}
                >
                  {provisioning ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
                  {provisioning ? "Se sincronizează…" : "Creează ce lipsește"}
                </Button>
              </div>
            </aside>
          </div>


          </TabsContent>

        <TabsContent value="messages" className="mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Users className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Bun venit și rămas-bun generate de AI</h2>
                <p className="text-xs text-muted-foreground">
                  AI scrie un mesaj nou pentru fiecare intrare sau plecare. În octombrie adaugă o temă veselă de Halloween, iar în decembrie și până pe 6 ianuarie o temă de Crăciun. Botul adaugă automat mențiunea Discord a membrului.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetMemberMessages}>
                <RotateCcw className="h-3.5 w-3.5" /> Implicit
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Mesaj de bun venit</span>
                  <span className="block text-xs text-muted-foreground">Generează un mesaj când intră cineva.</span>
                </span>
                <Switch
                  checked={draft.gameplayConfig.memberMessages.welcomeEnabled}
                  onCheckedChange={(checked) => setMemberMessage("welcomeEnabled", checked)}
                  aria-label="Activează mesajele de bun venit"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Mesaj la plecare</span>
                  <span className="block text-xs text-muted-foreground">Generează un rămas-bun când pleacă cineva.</span>
                </span>
                <Switch
                  checked={draft.gameplayConfig.memberMessages.leaveEnabled}
                  onCheckedChange={(checked) => setMemberMessage("leaveEnabled", checked)}
                  aria-label="Activează mesajele la plecare"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium">Canalul pentru mesaje</span>
                <Select
                  value={selectedMemberMessageChannel}
                  onValueChange={(value) => {
                    if (value !== "__manual__") {
                      setMemberMessage("channelId", value === "__none__" ? "" : value);
                    }
                  }}
                >
                  <SelectTrigger className="mod-select-trigger">
                    <SelectValue placeholder="Alege canal" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__none__">Neconfigurat</SelectItem>
                    {selectedMemberMessageChannel === "__manual__" && (
                      <SelectItem value="__manual__">Canal introdus manual ({memberMessageChannelId})</SelectItem>
                    )}
                    {textChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="numeric"
                  value={memberMessageChannelId}
                  onChange={(event) => setMemberMessage("channelId", event.target.value.trim())}
                  placeholder="ID canal Discord"
                  aria-label="ID canal bun venit și plecare"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium">Stilul AI</span>
                <Select
                  value={draft.gameplayConfig.memberMessages.style}
                  onValueChange={(value) => setMemberMessage("style", value as BotControlConfig["gameplayConfig"]["memberMessages"]["style"])}
                >
                  <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEMBER_MESSAGE_STYLES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {(draft.gameplayConfig.memberMessages.welcomeEnabled || draft.gameplayConfig.memberMessages.leaveEnabled)
              && !memberMessageChannelId && (
                <p role="alert" className="text-xs text-amber-300">
                  Alege un canal înainte să salvezi mesajele de bun venit sau plecare.
                </p>
              )}

            {draft.gameplayConfig.memberMessages.style === "custom" && (
              <label className="block space-y-2 text-sm">
                <span className="text-xs font-medium">Descrie tema personalizată</span>
                <Textarea
                  rows={3}
                  maxLength={180}
                  value={draft.gameplayConfig.memberMessages.customStyle}
                  onChange={(event) => setMemberMessage("customStyle", event.target.value)}
                  placeholder="Ex.: ton de basm românesc, cald și poetic"
                />
                <span className="text-xs text-muted-foreground">AI va păstra limba română și va genera fiecare mesaj separat.</span>
              </label>
            )}
          </section>
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Mesaje de stare</h2>
                <p className="text-xs text-muted-foreground">Acestea sunt mesajele trimise când jocul sau Oracle AI sunt oprite.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetGameplayMessages}>
                <RotateCcw className="h-3.5 w-3.5" /> Implicit
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium">Joc oprit</span>
                <EmojiField multiline rows={4} maxLength={2000} value={draft.gameplayConfig.messages.gamePaused} onChange={(value) => setGameplayMessage("gamePaused", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                <ImageField label="Imagine pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("gamePausedImageUrl", value)} />
                <ImageField label="Thumbnail pentru mesajul Joc oprit" value={draft.gameplayConfig.messages.gamePausedThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("gamePausedThumbnailUrl", value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium">Oracle AI oprit</span>
                <EmojiField multiline rows={4} maxLength={2000} value={draft.gameplayConfig.messages.oraclePaused} onChange={(value) => setGameplayMessage("oraclePaused", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
                <ImageField label="Imagine pentru mesajul Oracle oprit" value={draft.gameplayConfig.messages.oraclePausedImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("oraclePausedImageUrl", value)} />
                <ImageField label="Thumbnail pentru mesajul Oracle oprit" value={draft.gameplayConfig.messages.oraclePausedThumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setGameplayMessage("oraclePausedThumbnailUrl", value)} />
              </label>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="statistics" className="mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Link2 className="mt-1 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">Statistici pentru invitații Discord</h2>
                <p className="text-xs text-muted-foreground">
                  Urmărește intrările atribuite fiecărui cod, creatorul invitației și utilizările raportate de Discord.
                  ID-urile membrilor nu sunt păstrate în statisticile invitațiilor.
                </p>
              </div>
              <Switch
                checked={draft.inviteTracking.enabled}
                onCheckedChange={(checked) => setInviteTracking("enabled", checked)}
                aria-label="Activează colectarea statisticilor invitațiilor"
              />
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs text-muted-foreground">
              Pentru atribuire, botul are nevoie de permisiunea Discord <strong>Manage Server</strong> și de intenția
              privilegiată <strong>Server Members</strong> activată în Discord Developer Portal și în configurația botului.
              Diferențele dintre utilizările codurilor și evenimentele de intrare sunt atribuite; cazurile neconfirmate
              rămân marcate ca neatribuite.
              {metadata?.botCapabilities?.canManageGuild === false && (
                <p className="mt-2 font-medium text-destructive">Botului îi lipsește momentan permisiunea Manage Server.</p>
              )}
              {metadata?.botCapabilities?.guildMembers === false && (
                <p className="mt-2 font-medium text-destructive">Intenția Server Members nu este activă; intrările nu vor fi captate.</p>
              )}
            </div>

            <section className="space-y-5 rounded-lg border border-border/70 p-4" aria-labelledby="invite-recruitment-heading" data-testid="panel-invite-recruitment">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
                  <div>
                    <h3 id="invite-recruitment-heading" className="text-sm font-medium">Program de recrutare</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                      Creează invitații personale și acordă puncte sau roluri la pragurile stabilite.
                      Activarea recrutării este independentă de jurnalul intrărilor și de rapoartele obișnuite ale invitațiilor.
                    </p>
                  </div>
                </div>
                <label className="flex min-h-10 items-center gap-2 text-xs font-medium">
                  <Switch
                    checked={recruitment.enabled}
                    onCheckedChange={(checked) => setInviteRecruitment("enabled", checked)}
                    aria-label="Activează programul de recrutare"
                    data-testid="switch-invite-recruitment-enabled"
                  />
                  <span>{recruitment.enabled ? "Activ" : "Oprit"}</span>
                </label>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                Recompensele sunt <strong className="text-foreground">puncte de recrutare</strong>, separate de moneda, XP-ul și progresul RPG.
                Configurația este salvată împreună cu restul setărilor Control Bot; validarea serverului rămâne autoritară.
              </div>

              {recruitmentErrors.length > 0 && (
                <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200" data-testid="alert-recruitment-validation">
                  <p className="font-semibold">Corectează valorile înainte de salvare:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {recruitmentErrors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">
                  <span className="text-xs font-medium">Canal invitații personale</span>
                  <Select
                    value={recruitment.inviteChannelId || "__none__"}
                    onValueChange={(value) => setInviteRecruitment("inviteChannelId", value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="mod-select-trigger" aria-label="Canal pentru invitațiile personale" data-testid="select-recruitment-invite-channel">
                      <SelectValue placeholder="Alege un canal text" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                      <SelectItem value="__none__">Alege un canal</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="block text-xs text-muted-foreground">Invitațiile create de program vor folosi acest canal ca destinație.</span>
                </label>

                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Utilizări maxime per invitație (1–100)</span>
                  <Input
                    type="number" min={1} max={100} step={1}
                    value={Number.isFinite(recruitment.maxUses) ? recruitment.maxUses : ""}
                    onChange={(event) => setInviteRecruitment("maxUses", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    aria-label="Utilizări maxime per invitație"
                    data-testid="input-recruitment-max-uses"
                    aria-invalid={!Number.isInteger(recruitment.maxUses) || recruitment.maxUses < 1 || recruitment.maxUses > 100}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Valabilitate invitație în zile (1–30)</span>
                  <Input
                    type="number" min={1} max={30} step={1}
                    value={Number.isFinite(recruitment.maxAgeDays) ? recruitment.maxAgeDays : ""}
                    onChange={(event) => setInviteRecruitment("maxAgeDays", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    aria-label="Valabilitate invitație în zile"
                    data-testid="input-recruitment-max-age-days"
                    aria-invalid={!Number.isInteger(recruitment.maxAgeDays) || recruitment.maxAgeDays < 1 || recruitment.maxAgeDays > 30}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Limită invitații zilnice (1–20)</span>
                  <Input
                    type="number" min={1} max={20} step={1}
                    value={Number.isFinite(recruitment.dailyInviteLimit) ? recruitment.dailyInviteLimit : ""}
                    onChange={(event) => setInviteRecruitment("dailyInviteLimit", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    aria-label="Limită zilnică de invitații"
                    data-testid="input-recruitment-daily-limit"
                    aria-invalid={!Number.isInteger(recruitment.dailyInviteLimit) || recruitment.dailyInviteLimit < 1 || recruitment.dailyInviteLimit > 20}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Fereastră verificare (ore, 1–72)</span>
                  <Input
                    type="number" min={1} max={72} step={1}
                    value={Number.isFinite(recruitment.verificationHours) ? recruitment.verificationHours : ""}
                    onChange={(event) => setInviteRecruitment("verificationHours", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    aria-label="Fereastră de verificare în ore"
                    data-testid="input-recruitment-verification-hours"
                    aria-invalid={!Number.isInteger(recruitment.verificationHours) || recruitment.verificationHours < 1 || recruitment.verificationHours > 72}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Puncte per recomandare confirmată (1–100000)</span>
                  <Input
                    type="number" min={1} max={100000} step={1}
                    value={Number.isFinite(recruitment.rewardPoints) ? recruitment.rewardPoints : ""}
                    onChange={(event) => setInviteRecruitment("rewardPoints", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    aria-label="Puncte de recrutare per recomandare"
                    data-testid="input-recruitment-reward-points"
                    aria-invalid={!Number.isInteger(recruitment.rewardPoints) || recruitment.rewardPoints < 1 || recruitment.rewardPoints > 100000}
                  />
                </label>
              </div>

              <div className="space-y-3 border-t border-border/60 pt-4">
                <div>
                  <h4 className="text-sm font-medium">Praguri de recomandări</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Exact trei praguri, păstrate în ordinea de mai jos. Rolurile bonus sunt opționale.</p>
                </div>
                <div className="space-y-3">
                  {recruitment.milestones.map((milestone, index) => (
                    <div key={`recruitment-milestone-${index}`} className="grid gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-[minmax(9rem,.55fr)_minmax(12rem,1fr)]">
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-medium">Pragul {index + 1} — invitații confirmate</span>
                        <Input
                          type="number" min={1} max={100000} step={1}
                          value={Number.isFinite(milestone.requiredInvites) ? milestone.requiredInvites : ""}
                          onChange={(event) => setRecruitmentMilestone(index as 0 | 1 | 2, "requiredInvites", event.target.value === "" ? Number.NaN : Number(event.target.value))}
                          aria-label={`Pragul ${index + 1} de invitații confirmate`}
                          data-testid={`input-recruitment-milestone-${index + 1}`}
                          aria-invalid={!Number.isInteger(milestone.requiredInvites) || milestone.requiredInvites < 1 || milestone.requiredInvites > 100000 || (index > 0 && milestone.requiredInvites <= recruitment.milestones[index - 1]!.requiredInvites)}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-xs font-medium">Rol bonus (opțional)</span>
                        <Select
                          value={milestone.roleId || "__none__"}
                          onValueChange={(value) => setRecruitmentMilestone(index as 0 | 1 | 2, "roleId", value === "__none__" ? "" : value)}
                        >
                          <SelectTrigger className="mod-select-trigger" aria-label={`Rol bonus pentru pragul ${index + 1}`} data-testid={`select-recruitment-milestone-role-${index + 1}`}>
                            <SelectValue placeholder="Fără rol bonus" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                            <SelectItem value="__none__">Fără rol bonus</SelectItem>
                            {recruitmentRoles.map((role) => <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div>
                <h3 className="text-sm font-medium">Jurnal pentru fiecare intrare</h3>
                <p className="text-xs text-muted-foreground">
                  Postează cine a intrat și cine l-a invitat. Dacă Discord nu poate confirma invitația, intrarea apare ca neatribuită.
                </p>
              </div>
              <label className="block max-w-md space-y-1 text-sm">
                <span className="text-xs font-medium">Canal jurnal invitații</span>
                <Select
                  disabled={!draft.inviteTracking.enabled}
                  value={draft.inviteTracking.joinLogChannelId || "__none__"}
                  onValueChange={(value) => setInviteTracking("joinLogChannelId", value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__none__">Dezactivat</SelectItem>
                    {textChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Raport automat în Discord</h3>
                  <p className="text-xs text-muted-foreground">Publică în canal un clasament zilnic sau săptămânal.</p>
                </div>
                <Switch
                  checked={draft.inviteTracking.reportEnabled}
                  disabled={!draft.inviteTracking.enabled}
                  onCheckedChange={(checked) => setInviteTracking("reportEnabled", checked)}
                  aria-label="Activează raportul automat al invitațiilor"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Canal raport</span>
                  <Select
                    value={draft.inviteTracking.reportChannelId || "__none__"}
                    onValueChange={(value) => setInviteTracking("reportChannelId", value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                      <SelectItem value="__none__">Alege canal</SelectItem>
                      {textChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Frecvență</span>
                  <Select
                    value={draft.inviteTracking.reportFrequency}
                    onValueChange={(value) => setInviteTracking("reportFrequency", value as BotControlConfig["inviteTracking"]["reportFrequency"])}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Zilnic</SelectItem>
                      <SelectItem value="weekly">Săptămânal</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Ora raportului</span>
                  <Input
                    type="time"
                    value={draft.inviteTracking.reportTime}
                    onChange={(event) => setInviteTracking("reportTime", event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Fus orar</span>
                  <Select
                    value={draft.inviteTracking.reportTimeZone}
                    onValueChange={(value) => setInviteTracking("reportTimeZone", value as BotControlConfig["inviteTracking"]["reportTimeZone"])}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe/Bucharest">Europe/Bucharest</SelectItem>
                      <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {draft.inviteTracking.reportFrequency === "weekly" && (
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Ziua raportului săptămânal</span>
                    <Select
                      value={String(draft.inviteTracking.reportWeekday)}
                      onValueChange={(value) => setInviteTracking("reportWeekday", Number(value))}
                    >
                      <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Luni</SelectItem>
                        <SelectItem value="2">Marți</SelectItem>
                        <SelectItem value="3">Miercuri</SelectItem>
                        <SelectItem value="4">Joi</SelectItem>
                        <SelectItem value="5">Vineri</SelectItem>
                        <SelectItem value="6">Sâmbătă</SelectItem>
                        <SelectItem value="7">Duminică</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium">Linkuri afișate în raport (3–10)</span>
                  <Input
                    type="number"
                    min={3}
                    max={10}
                    step={1}
                    value={draft.inviteTracking.reportTopLimit}
                    onChange={(event) => setInviteTracking("reportTopLimit", Number(event.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Performanța linkurilor</h3>
                  <p className="text-xs text-muted-foreground">
                    Intrările atribuite sunt colectate numai după activarea urmăririi.
                  </p>
                </div>
              </div>

              {inviteStatsError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {inviteStatsError.message}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Intrări atribuite</p>
                  <p className="mt-1 text-2xl font-semibold">{(inviteStats?.totals.attributedJoins ?? 0).toLocaleString("ro-RO")}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Intrări neatribuite</p>
                  <p className="mt-1 text-2xl font-semibold">{(inviteStats?.totals.unknownJoins ?? 0).toLocaleString("ro-RO")}</p>
                </div>
              </div>

              {inviteStatsLoading ? (
                <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : inviteStats?.rows.length ? (
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Link de invitație</th>
                        <th className="px-3 py-2 font-medium">Creator</th>
                        <th className="px-3 py-2 font-medium">Intrări atribuite</th>
                        <th className="px-3 py-2 font-medium">Utilizări Discord</th>
                        <th className="px-3 py-2 font-medium">Stare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {inviteStats.rows.map((row) => (
                        <tr key={row.code}>
                          <td className="px-3 py-2">
                            <a href={row.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{row.code}</a>
                          </td>
                          <td className="px-3 py-2">{row.inviterName ?? "Necunoscut"}</td>
                          <td className="px-3 py-2">{row.attributedJoins.toLocaleString("ro-RO")}</td>
                          <td className="px-3 py-2">{row.totalDiscordUses.toLocaleString("ro-RO")}</td>
                          <td className="px-3 py-2">{row.active ? "Activ" : "Inactiv"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Nu există invitații sincronizate. Apasă „Sincronizează” pentru a încărca linkurile active din Discord.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-1 h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">Design statistici zilnice</h2>
                  <p className="text-xs text-muted-foreground">
                    Canalul ales mai jos activează publicarea automată. Aspectul vizual și mesajul se personalizează separat.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <label className="space-y-1 text-sm">
                    <span className="text-xs font-medium">Culoare accent</span>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 cursor-pointer p-1" value={draft.dailyStats.color} onChange={(event) => setDailyStats("color", event.target.value)} />
                      <Input maxLength={7} value={draft.dailyStats.color} onChange={(event) => setDailyStats("color", event.target.value)} />
                    </div>
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-medium">Canal raport zilnic</span>
                  <Select
                    value={dailyStatsTargetChannelId || "__none__"}
                    onValueChange={(value) => setDailyStats("channelId", value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger aria-label="Canal raport zilnic">
                      <SelectValue placeholder="Alege un canal dedicat" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nu publica automat</SelectItem>
                      {textChannels.filter((channel) => channel.id !== dailyStatsChestChannelId).map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="block text-xs text-muted-foreground">Alege un canal dedicat; canalul „Cufere” este rezervat jocului. Fără o alegere, raportul nu se publică automat.</span>
                </label>
                <ImageField label="Imaginea raportului zilnic" value={draft.dailyStats.imageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setDailyStats("imageUrl", value)} />
                <ImageField label="Thumbnail-ul raportului zilnic" value={draft.dailyStats.thumbnailUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setDailyStats("thumbnailUrl", value)} />
              </div>
              <div className="h-fit rounded-xl border bg-[#1E1E1E] p-3 text-[#FFFFFF] shadow-xl" style={{ borderLeftColor: draft.dailyStats.color, borderLeftWidth: 4 }}>
                <p className="mb-3 text-[10px] font-semibold tracking-[0.18em] text-[#D94A2B]">PREVIZUALIZARE EMBED</p>
                <div className="rounded-md bg-[#1E1E1E] p-3">
                  {draft.dailyStats.thumbnailUrl && <img src={draft.dailyStats.thumbnailUrl} alt="" className="float-right ml-3 h-20 w-20 rounded object-cover" />}
                  <p className="text-[10px] font-semibold tracking-wider text-[#D94A2B]">ORACOLUL CENUȘII · COMMUNITY INSIGHTS</p>
                  <h3 className="mt-2 font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.title)}</DiscordEmojiText></h3>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-[#B0B0B0]"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.description)}</DiscordEmojiText></p>
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-semibold">📊 Rezumat</p>
                    <div className="space-y-1 rounded bg-[#1E1E1E] p-2 text-xs leading-relaxed">
                      {DAILY_STATS_PREVIEW_METRIC_ROWS.map((row) => (
                        <p key={row[0][0]} className="break-words">
                          {row.map(([key, value], index) => (
                            <span key={key}>
                              {index > 0 && <span className="mx-1 text-[#B0B0B0]">·</span>}
                              <DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.metricLabels[key])}</DiscordEmojiText>{": "}
                              <strong>{value.toLocaleString("ro-RO")}</strong>
                            </span>
                          ))}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.activityTitle)}</DiscordEmojiText></p>
                    <p className="break-words rounded bg-[#121212] p-2 text-xs leading-relaxed">
                      {DAILY_STATS_PREVIEW_ACTIVITY.map((item) => `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}: ${item.messages.toLocaleString("ro-RO")}`).join(" · ")}
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.channelsTitle)}</DiscordEmojiText></p>
                    <div className="space-y-1 text-xs">
                      {DAILY_STATS_PREVIEW_CHANNELS.map((channel, index) => (
                        <p key={channel.name}>
                          {index + 1}. <strong>#{channel.name}</strong> · {channel.messages.toLocaleString("ro-RO")} mesaje
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 rounded bg-[#121212] p-2 text-xs">
                    <p className="mb-1 font-semibold">Previzualizare fără canale active</p>
                    <p className="whitespace-pre-wrap text-[#B0B0B0]">
                      <DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.emptyChannelsText)}</DiscordEmojiText>
                    </p>
                  </div>
                  {draft.dailyStats.imageUrl && <img src={draft.dailyStats.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded object-contain" />}
                  <p className="mt-4 border-t border-white/10 pt-3 text-[10px] text-[#B0B0B0]">
                    <DiscordEmojiText emojis={metadata?.emojis}>{renderDailyStatsPreviewText(draft.dailyStats.footer)}</DiscordEmojiText>
                    <span className="ml-2 text-[#B0B0B0]">18 septembrie 2026</span>
                  </p>
                </div>
              </div>
            </div>
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
              <article
                key={category.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{category.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => clearDestinations(category.key)}
                >
                  Golește
                </Button>
              </article>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearCategoryDialogOpen(false)}>
              Închide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={provisionConfirmOpen} onOpenChange={setProvisionConfirmOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmă sincronizarea cu Discord</DialogTitle>
            <DialogDescription>
              Verifică categoriile și accesul înainte de a modifica serverul. Vor fi create canalele lipsă, iar permisiunile de acces gestionate aici vor fi actualizate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PROVISIONING_CATEGORIES
              .filter((category) => selectedProvisioningCategories.includes(category.key))
              .map((category) => {
                const permission = provisioningPermissions[category.key] ?? defaultProvisioningPermission(category.key, metadata?.guild.id);
                const allowedRoles = permission.roleIds
                  .map((roleId) => metadata?.roles.find((role) => role.id === roleId))
                  .filter((role): role is NonNullable<typeof role> => Boolean(role));
                return (
                  <article key={category.key} className="rounded-lg border border-border bg-muted/20 p-3">
                    <h3 className="text-sm font-medium">{category.label}</h3>
                    {allowedRoles.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {allowedRoles.map((role) => {
                          const access = permission.rolePermissions?.[role.id] ?? {
                            viewChannel: true,
                            readMessageHistory: permission.readMessageHistory,
                            sendMessages: permission.sendMessages,
                          };
                          const roleLabel = role.id === metadata?.guild.id ? "@everyone" : `@${role.name}`;
                          return (
                            <li key={role.id}>
                              {roleLabel}: vede {access.viewChannel ? "Da" : "Nu"} · istoric {access.readMessageHistory ? "Da" : "Nu"} · scrie {access.sendMessages ? "Da" : "Nu"}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Niciun rol suplimentar selectat. Regulile Discord existente pentru celelalte roluri rămân neschimbate.
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {category.items.join(" · ")}
                    </p>
                  </article>
                );
              })}
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-muted-foreground">
              Suprascrierile pentru roluri care nu sunt gestionate de aceste setări rămân neschimbate. La eliminarea unui rol din configurație se șterg doar regulile de vizualizare, istoric și scriere create de acest panou.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProvisionConfirmOpen(false)}>
              Înapoi
            </Button>
            <Button type="button" onClick={() => void provision()} disabled={provisioning}>
              {provisioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
              Aplică și sincronizează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
