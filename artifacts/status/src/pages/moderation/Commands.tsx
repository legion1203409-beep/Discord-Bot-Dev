import { useState } from "react";
import { Zap, AlertTriangle, Send, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useManualAction, useActiveGuild } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { Textarea } from "../../components/ui/textarea";

const actionSchema = z.object({
  type: z.enum(["warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role"]),
  targetId: z.string().optional(),
  reason: z.string().max(500).optional(),
  durationMinutes: z.coerce.number().min(1).max(40320).optional(),
  channelId: z.string().optional(),
  roleId: z.string().optional(),
  nickname: z.string().max(32).optional(),
  amount: z.coerce.number().min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  if (["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(value.type) && !value.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul țintei este necesar", path: ["targetId"] });
  }
  if (value.type === "mute" && !value.durationMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Durata este necesară", path: ["durationMinutes"] });
  }
  if (value.type === "purge" && !value.amount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numărul de mesaje este necesar", path: ["amount"] });
  }
});

export function CommandsPage() {
  const { guildId } = useActiveGuild();
  const { execute: executeAction, resetKey } = useManualAction(guildId);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof actionSchema>>({
    resolver: zodResolver(actionSchema),
    defaultValues: { type: "warn", reason: "" },
  });

  const actionType = form.watch("type");

  async function onSubmit(values: z.infer<typeof actionSchema>) {
    if (!confirm(`Ești sigur că vrei să execuți acțiunea ${values.type.toUpperCase()}? Această operațiune va afecta direct serverul de Discord.`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await executeAction(values);
      toast({ title: "Acțiune executată", description: "Comanda a fost trimisă cu succes către Oracol." });
      form.reset({ type: values.type, reason: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Acțiune eșuată", description: err.message });
    } finally {
      setLoading(false);
    }
  }

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" /> Acțiuni Manuale
        </h1>
        <p className="text-muted-foreground">Execută comenzi de moderare direct din consolă, ocolind Discord-ul.</p>
      </div>

      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong>Atenție!</strong> Orice acțiune executată aici va fi aplicată instantaneu pe serverul Discord selectat.
          Toate comenzile sunt înregistrate în sistemul de audit.
        </div>
      </div>

      <div className="bg-card border border-border p-6 rounded-xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipul Acțiunii</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background"><SelectValue placeholder="Alege comanda" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="warn">Avertisment (Warn)</SelectItem>
                        <SelectItem value="mute">Mute</SelectItem>
                        <SelectItem value="unmute">Unmute</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="ban">Ban</SelectItem>
                        <SelectItem value="purge">Șterge Mesaje (Purge)</SelectItem>
                        <SelectItem value="lock">Închide Canal (Lock)</SelectItem>
                        <SelectItem value="unlock">Deschide Canal (Unlock)</SelectItem>
                        <SelectItem value="nick">Schimbă Nickname</SelectItem>
                        <SelectItem value="role">Acordă Rol</SelectItem>
                        <SelectItem value="slowmode">Setează Slowmode</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(actionType) && (
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Utilizator (Țintă)</FormLabel>
                      <FormControl>
                        <Input placeholder="Discord User ID (ex: 123456789...)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {["lock", "unlock", "slowmode"].includes(actionType) && (
                <FormField
                  control={form.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Canal</FormLabel>
                      <FormControl>
                        <Input placeholder="Discord Channel ID" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "mute" && (
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durată (Minute)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="60" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}


              {actionType === "nick" && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nou Nickname</FormLabel>
                      <FormControl>
                        <Input placeholder="Nume nou (max 32 char)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "role" && (
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Rol</FormLabel>
                      <FormControl>
                        <Input placeholder="Discord Role ID" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "slowmode" && (
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durată Slowmode (Minute)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="5" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "purge" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Număr de mesaje de șters</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Ex: 50 (Max: 100)" {...field} value={field.value || ""} />
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
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4 border-t border-border">
              <Button type="submit" disabled={loading} className="gap-2 px-8">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Execută Comanda
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
