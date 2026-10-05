import { useState, type ComponentProps } from "react";
import { ACTIVITY_LOG_GROUPS, ACTIVITY_LOG_TEMPLATES, ACTIVITY_LOG_VARIABLES, renderActivityLogText, type ActivityLogGroup, type ActivityLogTextTemplate } from "../../../../api-server/src/moderation/activity-log-template-definitions";
import { EmojiField } from "./EmojiField";
import { MessageCustomizationDialog } from "./MessageCustomizationDialog";
import { Button } from "../ui/button";
import { renderMemberLogPreview } from "../../pages/moderation/ConfigEditor";

type EmojiProps = Pick<ComponentProps<typeof EmojiField>, "guildId" | "csrfToken" | "emojis" | "onEmojiCreated">;
const EMPTY_TEMPLATE: ActivityLogTextTemplate = { title: "", description: "" };
const MEMBER_VARIABLES = ["member", "member_name", "username", "account_created_at", "account_created_at_relative", "account_age", "account_age_years", "account_age_days", "server_joined_at", "server_joined_at_relative", "timestamp", "timestamp_relative"];
const PREVIEW_VALUES: Record<string, string> = {
  guild: "Regatul Cenușii", member: "@Adina", member_name: "Adina pe server", username: "adina",
  moderator: "@Moderator", channel: "#general", target: "@Adina", action: "mute", reason: "Spam",
  timestamp: "5 octombrie 2026, 14:00", timestamp_relative: "acum",
  details: "Detaliile evenimentului primite de la Discord.",
  before: "Textul anterior", after: "Textul nou", content: "Textul mesajului", count: "3",
  name: "Comunitate", changes: "Nume: vechi → nou", roles_added: "Membru", roles_removed: "Vizitator",
  old_channel: "Lobby", new_channel: "General", old_nickname: "Adina", new_nickname: "Adina pe server",
  duration: "10 minute", error: "Permisiuni insuficiente",
};

function TextEditor({ value, onChange, variables, preview, emojiProps }: {
  value: ActivityLogTextTemplate; onChange: (next: ActivityLogTextTemplate) => void;
  variables: readonly string[]; preview: (template: string, field: "title" | "description") => string; emojiProps: EmojiProps;
}) {
  const [focusedField, setFocusedField] = useState<"title" | "description">("description");
  return <>
    <div className="flex flex-wrap gap-1.5" aria-label="Variabile disponibile">
      {variables.map((variable) => <Button key={variable} size="sm" variant="outline" type="button"
        className="h-7 px-2 text-xs" aria-label={`Inserează {${variable}}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange({ ...value, [focusedField]: `${value[focusedField]}{${variable}}`.slice(0, focusedField === "title" ? 256 : 2000) })}>
        {`{${variable}}`}
      </Button>)}
    </div>
    <p className="text-xs text-muted-foreground">Apasă o variabilă pentru a o adăuga în câmpul selectat. Datele indisponibile sunt afișate cu „—”.</p>
    {(["title", "description"] as const).map((field) => <label key={field} className="block space-y-2 text-sm" onFocusCapture={() => setFocusedField(field)}>
      <span className="font-medium">{field === "title" ? "Titlu mesaj" : "Descriere mesaj"}</span>
      <EmojiField {...emojiProps} value={value[field]} multiline={field === "description"} rows={5}
        maxLength={field === "title" ? 256 : 2000} aria-label={field === "title" ? "Titlu mesaj" : "Descriere mesaj"}
        onChange={(text) => onChange({ ...value, [field]: text })} />
    </label>)}
    <div className="rounded-md bg-muted/50 p-3 text-xs" aria-label="Previzualizare mesaj">
      <p className="font-medium">{preview(value.title, "title")}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{preview(value.description, "description")}</p>
      <p className="mt-2 text-muted-foreground">Dacă personalizezi descrierea, detaliile standard nu se mai adaugă separat. Folosește {"{details}"} dacă vrei să le incluzi.</p>
    </div>
  </>;
}

export function ActivityLogTemplateEditors({ config, onSave, ...emojiProps }: EmojiProps & {
  config: any; onSave: (keys: string[], draft: any) => Promise<unknown>;
}) {
  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Mesajele fiecărui log Discord</h2>
      <p className="mt-1 text-sm text-muted-foreground">Alege categoria și tipul de eveniment. Fiecare mesaj are propriul titlu și propria descriere; canalele și activarea nu se schimbă.</p></div>
    {(Object.entries(ACTIVITY_LOG_GROUPS) as Array<[ActivityLogGroup, string]>).map(([group, label]) => <details
      key={group} open={group === "members" || group === "messages"} className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">{label}</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {ACTIVITY_LOG_TEMPLATES.filter((entry) => entry.group === group).map((entry) => {
          const kind = entry.key === "member_join" ? "join" : entry.key === "member_leave" ? "leave" : null;
          const prefix = kind === "join" ? "memberJoin" : "memberLeave";
          const value: ActivityLogTextTemplate = config.activityLog.templates?.[entry.key] ?? (kind
            ? { title: config.activityLog[`${prefix}TitleTemplate`] || "", description: config.activityLog[`${prefix}DescriptionTemplate`] || "" }
            : EMPTY_TEMPLATE);
          const title = kind === "join" ? "Mesaj la intrarea unui membru" : kind === "leave" ? "Mesaj la plecarea unui membru" : entry.title;
          const variables = kind ? [...MEMBER_VARIABLES, ...(kind === "leave" ? ["server_left_at", "server_left_at_relative", "server_duration"] : [])]
            : [...ACTIVITY_LOG_VARIABLES.common, ...ACTIVITY_LOG_VARIABLES[group]];
          const preview = (text: string, field: "title" | "description") => kind
            ? renderMemberLogPreview(text, kind, field === "title" ? entry.title : kind === "join" ? "Un membru nou s-a alăturat serverului." : "Membrul a părăsit serverul.")
            : renderActivityLogText(text.trim() || (field === "title" ? entry.title : "{details}"), { ...PREVIEW_VALUES, event: entry.event, category: label, title: entry.title });
          return <div key={entry.key} className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">{title}</h3>
            <MessageCustomizationDialog
              triggerId={kind ? `member-${kind}-template` : `activity-${entry.key}-template`} title={title}
              description="Editează textul acestui log fără să modifici canalul, activarea sau detaliile înregistrate."
              value={value} defaultValue={EMPTY_TEMPLATE}
              isDefault={(template) => !template.title.trim() && !template.description.trim()} saveOnApply
              onApply={(template) => kind
                ? onSave([`activityLog.${prefix}TitleTemplate`, `activityLog.${prefix}DescriptionTemplate`, `activityLog.templates.${entry.key}`], {
                  activityLog: { [`${prefix}TitleTemplate`]: template.title, [`${prefix}DescriptionTemplate`]: template.description, templates: { [entry.key]: template } },
                })
                : onSave([`activityLog.templates.${entry.key}`], { activityLog: { templates: { [entry.key]: template } } })}
              defaultMessage={<><p>{entry.title}</p><p className="mt-2">Botul folosește descrierea standard și detaliile primite de la Discord.</p></>}
              renderEditor={(draft, change) => <TextEditor value={draft} onChange={change} variables={variables} preview={preview} emojiProps={emojiProps} />}
            />
          </div>;
        })}
      </div>
    </details>)}
  </section>;
}
