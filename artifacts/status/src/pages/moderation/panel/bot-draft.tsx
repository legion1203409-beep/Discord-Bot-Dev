/**
 * Ciorna paginilor din panou care schimbă setările botului (verificarea, apoi
 * tichetele): încarcă setările serverului ales, ține modificările nesalvate,
 * le salvează (serverul primește setările botului întregi, ca până acum),
 * publică panoul de verificare și păstrează recuperarea unui panou publicat
 * pe jumătate. Aceeași formă ca useConfigDraft, ca modulele să folosească
 * aceleași câmpuri.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BotControlPartialApplyError, useActiveGuild, useBotControl, useModerationMetadata, useSession, type BotControlConfig,
} from "../../../hooks/use-moderation-api";
import { useToast } from "../../../hooks/use-toast";
import { rebaseDraftChanges } from "../../../lib/utils";
import type { PanelApi } from "./context";
import { deepEqual, getAt, setAt, type DraftSection, type Path } from "./model";

export function useBotControlDraft({ changedParts, validate, savedText }: {
  /** The parts of the bot's settings this page edits that differ from what is saved. */
  changedParts: (saved: BotControlConfig, draft: BotControlConfig) => DraftSection[];
  /** First problem that would make the server refuse the draft, or null. */
  validate?: (draft: BotControlConfig) => string | null;
  /** What the success message says, from what was saved. */
  savedText?: (saved: BotControlConfig) => string;
}) {
  const { guildId, guilds } = useActiveGuild();
  const control = useBotControl(guildId);
  const { data, loading, error, update, publishVerification, panelRecovery, confirmPanelReconciliation, refetch } = control;
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { session } = useSession();
  const { toast } = useToast();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [partialError, setPartialError] = useState<{ guildId: string; message: string } | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const initialized = useRef<string | null>(null);
  const revision = useRef(0);
  const latest = useRef<BotControlConfig | null>(null);
  const editorKey = guildId ?? null;

  useEffect(() => {
    if (!editorKey) {
      initialized.current = null;
      latest.current = null;
      setDraft(null);
    } else if (initialized.current && initialized.current !== editorKey && !data) {
      initialized.current = null;
      latest.current = null;
      setDraft(null);
    } else if (data && initialized.current !== editorKey) {
      initialized.current = editorKey;
      revision.current += 1;
      const fresh = structuredClone(data);
      // A panel published while its settings could not be saved keeps its ID,
      // so the next save edits that message instead of posting a second one.
      if (panelRecovery?.panelMessageId) fresh.verification.panelMessageId = panelRecovery.panelMessageId;
      latest.current = fresh;
      setDraft(fresh);
    }
  }, [data, editorKey, panelRecovery?.panelMessageId]);

  const current = initialized.current === editorKey && data ? draft : null;

  const editDraft = useCallback((next: BotControlConfig) => {
    revision.current += 1;
    latest.current = next;
    setDraft(next);
  }, []);
  const set = useCallback((path: Path, value: unknown) => {
    if (latest.current) editDraft(setAt(latest.current, path, value));
  }, [editDraft]);
  const updateAt = useCallback((path: Path, change: (value: any) => any) => {
    if (latest.current) editDraft(setAt(latest.current, path, change(getAt(latest.current, path))));
  }, [editDraft]);

  const roles = useMemo(
    () => metadata?.roles?.filter((role) => role.id !== metadata.guild?.id && role.name !== "@everyone"),
    [metadata?.roles, metadata?.guild?.id],
  );

  const api = useMemo<PanelApi | null>(() => current ? {
    config: current,
    saved: data,
    set,
    update: updateAt,
    channels: metadata?.channels,
    roles,
    creating: null,
    createDisabled: true,
    capabilities: metadata?.botCapabilities,
    isOpen: (key) => openCards[key] === true,
    toggleOpen: (key) => setOpenCards((open) => ({ ...open, [key]: !open[key] })),
  } : null, [current, data, set, updateAt, metadata?.channels, metadata?.botCapabilities, roles, openCards]);

  const changed = current && data ? changedParts(data, current) : [];
  const guildPartialError = partialError?.guildId === guildId ? partialError.message : null;
  const blockedByPanel = Boolean(panelRecovery?.requiresManualReconciliation);

  const reportFailure = (failure: unknown, savingGuild: string, what: "save" | "publish") => {
    if (failure instanceof BotControlPartialApplyError) {
      setPartialError(failure.verificationPanelPublished ? null : { guildId: savingGuild, message: failure.message });
      toast({
        variant: "destructive",
        title: failure.verificationPanelPublished
          ? "Panoul a fost publicat, dar setările s-au salvat doar în parte"
          : "Salvare parțială: efectele din Discord nu sunt confirmate",
        description: failure.message,
      });
      return;
    }
    toast({
      variant: "destructive",
      title: what === "save" ? "Salvarea a eșuat" : "Publicarea panoului a eșuat",
      description: failure instanceof Error ? failure.message : "Modificările rămân în formular; încearcă din nou.",
    });
  };

  const save = async () => {
    if (saving || !editorKey || !current || !changed.length) return;
    if (blockedByPanel) {
      toast({ variant: "destructive", title: "Salvarea este blocată", description: "Reconciliază întâi panoul publicat fără ID, din Discord." });
      return;
    }
    const problem = validate?.(current) ?? null;
    if (problem) {
      toast({ variant: "destructive", title: "Verifică setările înainte de salvare", description: problem });
      return;
    }
    const savingGuild = editorKey;
    const savingRevision = revision.current;
    const submitted = current;
    setSaving(true);
    try {
      const result = await update({
        ...submitted,
        channels: Object.fromEntries(Object.entries(submitted.channels ?? {}).filter(([, value]) => typeof value === "string")),
      });
      if (initialized.current !== savingGuild) return;
      const canonical = structuredClone(result);
      // Keep what was changed while the request was on its way, on top of what the server saved.
      const next = revision.current === savingRevision ? canonical : rebaseDraftChanges(canonical, submitted, latest.current);
      latest.current = next;
      setDraft(next);
      setPartialError(null);
      toast(result.discordLive === false
        ? { variant: "destructive", title: "Salvat, dar botul este offline", description: "Setările se aplică în Discord când botul revine." }
        : { title: "Setări salvate", description: savedText?.(result) ?? "Setările botului au fost salvate." });
    } catch (failure) {
      if (initialized.current !== savingGuild) return;
      reportFailure(failure, savingGuild, "save");
    } finally {
      setSaving(false);
    }
  };

  /** Publishes (or updates) the verification panel; saves only the verification's settings. */
  const publish = async () => {
    if (saving || !editorKey || !current) return;
    if (blockedByPanel) {
      toast({ variant: "destructive", title: "Publicarea este blocată", description: "Reconciliază întâi panoul publicat fără ID, din Discord." });
      return;
    }
    const problem = validate?.(current) ?? null;
    if (problem) {
      toast({ variant: "destructive", title: "Verifică setările înainte de publicare", description: problem });
      return;
    }
    const savingGuild = editorKey;
    const submitted = structuredClone(current.verification);
    setSaving(true);
    setPublishing(true);
    try {
      const published = await publishVerification(submitted);
      if (initialized.current !== savingGuild || !latest.current) return;
      const now = latest.current.verification;
      const merged: Record<string, unknown> = { ...published };
      // Fields edited while the panel was being published stay as edited.
      for (const key of Object.keys(now) as Array<keyof typeof now>) {
        if (!deepEqual(now[key], submitted[key])) merged[key] = now[key];
      }
      const next = { ...latest.current, verification: merged as BotControlConfig["verification"] };
      latest.current = next;
      setDraft(next);
      setPartialError(null);
      toast({ title: "Panoul a fost publicat", description: "Setările verificării au fost salvate; restul modificărilor rămân nesalvate." });
    } catch (failure) {
      if (initialized.current !== savingGuild) return;
      reportFailure(failure, savingGuild, "publish");
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const discard = () => {
    if (saving || !data) return;
    const fresh = structuredClone(data);
    if (panelRecovery?.panelMessageId) fresh.verification.panelMessageId = panelRecovery.panelMessageId;
    editDraft(fresh);
  };

  return {
    status: current && api ? "ready" as const : loading || (data && initialized.current !== editorKey) ? "loading" as const : "error" as const,
    error,
    refetch: () => refetch(),
    api,
    config: current,
    saved: current ? data : null,
    changed,
    saving,
    publishing,
    save,
    publish,
    discard,
    guildId,
    guildName: guilds.find((guild) => guild.id === guildId)?.name || "Serverul selectat",
    metadata,
    refetchMetadata,
    csrfToken: session?.csrfToken,
    panelRecovery,
    partialError: guildPartialError,
    confirmPanelReconciliation,
  };
}

export type BotControlDraft = ReturnType<typeof useBotControlDraft>;
