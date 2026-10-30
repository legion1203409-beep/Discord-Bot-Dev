/**
 * Ciorna unei pagini din panou: încarcă setările serverului ales, ține
 * modificările nesalvate, trimite la salvare doar secțiunile schimbate și
 * creează canalele de jurnal. Folosită de paginile Protecție, Judecătorul AI și Sancțiuni.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveGuild, useModerationConfig, useModerationMetadata } from "../../../hooks/use-moderation-api";
import { useToast } from "../../../hooks/use-toast";
import { configSaveToastOptions } from "../../../lib/protection-toggle-feedback";
import { rebaseDraftChanges } from "../../../lib/utils";
import type { PanelApi } from "./context";
import { Ico, Spinner, cx } from "./fields";
import { changedSectionsOf, getAt, setAt, type DraftSection, type Path } from "./model";

export function useConfigDraft({ sections, validate }: {
  /** The parts of the configuration this page edits and saves. */
  sections: readonly DraftSection[];
  /** First problem that would make the server refuse the sections about to be sent, or null. */
  validate?: (draft: any, keys: string[]) => string | null;
}) {
  const { guildId, guilds } = useActiveGuild();
  const { data, updateSection, createChannel, loading, error, refetch } = useModerationConfig(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  // Which server the draft belongs to; null until its configuration arrived.
  const initialized = useRef<string | null>(null);
  // Bumped on every edit, so a save can tell whether the draft changed meanwhile.
  const revision = useRef(0);
  // The newest draft, also between a change and the next render.
  const latest = useRef<any>(null);
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
      latest.current = fresh;
      setDraft(fresh);
    }
  }, [data, editorKey]);

  const current = initialized.current === editorKey && data ? draft : null;

  const editDraft = useCallback((next: any) => {
    revision.current += 1;
    latest.current = next;
    setDraft(next);
  }, []);
  const set = useCallback((path: Path, value: unknown) => {
    if (latest.current) editDraft(setAt(latest.current, path, value));
  }, [editDraft]);
  const update = useCallback((path: Path, change: (value: any) => any) => {
    if (latest.current) editDraft(setAt(latest.current, path, change(getAt(latest.current, path))));
  }, [editDraft]);

  // @everyone is every member: protecting, ignoring or granting commands to it
  // would cover the whole server, so the panel never offers it as a role.
  const roles = useMemo(
    () => metadata?.roles?.filter((role) => role.id !== metadata.guild?.id && role.name !== "@everyone"),
    [metadata?.roles, metadata?.guild?.id],
  );
  const capabilities = metadata?.botCapabilities;
  const createDisabled = capabilities?.online === false || capabilities?.canManageChannels === false || capabilities?.canManageRoles === false;
  const handleCreateChannel = useCallback(async (destination: string, path: Path) => {
    setCreating(destination);
    try {
      const result = await createChannel(destination);
      set(path, result.channel.id);
      // A log channel also brings its private category and turns its category
      // on; take both from what the server saved, so the draft does not undo them.
      const category = destination.startsWith("activityLog.") ? destination.slice("activityLog.".length) : null;
      if (category && result.config?.activityLog) {
        update(["activityLog", "categoryId"], () => result.config.activityLog.categoryId ?? null);
        update(["activityLog", "categories", category], () => result.config.activityLog.categories?.[category] ?? true);
      }
      toast({
        title: result.created ? "Canal creat și salvat" : "Canal existent reutilizat",
        description: `#${result.channel.name} este configurat pentru această destinație.`,
      });
    } catch (createError: any) {
      toast({ variant: "destructive", title: "Crearea canalului a eșuat", description: createError?.message || "Canalul nu a putut fi creat." });
    } finally {
      setCreating(null);
    }
  }, [createChannel, set, update, toast]);

  const api = useMemo<PanelApi | null>(() => current ? {
    config: current,
    saved: data,
    set,
    update,
    channels: metadata?.channels,
    roles,
    createChannel: (destination, path) => { if (!creating) void handleCreateChannel(destination, path); },
    creating,
    createDisabled,
    capabilities,
    isOpen: (key) => openCards[key] === true,
    toggleOpen: (key) => setOpenCards((open) => ({ ...open, [key]: !open[key] })),
  } : null, [current, data, set, update, metadata?.channels, roles, creating, createDisabled, capabilities, handleCreateChannel, openCards]);

  const changed = current && data ? changedSectionsOf(sections, data, current) : [];

  const save = async () => {
    if (saving || !editorKey || !current || !changed.length) return;
    const keys = changed.map((section) => section.key);
    const problem = validate?.(current, keys) ?? null;
    if (problem) {
      toast({ variant: "destructive", title: "Verifică setările înainte de salvare", description: problem });
      return;
    }
    const savingKey = editorKey;
    const savingRevision = revision.current;
    const submitted = current;
    setSaving(true);
    try {
      const result = await updateSection(keys, submitted);
      if (initialized.current !== savingKey) return;
      if (result?.config) {
        const canonical = structuredClone(result.config);
        // Keep what was changed while the request was on its way, on top of what the server saved.
        const next = revision.current === savingRevision ? canonical : rebaseDraftChanges(canonical, submitted, latest.current);
        latest.current = next;
        setDraft(next);
      }
      toast(configSaveToastOptions(
        result?.notification?.status,
        "Setări salvate",
        `Au fost salvate: ${changed.map((section) => section.label).join(", ")}.`,
        result?.nativeAutoMod?.status,
      ));
    } catch (saveError: any) {
      if (initialized.current !== savingKey) return;
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message || "Modificările nu au fost salvate; rămân în formular." });
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    if (!saving && data) editDraft(structuredClone(data));
  };

  return {
    /** "ready" once the draft of the selected server exists. */
    status: current && api ? "ready" as const : loading || (data && initialized.current !== editorKey) ? "loading" as const : "error" as const,
    error,
    refetch,
    api,
    config: current,
    /** What the server has saved, to compare the draft with. */
    saved: current ? data : null,
    changed,
    saving,
    save,
    discard,
    guildName: guilds.find((guild) => guild.id === guildId)?.name || "Serverul selectat",
  };
}

/** What a page shows while its settings load, or when they cannot be read. */
export function PanelState({ status, error, onRetry, loadingText, children }: {
  status: "loading" | "error"; error: Error | null; onRetry: () => void; loadingText: string;
  /** Shown under the error (other places the person can still go). */
  children?: React.ReactNode;
}) {
  if (status === "loading") {
    return <div className="pn"><div className="pn-state" role="status"><Spinner /><span className="pn-sr">{loadingText}</span></div></div>;
  }
  return (
    <div className="pn">
      <div className="pn-fail" role="alert">
        <p>{error?.message || "Configurația nu a putut fi încărcată."}</p>
        <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={onRetry}>Reîncearcă</button>
      </div>
      {children}
    </div>
  );
}

/** The bar that appears while there are unsaved changes. */
export function SaveBar({ changed, saving, onSave, onDiscard, testId, blocked }: {
  changed: readonly DraftSection[]; saving: boolean; onSave: () => void; onDiscard: () => void; testId: string;
  /** Saving is not possible right now; the page says why. */
  blocked?: boolean;
}) {
  if (!changed.length) return null;
  return (
    <div className="pn-save" role="region" aria-label="Modificări nesalvate" data-testid={`${testId}-save-bar`}>
      <div className={cx("pn-save-st", saving && "is-saving")} role="status">
        <i aria-hidden="true" />
        <span>{saving ? "Se salvează…" : <>Modificări nesalvate în <b>{changed.map((section) => section.label).join(", ")}</b>.</>}</span>
      </div>
      <div className="pn-save-act">
        <button type="button" className="pn-btn-ghost" onClick={onDiscard} disabled={saving}>Renunță</button>
        <button type="button" className="pn-btn" onClick={onSave} disabled={saving || blocked} data-testid={`button-save-${testId}`}>
          {saving ? <Spinner /> : <Ico name="check" />}Salvează
        </button>
      </div>
    </div>
  );
}

/** The page head: server, title, description and a summary on the right. */
export function PageHead({ icon, guildName, title, lede, summary }: {
  icon: React.ReactNode; guildName: string; title: string; lede: React.ReactNode; summary?: React.ReactNode;
}) {
  return (
    <header className="pn-head">
      <div>
        <span className="pn-kick pn-rv" style={{ "--i": 0 } as React.CSSProperties}><span aria-hidden="true">{icon}</span>{guildName}</span>
        <h1 className="pn-h1 pn-rv" style={{ "--i": 1 } as React.CSSProperties}>{title}</h1>
        <p className="pn-lede pn-rv" style={{ "--i": 2 } as React.CSSProperties}>{lede}</p>
      </div>
      {summary}
    </header>
  );
}

/** "3/5 module pornite" with a small bar. */
export function CountSummary({ on, total, label, testId }: { on: number; total: number; label: React.ReactNode; testId: string }) {
  return (
    <div className="pn-sum pn-rv" style={{ "--i": 3 } as React.CSSProperties} data-testid={testId}>
      <b>{on}/{total}</b>
      <span>{label}</span>
      <span className="pn-bar" aria-hidden="true"><i style={{ "--p": `${total ? (on / total) * 100 : 0}%` } as React.CSSProperties} /></span>
    </div>
  );
}
