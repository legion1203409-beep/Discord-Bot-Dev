import { useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export type ModerationEmbedTemplate = {
  titleTemplate: string;
  descriptionTemplate: string;
};

const TEMPLATE_TOKENS = [
  { key: "member", label: "Membru", token: "{member}" },
  { key: "member_name", label: "Nume membru", token: "{member_name}" },
  { key: "username", label: "Username", token: "{username}" },
  { key: "member_id", label: "ID membru", token: "{member_id}" },
  { key: "moderator", label: "Moderator", token: "{moderator}" },
  { key: "moderator_name", label: "Nume moderator", token: "{moderator_name}" },
  { key: "moderator_id", label: "ID moderator", token: "{moderator_id}" },
  { key: "channel", label: "Canal", token: "{channel}" },
  { key: "channel_name", label: "Nume canal", token: "{channel_name}" },
  { key: "action", label: "Acțiune", token: "{action}" },
  { key: "reason", label: "Motiv", token: "{reason}" },
  { key: "duration", label: "Durată", token: "{duration}" },
  { key: "guild", label: "Server", token: "{guild}" },
  { key: "time", label: "Timp", token: "{time}" },
  { key: "time_relative", label: "Timp relativ", token: "{time_relative}" },
] as const;

export function ModerationEmbedTemplateEditor({
  template,
  onChange,
}: {
  template: ModerationEmbedTemplate;
  onChange: (template: ModerationEmbedTemplate) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<"titleTemplate" | "descriptionTemplate">("descriptionTemplate");

  const insertToken = (token: string) => {
    const field = activeField.current === "titleTemplate" ? titleRef.current : descriptionRef.current;
    if (!field) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const nextValue = `${field.value.slice(0, start)}${token}${field.value.slice(end)}`;
    const nextCaret = start + token.length;

    onChange({ ...template, [activeField.current]: nextValue });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Variabile de inserat</p>
        <p className="text-xs text-muted-foreground">
          Pune cursorul în titlu sau descriere, apoi apasă o variabilă. Se poate combina cu textul scris de tine.
          {` `}Exemplu: {`{member}`} a primit {`{action}`} la {`{time_relative}`}.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_TOKENS.map(({ key, label, token }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              data-testid={`button-template-token-${key}`}
              aria-label={`Inserează ${label}: ${token}`}
              title={token}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertToken(token)}
            >
              {label} <span className="ml-1 font-mono text-muted-foreground">{token}</span>
            </Button>
          ))}
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Titlu mesaj</span>
        <Input
          ref={titleRef}
          value={template.titleTemplate}
          maxLength={200}
          data-testid="input-moderation-template-title"
          onFocus={() => { activeField.current = "titleTemplate"; }}
          onChange={(event) => onChange({ ...template, titleTemplate: event.target.value })}
          placeholder="Avertisment pentru {member_name}"
        />
        <span className="block text-xs text-muted-foreground">Maximum 200 caractere.</span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Descriere mesaj</span>
        <Textarea
          ref={descriptionRef}
          value={template.descriptionTemplate}
          maxLength={2_000}
          rows={5}
          data-testid="input-moderation-template-description"
          onFocus={() => { activeField.current = "descriptionTemplate"; }}
          onChange={(event) => onChange({ ...template, descriptionTemplate: event.target.value })}
          placeholder="{member} a primit {action} pentru: {reason} · {time_relative}"
        />
        <span className="block text-xs text-muted-foreground">Maximum 2000 caractere.</span>
      </label>
    </div>
  );
}
