import React from "react";
import { Check, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { activityLogDraftError } from "../../lib/activity-log-validation";
import {
  CAPS_LIMIT, DELETE_SPAM, EDIT_SPAM, EMOJI_LIMIT, FLOOD_LENGTH, FLOOD_RUN, groupThresholdFields, MENTION_LIMIT, MESSAGE_SPAM,
  RAID_LIMIT, REPEAT_LIMIT, SUSPICIOUS_LIMIT, type Threshold,
} from "../../lib/anti-spam-validation";
import { embedUrlDraftError, isPublicGifUrl, isPublicHttpsUrl } from "../../lib/embed-url-validation";
import { MANUAL_COMMAND_GROUPS_WITH_COMMANDS } from "../../lib/manual-command-catalog";
import { aiCategoryActions, inheritsAiCategoryActions, setAiCategoryActions } from "../../lib/automod-actions";
import { ModerationActionPicker } from "../../components/moderation/ModerationActionPicker";

type Config = Record<string, any>;
type Path = Array<string | number>;
export type ConfigSection = "automod" | "anti-raid" | "anti-spam" | "anti-flood" | "suspicious" | "ai" | "tools" | "cases-audit" | "roles-channels" | "time" | "escalation" | "embeds" | "permissions";
const VisibleSections = React.createContext<ReadonlySet<string> | null>(null);
type DiscordRoleOption = { id: string; name: string; managed?: boolean };
type DiscordChannelOption = { id: string; name: string; type: number | string; parentId?: string | null };
type ActivityLogCapabilities = {
  online?: boolean;
  canManageChannels?: boolean;
  canManageRoles?: boolean;
};

const ACTIONS = [
  ["none", "Nicio acțiune"],
  ["warn", "Avertisment"],
  ["mute", "Restricționează (mute)"],
  ["kick", "Elimină (kick)"],
  ["ban", "Blochează (ban)"],
  ["delete", "Șterge mesajul"],
] as const;
const SUSPICIOUS_ACTIONS = ACTIONS.filter(([action]) => action !== "delete");
const SCAM_ACTIONS = [
  ["delete", "Șterge doar mesajul"],
  ["mute", "Șterge + timeout 10 minute"],
  ["kick", "Șterge + elimină membrul (kick)"],
] as const;
const SEVERITIES = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]] as const;
const SENSITIVITIES = [["low", "Scăzută"], ["medium", "Medie"], ["high", "Ridicată"]] as const;
const AI_CATEGORIES = [
  ["toxicity", "Toxicitate", "Limbaj ostil sau abuziv"],
  ["profanity", "Limbaj vulgar", "Înjurături îndreptate către alte persoane"],
  ["attacks", "Atacuri", "Insulte și atacuri personale"],
  ["bullying", "Hărțuire", "Umilirea sau hărțuirea țintită"],
  ["intelligentSpam", "Spam inteligent", "Promovare nedorită mascată în conversație"],
  ["trolling", "Trolling", "Provocări intenționate și dăunătoare"],
  ["scams", "Fraude", "Oferte înșelătoare și furt de bani sau conturi"],
  ["threats", "Amenințări", "Amenințări credibile îndreptate către persoane"],
  ["deceptiveLinks", "Linkuri înșelătoare", "Phishing și linkuri care imită servicii legitime"],
] as const;
const LINK_CATEGORIES = [
  ["discordInvite", "Invitații Discord", "discord.gg și discord.com/invite"],
  ["social", "Rețele sociale", "Facebook, Instagram, TikTok, X, Reddit"],
  ["video", "Video și streaming", "YouTube, Twitch, Kick"],
  ["shortener", "Linkuri scurtate", "bit.ly, tinyurl.com, t.co"],
  ["all", "Toate linkurile", "Orice URL http(s) sau www și invitații Discord"],
] as const;
const MEMBER_LOG_PREVIEW_VALUES = {
  join: {
    member: "@Adina",
    member_name: "Adina pe server",
    username: "adina",
    account_created_at: "18 mai 2021, 12:30",
    account_created_at_relative: "acum 5 ani",
    account_age: "5 ani, 4 luni",
    account_age_years: "5",
    account_age_days: "1.950",
    server_joined_at: "5 octombrie 2026, 14:00",
    server_joined_at_relative: "acum 2 ore",
    server_left_at: "încă pe server",
    server_left_at_relative: "încă pe server",
    server_duration: "în curs",
    timestamp: "5 octombrie 2026, 14:00",
    timestamp_relative: "acum 2 ore",
  },
  leave: {
    member: "@Adina",
    member_name: "Adina pe server",
    username: "adina",
    account_created_at: "18 mai 2021, 12:30",
    account_created_at_relative: "acum 5 ani",
    account_age: "5 ani, 4 luni",
    account_age_years: "5",
    account_age_days: "1.950",
    server_joined_at: "24 septembrie 2026, 11:00",
    server_joined_at_relative: "acum 11 zile",
    server_left_at: "5 octombrie 2026, 14:00",
    server_left_at_relative: "acum 2 ore",
    server_duration: "11 zile, 3 ore",
    timestamp: "5 octombrie 2026, 14:00",
    timestamp_relative: "acum 2 ore",
  },
} satisfies Record<"join" | "leave", Record<string, string>>;
export function renderMemberLogPreview(template: string, kind: "join" | "leave", fallback: string): string {
  const source = template.trim() ? template : fallback;
  const values: Record<string, string> = MEMBER_LOG_PREVIEW_VALUES[kind];
  return source.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) =>
    values[key.toLocaleLowerCase()] ?? match,
  );
}

function renderModerationTemplatePreview(template: string, action: string, reason: string): string {
  const values: Record<string, string> = {
    action,
    reason,
    guild: "Regatul Cenușii",
    timestamp: "5 octombrie 2026, 14:00",
    timestamp_relative: "acum",
    time: "5 octombrie 2026, 14:00",
    time_relative: "acum",
    member: "@Adina",
    member_mention: "@Adina",
    member_name: "Adina",
    username: "adina",
    member_id: "123456789012345678",
    moderator: "@Moderator",
    moderator_name: "Moderator",
    moderator_id: "234567890123456789",
    channel: "#general",
    channel_name: "general",
    channel_id: "345678901234567890",
    duration: "10 minute",
  };
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key.toLocaleLowerCase()] ?? match);
}

/** Immutable nested update used by every control, including numeric thresholds. */
export function updateConfigField<T extends Config>(config: T, path: Path, value: unknown): T {
  const copy = Array.isArray(config) ? [...config] : { ...config };
  let target: any = copy;
  let source: any = config;
  path.slice(0, -1).forEach((part, index) => {
    const nextPart = path[index + 1];
    const existing = source?.[part];
    const next = Array.isArray(existing) ? [...existing] : { ...(existing ?? (typeof nextPart === "number" ? [] : {})) };
    target[part] = next;
    target = next;
    source = existing;
  });
  target[path[path.length - 1]] = value;
  return copy as T;
}

function removeConfigField<T extends Config>(config: T, path: Path): T {
  const copy = updateConfigField(config, path.slice(0, -1), { ...(path.length > 1 ? getValue(config, path.slice(0, -1)) : config) });
  let target: any = copy;
  path.slice(0, -1).forEach((part) => { target = target[part]; });
  delete target[path[path.length - 1]];
  return copy;
}

function getValue(config: Config, path: Path): any {
  return path.reduce((value, key) => value?.[key], config);
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {help && <span className="block text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}

function Toggle({ label, help, checked, onChange, disabled = false, testId }: {
  label: string; help?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      <Switch aria-label={label} data-testid={testId} checked={Boolean(checked)} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function TextField({ label, help, value, onChange, placeholder, type = "text", disabled = false }: {
  label: string; help?: string; value: string | null | undefined; onChange: (value: string) => void;
  placeholder?: string; type?: React.HTMLInputTypeAttribute; disabled?: boolean;
}) {
  return <Field label={label} help={help}><Input type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function NumberField({ label, help, value, onChange, min, max, valuesToValidate }: {
  label: string; help?: string; value: number | undefined; onChange: (value: number | undefined) => void;
  min?: number; max?: number; valuesToValidate?: Array<number | undefined>;
}) {
  const values = valuesToValidate ?? [value];
  const invalid = values.some((candidate) => candidate !== undefined && (
    !Number.isFinite(candidate)
    || !Number.isInteger(candidate)
    || (min !== undefined && candidate < min)
    || (max !== undefined && candidate > max)
  ));
  return (
    <Field label={label} help={help}>
      <Input type="number" min={min} max={max} step={1} aria-invalid={invalid}
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }} />
      {invalid && (
        <span className="block text-xs text-destructive" role="alert">
          Introdu un număr întreg între {min ?? "valoarea minimă"} și {max ?? "valoarea maximă"}.
        </span>
      )}
    </Field>
  );
}

function Choice({ label, help, value, options, onChange, testId }: {
  label: string; help?: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; testId?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
}

const MESSAGE_CHANNEL_TYPES = new Set([
  "0", "5", "10", "11", "12", "15", "16",
  "GuildText", "GuildAnnouncement", "AnnouncementThread", "PublicThread", "PrivateThread", "GuildForum", "GuildMedia",
]);

function ChannelScopeSelector({ channels, selectedChannelIds, onChange }: {
  channels?: DiscordChannelOption[];
  selectedChannelIds: string[];
  onChange: (channelIds: string[]) => void;
}) {
  const messageChannels = (channels ?? [])
    .filter((channel) => MESSAGE_CHANNEL_TYPES.has(String(channel.type)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selected = new Set(selectedChannelIds);
  const allChannelsSelected = selected.size === 0;
  const unavailableSelections = selectedChannelIds.filter((id) =>
    !messageChannels.some((channel) => channel.id === id),
  );

  return (
    <fieldset className="space-y-3 rounded-2xl border border-border/80 bg-card/60 p-4 shadow-sm">
      <legend className="px-1 text-sm font-semibold">Canalele pentru blocarea linkurilor</legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Fără canale selectate, blocarea se aplică peste tot. Bifează unul sau mai multe canale pentru a o limita.
      </p>
      <button
        type="button"
        aria-pressed={allChannelsSelected}
        onClick={() => onChange([])}
        className={`ui-feedback group flex min-h-[68px] w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] ${
          allChannelsSelected
            ? "border-primary/45 bg-gradient-to-r from-primary/15 via-primary/10 to-background text-foreground shadow-md shadow-primary/10"
            : "border-border/80 bg-background/75 text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/5 hover:shadow-md"
        }`}
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-200 ${
          allChannelsSelected
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        }`}>
          <Globe className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Toate canalele</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {allChannelsSelected ? "Fără restricții de canal" : "Resetează selecția la întregul server"}
          </span>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
          allChannelsSelected
            ? "border-primary/25 bg-primary/10 text-primary"
            : "border-border bg-background/80 text-muted-foreground group-hover:border-primary/25 group-hover:text-primary"
        }`}>
          {allChannelsSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          {allChannelsSelected ? "Implicit" : "Resetează"}
        </span>
      </button>
      {messageChannels.length > 0 ? (
        <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-border/70 bg-background/45 p-2 sm:grid-cols-2 lg:grid-cols-3">
          {messageChannels.map((channel) => {
            const channelSelected = selected.has(channel.id);
            return (
            <label
              key={channel.id}
              className={`group flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150 ${
                channelSelected
                  ? "border-primary/35 bg-primary/8 text-foreground shadow-sm shadow-primary/5"
                  : "border-transparent bg-card/65 text-muted-foreground hover:-translate-y-px hover:border-border hover:bg-card hover:text-foreground hover:shadow-sm"
              }`}
            >
              <input
                type="checkbox"
                checked={channelSelected}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...new Set([...selectedChannelIds, channel.id])]
                    : selectedChannelIds.filter((id) => id !== channel.id);
                  onChange(next);
                }}
                className="h-4 w-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <span className="min-w-0 flex-1 truncate font-medium">#{channel.name}</span>
              {channelSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </label>
          )})}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          {channels === undefined
            ? "Lista canalelor Discord nu este disponibilă momentan."
            : "Nu au fost găsite canale care acceptă mesaje."}
        </p>
      )}
      {unavailableSelections.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">
          {unavailableSelections.length} canal(e) salvate nu apar în lista disponibilă; selecția se păstrează până o modifici.
        </p>
      )}
    </fieldset>
  );
}

function IdField({ label, help, value, onChange, role = false }: {
  label: string; help?: string; value: string | null; onChange: (value: string | null) => void; role?: boolean;
}) {
  return <TextField label={label} help={help ?? `ID ${role ? "rol" : "canal"} Discord (Developer Mode); lasă gol pentru neconfigurat.`} value={value} placeholder="123456789012345678" onChange={(next) => onChange(next.trim() || null)} />;
}

function UrlField({ label, help, value, onChange, placeholder }: {
  label: string; help: string; value: string | null; onChange: (value: string | null) => void; placeholder: string;
}) {
  return <TextField label={label} help={help} value={value} placeholder={placeholder} onChange={(next) => onChange(next.trim() || null)} />;
}

function ListField({ label, help, values, onChange, ids = false, testId }: {
  label: string; help: string; values: string[]; onChange: (value: string[]) => void; ids?: boolean; testId?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Textarea
        value={(values ?? []).join("\n")}
        data-testid={testId}
        placeholder={ids ? "123456789012345678\n987654321098765432" : "Un element pe fiecare rând"}
        onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}
      />
    </Field>
  );
}

type RuleProps = { title: string; help?: string; rule: any; thresholds: Threshold[]; actions?: readonly (readonly [string, string])[]; showAction?: boolean; combineDeletion?: boolean; collapsible?: boolean; onChange: (path: string[], value: any) => void };

function RuleEditor({ title, help, rule, thresholds, actions = ACTIONS, showAction = true, combineDeletion = false, collapsible = false, onChange }: RuleProps) {
  const thresholdFields = groupThresholdFields(thresholds);
  const controls = (
    <>
      <div className={`grid gap-3 ${showAction && !combineDeletion ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <Toggle label="Regulă activă" checked={rule.enabled} onChange={(value) => onChange(["enabled"], value)} />
        {showAction && !combineDeletion && (
          <Choice label="Acțiune" value={rule.action} options={rule.action === "delete" && !actions.some(([key]) => key === "delete")
            ? [...actions, ["delete", "Șterge mesajul (indisponibil)"] as const] : actions}
            onChange={(value) => onChange(["action"], value)} />
        )}
        <Choice label="Severitate" value={rule.severity} options={SEVERITIES} onChange={(value) => onChange(["severity"], value)} />
      </div>
      {combineDeletion && (
        <ModerationActionPicker label={`Acțiuni — ${title}`} value={rule}
          testId={`actions-${title}`}
          onChange={(next) => onChange([], { ...rule, ...next })} />
      )}
      {thresholds.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {thresholdFields.map((threshold) => (
            <NumberField
              key={threshold.key}
              label={threshold.label}
              help={threshold.help}
              value={rule.thresholds?.[threshold.key] ?? threshold.groupKeys
                .map((key) => rule.thresholds?.[key])
                .find((value) => value !== undefined)}
              valuesToValidate={threshold.groupKeys.map((key) => rule.thresholds?.[key])}
              min={threshold.min}
              max={threshold.max}
              onChange={(value) => {
                const nextThresholds = { ...(rule.thresholds ?? {}) };
                // Remove legacy aliases before writing the preferred key. Otherwise
                // the engine may read an older alias first despite a new UI value.
                for (const key of threshold.groupKeys) delete nextThresholds[key];
                if (value !== undefined) nextThresholds[threshold.key] = value;
                onChange(["thresholds"], nextThresholds);
              }}
            />
          ))}
        </div>
      )}
    </>
  );

  if (collapsible) {
    return (
      <Accordion type="single" collapsible className="space-y-0">
        <AccordionItem value={title} className="rounded-lg border border-border bg-muted/20 px-4">
          <AccordionTrigger className="gap-3 text-left hover:no-underline">
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-medium">{title}</span>
              {help && <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span>}
            </span>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              rule.enabled
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                : "border-border bg-muted text-muted-foreground"
            }`}>
              {rule.enabled ? "Activă" : "Inactivă"}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 border-t border-border pt-4">
            {controls}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div><h4 className="font-medium">{title}</h4>{help && <p className="text-xs text-muted-foreground">{help}</p>}</div>
      {controls}
    </div>
  );
}

function Section({ value, title, description, children }: { value: string; title: string; description: string; children: React.ReactNode }) {
  const visible = React.useContext(VisibleSections);
  if (visible && !visible.has(value)) return null;
  return (
    <AccordionItem value={value} className="rounded-xl border border-border bg-card px-5">
      <AccordionTrigger className="no-underline hover:no-underline">
        <span><span className="block text-base">{title}</span><span className="block pt-1 text-xs font-normal text-muted-foreground">{description}</span></span>
      </AccordionTrigger>
      <AccordionContent className="space-y-5">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function ConfigEditor({
  value,
  onChange,
  sections,
  discordRoles = [],
  discordChannels,
  botCapabilities,
  onCreateChannel,
}: {
  value: Config;
  onChange: (config: Config) => void;
  sections?: ConfigSection[];
  discordRoles?: DiscordRoleOption[];
  discordChannels?: DiscordChannelOption[];
  guildId?: string;
  botCapabilities?: ActivityLogCapabilities;
  onCreateChannel?: (destination: string) => Promise<{
    channel: { id: string; name: string };
    created: boolean;
    config?: Config;
  }>;
}) {
  const [creatingDestination, setCreatingDestination] = React.useState<string | null>(null);
  const latestValue = React.useRef(value);
  latestValue.current = value;
  const set = (path: Path, next: any) => {
    const current = latestValue.current;
    const updated = next === undefined && path.includes("thresholds")
      ? removeConfigField(current, path)
      : updateConfigField(current, path, next);
    latestValue.current = updated;
    onChange(updated);
  };
  const createDestination = async (destination: string, path: Path) => {
    if (!onCreateChannel || creatingDestination) return;
    setCreatingDestination(destination);
    try {
      const result = await onCreateChannel(destination);
      set(path, result.channel.id);
      if (destination.startsWith("activityLog.") && result.config?.activityLog?.categoryId) {
        set(["activityLog", "categoryId"], result.config.activityLog.categoryId);
      }
    } catch {
      // The page-level handler displays the API error and keeps the draft.
    } finally {
      setCreatingDestination(null);
    }
  };
  const createChannelButton = (destination: string, label: string, path: Path) => onCreateChannel ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Creează canal pentru ${label}`}
      disabled={creatingDestination !== null || botCapabilities?.online === false ||
        botCapabilities?.canManageChannels === false || botCapabilities?.canManageRoles === false}
      onClick={() => void createDestination(destination, path)}
    >
      {creatingDestination === destination
        ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Se creează</>
        : <><Plus className="mr-1 h-3.5 w-3.5" />Creează</>}
    </Button>
  ) : null;
  const selectableTextChannels = (discordChannels ?? []).filter((channel) =>
    [0, 5, "text", "announcement", "GuildText", "GuildAnnouncement", "GuildNews"].includes(channel.type),
  );
  const channelSelectorField = (currentValue: string | null, label: string, path: Path) => {
    const channelId = currentValue ?? "";
    const channelAvailable = selectableTextChannels.some((channel) => channel.id === channelId);
    const savedChannelUnavailable = Boolean(channelId) &&
      discordChannels !== undefined &&
      !channelAvailable;

    return (
      <div className="space-y-2">
        <Select
          value={channelId || "__none__"}
          onValueChange={(next) => set(path, next === "__none__" ? null : next)}
        >
          <SelectTrigger aria-label={`Canal pentru ${label}`} className="bg-background/70">
            <SelectValue placeholder="Alege un canal existent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Neconfigurat</SelectItem>
            {channelId && !channelAvailable && (
              <SelectItem value={channelId}>Canal salvat, indisponibil ({channelId})</SelectItem>
            )}
            {selectableTextChannels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={`Canal ${label} ID fallback`}
          value={channelId}
          placeholder="ID canal Discord"
          onChange={(event) => set(path, event.target.value.trim() || null)}
          className="bg-background/50 font-mono text-xs"
        />
        {savedChannelUnavailable && (
          <p role="alert" className="text-xs text-destructive">
            Canalul salvat nu este disponibil ca text în serverul selectat sau botul nu îl poate vedea.
            Alege un canal din listă ori șterge ID-ul.
          </p>
        )}
      </div>
    );
  };
  const channelDestinationField = (destination: string, label: string, currentValue: string | null, path: Path) => (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{label}</p>
        {channelSelectorField(currentValue, label, path)}
      </div>
      {createChannelButton(destination, label, path)}
    </div>
  );
  const activityChannelSelector = (key: string, label: string) => {
    return channelSelectorField(value.activityLog.channelIds[key] ?? null, label, ["activityLog", "channelIds", key]);
  };
  const rule = (base: string[]) => (path: string[], next: any) => set([...base, ...path], next);
  const floodRules = [
    value.antiFlood.longMessage,
    value.antiFlood.character,
    value.antiFlood.caps,
    value.antiFlood.symbol,
  ];
  const hasActionableFloodRule = floodRules.some((item) => item.enabled && item.action !== "none");
  const activeAntiSpamRules = [
    value.antiSpam.message,
    value.antiSpam.edit,
    value.antiSpam.delete,
    value.antiSpam.mention,
    value.antiSpam.emoji,
  ].filter((item) => item.enabled).length;
  const suspiciousRules = [
    value.suspiciousBehavior.nicknameChanges,
    value.suspiciousBehavior.roleChanges,
    value.suspiciousBehavior.massEdits,
    value.suspiciousBehavior.massDeletes,
    value.suspiciousBehavior.joinLeaveFlood,
    value.suspiciousBehavior.unusualActivity,
  ];
  const activityLogCategories = [
    ["messages", "Mesaje editate sau șterse"],
    ["members", "Intrări, ieșiri și modificări de profil"],
    ["channels", "Canale create, schimbate sau șterse"],
    ["roles", "Roluri create, schimbate, acordate sau retrase"],
    ["voice", "Activitate vocală"],
    ["moderation", "Acțiuni de moderare"],
    ["security", "Alerte de securitate și AutoMod"],
  ] as const;
  const selectedActivityCategories = activityLogCategories.filter(([key]) => value.activityLog.categories[key]);
  const configuredActivityCount = selectedActivityCategories.filter(([key]) => value.activityLog.channelIds[key]).length;
  const missingActivityPermissions = [
    botCapabilities?.online === false ? "Botul Discord este offline." : null,
    botCapabilities?.canManageChannels === false ? "Lipsește Manage Channels." : null,
    botCapabilities?.canManageRoles === false ? "Lipsește Manage Roles." : null,
  ].filter((entry): entry is string => Boolean(entry));
  return (
    <VisibleSections.Provider value={sections ? new Set(sections) : null}>
    <div className="space-y-3">
    {onCreateChannel && (
      <p className="rounded-lg border border-border bg-card/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Canalele create rămân private implicit: @everyone este blocat, iar botul păstrează accesul. Configurează rolurile care trebuie să le vadă direct în Discord; rolurile staff din setări autorizează moderarea, nu accesul la canale.
      </p>
    )}
    <Accordion type="multiple" defaultValue={sections ?? ["automod", "anti-raid", "anti-spam", "anti-flood"]} className="space-y-3">
      <Section value="automod" title="1. AutoMod" description="Filtre de cuvinte, linkuri, anti-scam, emoji, majuscule și repetări.">
        <Toggle label="Activează AutoMod" help="Comutatorul principal pentru regulile de mai jos." checked={value.autoMod.enabled} onChange={(next) => set(["autoMod", "enabled"], next)} />
        {channelDestinationField("autoMod.logChannelId", "Canal jurnal AutoMod", value.autoMod.logChannelId, ["autoMod", "logChannelId"])}
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <h3 className="font-semibold">Anti-Scam</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Detectează afirmații clare despre câștiguri în bani sau crypto, inclusiv textul din imaginile atașate (OCR local).
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              testId="toggle-anti-scam"
              label="Activează Anti-Scam"
              help="Este oprit implicit; pornește-l doar după ce alegi acțiunea."
              checked={Boolean(value.autoMod.scamFilter?.enabled)}
              onChange={(next) => set(["autoMod", "scamFilter", "enabled"], next)}
            />
            <Choice
              testId="select-anti-scam-action"
              label="Acțiune pentru mesajele detectate"
              help="Mesajul se șterge întotdeauna; timeout și kick adaugă și sancțiunea aleasă."
              value={value.autoMod.scamFilter?.action ?? "delete"}
              options={SCAM_ACTIONS}
              onChange={(next) => set(["autoMod", "scamFilter", "action"], next)}
            />
          </div>
          <ListField
            testId="input-anti-scam-phrases"
            label="Expresii suplimentare de blocat"
            help="Opțional: o expresie pe rând. Orice mesaj care conține una dintre ele va fi tratat ca scam."
            values={value.autoMod.scamPhrases ?? []}
            onChange={(next) => set(["autoMod", "scamPhrases"], next)}
          />
          <p className="text-xs text-muted-foreground" data-testid="text-anti-scam-requirements">
            Rulează numai când Protecția serverului și AutoMod general sunt pornite. Mesajele și sancțiunile apar în Cazuri/Audit.
            Timeout-ul este de 10 minute. Botul are nevoie de Message Content și Manage Messages; mute cere Moderate Members,
            iar kick cere Kick Members și un rol bot suficient de sus. Kick-ul elimină membrul, fără ban.
            OCR verifică local maximum două imagini PNG/JPG/GIF/WebP de până la 6 MB per mesaj; textul ilizibil poate scăpa.
          </p>
        </div>
        <RuleEditor combineDeletion title="Filtru cuvinte" help="Lista de mai jos determină potrivirile; regula nu are un prag numeric efectiv." rule={value.autoMod.wordFilter} thresholds={[]} onChange={rule(["autoMod", "wordFilter"])} />
        <ListField label="Cuvinte interzise" help="Un cuvânt sau o expresie pe rând; maximum 500." values={value.autoMod.forbiddenWords} onChange={(next) => set(["autoMod", "forbiddenWords"], next)} />
        <RuleEditor combineDeletion title="Blocare linkuri" help="Categoriile și lista de mai jos determină potrivirile; regula nu are un prag numeric efectiv." rule={value.autoMod.linkBlock} thresholds={[]} onChange={rule(["autoMod", "linkBlock"])} />
        <ChannelScopeSelector
          channels={discordChannels}
          selectedChannelIds={value.autoMod.linkBlock.channelIds ?? []}
          onChange={(next) => set(["autoMod", "linkBlock", "channelIds"], next)}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Categorii de linkuri interzise</p>
          <p className="text-xs text-muted-foreground">Bifează tipurile de blocat. Necesită Protecția serverului, AutoMod și Blocare linkuri active.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {LINK_CATEGORIES.map(([key, label, help]) => (
              <Toggle key={key} label={label} help={help}
                checked={Boolean(value.autoMod.forbiddenLinkCategories?.[key])}
                onChange={(next) => set(["autoMod", "forbiddenLinkCategories", key], next)}
                testId={`link-category-${key}`} />
            ))}
          </div>
        </div>
        <ListField label="Linkuri interzise" help="Un domeniu sau link pe rând; maximum 500." values={value.autoMod.forbiddenLinks} onChange={(next) => set(["autoMod", "forbiddenLinks"], next)} />
        <RuleEditor combineDeletion title="Limită emoji" rule={value.autoMod.emojiLimit} thresholds={EMOJI_LIMIT} onChange={rule(["autoMod", "emojiLimit"])} />
        <RuleEditor combineDeletion title="Limită majuscule" rule={value.autoMod.capsLimit} thresholds={CAPS_LIMIT} onChange={rule(["autoMod", "capsLimit"])} />
        <RuleEditor combineDeletion title="Repetări de caractere și mesaje" rule={value.autoMod.repeatBlock} thresholds={REPEAT_LIMIT} onChange={rule(["autoMod", "repeatBlock"])} />
      </Section>

      <Section value="anti-raid" title="2. Anti-raid" description="Detectează intrările rapide și conturile prea noi.">
        <Toggle label="Activează anti-raid" checked={value.antiRaid.enabled} onChange={(next) => set(["antiRaid", "enabled"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField label="Intrări pe minut" help="Între 1 și 10.000 intrări." value={value.antiRaid.joinsPerMinute} min={1} max={10000} onChange={(next) => set(["antiRaid", "joinsPerMinute"], next)} />
          <NumberField label="Vârsta minimă a contului" help="În zile (0–3650). Conturile mai noi pot declanșa regula." value={value.antiRaid.accountAgeDays} min={0} max={3650} onChange={(next) => set(["antiRaid", "accountAgeDays"], next)} />
        </div>
        <Toggle label="Blochează serverul (lockdown)" help="Activează lockdown la detectarea unui raid." checked={value.antiRaid.lockdown} onChange={(next) => set(["antiRaid", "lockdown"], next)} />
        {channelDestinationField("antiRaid.alertChannelId", "Canal alerte raid", value.antiRaid.alertChannelId, ["antiRaid", "alertChannelId"])}
        <RuleEditor title="Regula de raid" rule={value.antiRaid.rule} thresholds={RAID_LIMIT} onChange={rule(["antiRaid", "rule"])} />
      </Section>

      <Section value="anti-spam" title="3. Anti-spam" description="Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.">
        <Toggle label="Activează anti-spam" checked={value.antiSpam.enabled} onChange={(next) => set(["antiSpam", "enabled"], next)} />
        {value.antiSpam.enabled && !value.protection.enabled && (
          <p role="status" className="rounded-lg border border-[#D94A2B]/25 bg-[#D94A2B]/5 px-3 py-2 text-sm text-[#D94A2B]">
            Activează și Protecția generală; altfel regulile anti-spam nu rulează.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Reguli anti-spam</p>
            <p className="mt-1 text-xs text-muted-foreground">Deschide o regulă pentru a ajusta acțiunea, severitatea și pragurile.</p>
          </div>
          <span className="rounded-full border border-[#D94A2B]/25 bg-[#D94A2B]/10 px-3 py-1 font-mono text-xs font-semibold text-[#D94A2B]">
            {activeAntiSpamRules} din 5 bifate
          </span>
        </div>
        {channelDestinationField("antiSpam.logChannelId", "Canal jurnal anti-spam", value.antiSpam.logChannelId, ["antiSpam", "logChannelId"])}
        <RuleEditor title="Spam de mesaje" help="Mesaje repetate într-o fereastră de timp." collapsible rule={value.antiSpam.message} thresholds={MESSAGE_SPAM} onChange={rule(["antiSpam", "message"])} />
        <RuleEditor title="Spam de editări" help="Editări repetate într-o fereastră de timp." collapsible rule={value.antiSpam.edit} thresholds={EDIT_SPAM} onChange={rule(["antiSpam", "edit"])} />
        {value.antiSpam.enabled && value.antiSpam.edit.enabled && value.antiSpam.edit.action === "none" && (
          <p className="text-sm text-amber-600">Regula de editări nu va sancționa: acțiunea este „Nicio acțiune”.</p>
        )}
        <RuleEditor title="Spam de ștergeri" help="Ștergeri repetate într-o fereastră de timp." collapsible rule={value.antiSpam.delete} thresholds={DELETE_SPAM}
          actions={ACTIONS.filter(([key]) => key !== "delete")} onChange={rule(["antiSpam", "delete"])} />
        {value.antiSpam.enabled && value.antiSpam.delete.enabled && (
          <p className="text-sm text-muted-foreground">
            Sancțiunile pentru ștergeri necesită „Vezi jurnalul de audit” și un operator identificat acolo. Pentru ștergeri fără autor verificabil, botul doar alertează; un mesaj deja șters nu poate fi șters din nou.
          </p>
        )}
        <RuleEditor title="Spam de mențiuni" help="Mențiuni într-un singur mesaj." collapsible rule={value.antiSpam.mention} thresholds={MENTION_LIMIT} onChange={rule(["antiSpam", "mention"])} />
        <RuleEditor title="Spam de emoji" help="Numărul maxim de emoji într-un mesaj." collapsible rule={value.antiSpam.emoji} thresholds={EMOJI_LIMIT} onChange={rule(["antiSpam", "emoji"])} />
      </Section>

      <Section value="anti-flood" title="4. Anti-flood" description="Controlează mesaje foarte lungi, șiruri, majuscule și simboluri.">
        <Toggle label="Activează anti-flood" checked={value.antiFlood.enabled} onChange={(next) => set(["antiFlood", "enabled"], next)} />
        {channelDestinationField("antiFlood.logChannelId", "Canal jurnal Anti-Flood", value.antiFlood.logChannelId, ["antiFlood", "logChannelId"])}
        {!value.antiFlood.enabled && (
          <p className="text-sm text-amber-600">Anti-flood este oprit. Regulile de mai jos nu verifică mesajele până când activezi modulul.</p>
        )}
        {value.antiFlood.enabled && !value.protection.enabled && (
          <p className="text-sm text-amber-600">Activează și Protecția generală; altfel Anti-flood nu rulează.</p>
        )}
        {value.antiFlood.enabled && !hasActionableFloodRule && (
          <p className="text-sm text-amber-600">Nicio regulă Anti-flood nu poate sancționa: activează cel puțin o regulă și alege o acțiune diferită de „Nicio acțiune”.</p>
        )}
        {value.antiFlood.enabled && value.antiFlood.caps.enabled && value.autoMod.enabled && value.autoMod.capsLimit.enabled && (
          <p className="text-sm text-muted-foreground">Limita de majuscule din AutoMod are prioritate față de cea din Anti-flood; pentru aceeași abatere se aplică o singură acțiune.</p>
        )}
        <RuleEditor title="Mesaj lung" rule={value.antiFlood.longMessage} thresholds={FLOOD_LENGTH} onChange={rule(["antiFlood", "longMessage"])} />
        <RuleEditor title="Șir de caractere" rule={value.antiFlood.character} thresholds={FLOOD_RUN} onChange={rule(["antiFlood", "character"])} />
        <RuleEditor title="Majuscule excesive" rule={value.antiFlood.caps} thresholds={CAPS_LIMIT} onChange={rule(["antiFlood", "caps"])} />
        <RuleEditor title="Șir de simboluri" rule={value.antiFlood.symbol} thresholds={FLOOD_RUN} onChange={rule(["antiFlood", "symbol"])} />
      </Section>

      <Section value="suspicious" title="5. Comportament suspect" description="Alerte pentru schimbări neobișnuite de nickname, roluri și activitate.">
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label="Activează detecția" checked={value.suspiciousBehavior.enabled} onChange={(next) => set(["suspiciousBehavior", "enabled"], next)} />
          <Choice label="Sensibilitate" value={value.suspiciousBehavior.sensitivity} options={SENSITIVITIES} onChange={(next) => set(["suspiciousBehavior", "sensitivity"], next)} />
          <Choice label="Acțiune principală" value={value.suspiciousBehavior.action}
            options={value.suspiciousBehavior.action === "delete"
              ? [...SUSPICIOUS_ACTIONS, ["delete", "Șterge mesajul (indisponibil)"] as const] : SUSPICIOUS_ACTIONS}
            onChange={(next) => set(["suspiciousBehavior", "action"], next)} />
        </div>
        {!value.suspiciousBehavior.enabled && (
          <p className="text-sm text-amber-600">Detecția este oprită. Regulile de mai jos nu rulează până când activezi modulul.</p>
        )}
        {value.suspiciousBehavior.enabled && !value.protection.enabled && (
          <p className="text-sm text-amber-600">Activează și Protecția generală; altfel detecția nu rulează.</p>
        )}
        {value.suspiciousBehavior.enabled && !suspiciousRules.some((item) => item.enabled) && (
          <p className="text-sm text-amber-600">Nicio regulă de comportament suspect nu este activă. Activează cel puțin una pentru a primi alerte.</p>
        )}
        {value.suspiciousBehavior.enabled && suspiciousRules.some((item) => item.enabled) && !value.suspiciousBehavior.alertChannelId && (
          <p className="text-sm text-amber-600">Alege un canal de alerte; fără el, regulile care doar semnalează nu vor publica avertizări.</p>
        )}
        {value.suspiciousBehavior.enabled && (value.suspiciousBehavior.action === "delete" ||
          suspiciousRules.some((item) => item.enabled && item.action === "delete")) && (
          <p className="text-sm text-amber-600">„Șterge mesajul” nu este o acțiune disponibilă pentru comportament suspect. Alege o sancțiune permisă sau folosește alerte.</p>
        )}
        {channelDestinationField("suspiciousBehavior.alertChannelId", "Canal alerte comportament suspect", value.suspiciousBehavior.alertChannelId, ["suspiciousBehavior", "alertChannelId"])}
        {[
          ["nicknameChanges", "Schimbări nickname"], ["roleChanges", "Schimbări roluri"], ["massEdits", "Editări în masă"],
          ["massDeletes", "Ștergeri în masă"], ["joinLeaveFlood", "Flux intrări / ieșiri"], ["unusualActivity", "Activitate neobișnuită"],
        ].map(([key, label]) => <RuleEditor key={key} title={label} rule={value.suspiciousBehavior[key]}
          thresholds={SUSPICIOUS_LIMIT} actions={SUSPICIOUS_ACTIONS} showAction={key !== "joinLeaveFlood"}
          help={key === "joinLeaveFlood" ? "Doar alertă: intrările și ieșirile nu au un actor care poate fi sancționat automat."
            : key === "unusualActivity" ? "Combină incidentele detectate de celelalte reguli și schimbările de canale, roluri sau webhook-uri." : undefined}
          onChange={rule(["suspiciousBehavior", key])} />)}
      </Section>

      <Section value="ai" title="6. Moderare AI" description="Analiză multilingvă, categorii, acțiuni și excepții pentru fiecare server.">
        <p className="text-sm text-muted-foreground">Mesajele sunt analizate automat în limba în care au fost scrise, inclusiv dacă amestecă limbi. Limba folosită nu este o abatere.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label="Activează AI" checked={value.ai.enabled} onChange={(next) => set(["ai", "enabled"], next)} />
          <Choice label="Sensibilitate generală AI" value={value.ai.sensitivity} options={SENSITIVITIES} onChange={(next) => set(["ai", "sensitivity"], next)} />
          <Choice label="Ton" value={value.ai.tone} options={[["serious", "Serios"], ["calm", "Calm"], ["strict", "Strict"]]} onChange={(next) => set(["ai", "tone"], next)} />
        </div>
        <ModerationActionPicker label="Acțiuni generale AI" value={value.ai}
          testId="actions-ai-general"
          onChange={(next) => set(["ai"], { ...value.ai, ...next })} />
        {channelDestinationField("ai.logChannelId", "Canal jurnal AI", value.ai.logChannelId, ["ai", "logChannelId"])}
        <div className="space-y-3">
          <p className="text-sm font-medium">Categorii urmărite</p>
          {AI_CATEGORIES.map(([key, label, help]) => (
            <div key={key} className="space-y-3 rounded-xl border border-border p-3">
              <Toggle label={label} help={help} checked={Boolean(value.ai.categories[key])} onChange={(next) => set(["ai", "categories", key], next)} />
              {value.ai.categories[key] && (
                <div className="space-y-3">
                  <Choice label={`Sensibilitate — ${label}`} value={value.ai.categorySettings?.[key]?.sensitivity ?? "inherit"}
                    options={[["inherit", "Folosește setarea generală"], ...SENSITIVITIES]}
                    onChange={(next) => set(["ai", "categorySettings", key, "sensitivity"], next === "inherit" ? undefined : next)} />
                  <Toggle label={`Folosește acțiunile generale — ${label}`}
                    help="Bifarea unei acțiuni mai jos personalizează doar această categorie."
                    checked={inheritsAiCategoryActions(value.ai, key)}
                    onChange={(next) => set(["ai"], setAiCategoryActions(value.ai, key,
                      next ? undefined : aiCategoryActions(value.ai, key)))} />
                  <ModerationActionPicker label={`Acțiuni — ${label}`}
                    testId={`actions-ai-${key}`}
                    value={aiCategoryActions(value.ai, key)}
                    onChange={(next) => set(["ai"], setAiCategoryActions(value.ai, key, next))} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ListField ids label="Canale exceptate de la AI" help="Un ID de canal pe rând (max. 100). Alte protecții rămân active." values={value.ai.excludedChannelIds} onChange={(next) => set(["ai", "excludedChannelIds"], next)} />
          <ListField ids label="Roluri exceptate de la AI" help="Un ID de rol pe rând (max. 100). Alte protecții rămân active." values={value.ai.excludedRoleIds} onChange={(next) => set(["ai", "excludedRoleIds"], next)} />
        </div>
        {value.ai.enabled && !Object.values(value.ai.categories).some(Boolean) && (
          <p className="text-sm text-amber-600">Selectează cel puțin o categorie; fără categorii, analiza AI nu rulează.</p>
        )}
        {value.ai.enabled && !AI_CATEGORIES.some(([key]) => {
          const selected = aiCategoryActions(value.ai, key);
          return value.ai.categories[key] && (selected.action !== "none" || selected.deleteMessage);
        }) && (
          <p className="text-sm text-muted-foreground">Nu sunt bifate acțiuni pentru categoriile active; rezultatele sunt doar jurnalizate.</p>
        )}
      </Section>

      <Section value="tools" title="7. Unelte staff" description="Un singur comutator master controlează disponibilitatea comenzilor. Apoi acordă acces prin ID de rol, comandă cu comandă.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/35 p-3">
            <Toggle label="Activează uneltele manuale" checked={value.manualTools.enabled} onChange={(next) => set(["manualTools", "enabled"], next)} />
          </div>
          <div className="rounded-xl border border-border/70 bg-background/35 p-3">
            <Toggle label="Jurnalizează acțiunile staff-ului" checked={value.manualTools.logActions} onChange={(next) => set(["manualTools", "logActions"], next)} />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3" data-testid="manual-command-role-grants">
          {MANUAL_COMMAND_GROUPS_WITH_COMMANDS.map((group) => (
            <section key={group.key} className="min-w-0 space-y-3 rounded-xl border border-border/70 bg-background/30 p-3 sm:p-4" data-testid={`manual-grant-group-${group.key}`}>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground">{String(group.commands.length).padStart(2, "0")} COMENZI</span>
              </div>
              <div className="space-y-3">
                {group.commands.map((command) => (
                  <div key={command.key} className="rounded-lg border border-border/50 bg-card/55 p-3">
                    <ListField
                      ids
                      testId={`manual-command-role-grants-${command.key}`}
                      label={`Roluri pentru /${command.key}`}
                      help={`${command.label}: un ID de rol pe rând (max. 100).`}
                      values={value.manualTools.commandGrants[command.key]}
                      onChange={(next) => set(["manualTools", "commandGrants", command.key], next)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>

      <Section value="cases-audit" title="8. Cazuri și audit" description="Păstrarea cazurilor, drepturile staff-ului și canalul de audit.">
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Activează cazurile" checked={value.cases.enabled} onChange={(next) => set(["cases", "enabled"], next)} />
          <Toggle label="Staff-ul poate închide cazuri" checked={value.cases.allowStaffClose} onChange={(next) => set(["cases", "allowStaffClose"], next)} />
          <Toggle label="Staff-ul poate adăuga note" checked={value.cases.allowStaffNotes} onChange={(next) => set(["cases", "allowStaffNotes"], next)} />
          <Toggle label="Staff-ul poate exporta cazuri" checked={value.cases.allowStaffExport} onChange={(next) => set(["cases", "allowStaffExport"], next)} />
        </div>
        <NumberField label="Păstrare cazuri" help="Număr de zile, între 1 și 3650." value={value.cases.retentionDays} min={1} max={3650} onChange={(next) => set(["cases", "retentionDays"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Activează auditul" checked={value.audit.enabled} onChange={(next) => set(["audit", "enabled"], next)} />
          <Choice label="Nivel detalii audit" value={value.audit.detailLevel} options={[["minimal", "Minimal"], ["standard", "Standard"], ["verbose", "Detaliat"]]} onChange={(next) => set(["audit", "detailLevel"], next)} />
        </div>
        {channelDestinationField("audit.channelId", "Canal audit", value.audit.channelId, ["audit", "channelId"])}

        <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div>
            <h4 className="font-semibold">Jurnal automat Discord</h4>
            <p className="mt-1 text-xs text-muted-foreground">La salvare, botul creează sau reutilizează o categorie privată și câte un canal pentru fiecare categorie activă. Conținutul mesajelor nu este copiat în log.</p>
          </div>
          <Toggle
            label="Activează jurnalizarea serverului"
            help="Oprirea oprește postările noi și păstrează canalele și istoricul."
            checked={value.activityLog.enabled}
            onChange={(next) => set(["activityLog", "enabled"], next)}
          />
          {activityLogDraftError(value.activityLog) && (
            <p role="alert" className="text-sm text-amber-600">
              Nu poți salva jurnalizarea activă: {activityLogDraftError(value.activityLog)}
            </p>
          )}
          {missingActivityPermissions.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {missingActivityPermissions.join(" ")} Sunt necesare Manage Channels și Manage Roles pentru a crea ACL-uri private.
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {activityLogCategories.map(([key, label]) => (
              <div key={key} className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                  <Toggle
                    label={label}
                    checked={value.activityLog.categories[key]}
                    onChange={(next) => set(["activityLog", "categories", key], next)}
                  />
                  </div>
                  {createChannelButton(`activityLog.${key}`, label, ["activityLog", "channelIds", key])}
                </div>
                {key === "members" && value.activityLog.categories.members && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-3 text-xs">
                      <p className="font-medium">
                        {renderMemberLogPreview(value.activityLog.memberJoinTitleTemplate, "join", "Membru nou · a intrat pe server")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {renderMemberLogPreview(value.activityLog.memberJoinDescriptionTemplate, "join", "Un membru nou s-a alăturat serverului.")}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-xs">
                      <p className="font-medium">
                        {renderMemberLogPreview(value.activityLog.memberLeaveTitleTemplate, "leave", "Membru a părăsit serverul")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {renderMemberLogPreview(value.activityLog.memberLeaveDescriptionTemplate, "leave", "Membrul a părăsit serverul.")}
                      </p>
                    </div>
                  </div>
                )}
                {activityChannelSelector(key, label)}
              </div>
            ))}
          </div>
          {onCreateChannel && (
            <p className="text-xs text-muted-foreground">
              Fiecare buton creează canalul în categoria jurnalului, creată o singură dată și reutilizată. Categoria și canalele rămân private; configurează accesul rolurilor direct în Discord.
            </p>
          )}
          <div role="status" className="rounded-lg border border-border bg-background/70 p-3 text-sm">
            <p className="font-medium">
              {value.activityLog.enabled
                ? `Jurnal activat în formular · ${configuredActivityCount}/${selectedActivityCategories.length} canale configurate (salvează pentru a aplica)`
                : "Jurnal oprit · canalele și istoricul existente sunt păstrate"}
            </p>
            {value.activityLog.categoryId && <p className="mt-1 text-xs text-muted-foreground">Categorie: {value.activityLog.categoryId}</p>}
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {selectedActivityCategories.map(([key, label]) => (
                <li key={key}>
                  {label}: {value.activityLog.channelIds[key]
                    ? `configurat (${value.activityLog.channelIds[key]})`
                    : value.activityLog.enabled ? "lipsește — verifică permisiunile și salvează din nou" : "se va crea la activare"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section value="roles-channels" title="9. Roluri și canale" description="Excluderi, protecții și canale cu politici speciale.">
        <div className="grid gap-4 md:grid-cols-2">
          <ListField ids label="Roluri sancționabile" help="Roluri asupra cărora pot fi aplicate sancțiuni." values={value.roles.sanctionableRoleIds} onChange={(next) => set(["roles", "sanctionableRoleIds"], next)} />
          <ListField ids label="Roluri protejate" help="Roluri care nu trebuie sancționate automat." values={value.roles.protectedRoleIds} onChange={(next) => set(["roles", "protectedRoleIds"], next)} />
          <ListField ids label="Roluri ignorate de AutoMod" help="AutoMod nu procesează membrii cu aceste roluri." values={value.roles.ignoredAutoModRoleIds} onChange={(next) => set(["roles", "ignoredAutoModRoleIds"], next)} />
          <ListField ids label="Roluri cu permisiuni speciale" help="Roluri marcate pentru permisiuni speciale." values={value.roles.specialPermissionRoleIds} onChange={(next) => set(["roles", "specialPermissionRoleIds"], next)} />
          <ListField ids label="Canale ignorate" help="AutoMod nu procesează aceste canale." values={value.channels.ignoredChannelIds} onChange={(next) => set(["channels", "ignoredChannelIds"], next)} />
          <ListField ids label="Canale protejate" help="Canale care nu pot fi afectate de automatizări." values={value.channels.protectedChannelIds} onChange={(next) => set(["channels", "protectedChannelIds"], next)} />
          <ListField ids label="Canale slowmode automat" help="Canale unde poate fi aplicat slowmode automat." values={value.channels.autoSlowmodeChannelIds} onChange={(next) => set(["channels", "autoSlowmodeChannelIds"], next)} />
          <ListField ids label="Canale stricte" help="Canale cu politică strictă." values={value.channels.strictChannelIds} onChange={(next) => set(["channels", "strictChannelIds"], next)} />
          <ListField ids label="Canale permisive" help="Canale cu politică mai blândă." values={value.channels.softChannelIds} onChange={(next) => set(["channels", "softChannelIds"], next)} />
        </div>
      </Section>

      <Section value="time" title="10. Profile de timp" description="Fuse orar și reguli programate pentru noapte, zi, weekend și evenimente.">
        <TextField label="Fus orar IANA" help="De exemplu Europe/Bucharest sau UTC. Trebuie să fie un fus orar IANA valid." value={value.timeProfiles.timezone} onChange={(next) => set(["timeProfiles", "timezone"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Noapte strictă" checked={value.timeProfiles.strictNight.enabled} onChange={(next) => set(["timeProfiles", "strictNight", "enabled"], next)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Începe la" help="Oră 0–23." value={value.timeProfiles.strictNight.startHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "strictNight", "startHour"], next)} />
            <NumberField label="Se termină la" help="Oră 0–23." value={value.timeProfiles.strictNight.endHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "strictNight", "endHour"], next)} />
          </div>
          <Toggle label="Zi permisivă" checked={value.timeProfiles.softDay.enabled} onChange={(next) => set(["timeProfiles", "softDay", "enabled"], next)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Începe la" help="Oră 0–23." value={value.timeProfiles.softDay.startHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "softDay", "startHour"], next)} />
            <NumberField label="Se termină la" help="Oră 0–23." value={value.timeProfiles.softDay.endHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "softDay", "endHour"], next)} />
          </div>
          <Toggle label="Weekend" checked={value.timeProfiles.weekend.enabled} onChange={(next) => set(["timeProfiles", "weekend", "enabled"], next)} />
          <Choice label="Severitate weekend" value={value.timeProfiles.weekend.severity} options={SEVERITIES} onChange={(next) => set(["timeProfiles", "weekend", "severity"], next)} />
          <Toggle label="Eveniment major" checked={value.timeProfiles.majorEvent.enabled} onChange={(next) => set(["timeProfiles", "majorEvent", "enabled"], next)} />
          <Choice label="Severitate eveniment major" value={value.timeProfiles.majorEvent.severity} options={SEVERITIES} onChange={(next) => set(["timeProfiles", "majorEvent", "severity"], next)} />
        </div>
      </Section>

      <Section value="escalation" title="11. Escaladare" description="Mărește sancțiunea după încălcări repetate.">
        <Toggle label="Activează escaladarea" checked={value.escalation.enabled} onChange={(next) => set(["escalation", "enabled"], next)} />
        <NumberField label="Resetare după" help="Zile fără încălcări până la resetarea nivelului (1–3650)." value={value.escalation.resetAfterDays} min={1} max={3650} onChange={(next) => set(["escalation", "resetAfterDays"], next)} />
        <div className="space-y-3">
          {value.escalation.levels.map((level: any, index: number) => (
            <div key={`${level.level}-${index}`} className="grid items-end gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <NumberField label="Nivel" help="1–4" value={level.level} min={1} max={4} onChange={(next) => set(["escalation", "levels", index, "level"], next)} />
              <NumberField label="Încălcări" help="1–10.000" value={level.violations} min={1} max={10000} onChange={(next) => set(["escalation", "levels", index, "violations"], next)} />
              <Choice label="Acțiune" value={level.action} options={ACTIONS} onChange={(next) => set(["escalation", "levels", index, "action"], next)} />
              <Button type="button" variant="outline" size="icon" disabled={value.escalation.levels.length <= 1} aria-label={`Șterge nivelul ${level.level}`} onClick={() => set(["escalation", "levels"], value.escalation.levels.filter((_: any, position: number) => position !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" disabled={value.escalation.levels.length >= 4} onClick={() => set(["escalation", "levels"], [...value.escalation.levels, { level: value.escalation.levels.length + 1, violations: 1, action: "warn" }])}><Plus className="mr-2 h-4 w-4" />Adaugă nivel</Button>
        </div>
      </Section>

      <Section value="embeds" title="12. Embed-uri și aspect" description="Previzualizează mesajul de moderare și configurează animațiile.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toggle label="Activează embed-uri" checked={value.embeds.enabled} onChange={(next) => set(["embeds", "enabled"], next)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Culoare HEX" help="Format obligatoriu #RRGGBB." value={value.embeds.color} placeholder="#5865F2" onChange={(next) => set(["embeds", "color"], next)} />
          <Choice label="Stil" value={value.embeds.style} options={[["plain", "Simplu"], ["compact", "Compact"], ["detailed", "Detaliat"]]} onChange={(next) => set(["embeds", "style"], next)} />
          <UrlField label="URL icon" help="URL HTTPS public pentru icon; lasă gol pentru fără icon." placeholder="https://example.com/icon.png" value={value.embeds.iconUrl} onChange={(next) => set(["embeds", "iconUrl"], next)} />
          <Toggle label="Activează animațiile" help="Necesită URL HTTPS către un fișier .gif." checked={value.embeds.animations} onChange={(next) => set(["embeds", "animations"], next)} />
          <UrlField label="URL animație GIF" help="URL HTTPS public care se termină în .gif; obligatoriu când animațiile sunt active." placeholder="https://example.com/animation.gif" value={value.embeds.animationUrl} onChange={(next) => set(["embeds", "animationUrl"], next)} />
        </div>
        {embedUrlDraftError(value.embeds) && (
          <p role="alert" className="text-sm text-amber-600">Nu poți salva aceste setări: {embedUrlDraftError(value.embeds)}</p>
        )}
        <div className="rounded-lg border border-border bg-background p-4" style={{ borderLeftWidth: 4, borderLeftColor: /^#[0-9a-fA-F]{6}$/.test(value.embeds.color) ? value.embeds.color : undefined }}>
          <div className="flex gap-3">{value.embeds.iconUrl && isPublicHttpsUrl(value.embeds.iconUrl) && <img src={value.embeds.iconUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}<div><p className="font-semibold">{renderModerationTemplatePreview(value.embeds.titleTemplate, "Avertisment", "Exemplu de motiv")}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{renderModerationTemplatePreview(value.embeds.descriptionTemplate, "Avertisment", "Exemplu de motiv")}</p></div></div>
          {value.embeds.animations && value.embeds.animationUrl && isPublicGifUrl(value.embeds.animationUrl) && <img src={value.embeds.animationUrl} alt="Previzualizare animație" className="mt-3 max-h-40 rounded-md" />}
        </div>
      </Section>

      <Section value="permissions" title="13. Permisiuni și izolare" description="Acces la consolă, roluri staff și invarianta de confidențialitate per server.">
        <ListField ids label="Roluri staff" help="Roluri autorizate pentru moderare; un ID pe rând." values={value.permissions.staffRoleIds} onChange={(next) => set(["permissions", "staffRoleIds"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Permite Manage Guild" help="Membrii cu Manage Server primesc acces la comenzile de moderare." checked={value.permissions.allowManageGuild} onChange={(next) => set(["permissions", "allowManageGuild"], next)} />
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-sm font-medium text-foreground">Acces la setări și audit</p>
            <p className="mt-1 text-xs text-muted-foreground">Proprietarii serverului și membrii cu permisiunea Discord Administrator.</p>
          </div>
          <Toggle label="Multi-server activ" help="Activează funcționarea în mai multe servere." checked={value.multiServer.enabled} onChange={(next) => set(["multiServer", "enabled"], next)} />
          <Toggle label="Date izolate per server" help="Este obligatoriu pentru confidențialitate și nu poate fi dezactivat." checked={true} disabled onChange={() => undefined} />
        </div>
        <TextField label="Prefix bot" help="Comenzile de moderare sunt slash commands; prefixul este fix și nu poate fi schimbat." value="/" disabled onChange={() => undefined} />
      </Section>
    </Accordion>
    </div>
    </VisibleSections.Provider>
  );
}