import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Search, ShieldCheck, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  useActiveGuild,
  useBotControl,
  useModerationMetadata,
  useVerifiedMembers,
  type BotControlConfig,
} from "../../hooks/use-moderation-api";
import { useToast } from "../../hooks/use-toast";

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

export function VerificationAdminPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, update } = useBotControl(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const {
    data: verifiedMembersData,
    loading: verifiedMembersLoading,
    error: verifiedMembersError,
    refetch: refetchVerifiedMembers,
  } = useVerifiedMembers(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [verificationSearch, setVerificationSearch] = useState("");

  useEffect(() => {
    setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
  }, [data]);

  const setVerification = (
    field: keyof BotControlConfig["verification"],
    value: string | boolean,
  ) => {
    setDraft((current) => current ? {
      ...current,
      verification: { ...current.verification, [field]: value },
    } : current);
  };

  const openBotInvite = async () => {
    if (!guildId) return;
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/moderation/guilds/${guildId}/verification/invite`, {
        credentials: "include",
      });
      const payload = await response.json() as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error ?? "Linkul de autorizare nu este disponibil.");
      }
      window.open(payload.inviteUrl, "_blank", "noopener,noreferrer");
    } catch (inviteError) {
      toast({
        variant: "destructive",
        title: "Autorizarea botului a eșuat",
        description: inviteError instanceof Error ? inviteError.message : "Încearcă din nou.",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
      });
      toast({
        title: "Verificarea a fost salvată",
        description: "Configurația Discord și asocierea cu site-ul sunt persistente.",
      });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Salvarea a eșuat",
        description: saveError instanceof Error ? saveError.message : "Încearcă din nou.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {error?.message ?? "Setările verificării nu au putut fi încărcate."}
      </div>
    );
  }

  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const normalizedSearch = verificationSearch.trim().toLocaleLowerCase("ro");
  const filteredVerifiedMembers = (verifiedMembersData?.members ?? []).filter((member) => {
    if (!normalizedSearch) return true;
    return [member.displayName, member.username, member.id]
      .some((value) => value.toLocaleLowerCase("ro").includes(normalizedSearch));
  });

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="mod-eyebrow">CONFIGURARE SEPARATĂ</p>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <ShieldCheck className="h-8 w-8 text-primary" /> Verificare
        </h1>
        <p className="text-muted-foreground">
          Configurează verificarea Discord + site și vezi membrii care au rolul de verificare.
        </p>
      </header>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-medium">Verificare Discord + site</h2>
              <p className="text-xs text-muted-foreground">
                Membrul confirmă identitatea prin Discord, primește rolul ales și rămâne asociat cu sesiunea de verificare a site-ului.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.verification.enabled}
              onChange={(event) => setVerification("enabled", event.target.checked)}
            />
            Activ
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Canalul panoului</label>
            <Select
              value={textChannels.some((channel) => channel.id === draft.verification.channelId)
                ? draft.verification.channelId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "channelId",
                value === "__manual__" ? draft.verification.channelId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.channelId}
              placeholder="ID canal Discord"
              onChange={(event) => setVerification("channelId", event.target.value.trim())}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rolul acordat</label>
            <Select
              value={metadata?.roles.some((role) => role.id === draft.verification.roleId && !role.managed)
                ? draft.verification.roleId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "roleId",
                value === "__manual__" ? draft.verification.roleId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege rol" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {metadata?.roles.filter((role) => !role.managed).map((role) => (
                  <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.roleId}
              placeholder="ID rol Discord"
              onChange={(event) => setVerification("roleId", event.target.value.trim())}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Titlul mesajului</label>
            <Input maxLength={256} value={draft.verification.title} onChange={(event) => setVerification("title", event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Textul butonului</label>
            <Input maxLength={80} value={draft.verification.buttonLabel} onChange={(event) => setVerification("buttonLabel", event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Emoji buton</label>
            <Input maxLength={100} value={draft.verification.buttonEmoji} placeholder="✅" onChange={(event) => setVerification("buttonEmoji", event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mesaj după succes</label>
            <Input maxLength={2000} value={draft.verification.successMessage} onChange={(event) => setVerification("successMessage", event.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Textul panoului</label>
          <Textarea rows={5} maxLength={4000} value={draft.verification.message} onChange={(event) => setVerification("message", event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Mesaj dacă membrul este deja verificat</label>
          <Textarea rows={3} maxLength={2000} value={draft.verification.alreadyVerifiedMessage} onChange={(event) => setVerification("alreadyVerifiedMessage", event.target.value)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
          <div>
            <p className="text-sm font-medium">Pasul administratorului</p>
            <p className="text-xs text-muted-foreground">Botul trebuie să fie instalat pe server și să aibă rolul botului deasupra rolului de verificare.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void openBotInvite()} disabled={inviteLoading}>
            {inviteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Autorizează / invită botul
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Users className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-medium">Membri verificați</h2>
              <p className="text-xs text-muted-foreground">Lista live a membrilor care au în prezent rolul de verificare configurat.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-medium">
              {verifiedMembersData?.total ?? 0} membri
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetchVerifiedMembers()}
              disabled={verifiedMembersLoading}
              title="Reîncarcă lista"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${verifiedMembersLoading ? "animate-spin" : ""}`} />
              Reîncarcă
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={verificationSearch}
            onChange={(event) => setVerificationSearch(event.target.value)}
            placeholder="Caută după nume, username sau ID Discord"
            aria-label="Caută membri verificați"
            className="pl-9"
          />
        </div>

        {verifiedMembersLoading && !verifiedMembersData ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se încarcă membrii verificați…
          </div>
        ) : verifiedMembersError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {verifiedMembersError.message}
          </div>
        ) : !draft.verification.roleId ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Configurează și salvează rolul de verificare pentru a vedea membrii.
          </div>
        ) : filteredVerifiedMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {verificationSearch.trim() ? "Nu există membri care corespund căutării." : "Nu există membri verificați în acest moment."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Membru</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">ID Discord</th>
                  <th className="px-4 py-3 font-medium">În server din</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredVerifiedMembers.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={member.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-muted object-cover" />
                        <span className="font-medium">{member.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">@{member.username}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{member.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ro-RO") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Se salvează…" : "Salvează verificarea"}
        </Button>
      </div>
    </div>
  );
}