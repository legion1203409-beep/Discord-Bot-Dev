import React, { useEffect, useState } from "react";
import { Bot, Loader2, Save, Radio, Megaphone, Ticket, ShieldCheck, Timer, ScrollText, Coins, PlayCircle, RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useActiveGuild, useBotControl, useModerationMetadata, useSession, type BotControlConfig, type TicketFlowConfig } from "../../hooks/use-moderation-api";
import { useToast } from "../../hooks/use-toast";

const CHANNELS = [
  ["main", "Cufere și Oracol"],
  ["event", "Ora Umbrelor"],
  ["boss", "Dragonul Stins"],
  ["trader", "Negustorul"],
  ["eventTop", "Top Ora Umbrelor"],
  ["bossTop", "Top Dragonul Stins"],
  ["council", "Consiliul Umbrelor"],
  ["fratia", "Chivotul Frăției"],
] as const;

const TICKET_CATEGORIES = [
  ["staff", "Aplicare staff"],
  ["partnership", "Parteneriate"],
  ["help_report", "Ajutor / raportare"],
] as const;

const FLOW_KINDS = [
  ["staff", "Aplicare staff"],
  ["partnership", "Parteneriate"],
  ["help_report", "Ajutor / raportare"],
] as const;

const NEW_QUESTION = {
  key: "question",
  label: "Întrebare nouă",
  description: "Scrie întrebarea la care trebuie să răspundă membrul.",
  placeholder: "Scrie răspunsul tău...",
  multiline: true,
  required: true,
};

function getDuplicateQuestionKeys(flow: TicketFlowConfig): string[] {
  const counts = new Map<string, number>();
  for (const question of flow.questions) {
    const key = question.key.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function ImageField({
  label,
  value,
  guildId,
  csrfToken,
  onChange,
}: {
  label: string;
  value?: string;
  guildId: string | null;
  csrfToken?: string;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    if (!guildId) return;
    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/) || file.size > 10 * 1024 * 1024) {
      setError("Alege PNG, JPG, GIF sau WEBP, maximum 10 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        credentials: "include",
        body: JSON.stringify({ guildId, name: file.name, size: file.size, contentType: file.type }),
      });
      const payload = await request.json() as { uploadURL?: string; objectPath?: string; error?: string };
      if (!request.ok || !payload.uploadURL || !payload.objectPath) throw new Error(payload.error ?? "Uploadul a eșuat.");
      const uploaded = await fetch(payload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!uploaded.ok) throw new Error("Imaginea nu a putut fi încărcată în storage.");
      onChange(`/api/storage${payload.objectPath}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Uploadul a eșuat.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <label className="text-xs font-medium">{label}</label>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input
          value={value ?? ""}
          placeholder="URL imagine sau folosește Upload"
          onChange={(event) => onChange(event.target.value)}
        />
        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-muted">
          {uploading ? "Se încarcă…" : "Încarcă imagine"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {value && <img src={value} alt="" className="max-h-32 rounded-md border border-border object-contain" />}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Emoji-urile se pot introduce direct în orice text. Sunt acceptate linkuri HTTPS și imagini încărcate aici.</p>
    </div>
  );
}

function isCategory(type: number | string): boolean {
  return String(type) === "4" || type === "GuildCategory";
}

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

const PARTNERSHIP_PREVIEW_KEYS = [
  "server_name",
  "representative",
  "invite",
  "members",
  "description",
  "motivation",
  "offer",
  "terms",
] as const;

function previewValue(value: string | undefined, fallback = "—"): string {
  return value?.trim() || fallback;
}

function partnershipPreviewAnswers(
  flow: TicketFlowConfig,
  answers: Record<string, string>,
): Record<string, string> {
  const orderedAnswers = flow.questions
    .map((question) => answers[question.key])
    .filter((value): value is string => Boolean(value?.trim()));
  return Object.fromEntries(
    PARTNERSHIP_PREVIEW_KEYS.map((key, index) => [
      key,
      answers[key] ?? orderedAnswers[index] ?? "—",
    ]),
  );
}

function renderAnnouncementTemplate(
  template: string,
  answers: Record<string, string>,
): string {
  const values: Record<string, string> = {
    ...answers,
    applicant: "Membrul care testează",
    applicant_mention: "@Membrul care testează",
    members_total: answers.members_total ?? "150",
    members_online: answers.members_online ?? "60",
  };
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key] ?? match);
}

export function BotControlPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, update, provisionChannels } = useBotControl(guildId);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const { session } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [activeFlowKind, setActiveFlowKind] = useState<keyof BotControlConfig["tickets"]["flows"]>("staff");
  const [testOpen, setTestOpen] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);
  const [testStep, setTestStep] = useState(0);
  const [testDraftAnswer, setTestDraftAnswer] = useState("");
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [testError, setTestError] = useState("");

  useEffect(() => {
    setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
  }, [data]);

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      channels: { ...current.channels, [key]: value === "__none__" ? "" : value },
    } : current);
  };

  const setTicket = (path: string[], value: string | number) => {
    setDraft((current) => {
      if (!current) return current;
      const tickets = JSON.parse(JSON.stringify(current.tickets));
      let target: any = tickets;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return { ...current, tickets };
    });
  };

  const setFlow = (kind: keyof BotControlConfig["tickets"]["flows"], field: keyof TicketFlowConfig, value: string) => {
    setDraft((current) => current ? {
      ...current,
      tickets: {
        ...current.tickets,
        flows: {
          ...current.tickets.flows,
          [kind]: { ...current.tickets.flows[kind], [field]: value },
        },
      },
    } : current);
  };

  const setPostedQuestion = (
    kind: keyof BotControlConfig["tickets"]["flows"],
    key: string,
    included: boolean,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const selected = flow.postedQuestionKeys ?? flow.questions.map((question) => question.key);
      const postedQuestionKeys = included
        ? Array.from(new Set([...selected, key]))
        : selected.filter((selectedKey) => selectedKey !== key);
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", postedQuestionKeys } },
        },
      };
    });
  };

  const updateQuestion = (
    kind: keyof BotControlConfig["tickets"]["flows"],
    index: number,
    field: string,
    value: string | boolean,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const previousKey = flow.questions[index]?.key;
      const questions = flow.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question,
      );
      const currentPostedKeys = flow.postedQuestionKeys ?? flow.questions.map((question) => question.key);
      const postedQuestionKeys = field === "key" && typeof value === "string"
        ? currentPostedKeys.map((key) => key === previousKey ? value : key)
        : currentPostedKeys.filter((key) => questions.some((question) => question.key === key));
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, questions, postedQuestionKeys } },
        },
      };
    });
  };

  const addQuestion = (kind: keyof BotControlConfig["tickets"]["flows"]) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const suffix = flow.questions.length + 1;
      const question = { ...NEW_QUESTION, key: `question_${suffix}` };
      const postedQuestionKeys = [...(flow.postedQuestionKeys ?? flow.questions.map((entry) => entry.key)), question.key];
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions: [...flow.questions, question], postedQuestionKeys } },
        },
      };
    });
  };

  const removeQuestion = (kind: keyof BotControlConfig["tickets"]["flows"], index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      if (flow.questions.length <= 1) return current;
      const removedKey = flow.questions[index]?.key;
      const postedQuestionKeys = (flow.postedQuestionKeys ?? flow.questions.map((entry) => entry.key))
        .filter((key) => key !== removedKey);
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions: flow.questions.filter((_, questionIndex) => questionIndex !== index), postedQuestionKeys } },
        },
      };
    });
  };

  const moveQuestion = (kind: keyof BotControlConfig["tickets"]["flows"], index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const flow = current.tickets.flows[kind];
      const target = index + direction;
      if (target < 0 || target >= flow.questions.length) return current;
      const questions = [...flow.questions];
      [questions[index], questions[target]] = [questions[target]!, questions[index]!];
      return {
        ...current,
        tickets: {
          ...current.tickets,
          flows: { ...current.tickets.flows, [kind]: { ...flow, mode: "custom", questions } },
        },
      };
    });
  };

  const setGameplay = (section: "events" | "missions" | "economy", key: string, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const numeric = Number(value);
      const [parent, child] = key.split(".");
      const currentSection = current.gameplayConfig[section] as Record<string, unknown>;
      const nextSection = child
        ? { ...currentSection, [parent]: { ...(currentSection[parent] as Record<string, unknown>), [child]: Number.isFinite(numeric) ? numeric : 0 } }
        : { ...currentSection, [key]: Number.isFinite(numeric) ? numeric : 0 };
      return { ...current, gameplayConfig: { ...current.gameplayConfig, [section]: nextSection } };
    });
  };

  const numberField = (
    section: "events" | "missions" | "economy",
    key: string,
    label: string,
    description: string,
    step = 1,
  ) => {
    if (!draft) return null;
    const [parent, child] = key.split(".");
    const sectionValue = draft.gameplayConfig[section] as Record<string, unknown>;
    const value = (child
      ? (sectionValue[parent] as Record<string, unknown>)?.[child]
      : sectionValue[key]) as number;
    return (
      <div className="space-y-2" key={`${section}-${key}`}>
        <label className="text-sm font-medium">{label}</label>
        <Input
          type="number"
          min={step === 0.1 ? 0.1 : 1}
          step={step}
          value={value}
          onChange={(event) => setGameplay(section, key, event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    );
  };

  const save = async () => {
    if (!draft) return;
    const duplicateFlow = Object.entries(draft.tickets.flows)
      .map(([kind, flow]) => ({ kind, flow, duplicateKeys: getDuplicateQuestionKeys(flow) }))
      .find(({ duplicateKeys }) => duplicateKeys.length > 0);
    if (duplicateFlow) {
      const flowLabel = FLOW_KINDS.find(([kind]) => kind === duplicateFlow.kind)?.[1] ?? duplicateFlow.kind;
      toast({
        variant: "destructive",
        title: "Salvarea a fost blocată",
        description: `Fluxul „${flowLabel}” are chei duplicate: ${duplicateFlow.duplicateKeys.join(", ")}. Schimbă cheile înainte de salvare.`,
      });
      return;
    }
    setSaving(true);
    try {
      const flows = Object.fromEntries(
        Object.entries(draft.tickets.flows).map(([kind, flow]) => [kind, { ...flow, mode: "custom" }]),
      ) as BotControlConfig["tickets"]["flows"];
      const saved = await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
        tickets: { ...draft.tickets, flows },
      });
      toast(saved.discordLive
        ? {
            title: "Setările sunt active pe Discord",
            description: "Canalele, tichetele, mesajele și programul de evenimente au fost sincronizate cu botul.",
          }
        : {
            variant: "destructive",
            title: "Salvate, dar botul Discord este offline",
            description: "Valorile sunt persistente și vor fi încărcate când botul se reconectează.",
          });
    } catch (saveError: any) {
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  const provision = async () => {
    setProvisioning(true);
    try {
      const saved = await provisionChannels();
      await refetchMetadata();
      const created = saved.provisioning?.created.length ?? 0;
      const reused = saved.provisioning?.reused.length ?? 0;
      toast({
        title: "Canalele au fost sincronizate",
        description: `${created} create, ${reused} reutilizate. Configurația a fost salvată pentru acest server.`,
      });
    } catch (provisionError: any) {
      toast({
        variant: "destructive",
        title: "Provisioningul a eșuat",
        description: provisionError?.message ?? "Verifică permisiunea Manage Channels și încearcă din nou.",
      });
    } finally {
      setProvisioning(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  const categories = metadata?.channels.filter((channel) => isCategory(channel.type)) ?? [];
  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const activeFlow = draft.tickets.flows[activeFlowKind];
  const duplicateQuestionKeys = getDuplicateQuestionKeys(activeFlow);
  const activeCategory = draft.tickets.categories[activeFlowKind];
  const selectedActiveCategory = categories.some((category) => category.id === activeCategory)
    ? activeCategory
    : "__manual__";
  const postedQuestionKeys = new Set(
    activeFlow.postedQuestionKeys ?? activeFlow.questions.map((question) => question.key),
  );
  const testQuestion = activeFlow.questions[testStep];
  const partnershipAnswers = activeFlowKind === "partnership"
    ? partnershipPreviewAnswers(activeFlow, testAnswers)
    : null;
  const partnershipAnnouncement = partnershipAnswers
    ? renderAnnouncementTemplate(
      draft.tickets.allianceAnnouncementTemplate,
      partnershipAnswers,
    )
    : "";
  const resetFlowTest = () => {
    setTestStarted(false);
    setTestCompleted(false);
    setTestStep(0);
    setTestDraftAnswer("");
    setTestAnswers({});
    setTestError("");
  };
  const openFlowTest = () => {
    resetFlowTest();
    setTestOpen(true);
  };
  const submitTestAnswer = () => {
    if (!testQuestion) return;
    const answer = testDraftAnswer.trim();
    if (testQuestion.required && !answer) {
      setTestError("Răspunsul este obligatoriu pentru această întrebare.");
      return;
    }
    const nextAnswers = { ...testAnswers, [testQuestion.key]: answer || "—" };
    setTestAnswers(nextAnswers);
    setTestError("");
    setTestDraftAnswer("");
    if (testStep >= activeFlow.questions.length - 1) {
      setTestCompleted(true);
    } else {
      setTestStep((step) => step + 1);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Bot className="h-8 w-8 text-primary" /> Control bot
        </h1>
        <p className="text-muted-foreground">Gestionează infrastructura botului dintr-un singur loc. Accesul la această pagină este limitat la owner.</p>
      </header>

      {draft.discordLive === false && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          Botul Discord nu este conectat la această instanță. Modificările pot fi salvate, dar devin active pe Discord doar după reconectarea botului.
        </div>
      )}
      {draft.gameplayConfig.paused && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          Jocul este suspendat: evenimentele, luptele și cuferele nu vor fi postate. Deschide Dashboard-ul și apasă „Pornește jocul”.
        </div>
      )}

      <Tabs defaultValue="channels" className="space-y-5">
         <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:grid-cols-5">
           <TabsTrigger value="channels" className="mod-tab-trigger gap-2 py-2.5"><Radio className="h-4 w-4" /> Canale</TabsTrigger>
           <TabsTrigger value="tickets" className="mod-tab-trigger gap-2 py-2.5"><Ticket className="h-4 w-4" /> Tichete</TabsTrigger>
           <TabsTrigger value="gameplay" className="mod-tab-trigger gap-2 py-2.5"><Timer className="h-4 w-4" /> Gameplay</TabsTrigger>
           <TabsTrigger value="messages" className="mod-tab-trigger gap-2 py-2.5"><Megaphone className="h-4 w-4" /> Mesaje</TabsTrigger>
        </TabsList>

         <TabsContent value="channels" className="mod-tab-content mt-0">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Radio className="mt-1 h-5 w-5 text-primary" />
               <div className="min-w-0 flex-1">
                <h2 className="font-medium">Canale Discord</h2>
                 <p className="text-xs text-muted-foreground">Folosește canalele configurate sau găsește canalele existente după nume. Creează doar destinațiile care lipsesc.</p>
              </div>
               <Button
                 type="button"
                 variant="secondary"
                 className="shrink-0 gap-2"
                 onClick={() => void provision()}
                 disabled={provisioning || metadata?.botCapabilities?.canManageChannels !== true}
                 title={metadata?.botCapabilities?.canManageChannels === true ? "Sincronizează canalele Discord" : "Botul are nevoie de Manage Channels"}
               >
                 {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                 {provisioning ? "Se sincronizează…" : "Creează ce lipsește"}
               </Button>
            </div>
             {metadata?.botCapabilities?.canManageChannels !== true && (
               <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                 Butonul este disponibil după ce botul primește permisiunea Discord <strong>Manage Channels</strong>.
               </p>
             )}
            <div className="grid gap-4 md:grid-cols-2">
              {CHANNELS.map(([key, label]) => {
                const current = draft.channels[key] ?? "";
                const selected = metadata?.channels.some((channel) => channel.id === current) ? current : "__none__";
                return (
                  <div key={key} className={`mod-setting-card space-y-2 rounded-lg border border-transparent p-3 ${current ? "mod-setting-card--selected" : ""}`}>
                    <label className="text-sm font-medium">{label}</label>
                    <Select value={selected} onValueChange={(value) => setChannel(key, value)}>
                      <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                      <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                        <SelectItem value="__none__">Neconfigurat</SelectItem>
                        {metadata?.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={current} placeholder="ID canal Discord" aria-label={`${label} ID`} onChange={(event) => setChannel(key, event.target.value.trim())} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Ticket className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Editor flux ticket</h2>
                <p className="text-xs text-muted-foreground">
                  Configurează un singur tip de ticket de la cap la coadă: destinație, panou, răspunsuri și acțiunea finală.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
              <div>
                <p className="text-xs font-mono tracking-widest text-primary">PASUL 1 · FLUX ȘI DESTINAȚIE</p>
                <p className="mt-1 text-xs text-muted-foreground">Alege fluxul și categoria Discord în care vor fi create ticketurile.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipul de ticket</label>
                  <Select value={activeFlowKind} onValueChange={(value) => setActiveFlowKind(value as typeof activeFlowKind)}>
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege tipul de tichet" /></SelectTrigger>
                    <SelectContent>
                      {FLOW_KINDS.map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria Discord</label>
                  <Select
                    value={selectedActiveCategory}
                    onValueChange={(value) => setTicket(["categories", activeFlowKind], value === "__manual__" ? activeCategory : value)}
                  >
                    <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege categoria" /></SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                      <SelectItem value="__manual__">Introduc manual ID-ul</SelectItem>
                      {categories.map((category) => <SelectItem key={category.id} value={category.id}>▰ {category.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={activeCategory}
                    aria-label="ID categorie Discord pentru fluxul activ"
                    placeholder="ID categorie Discord"
                    onChange={(event) => setTicket(["categories", activeFlowKind], event.target.value.trim())}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-mono tracking-widest text-primary">PASUL 2 · PANOU ȘI COMPORTAMENT</p>
                <p className="mt-1 text-xs text-muted-foreground">Acestea sunt mesajele și acțiunile pe care le vede membrul după ce deschide ticketul.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Titlul panoului Discord</label>
                <Input value={activeFlow.title} maxLength={256} onChange={(event) => setFlow(activeFlowKind, "title", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Textul butonului de start</label>
                <Input value={activeFlow.startButtonLabel} maxLength={80} onChange={(event) => setFlow(activeFlowKind, "startButtonLabel", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Acțiune după completare</label>
                <Select value={activeFlow.completionAction} onValueChange={(value) => setFlow(activeFlowKind, "completionAction", value)}>
                 <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notify_staff">Închide și anunță stafful</SelectItem>
                    <SelectItem value="lock">Închide fără mesaj staff</SelectItem>
                    <SelectItem value="keep_open">Lasă ticketul deschis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Descrierea panoului</label>
                <Textarea rows={3} maxLength={2000} value={activeFlow.panelDescription} onChange={(event) => setFlow(activeFlowKind, "panelDescription", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Ghidul afișat la „Întrebări”</label>
                <Textarea rows={3} maxLength={2000} value={activeFlow.requirementsText} onChange={(event) => setFlow(activeFlowKind, "requirementsText", event.target.value)} />
              </div>
              <ImageField label="Imaginea panoului" value={activeFlow.panelImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "panelImageUrl", value)} />
              <div className="space-y-2">
                <label className="text-sm font-medium">Mesajul după completare</label>
                <Textarea rows={4} maxLength={2000} value={activeFlow.completionMessage} onChange={(event) => setFlow(activeFlowKind, "completionMessage", event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mesajul pentru staff</label>
                <Textarea rows={4} maxLength={2000} value={activeFlow.staffNotificationMessage} onChange={(event) => setFlow(activeFlowKind, "staffNotificationMessage", event.target.value)} />
              </div>
              <ImageField label="Imaginea mesajului de finalizare" value={activeFlow.completionImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "completionImageUrl", value)} />
              <ImageField label="Imaginea mesajului pentru staff" value={activeFlow.staffNotificationImageUrl} guildId={guildId} csrfToken={session?.csrfToken} onChange={(value) => setFlow(activeFlowKind, "staffNotificationImageUrl", value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono tracking-widest text-primary">PASUL 3 · ÎNTREBĂRI</p>
                  <h3 className="mt-1 font-medium">Întrebările ticketului ({activeFlow.questions.length}/20)</h3>
                  <p className="text-xs text-muted-foreground">Adaugă întrebările pentru categoria aleasă. Ordinea de aici este ordinea în care botul le va cere.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => addQuestion(activeFlowKind)} disabled={activeFlow.questions.length >= 20}>
                  Adaugă întrebare
                </Button>
              </div>
              {duplicateQuestionKeys.length > 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Chei duplicate în acest flux: {duplicateQuestionKeys.join(", ")}. Schimbă fiecare cheie astfel încât să fie unică înainte de salvare.
                </p>
              )}
              <div className="space-y-3">
                {activeFlow.questions.map((question, index) => (
                  <div key={`${question.key}-${index}`} className="space-y-3 rounded-lg border border-border/80 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                       <div className="flex items-center gap-3">
                         <p className="text-sm font-semibold">Întrebarea {index + 1}</p>
                         <label className="flex items-center gap-2 text-xs text-muted-foreground">
                           <input
                             type="checkbox"
                             checked={postedQuestionKeys.has(question.key)}
                             onChange={(event) => setPostedQuestion(activeFlowKind, question.key, event.target.checked)}
                           />
                           Postează în mesajul final
                         </label>
                       </div>
                       <div className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveQuestion(activeFlowKind, index, -1)} disabled={index === 0}>↑</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveQuestion(activeFlowKind, index, 1)} disabled={index === activeFlow.questions.length - 1}>↓</Button>
                        <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removeQuestion(activeFlowKind, index)} disabled={activeFlow.questions.length <= 1}>Șterge</Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Cheie internă</label>
                        <Input value={question.key} maxLength={32} onChange={(event) => updateQuestion(activeFlowKind, index, "key", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Etichetă</label>
                        <Input value={question.label} maxLength={45} onChange={(event) => updateQuestion(activeFlowKind, index, "label", event.target.value)} />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium">Întrebarea / descrierea afișată</label>
                        <Textarea rows={2} maxLength={900} value={question.description} onChange={(event) => updateQuestion(activeFlowKind, index, "description", event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Placeholder</label>
                        <Input value={question.placeholder} maxLength={100} onChange={(event) => updateQuestion(activeFlowKind, index, "placeholder", event.target.value)} />
                      </div>
                      <ImageField
                        label="Imaginea afișată după acest răspuns (opțional)"
                        value={question.imageUrl}
                        guildId={guildId}
                        csrfToken={session?.csrfToken}
                        onChange={(value) => updateQuestion(activeFlowKind, index, "imageUrl", value)}
                      />
                      <div className="flex items-center gap-5 pt-6 text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={question.multiline} onChange={(event) => updateQuestion(activeFlowKind, index, "multiline", event.target.checked)} />
                          Răspuns lung
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(activeFlowKind, index, "required", event.target.checked)} />
                          Obligatoriu
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <details open className="overflow-hidden rounded-xl border border-[#3f4147] bg-[#1e1f22]">
              <summary className="cursor-pointer list-none border-b border-[#3f4147] px-4 py-3 text-sm font-semibold text-[#f2f3f5]">
                <span className="mr-2 text-primary">▶</span>
                Previzualizare test · {FLOW_KINDS.find(([kind]) => kind === activeFlowKind)?.[1] ?? "Flux activ"}
              </summary>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-lg bg-[#2b2d31] p-4">
                  <p className="mb-3 text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">MESAJUL DIN PANOU</p>
                  <h4 className="text-base font-semibold text-[#f2f3f5]">{activeFlow.title}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                    {activeFlow.panelDescription}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-xs text-[#b5bac1]">{activeFlow.requirementsText}</p>
                  <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                    {activeFlow.questions.map((question, index) => (
                      <div key={`preview-question-${question.key}-${index}`} className="flex gap-2 text-xs">
                        <span className="font-semibold text-[#949ba4]">{index + 1}.</span>
                        <span className="text-[#dbdee1]">{question.label}</span>
                      </div>
                    ))}
                  </div>
                  <Button type="button" size="sm" className="mt-4 pointer-events-none">
                    {activeFlow.startButtonLabel}
                  </Button>
                </div>

                <div className="rounded-lg bg-[#2b2d31] p-4">
                  <p className="mb-3 text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">MESAJUL DUPĂ COMPLETARE</p>
                  <h4 className="text-base font-semibold text-[#f2f3f5]">Formular complet</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                    {activeFlow.completionMessage}
                  </p>
                  <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                    {activeFlow.questions.filter((question) => postedQuestionKeys.has(question.key)).length > 0 ? (
                      activeFlow.questions
                        .filter((question) => postedQuestionKeys.has(question.key))
                        .map((question, index) => (
                          <div key={`preview-answer-${question.key}-${index}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                            <p className="text-xs font-semibold text-[#f2f3f5]">{question.label}</p>
                            <p className="mt-1 text-xs italic text-[#949ba4]">
                              {question.placeholder || "Răspunsul membrului va apărea aici"}
                            </p>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs italic text-[#949ba4]">Nu este selectat niciun răspuns pentru mesajul final.</p>
                    )}
                  </div>
                  {activeFlow.completionAction === "notify_staff" && (
                    <p className="mt-4 text-xs text-primary">Mesajul va anunța rolul staff configurat.</p>
                  )}
                </div>
              </div>
              <p className="border-t border-[#3f4147] px-4 py-3 text-xs text-[#b5bac1]">
                Aceasta este o simulare. Pentru alt flux, schimbă „Tipul de ticket” de la Pasul 1.
              </p>
            </details>
          </section>
        </TabsContent>

        <TabsContent value="gameplay" className="mt-0 space-y-5">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Timer className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Evenimente și intervale</h2>
                <p className="text-xs text-muted-foreground">Valorile sunt în minute și se aplică separat pe acest server. Intervalele maxime nu pot fi mai mici decât cele minime.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {numberField("events", "eventDurationMinutes", "Durata Ora Umbrelor", "Cât timp rămâne activ evenimentul.")}
              {numberField("events", "eventCooldownMinMinutes", "Pauza minimă între evenimente", "Pauza minimă după un eveniment.")}
              {numberField("events", "eventCooldownMaxMinutes", "Pauza maximă între evenimente", "Pauza maximă după un eveniment.")}
              {numberField("events", "finalBossDurationMinutes", "Durata Dragonului Stins", "Cât timp poate fi atacat boss-ul final.")}
              {numberField("events", "standaloneBossIntervalMinMinutes", "Boss rar: interval minim", "Pauza minimă între invocări independente.")}
              {numberField("events", "standaloneBossIntervalMaxMinutes", "Boss rar: interval maxim", "Pauza maximă între invocări independente.")}
              {numberField("events", "standaloneBossDurationMinutes", "Durata boss-ului rar", "Cât timp rămâne boss-ul rar activ.")}
              {numberField("events", "battleEventIntervalMinutes", "Interval evenimente de luptă", "Frecvența anunțurilor dintr-o Ora a Umbrelor.")}
              {numberField("events", "chestIntervalMinutes", "Interval cufere", "Frecvența cufărului clasic.")}
              {numberField("events", "chestExpireMinutes", "Expirare cufere", "Cât timp poate fi revendicat un cufăr.")}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <ScrollText className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Misiuni zilnice</h2>
                <p className="text-xs text-muted-foreground">Țintele și cantitățile de materiale sunt folosite atât la progres, cât și la acordarea recompensei.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {numberField("missions", "kill_10.target", "Monștri uciși — țintă", "Numărul de monștri necesar.")}
              {numberField("missions", "kill_10.rewardQty", "Monștri uciși — recompensă", "Cantitatea de material acordată.")}
              {numberField("missions", "rare_3.target", "Monștri rari — țintă", "Numărul de monștri rari necesar.")}
              {numberField("missions", "rare_3.rewardQty", "Monștri rari — recompensă", "Cantitatea de material acordată.")}
              {numberField("missions", "boss_1.target", "Mini-boss — țintă", "Numărul de mini-bossi necesar.")}
              {numberField("missions", "boss_1.rewardQty", "Mini-boss — recompensă", "Cantitatea de material acordată.")}
            </div>
          </section>

          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Coins className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Economie</h2>
                <p className="text-xs text-muted-foreground">Multiplicatorii afectează recompensele de Oboli și XP din lupte și boss fights. Bonusurile existente se aplică separat.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {numberField("economy", "monsterGoldMultiplier", "Oboli din monștri", "1 = valoarea normală.", 0.1)}
              {numberField("economy", "monsterXpMultiplier", "XP din monștri", "1 = valoarea normală.", 0.1)}
              {numberField("economy", "bossGoldMultiplier", "Oboli din boss fights", "1 = valoarea normală.", 0.1)}
              {numberField("economy", "bossXpMultiplier", "XP din boss fights", "1 = valoarea normală.", 0.1)}
            </div>
          </section>
        </TabsContent>

         <TabsContent value="tickets" className="mod-tab-content mt-0 space-y-5">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Ticket className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Rutarea tichetelor</h2>
                <p className="text-xs text-muted-foreground">Alege categoriile Discord în care botul recunoaște și gestionează tichetele.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {TICKET_CATEGORIES.map(([key, label]) => {
                const current = draft.tickets.categories[key];
                const selected = categories.some((channel) => channel.id === current) ? current : "__manual__";
                return (
                  <div key={key} className="space-y-2">
                    <label className="text-sm font-medium">{label}</label>
                    <Select value={selected} onValueChange={(value) => setTicket(["categories", key], value === "__manual__" ? current : value)}>
                       <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege categorie" /></SelectTrigger>
                      <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                        <SelectItem value="__manual__">ID introdus manual</SelectItem>
                        {categories.map((category) => <SelectItem key={category.id} value={category.id}>▰ {category.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={current} aria-label={`${label} ID`} placeholder="ID categorie Discord" onChange={(event) => setTicket(["categories", key], event.target.value.trim())} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Staff și publicarea alianțelor</h2>
                <p className="text-xs text-muted-foreground">Rolul care poate confirma sau refuza parteneriatele și canalul public pentru alianțele aprobate.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol staff alianțe</label>
                <Select value={metadata?.roles.some((role) => role.id === draft.tickets.staffReviewRoleId) ? draft.tickets.staffReviewRoleId : "__manual__"} onValueChange={(value) => setTicket(["staffReviewRoleId"], value === "__manual__" ? draft.tickets.staffReviewRoleId : value)}>
                   <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege rol" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {metadata?.roles.filter((role) => !role.managed).map((role) => <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.staffReviewRoleId} placeholder="ID rol Discord" onChange={(event) => setTicket(["staffReviewRoleId"], event.target.value.trim())} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Canal public alianțe</label>
                <Select value={textChannels.some((channel) => channel.id === draft.tickets.alliancePublicChannelId) ? draft.tickets.alliancePublicChannelId : "__manual__"} onValueChange={(value) => setTicket(["alliancePublicChannelId"], value === "__manual__" ? draft.tickets.alliancePublicChannelId : value)}>
                   <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__manual__">ID introdus manual</SelectItem>
                    {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={draft.tickets.alliancePublicChannelId} placeholder="ID canal Discord" onChange={(event) => setTicket(["alliancePublicChannelId"], event.target.value.trim())} />
              </div>
            </div>
            <Input value={draft.tickets.allianceOwnerGuildId} placeholder="ID server owner pentru publicarea alianțelor" aria-label="ID server alianțe" onChange={(event) => setTicket(["allianceOwnerGuildId"], event.target.value.trim())} />
             <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
               <div>
                 <label className="text-sm font-medium">Mesajul public al parteneriatului</label>
                 <p className="mt-1 text-xs text-muted-foreground">
                   Acest șablon este folosit când stafful apasă „Publică pactul”. Poți decide exact ce apare și dacă este trimis ca text sau embed.
                 </p>
               </div>
               <Textarea
                 rows={12}
                 maxLength={2000}
                 value={draft.tickets.allianceAnnouncementTemplate}
                 onChange={(event) => setTicket(["allianceAnnouncementTemplate"], event.target.value)}
               />
               <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Formatul publicării</label>
                   <Select
                     value={draft.tickets.allianceAnnouncementMode}
                     onValueChange={(value) => setTicket(["allianceAnnouncementMode"], value)}
                   >
                     <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="text">Text simplu în mesaj</SelectItem>
                       <SelectItem value="embed">Embed Discord</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Afișarea imaginii</label>
                    <Select
                      value={draft.tickets.allianceAnnouncementImageMode}
                      onValueChange={(value) => setTicket(["allianceAnnouncementImageMode"], value)}
                    >
                      <SelectTrigger className="mod-select-trigger"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Fără imagine</SelectItem>
                        <SelectItem value="large">Imagine mare sub mesaj</SelectItem>
                        <SelectItem value="thumbnail">Thumbnail în dreapta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                 <div className="space-y-2 text-xs text-muted-foreground">
                   <p className="font-medium text-foreground">Variabile disponibile</p>
                   <p className="font-mono leading-relaxed">
                     {"{server_name}"} · {"{description}"} · {"{invite}"} · {"{representative}"} · {"{members_total}"} · {"{members_online}"} · {"{members}"} · {"{motivation}"} · {"{offer}"} · {"{terms}"} · {"{applicant}"} · {"{applicant_mention}"}
                   </p>
                   <p>„Membri total” și „online” sunt citite din invitația Discord la publicare. Dacă Discord nu le poate oferi, se afișează „Nedisponibil”.</p>
                 </div>
               </div>
                <ImageField
                  label="Imaginea anunțului public"
                  value={draft.tickets.allianceAnnouncementImageUrl}
                  guildId={guildId}
                  csrfToken={session?.csrfToken}
                  onChange={(value) => setTicket(["allianceAnnouncementImageUrl"], value)}
                />
               <p className="text-right text-xs text-muted-foreground">
                 {draft.tickets.allianceAnnouncementTemplate.length}/2000
               </p>
             </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <h2 className="font-medium">Termene pentru tichete incomplete</h2>
              <p className="text-xs text-muted-foreground">Minute de la crearea canalului: avertisment 1, avertisment 2 și ștergere automată.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["firstWarningMinutes", "Primul avertisment", 1, 180],
                ["secondWarningMinutes", "Al doilea avertisment", 2, 239],
                ["incompleteTimeoutMinutes", "Ștergere automată", 10, 240],
              ].map(([key, label, min, max]) => (
                <div key={String(key)} className="space-y-2">
                  <label className="text-sm font-medium">{label}</label>
                  <Input type="number" min={Number(min)} max={Number(max)} value={draft.tickets[key as keyof typeof draft.tickets] as number} onChange={(event) => setTicket([String(key)], Number(event.target.value))} />
                  <p className="text-xs text-muted-foreground">{min}–{max} minute</p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="messages" className="mt-0">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-medium">Textul mesajului de alianță</h2>
                <p className="text-xs text-muted-foreground">Textul este folosit la următoarea publicare a anunțului de recrutare. Discord limitează mesajul la 2.000 de caractere.</p>
              </div>
            </div>
            <Textarea
              value={draft.allianceRecruitmentText}
              maxLength={2000}
              rows={16}
              placeholder="Scrie mesajul de recrutare..."
              onChange={(event) => setDraft({ ...draft, allianceRecruitmentText: event.target.value })}
            />
            <p className="text-right text-xs text-muted-foreground">{draft.allianceRecruitmentText.length}/2000</p>
          </section>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-3 z-20 flex w-full justify-end py-2">
        <div className="ml-auto flex flex-wrap justify-end gap-2 rounded-xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur">
          <Button type="button" variant="secondary" onClick={openFlowTest} className="gap-2">
            <PlayCircle className="h-4 w-4" />
            Testează fluxul
          </Button>
          <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Se salvează…" : "Salvează controlul botului"}
          </Button>
        </div>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[#3f4147] bg-[#1e1f22] text-[#f2f3f5]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Test local · {FLOW_KINDS.find(([kind]) => kind === activeFlowKind)?.[1] ?? "Flux ticket"}
            </DialogTitle>
            <DialogDescription className="text-[#b5bac1]">
              Simulează pașii pe care îi vede membrul. Nu se creează ticket și nu se postează nimic pe Discord.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4">
              <p className="text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">PANOU DISCORD SIMULAT</p>
              <h3 className="mt-2 text-lg font-semibold">{activeFlow.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">{activeFlow.panelDescription}</p>
              <p className="mt-3 whitespace-pre-wrap text-xs text-[#b5bac1]">{activeFlow.requirementsText}</p>
              {!testStarted && !testCompleted && (
                <Button type="button" className="mt-4 gap-2" onClick={() => setTestStarted(true)}>
                  <PlayCircle className="h-4 w-4" />
                  {activeFlow.startButtonLabel}
                </Button>
              )}
            </div>

            {testStarted && !testCompleted && testQuestion && (
              <div className="rounded-lg border border-primary/40 bg-[#2b2d31] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-mono tracking-[0.14em] text-primary">
                    ÎNTREBAREA {testStep + 1}/{activeFlow.questions.length}
                  </p>
                  <span className="text-xs text-[#b5bac1]">
                    {testQuestion.required ? "Obligatoriu" : "Opțional"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold">{testQuestion.label}</h3>
                <p className="mt-1 text-sm text-[#dbdee1]">{testQuestion.description}</p>
                {testQuestion.multiline ? (
                  <Textarea
                    autoFocus
                    rows={4}
                    value={testDraftAnswer}
                    placeholder={testQuestion.placeholder}
                    onChange={(event) => {
                      setTestDraftAnswer(event.target.value);
                      setTestError("");
                    }}
                    className="mt-4 border-[#4b4f58] bg-[#1e1f22] text-[#f2f3f5]"
                  />
                ) : (
                  <Input
                    autoFocus
                    value={testDraftAnswer}
                    placeholder={testQuestion.placeholder}
                    onChange={(event) => {
                      setTestDraftAnswer(event.target.value);
                      setTestError("");
                    }}
                    className="mt-4 border-[#4b4f58] bg-[#1e1f22] text-[#f2f3f5]"
                  />
                )}
                {testError && <p className="mt-2 text-xs text-destructive">{testError}</p>}
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={submitTestAnswer}>
                    {testStep === activeFlow.questions.length - 1 ? "Finalizează simularea" : "Salvează și continuă"}
                  </Button>
                </div>
              </div>
            )}

            {Object.keys(testAnswers).length > 0 && (
              <div className="space-y-2 rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4">
                <p className="text-[10px] font-mono tracking-[0.18em] text-[#b5bac1]">RĂSPUNSURI SIMULATE</p>
                {activeFlow.questions
                  .filter((question) => testAnswers[question.key] !== undefined)
                  .map((question) => (
                    <div key={`test-answer-${question.key}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                      <p className="text-xs font-semibold">{question.label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{testAnswers[question.key]}</p>
                    </div>
                  ))}
              </div>
            )}

            {testCompleted && (
              <div className="rounded-lg border border-emerald-500/40 bg-[#2b2d31] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <p className="text-[10px] font-mono tracking-[0.18em] text-emerald-300">
                    {activeFlowKind === "partnership" ? "REZUMAT STAFF ÎN TICKET" : "MESAJ FINAL SIMULAT"}
                  </p>
                </div>
                <h3 className="mt-3 text-base font-semibold">
                  {activeFlowKind === "partnership"
                    ? "🤝 Contract de Parteneriat · Rezumat pentru staff"
                    : "Formular complet"}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">{activeFlow.completionMessage}</p>
                <div className="mt-4 space-y-2 border-t border-[#3f4147] pt-3">
                  {activeFlow.questions.filter((question) => postedQuestionKeys.has(question.key)).map((question) => (
                    <div key={`test-final-${question.key}`} className="rounded-md bg-[#1e1f22] px-3 py-2">
                      <p className="text-xs font-semibold">{question.label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{testAnswers[question.key] ?? "—"}</p>
                    </div>
                  ))}
                </div>
                {activeFlowKind === "partnership" && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#3f4147] pt-3">
                    <Button type="button" size="sm" className="pointer-events-none">🛡️ Confirmă pentru publicare</Button>
                    <Button type="button" size="sm" variant="destructive" className="pointer-events-none">Refuză pactul</Button>
                  </div>
                )}
                {activeFlow.completionAction === "notify_staff" && (
                  <p className="mt-4 text-xs text-primary">{activeFlow.staffNotificationMessage}</p>
                )}
              </div>
            )}

            {testCompleted && partnershipAnswers && (
              <>
                <div className="rounded-lg border border-[#7c8fbd]/50 bg-[#2b2d31] p-4">
                  <p className="text-[10px] font-mono tracking-[0.18em] text-[#b9c8ef]">DRAFT DUPĂ CONFIRMAREA STAFFULUI</p>
                  <h3 className="mt-2 text-base font-semibold">🤝 Contract de Parteneriat · Draft de publicare</h3>
                  <p className="mt-2 text-sm text-[#dbdee1]">
                    Draftul este vizibil în ticket până când stafful apasă „Publică pactul”.
                  </p>
                  <div className="mt-4 grid gap-2 border-t border-[#3f4147] pt-3 sm:grid-cols-2">
                    {[
                      ["🏰 Numele serverului", partnershipAnswers.server_name],
                      ["👤 Reprezentantul serverului", partnershipAnswers.representative],
                      ["🔗 Linkul serverului", partnershipAnswers.invite],
                      ["👥 Membri și activitate", partnershipAnswers.members],
                      ["📝 Descrierea serverului", partnershipAnswers.description],
                      ["🕯️ Motivul alianței", partnershipAnswers.motivation],
                      ["🎁 Ce oferă serverul", partnershipAnswers.offer],
                      ["📜 Așteptări și reguli", partnershipAnswers.terms],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md bg-[#1e1f22] px-3 py-2">
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{previewValue(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="pointer-events-none">📣 Publică pactul</Button>
                    <Button type="button" size="sm" variant="secondary" className="pointer-events-none">✏️ Revizuiește draftul</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/40 bg-[#2b2d31] p-4">
                  <p className="text-[10px] font-mono tracking-[0.18em] text-amber-300">TEXTUL POSTAT ÎN CANALUL ALIANȚELOR</p>
                  <p className="mt-2 text-xs text-[#b5bac1]">
                     Acesta este mesajul public trimis după „Publică pactul”. Imaginea este simulată aici ca preview Discord.
                  </p>
                   <div className="mt-3 overflow-hidden rounded-md bg-[#1e1f22] p-3">
                     {draft.tickets.allianceAnnouncementMode === "embed" ? (
                       <div className="border-l-4 border-[#7c8fbd] pl-3">
                         <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#f2f3f5]">{partnershipAnnouncement}</p>
                         {draft.tickets.allianceAnnouncementImageUrl && draft.tickets.allianceAnnouncementImageMode !== "none" && (
                           draft.tickets.allianceAnnouncementImageMode === "thumbnail" ? (
                             <div className="mt-3 flex justify-between gap-3">
                               <span />
                               <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="h-20 w-20 rounded object-cover" />
                             </div>
                           ) : (
                             <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="mt-3 max-h-56 w-full rounded object-cover" />
                           )
                         )}
                       </div>
                     ) : (
                       <>
                         <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#f2f3f5]">{partnershipAnnouncement}</p>
                         {draft.tickets.allianceAnnouncementImageUrl && draft.tickets.allianceAnnouncementImageMode !== "none" && (
                           <div className="mt-3 border-l-4 border-[#7c8fbd] pl-3">
                             {draft.tickets.allianceAnnouncementImageMode === "thumbnail" ? (
                               <div className="flex justify-between gap-3">
                                 <span />
                                 <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="h-20 w-20 rounded object-cover" />
                               </div>
                             ) : (
                               <img src={draft.tickets.allianceAnnouncementImageUrl} alt="" className="max-h-56 w-full rounded object-cover" />
                             )}
                           </div>
                         )}
                       </>
                     )}
                   </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-xs text-[#b5bac1]">Modificările curente sunt testate local, chiar dacă nu sunt încă salvate.</p>
            <Button type="button" variant="secondary" onClick={resetFlowTest} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Repornește testul
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
/*
export function BotControlPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, update } = useBotControl(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
  }, [data]);

  const setChannel = (key: string, value: string) => {
    setDraft((current) => current ? {
      ...current,
      channels: { ...current.channels, ...(value === "__none__" ? { [key]: "" } : { [key]: value }) },
    } : current);
  };

  const setGameplay = (section: "events" | "missions" | "economy", key: string, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const numeric = Number(value);
      const [parent, child] = key.split(".");
      const currentSection = current.gameplayConfig[section] as Record<string, unknown>;
      const nextSection = child
        ? { ...currentSection, [parent]: { ...(currentSection[parent] as Record<string, unknown>), [child]: Number.isFinite(numeric) ? numeric : 0 } }
        : { ...currentSection, [key]: Number.isFinite(numeric) ? numeric : 0 };
      return {
        ...current,
        gameplayConfig: {
          ...current.gameplayConfig,
          [section]: nextSection,
        },
      };
    });
  };

  const numberField = (
    section: "events" | "missions" | "economy",
    key: string,
    label: string,
    description: string,
    step = 1,
  ) => {
    if (!draft) return null;
    const [parent, child] = key.split(".");
    const sectionValue = draft.gameplayConfig[section] as Record<string, unknown>;
    const value = (child
      ? (sectionValue[parent] as Record<string, unknown>)?.[child]
      : sectionValue[key]) as number;
    return (
      <div className="space-y-2" key={`${section}-${key}`}>
        <label className="text-sm font-medium">{label}</label>
        <Input
          type="number"
          min={step === 0.1 ? 0.1 : 1}
          step={step}
          value={value}
          onChange={(event) => setGameplay(section, key, event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    );
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
      });
      toast({ title: "Setările botului au fost salvate", description: "Canalele și textul de alianță sunt persistente." });
    } catch (saveError: any) {
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message ?? "Încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft) {
    return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">{error?.message ?? "Setările botului nu au putut fi încărcate."}</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <Bot className="h-8 w-8 text-primary" /> Control bot
        </h1>
         <p className="text-muted-foreground">Canalele, textele și regulile gameplay pe care botul le folosește pe server. Accesul la această pagină este limitat la owner.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Radio className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Canale Discord</h2>
            <p className="text-xs text-muted-foreground">Alege un canal din lista live sau introdu ID-ul manual. Setarea se aplică sistemului asociat.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {CHANNELS.map(([key, label]) => {
            const current = draft.channels[key] ?? "";
            const selected = metadata?.channels.some((channel) => channel.id === current) ? current : "__none__";
            return (
              <div key={key} className="space-y-2">
                <label className="text-sm font-medium">{label}</label>
                <Select value={selected} onValueChange={(value) => setChannel(key, value)}>
                  <SelectTrigger><SelectValue placeholder="Alege canal" /></SelectTrigger>
                  <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                    <SelectItem value="__none__">Neconfigurat</SelectItem>
                    {metadata?.channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>#{channel.name} ({channel.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={current} placeholder="ID canal Discord" aria-label={`${label} ID`} onChange={(event) => setChannel(key, event.target.value.trim())} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Timer className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Evenimente și intervale</h2>
            <p className="text-xs text-muted-foreground">Valorile sunt în minute și se aplică separat pe acest server. Intervalele maxime nu pot fi mai mici decât cele minime.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {numberField("events", "eventDurationMinutes", "Durata Ora Umbrelor", "Cât timp rămâne activ evenimentul.")}
          {numberField("events", "eventCooldownMinMinutes", "Pauza minimă între evenimente", "Pauza minimă după un eveniment.")}
          {numberField("events", "eventCooldownMaxMinutes", "Pauza maximă între evenimente", "Pauza maximă după un eveniment.")}
          {numberField("events", "finalBossDurationMinutes", "Durata Dragonului Stins", "Cât timp poate fi atacat boss-ul final.")}
          {numberField("events", "standaloneBossIntervalMinMinutes", "Boss rar: interval minim", "Pauza minimă între invocări independente.")}
          {numberField("events", "standaloneBossIntervalMaxMinutes", "Boss rar: interval maxim", "Pauza maximă între invocări independente.")}
          {numberField("events", "standaloneBossDurationMinutes", "Durata boss-ului rar", "Cât timp rămâne boss-ul rar activ.")}
          {numberField("events", "battleEventIntervalMinutes", "Interval evenimente de luptă", "Frecvența anunțurilor dintr-o Ora a Umbrelor.")}
          {numberField("events", "chestIntervalMinutes", "Interval cufere", "Frecvența cufărului clasic.")}
          {numberField("events", "chestExpireMinutes", "Expirare cufere", "Cât timp poate fi revendicat un cufăr.", 1)}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <ScrollText className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Misiuni zilnice</h2>
            <p className="text-xs text-muted-foreground">Țintele și cantitățile de materiale sunt folosite atât la progres, cât și la acordarea recompensei.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {numberField("missions", "kill_10.target", "Monștri uciși — țintă", "Numărul de monștri necesar.")}
          {numberField("missions", "kill_10.rewardQty", "Monștri uciși — recompensă", "Cantitatea de material acordată.")}
          {numberField("missions", "rare_3.target", "Monștri rari — țintă", "Numărul de monștri rari necesar.")}
          {numberField("missions", "rare_3.rewardQty", "Monștri rari — recompensă", "Cantitatea de material acordată.")}
          {numberField("missions", "boss_1.target", "Mini-boss — țintă", "Numărul de mini-bossi necesar.")}
          {numberField("missions", "boss_1.rewardQty", "Mini-boss — recompensă", "Cantitatea de material acordată.")}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Coins className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Economie</h2>
            <p className="text-xs text-muted-foreground">Multiplicatorii afectează recompensele de aur/Oboli și XP din lupte și boss fights. Bonusurile de clasă, talisman și prestigiu se aplică în continuare separat.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {numberField("economy", "monsterGoldMultiplier", "Oboli din monștri", "1 = valoarea normală.", 0.1)}
          {numberField("economy", "monsterXpMultiplier", "XP din monștri", "1 = valoarea normală.", 0.1)}
          {numberField("economy", "bossGoldMultiplier", "Oboli din boss fights", "1 = valoarea normală.", 0.1)}
          {numberField("economy", "bossXpMultiplier", "XP din boss fights", "1 = valoarea normală.", 0.1)}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">Textul mesajului de alianță</h2>
            <p className="text-xs text-muted-foreground">Acest text este folosit la următoarea publicare a anunțului de recrutare. Discord limitează mesajul la 2.000 de caractere.</p>
          </div>
        </div>
        <Textarea
          value={draft.allianceRecruitmentText}
          maxLength={2000}
          rows={16}
          placeholder="Scrie mesajul de recrutare..."
          onChange={(event) => setDraft({ ...draft, allianceRecruitmentText: event.target.value })}
        />
        <p className="text-right text-xs text-muted-foreground">{draft.allianceRecruitmentText.length}/2000</p>
      </section>

      <div className="sticky bottom-3 z-20 flex w-full justify-end py-2">
        <div className="ml-auto flex flex-wrap justify-end gap-2 rounded-xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur">
          <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Se salvează…" : "Salvează controlul botului"}
          </Button>
        </div>
      </div>
    </div>
  );
}
*/
