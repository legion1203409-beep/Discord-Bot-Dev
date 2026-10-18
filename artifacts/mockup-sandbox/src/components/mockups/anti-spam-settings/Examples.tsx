import "./_group.css";
import { useState } from "react";
import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Rule = {
  enabled: boolean;
  action: string;
  severity: string;
  thresholds: Record<string, number>;
};

type AntiSpam = {
  enabled: boolean;
  logChannelId: string | null;
  message: Rule;
  edit: Rule;
  delete: Rule;
  mention: Rule;
  emoji: Rule;
};

const ACTIONS = [
  ["none", "Nicio acțiune"],
  ["warn", "Avertisment"],
  ["mute", "Restricționează (mute)"],
  ["kick", "Elimină (kick)"],
  ["ban", "Blochează (ban)"],
  ["delete", "Șterge mesajul"],
] as const;
const SEVERITIES = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]] as const;

const initialAntiSpam: AntiSpam = {
  enabled: true,
  logChannelId: "128745903217654784",
  message: { enabled: true, action: "mute", severity: "normal", thresholds: { messages: 5, windowMs: 5 } },
  edit: { enabled: true, action: "warn", severity: "soft", thresholds: { edits: 5, windowMs: 10 } },
  delete: { enabled: false, action: "none", severity: "normal", thresholds: { deletes: 5, windowMs: 10 } },
  mention: { enabled: true, action: "warn", severity: "normal", thresholds: { mentions: 5 } },
  emoji: { enabled: false, action: "none", severity: "soft", thresholds: { emoji: 10 } },
};

type Threshold = {
  key: string;
  label: string;
  help: string;
  example: (value: number, thresholds: Record<string, number>) => string;
  min: number;
  max: number;
  aliases: string[];
};
const messageThresholds: Threshold[] = [
  { key: "messages", label: "Mesaje", help: "Mesaje până la declanșare.", example: (value, thresholds) => `Exemplu: ${value} mesaje în ${thresholds.windowMs ?? 5} secunde declanșează regula.`, min: 1, max: 1000, aliases: ["messages", "limit", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", example: (value, thresholds) => `Exemplu: se numără mesajele din ultimele ${value} secunde (limita este ${thresholds.messages ?? 5}).`, min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const editThresholds: Threshold[] = [
  { key: "edits", label: "Editări", help: "Editări până la declanșare.", example: (value, thresholds) => `Exemplu: ${value} editări în ${thresholds.windowMs ?? 10} secunde declanșează regula.`, min: 1, max: 1000, aliases: ["limit", "edits", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", example: (value, thresholds) => `Exemplu: se numără editările din ultimele ${value} secunde (limita este ${thresholds.edits ?? 5}).`, min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const deleteThresholds: Threshold[] = [
  { key: "deletes", label: "Ștergeri", help: "Ștergeri până la declanșare.", example: (value, thresholds) => `Exemplu: ${value} ștergeri în ${thresholds.windowMs ?? 10} secunde declanșează regula.`, min: 1, max: 1000, aliases: ["limit", "deletes", "max"] },
  { key: "windowMs", label: "Fereastră (secunde)", help: "Intervalul de măsurare în secunde.", example: (value, thresholds) => `Exemplu: se numără ștergerile din ultimele ${value} secunde (limita este ${thresholds.deletes ?? 5}).`, min: 1, max: 3600, aliases: ["windowMs", "window", "seconds"] },
];
const mentionThresholds: Threshold[] = [
  { key: "mentions", label: "Mențiuni", help: "Mențiuni într-un mesaj până la declanșare.", example: (value) => `Exemplu: un mesaj cu ${value} mențiuni atinge această limită.`, min: 1, max: 100, aliases: ["mentions", "limit", "max"] },
];
const emojiThresholds: Threshold[] = [
  { key: "emoji", label: "Emoji", help: "Număr maxim de emoji.", example: (value) => `Exemplu: un mesaj cu ${value} emoji ajunge la limita setată.`, min: 1, max: 200, aliases: ["emoji", "limit", "max"] },
];

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}{help && <span className="block text-xs text-muted-foreground">{help}</span>}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><p className="text-sm font-medium">{label}</p><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></div>;
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <Field label={label}><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></Field>;
}

function NumberField({ field, rule, onChange }: { field: Threshold; rule: Rule; onChange: (thresholds: Record<string, number>) => void }) {
  const value = rule.thresholds[field.key] ?? field.aliases.map((key) => rule.thresholds[key]).find((item) => item !== undefined);
  const exampleValue = value ?? field.min;
  return <Field label={field.label} help={field.help}>
    <Input type="number" min={field.min} max={field.max} value={value ?? ""} onChange={(event) => {
      const next = { ...rule.thresholds };
      field.aliases.forEach((key) => delete next[key]);
      if (event.target.value !== "") next[field.key] = Number(event.target.value);
      onChange(next);
    }} />
    <span className="block rounded-md border border-border/70 bg-muted/45 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{field.example(exampleValue, rule.thresholds)}</span>
  </Field>;
}

function RuleEditor({ title, rule, thresholds, actions = ACTIONS, onChange }: { title: string; rule: Rule; thresholds: Threshold[]; actions?: readonly (readonly [string, string])[]; onChange: (rule: Rule) => void }) {
  return <div className="anti-spam-rule space-y-4 rounded-lg border p-4">
    <h4 className="font-medium">{title}</h4>
    <div className="grid gap-3 md:grid-cols-3">
      <Toggle label="Regulă activă" checked={rule.enabled} onChange={(enabled) => onChange({ ...rule, enabled })} />
      <Choice label="Acțiune" value={rule.action} options={actions} onChange={(action) => onChange({ ...rule, action })} />
      <Choice label="Severitate" value={rule.severity} options={SEVERITIES} onChange={(severity) => onChange({ ...rule, severity })} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{thresholds.map((field) => <NumberField key={field.key} field={field} rule={rule} onChange={(thresholds) => onChange({ ...rule, thresholds })} />)}</div>
  </div>;
}

export function Examples() {
  const [antiSpam, setAntiSpam] = useState<AntiSpam>(initialAntiSpam);
  const [saved, setSaved] = useState(true);
  const protectionEnabled = false;
  const update = (next: AntiSpam) => { setAntiSpam(next); setSaved(false); };
  const updateRule = (key: keyof Pick<AntiSpam, "message" | "edit" | "delete" | "mention" | "emoji">, rule: Rule) => update({ ...antiSpam, [key]: rule });

  return <main className="anti-spam-settings min-h-screen px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="mb-3 text-sm text-muted-foreground">Configurare</p>
        <h1 className="text-3xl font-bold">Anti-Spam</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.</p>
      </header>
      <Accordion type="multiple" defaultValue={["anti-spam"]} className="space-y-3">
        <AccordionItem value="anti-spam" className="anti-spam-card rounded-xl border px-5">
          <AccordionTrigger className="no-underline hover:no-underline"><span><span className="block text-base">3. Anti-spam</span><span className="block pt-1 text-xs font-normal text-muted-foreground">Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.</span></span></AccordionTrigger>
          <AccordionContent className="space-y-5">
            <Toggle label="Activează anti-spam" checked={antiSpam.enabled} onChange={(enabled) => update({ ...antiSpam, enabled })} />
            {antiSpam.enabled && !protectionEnabled && <p className="anti-spam-warning text-sm">Activează și Protecția generală; altfel regulile anti-spam nu rulează.</p>}
            <Field label="Canal jurnal anti-spam" help="ID canal Discord (Developer Mode); lasă gol pentru neconfigurat."><Input value={antiSpam.logChannelId ?? ""} placeholder="123456789012345678" onChange={(event) => update({ ...antiSpam, logChannelId: event.target.value.trim() || null })} /></Field>
            <RuleEditor title="Spam de mesaje" rule={antiSpam.message} thresholds={messageThresholds} onChange={(rule) => updateRule("message", rule)} />
            <RuleEditor title="Spam de editări" rule={antiSpam.edit} thresholds={editThresholds} onChange={(rule) => updateRule("edit", rule)} />
            {antiSpam.enabled && antiSpam.edit.enabled && antiSpam.edit.action === "none" && <p className="anti-spam-warning text-sm">Regula de editări nu va sancționa: acțiunea este „Nicio acțiune”.</p>}
            <RuleEditor title="Spam de ștergeri" rule={antiSpam.delete} thresholds={deleteThresholds} actions={ACTIONS.filter(([key]) => key !== "delete")} onChange={(rule) => updateRule("delete", rule)} />
            {antiSpam.enabled && antiSpam.delete.enabled && <p className="anti-spam-footnote text-sm">Sancțiunile pentru ștergeri necesită „Vezi jurnalul de audit” și un operator identificat acolo. Pentru ștergeri fără autor verificabil, botul doar alertează; un mesaj deja șters nu poate fi șters din nou.</p>}
            <RuleEditor title="Spam de mențiuni" rule={antiSpam.mention} thresholds={mentionThresholds} onChange={(rule) => updateRule("mention", rule)} />
            <RuleEditor title="Spam de emoji" rule={antiSpam.emoji} thresholds={emojiThresholds} onChange={(rule) => updateRule("emoji", rule)} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {!saved && <div className="anti-spam-card sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm text-muted-foreground">Ai modificări nesalvate.</span><Button className="anti-spam-save" onClick={() => setSaved(true)}>Salvează</Button></div>}
    </div>
  </main>;
}
