import { useState } from "react";
import { Zap, AlertTriangle, Send, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useManualAction, useActiveGuild, useModerationMetadata, type BulkRoleGrantPreview } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { Textarea } from "../../components/ui/textarea";
import {
  getManualCommandDefinition,
  MANUAL_COMMAND_GROUPS_WITH_COMMANDS,
} from "../../lib/manual-command-catalog";
import { actionSchema } from "../../lib/moderation-form-schemas";

type ActionValues = z.infer<typeof actionSchema>;
type ActionAttempt = ActionValues & {
  previewToken?: string;
  previewSummary?: BulkRoleGrantPreview;
};

function MetadataSelectField({
  label,
  fallbackLabel,
  field,
  options,
}: {
  label: string;
  fallbackLabel: string;
  field: { value?: string; onChange: (value: string) => void };
  options: Array<{ id: string; name: string; managed?: boolean }>;
}) {
  const selected = options.some((option) => option.id === field.value) ? field.value : undefined;
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <Select value={selected} onValueChange={field.onChange}>
        <FormControl>
          <SelectTrigger className="bg-background" data-testid={`select-manual-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <SelectValue placeholder={`Alege ${label.toLowerCase()}`} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} disabled={option.managed}>
              {option.name} ({option.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={`${label} - ${fallbackLabel}`}
        data-testid={`input-manual-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-id`}
        placeholder={`${fallbackLabel} (ID Discord)`}
        value={field.value || ""}
        onChange={(event) => field.onChange(event.target.value.trim())}
      />
      <p className="text-xs text-muted-foreground">Poți introduce manual ID-ul dacă nu este disponibil în metadate.</p>
    </div>
  );
}

export function CommandsPage() {
  const { guildId } = useActiveGuild();
  const { execute: executeAction, previewBulkRoleGrant } = useManualAction(guildId);
  const { data: metadata, error: metadataError } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [lastAttempt, setLastAttempt] = useState<ActionAttempt | null>(null);

  const form = useForm<z.input<typeof actionSchema>, unknown, z.output<typeof actionSchema>>({
    resolver: zodResolver(actionSchema),
    defaultValues: { type: "warn", reason: "", allMembers: false },
  });

  const actionType = form.watch("type");
  const applyRoleToAllMembers = form.watch("allMembers") === true;
  const selectedCommand = getManualCommandDefinition(actionType);

  async function submitAction(values: ActionAttempt, isRetry = false) {
    setLastResult(null);
    setLoading(true);
    setActionError(null);
    try {
      let attempt = values;
      if (values.type === "role" && values.allMembers) {
        if (!values.roleId) throw new Error("Alege rolul înainte de previzualizare.");
        if (!(isRetry && values.previewToken && values.previewSummary)) {
          const preview = await previewBulkRoleGrant(values.roleId);
          attempt = { ...values, previewToken: preview.previewToken, previewSummary: preview };
        }
        const preview = attempt.previewSummary;
        if (!preview) throw new Error("Previzualizarea membrilor nu este disponibilă. Încearcă din nou.");
        if (preview.eligibleCount === 0) {
          throw new Error(`Niciun membru nu poate primi rolul. ${preview.alreadyAssignedCount} îl au deja; ${preview.skippedCount} au fost omiși.`);
        }
        const confirmation = [
          `Server: ${preview.guildName}`,
          `Rol: @${preview.roleName}`,
          `Vor primi rolul: ${preview.eligibleCount} membri umani.`,
          `Au deja rolul: ${preview.alreadyAssignedCount}. Vor fi omiși: ${preview.skippedCount} (inclusiv ${preview.botCount} conturi bot).`,
          "Se aplică numai membrilor existenți acum. Confirmi?",
        ].join("\n");
        if (!confirm(confirmation)) return;
      } else {
        if (!confirm(`Ești sigur că vrei să execuți acțiunea ${values.type.toUpperCase()}? Această operațiune va afecta direct serverul de Discord.`)) {
          return;
        }
      }

      setLastAttempt(attempt);
      const { previewSummary: _previewSummary, ...payload } = attempt;
      const res = await executeAction(payload);
      setLastResult(res);
      toast({ title: "Acțiune executată", description: "Comanda a fost trimisă cu succes către Oracol." });
    } catch (err: any) {
      const message = err?.message || "Acțiunea nu a putut fi executată.";
      setLastResult(null);
      setActionError(message);
      toast({ variant: "destructive", title: "Acțiune eșuată", description: message });
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(values: ActionValues) {
    void submitAction(values);
  }

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  return (
      <div className="mx-auto max-w-5xl space-y-6 pb-28">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" /> Acțiuni Manuale
        </h1>
        <p className="text-muted-foreground">Alege o intervenție, completează datele și confirmă execuția asupra serverului selectat.</p>
      </div>

      <div className="bg-primary/10 border border-primary/30 text-primary p-4 rounded-xl flex gap-3" data-testid="notice-manual-action-warning">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong className="text-foreground">Atenție!</strong> Orice acțiune executată aici va fi aplicată instantaneu pe serverul Discord selectat.
          Toate comenzile sunt înregistrate în sistemul de audit.
        </div>
      </div>
      {metadataError && (
          <div role="alert" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
          Metadatele Discord nu au putut fi încărcate ({metadataError.message}). Poți continua cu ID-uri introduse manual.
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p>{actionError}</p>
          {lastAttempt && (
              <Button type="button" variant="outline" className="mt-3" disabled={loading} onClick={() => void submitAction(lastAttempt, true)} data-testid="button-manual-action-retry">
              Reîncearcă aceeași acțiune
            </Button>
          )}
        </div>
      )}
      {lastResult !== null && (
        <div role="status" data-testid="manual-action-result" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
          <strong>Rezultatul acțiunii</strong>
          <pre className="mt-2 max-w-full overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(lastResult, null, 2)}</pre>
        </div>
      )}

      <div className="bg-card border border-border p-5 sm:p-6 rounded-xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <FormLabel className="text-base">Alege acțiunea</FormLabel>
                      <FormDescription>Comenzile sunt grupate după tipul intervenției.</FormDescription>
                    </div>
                    <span className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[11px] text-primary" data-testid="status-selected-manual-command">/{selectedCommand.key}</span>
                  </div>
                  <FormControl>
                    <div className="grid gap-4 lg:grid-cols-3" role="group" aria-label="Comenzi manuale" data-testid="manual-command-picker">
                      {MANUAL_COMMAND_GROUPS_WITH_COMMANDS.map((group) => (
                        <section key={group.key} className="rounded-xl border border-border/70 bg-background/35 p-3" aria-labelledby={`manual-command-group-${group.key}`}>
                          <h3 id={`manual-command-group-${group.key}`} className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}<span className="font-mono text-[10px]">{String(group.commands.length).padStart(2, "0")}</span>
                          </h3>
                          <div className="grid gap-2">
                            {group.commands.map((command) => {
                              const selected = field.value === command.key;
                              return (
                                <button
                                  key={command.key}
                                  type="button"
                                  onClick={() => {
                                    form.setValue("type", command.key, { shouldDirty: true, shouldValidate: true });
                                    if (command.key !== "role") form.setValue("allMembers", false, { shouldDirty: true, shouldValidate: true });
                                  }}
                                  aria-pressed={selected}
                                  data-testid={`button-pick-command-${command.key}`}
                                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 bg-card/70 text-muted-foreground hover:border-primary/35 hover:text-foreground"}`}
                                >
                                  <span className="min-w-0 truncate">{command.label}</span>
                                  <span className={`shrink-0 font-mono text-[10px] ${selected ? "text-primary" : "text-muted-foreground/70"}`}>/{command.key}</span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-6 border-t border-border/60 pt-5 md:grid-cols-2">
              {selectedCommand.key === "role" && (
                <FormField
                  control={form.control}
                  name="allMembers"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 md:col-span-2">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <input
                            id="manual-role-all-members"
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-primary"
                            data-testid="checkbox-role-all-members"
                            checked={Boolean(field.value)}
                            onChange={(event) => {
                              field.onChange(event.target.checked);
                              if (event.target.checked) {
                                form.setValue("targetId", undefined, { shouldDirty: true, shouldValidate: true });
                              }
                            }}
                          />
                        </FormControl>
                        <div>
                          <FormLabel htmlFor="manual-role-all-members" className="cursor-pointer">Adaugă rolul tuturor membrilor actuali</FormLabel>
                          <FormDescription>
                            Se aplică membrilor umani eligibili din serverul selectat. Boții, membrii cu roluri protejate sau deasupra ierarhiei și cei care au deja rolul sunt omiși.
                          </FormDescription>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.target === "user" && !(selectedCommand.key === "role" && applyRoleToAllMembers) && (
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Utilizator (Țintă)</FormLabel>
                      <FormControl>
                        <Input data-testid="input-manual-target-user-id" placeholder="ID utilizator Discord" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.target === "channel" && (
                <FormField
                  control={form.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <MetadataSelectField
                        label="Canal"
                        fallbackLabel="ID canal"
                        field={field}
                        options={(metadata?.channels || []).map((channel) => ({ id: channel.id, name: `#${channel.name}` }))}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.extraField === "durationMinutes" && (
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durată (Minute)</FormLabel>
                      <FormControl>
                         <Input data-testid="input-manual-duration-minutes" type="number" placeholder="60" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}


              {selectedCommand.extraField === "nickname" && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nou Nickname</FormLabel>
                      <FormControl>
                        <Input data-testid="input-manual-nickname" placeholder="Nume nou (maxim 32 caractere)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.extraField === "roleId" && (
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <MetadataSelectField
                        label="Rol"
                        fallbackLabel="ID rol"
                        field={field}
                        options={(metadata?.roles || []).map((role) => ({ id: role.id, name: `@${role.name}`, managed: role.managed }))}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.extraField === "slowmodeAmount" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                         <FormLabel>Slowmode (secunde, 0 = oprit)</FormLabel>
                      <FormControl>
                            <Input data-testid="input-manual-slowmode-seconds" type="number" min={0} max={21600} placeholder="5" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCommand.extraField === "purgeAmount" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Număr de mesaje de șters</FormLabel>
                      <FormControl>
                        <Input data-testid="input-manual-purge-amount" type="number" min={1} max={100} placeholder="De exemplu, 50 (maximum 100)" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivul Acțiunii (opțional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Motivul va fi înregistrat în loguri și trimis utilizatorului (după caz)..." 
                      className="resize-none h-24 bg-background"
                      data-testid="input-manual-action-reason"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-end gap-3">
              <div className="mod-save-actions ml-auto">
                <Button type="submit" disabled={loading} className="gap-2 px-8" data-testid="button-manual-action-submit">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {actionType === "role" && applyRoleToAllMembers ? "Adaugă rolul tuturor membrilor" : "Execută Comanda"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
