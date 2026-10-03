import React from "react";
import { Checkbox } from "../ui/checkbox";
import { autoModActionSelection, toggleAutoModAction } from "../../lib/automod-actions";

const OPTIONS = [
  ["delete", "Șterge mesajul"],
  ["warn", "Avertisment"],
  ["mute", "Mute"],
  ["kick", "Kick"],
  ["ban", "Ban"],
] as const;

type Props = {
  label: string;
  value: { action: string; deleteMessage?: boolean };
  onChange: (value: { action: string; deleteMessage: boolean }) => void;
  testId?: string;
};

export function ModerationActionPicker({ label, value, onChange, testId }: Props) {
  const selection = autoModActionSelection(value);
  const selected = OPTIONS.filter(([key]) => key === "delete" ? selection.deleteMessage : selection.sanction === key);

  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-3" data-testid={testId}>
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">
        Bifează una sau două acțiuni: ștergerea mesajului și o sancțiune asupra membrului.
        Alegerea unei alte sancțiuni o înlocuiește pe cea anterioară.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map(([key, text]) => {
          const checked = key === "delete" ? selection.deleteMessage : selection.sanction === key;
          return (
            <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${checked ? "border-primary/60 bg-primary/10" : "border-border"}`}>
              <Checkbox aria-label={text} checked={checked}
                onCheckedChange={(next) => onChange(toggleAutoModAction(value, key, next === true))} />
              <span>{text}</span>
            </label>
          );
        })}
      </div>
      <p className="text-sm" aria-live="polite" data-testid={testId ? `${testId}-summary` : undefined}>
        <span className="text-muted-foreground">Selectat: </span>
        <strong>{selected.length ? selected.map(([, text]) => text).join(" + ") : "Doar jurnalizare, fără acțiuni"}</strong>
      </p>
    </fieldset>
  );
}