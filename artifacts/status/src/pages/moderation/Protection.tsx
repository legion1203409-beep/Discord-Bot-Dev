import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Shield, UserMinus, MessageSquare, AlertOctagon, Loader2 } from "lucide-react";
import { useModerationConfig, useActiveGuild } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../../components/ui/toast";

const protectionFormSchema = z.object({
  antiRaidEnabled: z.boolean(),
  joinsPerMinute: z.coerce.number().min(1).max(1000),
  lockdown: z.boolean(),
  antiSpamEnabled: z.boolean(),
  antiFloodEnabled: z.boolean(),
  suspiciousEnabled: z.boolean(),
});

export function ProtectionPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof protectionFormSchema>>({
    resolver: zodResolver(protectionFormSchema),
    defaultValues: {
      antiRaidEnabled: false,
      joinsPerMinute: 10,
      lockdown: false,
      antiSpamEnabled: false,
      antiFloodEnabled: false,
      suspiciousEnabled: false,
    },
  });

  const initializedForId = React.useRef<string | null>(null);
  useEffect(() => {
    if (data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      form.reset({
        antiRaidEnabled: data.antiRaid?.enabled ?? false,
        joinsPerMinute: data.antiRaid?.joinsPerMinute ?? 10,
        lockdown: data.antiRaid?.lockdown ?? false,
        antiSpamEnabled: data.antiSpam?.enabled ?? false,
        antiFloodEnabled: data.antiFlood?.enabled ?? false,
        suspiciousEnabled: data.suspiciousBehavior?.enabled ?? false,
      });
    }
  }, [data, form, guildId]);

  async function onSubmit(values: z.infer<typeof protectionFormSchema>) {
    if (!data) return;
    setSaving(true);
    try {
      await update({
        ...data,
        antiRaid: {
          ...data.antiRaid,
          enabled: values.antiRaidEnabled,
          joinsPerMinute: values.joinsPerMinute,
          lockdown: values.lockdown,
        },
        antiSpam: { ...data.antiSpam, enabled: values.antiSpamEnabled },
        antiFlood: { ...data.antiFlood, enabled: values.antiFloodEnabled },
        suspiciousBehavior: { ...data.suspiciousBehavior, enabled: values.suspiciousEnabled },
      });
      toast({ title: "Setări salvate", description: "Configurația de protecție a fost actualizată." });
    } catch (err: any) {
      if (err.message.includes("Conflict")) {
        toast({
          variant: "destructive",
          title: "Conflict de versiune",
          description: "Setările au fost modificate în altă parte.",
          action: <ToastAction altText="Reîncarcă" onClick={() => { if (initializedForId) initializedForId.current = null; window.location.reload(); }}>Reîncarcă</ToastAction>
        });
      } else {
        toast({ variant: "destructive", title: "Eroare", description: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error || !data) return <div role="alert" className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6"><p>{error?.message || "Nu s-a putut încărca configurația."}</p><Button variant="outline" onClick={() => void refetch()}>Reîncearcă</Button></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" /> Protecție Server
        </h1>
        <p className="text-muted-foreground">Sisteme defensive împotriva raidurilor, spamului și flood-ului.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="grid grid-cols-1 gap-6">
            {/* Anti-Raid */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <UserMinus className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-medium">Sistem Anti-Raid</h3>
              </div>
              
              <FormField
                control={form.control}
                name="antiRaidEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Activează Anti-Raid</FormLabel>
                      <FormDescription>Monitorizează valurile masive de intrări.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="joinsPerMinute"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intrări permise per minut (Prag)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lockdown"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background">
                      <div className="space-y-0.5">
                        <FormLabel>Auto-Lockdown</FormLabel>
                        <FormDescription>Oprește complet intrările noi în caz de raid.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Spam & Flood */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Control Trafic</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="antiSpamEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Anti-Spam</FormLabel>
                        <FormDescription>Prevenire mesaje repetitive rapide.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="antiFloodEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Anti-Flood</FormLabel>
                        <FormDescription>Blocare mesaje gigantice (ziduri de text).</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Suspicious */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <AlertOctagon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Comportament Suspect</h3>
              </div>
              
              <FormField
                control={form.control}
                name="suspiciousEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Detectare Anomalii</FormLabel>
                      <FormDescription>Monitorizează schimbări rapide de nickname și roluri.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="sticky bottom-3 z-20 flex w-full justify-end py-2">
            <div className="ml-auto rounded-xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Se salvează..." : "Salvează Setările"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
