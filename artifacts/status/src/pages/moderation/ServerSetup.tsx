import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Sparkles, Eye, Hammer, RefreshCw, AlertTriangle, Lock, ShieldCheck, Hash, FolderClosed, Users, Link2, Save, FolderOpen } from "lucide-react";
import { apiFetchWithMeta, useActiveGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  type SetupDraft, type SetupChannel, type SetupAccess, type PreviewResult, type ApplyResult,
  type SetupResources, normalizeSetupDraft, newKey, slugChannel, removeRole, validateDraft, roleLabel,
} from "../../lib/server-setup";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Eroare necunoscută.");
type UncertainSetupItem = { key: string; name: string; kind: "role" | "category" | "channel"; parentKey?: string; attemptedAt?: string };
type SetupResourceOption = { id: string; name: string; kind: "role" | "category" | "channel"; parentId?: string };
type ReconciliationInventory = {
  key: string;
  pending: UncertainSetupItem;
  nameMatches: SetupResourceOption[];
  candidates: SetupResourceOption[];
  canConfirmAbsent: boolean;
  blockedReason?: string;
  inventoryFingerprint: string;
};
type ReconciliationResult = { uncertain: UncertainSetupItem[]; action: "bound" | "confirmed-absent" };
type SavedSetupDraft = { draft: SetupDraft; revision: number; updatedAt: string };
type SavedSetupDraftResponse = { savedDraft: SavedSetupDraft | null };

const isConflictError = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 409;

function AccessMatrix({ draft, value, onChange, testId }: {
  draft: SetupDraft;
  value: SetupAccess;
  onChange: (next: SetupAccess) => void;
  testId: string;
}) {
  const roles = ["everyone", ...draft.roles.map(role => role.key)];
  const toggle = (list: "readers" | "writers", key: string) => {
    const selected = value[list].includes(key);
    const next = selected ? value[list].filter(item => item !== key) : [...value[list], key];
    const readers = list === "writers" && !selected && !value.readers.includes(key)
      ? [...value.readers, key]
      : list === "readers" && selected
        ? value.readers.filter(item => item !== key)
        : value.readers;
    onChange({
      readers,
      writers: list === "readers" && selected
        ? value.writers.filter(item => item !== key)
        : list === "writers" ? next : value.writers,
    });
  };
  return <div className="mt-3 overflow-x-auto">
    <table className="w-full text-xs">
      <thead><tr className="text-muted-foreground"><th className="py-1 text-left font-normal">Rol</th><th className="font-normal">Citește</th><th className="font-normal">Scrie</th></tr></thead>
      <tbody>{roles.map(role => <tr key={role} className="border-t border-border/40">
        <td className="py-1.5 text-foreground">{roleLabel(draft, role)}</td>
        <td className="text-center"><input type="checkbox" checked={value.readers.includes(role)} onChange={() => toggle("readers", role)} aria-label={`${roleLabel(draft, role)} citește`} data-testid={`${testId}-read-${role}`} /></td>
        <td className="text-center"><input type="checkbox" checked={value.writers.includes(role)} onChange={() => toggle("writers", role)} aria-label={`${roleLabel(draft, role)} scrie`} data-testid={`${testId}-write-${role}`} /></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function ServerSetupPage() {
  const { guildId, guilds } = useActiveGuild();
  const guildName = guilds.find(g => g.id === guildId)?.name ?? "serverul selectat";
  const [draft, setDraftState] = useState<SetupDraft | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState({ communityType: "", goals: "", refinement: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SetupDraft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [resources, setResources] = useState<SetupResources | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<ApplyResult | null>(null);
  const [uncertain, setUncertain] = useState<UncertainSetupItem[]>([]);
  const [inventories, setInventories] = useState<Record<string, ReconciliationInventory>>({});
  const [selectedResources, setSelectedResources] = useState<Record<string, string>>({});
  const [inventoryLoadingKey, setInventoryLoadingKey] = useState<string | null>(null);
  const [reconcileBusyKey, setReconcileBusyKey] = useState<string | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);
  const [confirmAbsentKey, setConfirmAbsentKey] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<SavedSetupDraft | null>(null);
  const [savedDraftLoaded, setSavedDraftLoaded] = useState(false);
  const [draftPersistenceBusy, setDraftPersistenceBusy] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [draftSaveNotice, setDraftSaveNotice] = useState<string | null>(null);
  const [draftSaveConflict, setDraftSaveConflict] = useState(false);
  const [restorePending, setRestorePending] = useState<SavedSetupDraft | null>(null);
  const [restoredNeedsReview, setRestoredNeedsReview] = useState(false);
  const [draftBaseRevision, setDraftBaseRevision] = useState(0);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const applying = useRef(false);
  const draftRevision = useRef(0);
  const loadSequence = useRef(0);

  const base = `/guilds/${guildId}/server-setup`;

  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setLoadError(null);
    draftRevision.current++;
    setPreview(null); setResult(null); setApplyError(null);
    setUncertain([]); setInventories({}); setSelectedResources({});
    setReconcileError(null); setReconcileNotice(null); setConfirmAbsentKey(null);
    setSavedDraft(null); setSavedDraftLoaded(false); setDraftSaveError(null); setDraftSaveNotice(null);
    setDraftSaveConflict(false); setRestorePending(null); setRestoredNeedsReview(false); setDraftPersistenceBusy(false);
    setDraftBaseRevision(0); setOverwriteConfirmOpen(false);
    try {
      const [setupResult, savedResult, resourcesResult] = await Promise.allSettled([
        apiFetchWithMeta<{ draft: SetupDraft; aiAvailable: boolean; uncertain?: UncertainSetupItem[] }>(base),
        apiFetchWithMeta<SavedSetupDraftResponse>(`${base}/draft`),
        apiFetchWithMeta<SetupResources>(`${base}/resources`),
      ]);
      if (sequence !== loadSequence.current) return;
      if (setupResult.status === "rejected") throw setupResult.reason;
      const { data } = setupResult.value;
      setDraftState(normalizeSetupDraft(data.draft)); setAiAvailable(Boolean(data.aiAvailable)); setUncertain(data.uncertain ?? []);
      if (savedResult.status === "fulfilled") {
        setSavedDraft(savedResult.value.data.savedDraft);
        setSavedDraftLoaded(true);
        setDraftBaseRevision(savedResult.value.data.savedDraft?.revision ?? 0);
      } else {
        setDraftSaveError(`Drafturile salvate nu au putut fi încărcate: ${msg(savedResult.reason)}`);
      }
      if (resourcesResult.status === "fulfilled") {
        setResources(resourcesResult.value.data);
        setResourcesError(null);
      } else {
        setResources(null);
        setResourcesError(`Inventarul Discord nu a putut fi încărcat: ${msg(resourcesResult.reason)}`);
      }
    } catch (e) {
      if (sequence === loadSequence.current) setLoadError(msg(e));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => { if (guildId) void load(); }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDraft = (d: SetupDraft) => {
    if (applying.current) return;
    draftRevision.current++; setDraftState(normalizeSetupDraft(d)); setPreview(null); setConfirmOpen(false); setPreviewError(null);
    setDeleteResult(null); setDeleteError(null); setDeleteConfirmOpen(false);
    setDraftSaveNotice(null);
  };
  const issues = draft ? validateDraft(draft) : [];
  const busy = previewBusy || applyBusy || deleteBusy || resourcesLoading || draftPersistenceBusy || Boolean(reconcileBusyKey) || Boolean(inventoryLoadingKey);

  const refreshSavedDraft = async (resume: boolean) => {
    if (draftPersistenceBusy) return;
    const targetGuildId = guildId;
    const targetBase = base;
    setDraftPersistenceBusy(true); setDraftSaveError(null);
    try {
      const { data } = await apiFetchWithMeta<SavedSetupDraftResponse>(`${targetBase}/draft`);
      if (targetGuildId !== guildId) return;
      setSavedDraft(data.savedDraft); setSavedDraftLoaded(true); setDraftSaveConflict(false);
      if (resume && data.savedDraft) setRestorePending(data.savedDraft);
      else if (!data.savedDraft) setDraftSaveError("Nu există un draft salvat pentru acest server și operator.");
    } catch (e) {
      if (targetGuildId === guildId) setDraftSaveError(`Starea draftului salvat nu a putut fi încărcată: ${msg(e)}`);
    } finally { if (targetGuildId === guildId) setDraftPersistenceBusy(false); }
  };

  const saveDraft = async (overwriteConflict = false) => {
    if (!draft || !savedDraftLoaded || draftPersistenceBusy || issues.length || (draftSaveConflict && !overwriteConflict)) return;
    const targetGuildId = guildId;
    const targetBase = base;
    const snapshot = draft;
    const revision = draftRevision.current;
    const expectedRevision = overwriteConflict ? savedDraft?.revision ?? 0 : draftBaseRevision;
    setDraftPersistenceBusy(true); setDraftSaveError(null); setDraftSaveNotice(null);
    try {
      const { data } = await apiFetchWithMeta<SavedSetupDraftResponse>(`${targetBase}/draft`, {
        method: "PUT",
        body: JSON.stringify({ draft: snapshot, expectedRevision }),
      });
      if (!data.savedDraft) throw new Error("Răspuns invalid la salvarea draftului.");
      if (targetGuildId !== guildId) return;
      setSavedDraft(data.savedDraft); setSavedDraftLoaded(true); setDraftSaveConflict(false);
      setDraftBaseRevision(data.savedDraft.revision);
      setOverwriteConfirmOpen(false);
      setDraftSaveNotice(revision === draftRevision.current
        ? "Draftul a fost salvat doar pentru contul tău și serverul selectat. Discord nu a fost modificat."
        : "Versiunea trimisă a fost salvată; editările făcute în timpul salvării au rămas locale. Salvează din nou pentru a le păstra.");
    } catch (e) {
      if (targetGuildId !== guildId) return;
      if (isConflictError(e)) {
        setDraftSaveConflict(true);
        setDraftSaveError("O altă sesiune a salvat o versiune mai nouă. Modificările tale locale au fost păstrate; încarcă versiunea salvată doar dacă vrei să o folosești.");
        try {
          const { data } = await apiFetchWithMeta<SavedSetupDraftResponse>(`${targetBase}/draft`);
          if (targetGuildId !== guildId) return;
          setSavedDraft(data.savedDraft); setSavedDraftLoaded(true);
        } catch (refreshError) {
          if (targetGuildId === guildId) setDraftSaveError(`O altă sesiune a salvat o versiune mai nouă, iar aceasta nu a putut fi încărcată: ${msg(refreshError)} Draftul local a fost păstrat.`);
        }
      } else {
        setDraftSaveError(`Draftul nu a putut fi salvat. Modificările locale au fost păstrate: ${msg(e)}`);
      }
    } finally { if (targetGuildId === guildId) setDraftPersistenceBusy(false); }
  };

  const confirmRestoreDraft = () => {
    if (!restorePending) return;
    setDraft(normalizeSetupDraft(restorePending.draft));
    setPreview(null); setResult(null); setApplyError(null); setSuggestion(null);
    setDraftBaseRevision(restorePending.revision);
    setRestoredNeedsReview(true); setDraftSaveConflict(false); setDraftSaveNotice(null);
    setRestorePending(null);
  };

  const refreshReconciliationInventory = async (item: UncertainSetupItem) => {
    setInventoryLoadingKey(item.key); setReconcileError(null); setReconcileNotice(null);
    try {
      const { data } = await apiFetchWithMeta<ReconciliationInventory>(
        `${base}/reconciliation/${encodeURIComponent(item.key)}/inventory`,
      );
      setInventories(current => ({ ...current, [item.key]: data }));
      setSelectedResources(current => ({
        ...current,
        [item.key]: current[item.key] && data.candidates.some(candidate => candidate.id === current[item.key])
          ? current[item.key]
          : data.candidates[0]?.id ?? "",
      }));
    } catch (e) {
      setInventories(current => { const next = { ...current }; delete next[item.key]; return next; });
      setReconcileError(`${item.name}: ${msg(e)}`);
    } finally { setInventoryLoadingKey(null); }
  };

  const reconcile = async (item: UncertainSetupItem, action: "bind" | "confirm-absent") => {
    const inventory = inventories[item.key];
    if (!inventory || reconcileBusyKey) return;
    setReconcileBusyKey(item.key); setReconcileError(null); setReconcileNotice(null);
    try {
      const payload = action === "bind"
        ? { action, inventoryFingerprint: inventory.inventoryFingerprint, resourceId: selectedResources[item.key] }
        : { action: "confirm-absent", inventoryFingerprint: inventory.inventoryFingerprint, confirmed: true as const };
      const { data } = await apiFetchWithMeta<ReconciliationResult>(
        `${base}/reconciliation/${encodeURIComponent(item.key)}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setUncertain(data.uncertain);
      setInventories(current => { const next = { ...current }; delete next[item.key]; return next; });
      setSelectedResources(current => { const next = { ...current }; delete next[item.key]; return next; });
      setPreview(null); setResult(null);
      setReconcileNotice(data.action === "bound"
        ? `Resursa existentă a fost legată de încercarea „${item.name}”. Nu i-am schimbat permisiunile.`
        : `Absența pentru „${item.name}” a fost confirmată. Rulează o verificare nouă; orice creare va cere confirmarea obișnuită.`);
    } catch (e) {
      setReconcileError(`${item.name}: ${msg(e)} Verifică din nou inventarul înainte să încerci iar.`);
      setInventories(current => { const next = { ...current }; delete next[item.key]; return next; });
    } finally { setReconcileBusyKey(null); setConfirmAbsentKey(null); }
  };

  const suggest = async () => {
    if (!draft || aiBusy) return;
    setAiBusy(true); setAiError(null);
    try {
      const aiDraft = { ...(suggestion ?? draft), deleteTargets: [] };
      const { data } = await apiFetchWithMeta<{ draft: SetupDraft }>(`${base}/suggest`, { method: "POST", body: JSON.stringify({ ...ai, draft: aiDraft }) });
      setSuggestion({ ...normalizeSetupDraft(data.draft), deleteTargets: [] });
    } catch (e) { setAiError(`AI nu a putut genera sugestia: ${msg(e)} Draftul tău a rămas neschimbat.`); }
    finally { setAiBusy(false); }
  };

  const runPreview = async () => {
    if (!draft || busy || issues.length) return;
    setPreviewBusy(true); setPreviewError(null); setResult(null); setApplyError(null);
    const snapshot = draft;
    const revision = draftRevision.current;
    try {
      const { data } = await apiFetchWithMeta<PreviewResult>(`${base}/preview`, { method: "POST", body: JSON.stringify({ draft: snapshot }) });
      if (revision === draftRevision.current) { setPreview(data); setRestoredNeedsReview(false); }
    } catch (e) { setPreviewError(msg(e)); } finally { setPreviewBusy(false); }
  };

  const apply = async () => {
    if (!draft || !preview || applying.current) return;
    applying.current = true; setApplyBusy(true); setConfirmOpen(false); setApplyError(null);
    try {
      const { data } = await apiFetchWithMeta<ApplyResult>(`${base}/apply`, { method: "POST", body: JSON.stringify({ draft, confirmed: true, fingerprint: preview.fingerprint }) });
      setResult(data);
    } catch (e) { setApplyError(msg(e)); }
    finally { setPreview(null); applying.current = false; setApplyBusy(false); }
  };

  const refreshResources = async () => {
    setResourcesLoading(true); setResourcesError(null);
    try {
      const { data } = await apiFetchWithMeta<SetupResources>(`${base}/resources`);
      setResources(data);
    } catch (e) { setResourcesError(`Inventarul Discord nu a putut fi reîncărcat: ${msg(e)}`); }
    finally { setResourcesLoading(false); }
  };

  const deleteSelected = async () => {
    if (!draft || !preview?.ready || !draft.deleteTargets.length || deleteBusy) return;
    setDeleteBusy(true); setDeleteConfirmOpen(false); setDeleteError(null); setDeleteResult(null);
    try {
      const { data } = await apiFetchWithMeta<ApplyResult>(`${base}/delete`, {
        method: "POST",
        body: JSON.stringify({ draft, confirmed: true, fingerprint: preview.fingerprint }),
      });
      setDeleteResult(data);
      setPreview(null);
      setDraftState(current => current ? {
        ...current,
        deleteTargets: current.deleteTargets.filter(target =>
          data.items.some(item => item.id === target.id && item.status === "failed")),
      } : current);
      draftRevision.current++;
      await refreshResources();
    } catch (e) { setDeleteError(`${msg(e)} Reîncarcă inventarul și rulează o verificare nouă înainte de a reîncerca.`); }
    finally { setDeleteBusy(false); }
  };

  const toggleDeleteTarget = (id: string, kind: "category" | "channel", checked: boolean) => {
    if (!draft) return;
    const current = draft.deleteTargets ?? [];
    setDraft({
      ...draft,
      deleteTargets: checked ? [...current, { id, kind }] : current.filter(target => target.id !== id),
    });
  };

  if (loading) return <div className="space-y-4" data-testid="status-setup-loading">{[0, 1, 2].map(i => <div key={i} className="mod-card h-28 animate-pulse rounded-2xl" />)}</div>;
  if (loadError || !draft) return (
    <div className="mod-card rounded-2xl p-8 text-center">
      <p className="text-destructive" data-testid="text-setup-error">{loadError ?? "Șablonul nu a putut fi încărcat."}</p>
      <Button className="mt-4 gap-2" onClick={() => void load()} data-testid="button-retry-setup"><RefreshCw className="h-4 w-4" /> Reîncearcă</Button>
    </div>
  );

  const updateChannel = (ci: number, hi: number, ch: SetupChannel) =>
    setDraft({ ...draft, categories: draft.categories.map((c, i) => i !== ci ? c : { ...c, channels: c.channels.map((x, j) => j === hi ? ch : x) }) });

  return (
    <div className="space-y-8 pb-16">
      <header>
        <p className="mod-eyebrow">Instrumente / Pornire server</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-foreground">Arhitectura serverului</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Consolă pentru proprietarul serverului. Schițează rolurile, categoriile și canalele pentru <span className="text-foreground">{guildName}</span>; fiecare modificare de acces și fiecare ștergere sunt afișate înainte de confirmarea explicită. Poți salva manual draftul ca să-l reiei mai târziu.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Serverul trebuie să existe deja în Discord, iar botul să fie invitat. Asistentul amenajează serverul selectat; nu creează un server Discord nou.</p>
      </header>

      <section className="mod-card rounded-2xl p-5 sm:p-6" data-testid="panel-saved-setup-draft">
        <div className="flex flex-wrap items-center gap-2">
          <Save className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl text-foreground">Draft salvat</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Salvarea este opțională și privată pentru contul tău în acest server. Nu creează și nu modifică resurse Discord.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={busy || !savedDraftLoaded || draftSaveConflict || issues.length > 0}
            onClick={() => void saveDraft()} data-testid="button-save-setup-draft">
            <Save className="h-4 w-4" />{draftPersistenceBusy ? "Se salvează..." : "Salvează draftul curent"}
          </Button>
          {draftSaveConflict && savedDraft && (
            <Button variant="destructive" className="gap-2" disabled={busy}
              onClick={() => setOverwriteConfirmOpen(true)} data-testid="button-overwrite-saved-setup-draft">
              Suprascrie versiunea mai nouă...
            </Button>
          )}
          {savedDraft && (
            <Button variant="outline" className="gap-2" disabled={busy}
              onClick={() => void refreshSavedDraft(true)} data-testid="button-resume-setup-draft">
              <FolderOpen className="h-4 w-4" />{draftSaveConflict ? "Încarcă versiunea salvată" : "Reia draftul salvat"}
            </Button>
          )}
          {!savedDraftLoaded && (
            <Button variant="ghost" disabled={busy} onClick={() => void refreshSavedDraft(false)} data-testid="button-retry-saved-setup-draft">
              Reîncarcă starea salvării
            </Button>
          )}
        </div>
        {savedDraft && <p className="mt-3 text-xs text-muted-foreground" data-testid="text-saved-setup-draft-meta">
          Draft disponibil · versiunea {savedDraft.revision} · salvat {new Date(savedDraft.updatedAt).toLocaleString()}
        </p>}
        {restoredNeedsReview && <p className="mt-3 text-sm text-amber-300" role="status" data-testid="text-restored-draft-review">
          Draftul a fost reluat, fără modificări pe Discord. Rulează o verificare nouă și confirmă separat orice aplicare.
        </p>}
        {draftSaveError && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="text-setup-draft-save-error">{draftSaveError}</p>}
        {draftSaveNotice && <p className="mt-3 text-sm text-primary" role="status" data-testid="text-setup-draft-save-notice">{draftSaveNotice}</p>}
      </section>

      {reconcileError && <p role="alert" className="text-sm text-destructive" data-testid="text-reconciliation-error">{reconcileError}</p>}
      {reconcileNotice && <p role="status" className="text-sm text-primary" data-testid="text-reconciliation-result">{reconcileNotice}</p>}
      {uncertain.length > 0 && (
        <section className="mod-card rounded-2xl border border-amber-500/40 p-5 sm:p-6" data-testid="panel-uncertain-resources">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-xl text-foreground">Creări Discord neconfirmate</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Discord poate să fi creat resursa chiar dacă răspunsul nu a ajuns. Până la reconciliere, configurarea nu o recreează. Verifică inventarul proaspăt, apoi leagă resursa găsită sau confirmă explicit că lipsește.
          </p>
          <div className="mt-4 space-y-3">
            {uncertain.map(item => {
              const inventory = inventories[item.key];
              return (
                <article key={item.key} className="rounded-xl border border-border/60 bg-background/40 p-4" data-testid={`card-uncertain-${item.key}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.kind === "channel" ? "#" : ""}{item.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {item.kind === "role" ? "rol" : item.kind === "category" ? "categorie" : "canal"} · cheia {item.key}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Încercarea de creare a rămas fără confirmare; nicio resursă nu va fi recreată automat.</p>
                      {item.attemptedAt && <p className="mt-1 text-[11px] text-muted-foreground">Încercare: {new Date(item.attemptedAt).toLocaleString()}</p>}
                    </div>
                    <Button size="sm" variant="outline" className="gap-2" disabled={busy || inventoryLoadingKey !== null}
                      onClick={() => void refreshReconciliationInventory(item)} data-testid={`button-check-uncertain-${item.key}`}>
                      <RefreshCw className="h-3.5 w-3.5" />{inventoryLoadingKey === item.key ? "Se verifică..." : "Verifică inventarul Discord"}
                    </Button>
                  </div>
                  {inventory && (
                    <div className="mt-4 space-y-3 border-t border-border/50 pt-4" data-testid={`panel-reconciliation-inventory-${item.key}`}>
                      {inventory.candidates.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground">Resurse existente, de tipul și din categoria așteptate. Alege ID-ul corect; legarea nu modifică permisiunile sau poziția.</p>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <select className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                              value={selectedResources[item.key] ?? ""} onChange={e => setSelectedResources(current => ({ ...current, [item.key]: e.target.value }))}
                              data-testid={`select-reconciliation-resource-${item.key}`} aria-label={`Resursă existentă pentru ${item.name}`}>
                              {inventory.candidates.map(candidate => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.kind === "channel" ? "#" : ""}{candidate.name} · ID {candidate.id}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" className="gap-2" disabled={busy || !selectedResources[item.key]}
                              onClick={() => void reconcile(item, "bind")} data-testid={`button-bind-resource-${item.key}`}>
                              <Link2 className="h-4 w-4" />Leagă resursa
                            </Button>
                          </div>
                        </>
                      ) : inventory.nameMatches.length > 0 ? (
                        <p className="text-xs text-amber-300" data-testid={`text-reconciliation-invalid-match-${item.key}`}>
                          Inventarul conține resurse cu acest nume, dar niciuna nu trece validarea necesară pentru legare. Confirmarea absenței este blocată.
                        </p>
                      ) : (
                        <p className="text-xs text-primary" data-testid={`text-reconciliation-absent-${item.key}`}>
                          Verificarea proaspătă nu a găsit o resursă cu acest nume. {inventory.blockedReason ?? "Poți confirma absența; dacă inventarul se schimbă, confirmarea va fi respinsă."}
                        </p>
                      )}
                      {inventory.blockedReason && inventory.candidates.length > 0 && <p className="text-xs text-amber-300">{inventory.blockedReason}</p>}
                      {inventory.canConfirmAbsent && (
                        <Button size="sm" variant="outline" className="gap-2 border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                          disabled={busy || Boolean(inventory.blockedReason)} onClick={() => setConfirmAbsentKey(item.key)}
                          data-testid={`button-confirm-absent-${item.key}`}>
                          <AlertTriangle className="h-3.5 w-3.5" />Confirmă că lipsește
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="mod-card rounded-2xl p-5 sm:p-6" data-testid="panel-discord-resources">
        <div className="flex flex-wrap items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl text-foreground">Inventar Discord și ștergere manuală</h2>
          <Button size="sm" variant="outline" className="ml-auto gap-2" disabled={resourcesLoading || busy}
            onClick={() => void refreshResources()} data-testid="button-refresh-server-resources">
            <RefreshCw className="h-3.5 w-3.5" />{resourcesLoading ? "Se încarcă..." : "Reîncarcă inventarul"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Alege resurse existente explicit după ID. Ștergerea este separată de sugestiile AI și de aplicarea configurării; selectează cel mult 20 de ID-uri și verifică fiecare țintă înainte de confirmarea dedicată.
        </p>
        {resourcesError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="text-resource-inventory-error">{resourcesError}</p>}
        {!resources && resourcesLoading && <div className="mt-4 h-16 animate-pulse rounded-xl bg-muted/40" data-testid="skeleton-resource-inventory" />}
        {resources && <>
          <p className="mt-3 text-xs text-muted-foreground" data-testid="text-resource-inventory-count">
            {resources.roles.length} roluri · {resources.categories.length} categorii · {resources.channels.length} canale · amprentă {resources.fingerprint.slice(0, 12)}
          </p>
          {resourcesError && <p className="mt-2 text-xs text-amber-300">Se folosește ultimul inventar încărcat cu succes.</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Selectează resurse pentru ștergere</h3>
              <p className="mt-1 text-xs text-amber-300">Ștergerea unei categorii nu șterge canalele copil: acestea rămân în Discord, fără categorie.</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/50 p-3">
                {[...resources.categories.map(item => ({ ...item, kind: "category" as const })),
                  ...resources.channels.map(item => ({ ...item, kind: "channel" as const }))].map(item => {
                  const selected = (draft.deleteTargets ?? []).some(target => target.id === item.id);
                  return <label key={item.id} className="flex items-start gap-2 text-xs" data-testid={`delete-resource-option-${item.id}`}>
                    <input type="checkbox" checked={selected} disabled={!selected && (draft.deleteTargets?.length ?? 0) >= 20}
                      onChange={event => toggleDeleteTarget(item.id, item.kind, event.target.checked)}
                      data-testid={`check-delete-resource-${item.id}`} />
                    <span className="min-w-0"><span className="text-foreground">{item.kind === "channel" ? "#" : ""}{item.name}</span>
                      <span className="block break-all font-mono text-[10px] text-muted-foreground">ID {item.id} · {item.kind === "category" ? "categorie" : "canal"}</span></span>
                  </label>;
                })}
                {!resources.categories.length && !resources.channels.length && <p className="text-xs text-muted-foreground">Nu există categorii sau canale în inventar.</p>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground" data-testid="text-delete-selection-count">{draft.deleteTargets.length}/20 ținte selectate</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">Țintele exacte din draft</h3>
              {draft.deleteTargets.length
                ? <ul className="mt-3 space-y-2" data-testid="list-selected-delete-targets">
                {draft.deleteTargets.map(target => {
                    const resource = target.kind === "category"
                      ? resources.categories.find(item => item.id === target.id)
                      : resources.channels.find(item => item.id === target.id);
                    return <li key={target.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs" data-testid={`selected-delete-target-${target.id}`}>
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{target.kind === "channel" ? "#" : ""}{resource?.name ?? "Resursă absentă din inventarul curent"}</span>
                        <span className="block break-all font-mono text-[10px] text-muted-foreground">{target.kind} · ID {target.id}</span>
                      </span>
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => toggleDeleteTarget(target.id, target.kind, false)}
                        data-testid={`button-remove-delete-target-${target.id}`}>Scoate</Button>
                    </div>
                    </li>;
                  })}
                </ul>
                : <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground" data-testid="empty-delete-targets">Nicio resursă selectată. Inventarul nu se șterge prin aplicarea obișnuită.</p>}
              <p className="mt-3 text-xs text-muted-foreground">Confirmarea de ștergere va fi disponibilă numai după o verificare proaspătă și nu este inclusă în butonul „Aplică pe Discord”.</p>
            </div>
          </div>
        </>}
      </section>

      {/* AI */}
      <section className="mod-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-display text-xl text-foreground">Asistent AI</h2>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground" data-testid="status-ai">{aiAvailable ? "disponibil" : "indisponibil"}</span></div>
        {!aiAvailable ? <p className="mt-3 text-sm text-muted-foreground">AI nu este configurat pe server. Poți edita manual șablonul de mai jos.</p> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">Tipul comunității
              <Input className="mt-1" value={ai.communityType} onChange={e => setAi({ ...ai, communityType: e.target.value })} placeholder="ex: breaslă de joc, club de lectură" data-testid="input-ai-type" /></label>
            <label className="text-xs text-muted-foreground">Obiective
              <Input className="mt-1" value={ai.goals} onChange={e => setAi({ ...ai, goals: e.target.value })} placeholder="ex: anunțuri clare, zonă privată pentru staff" data-testid="input-ai-goals" /></label>
            <label className="text-xs text-muted-foreground md:col-span-2">Rafinare (opțional)
              <Textarea className="mt-1" rows={2} value={ai.refinement} onChange={e => setAi({ ...ai, refinement: e.target.value })} placeholder="ex: adaugă un canal de evenimente vizibil doar membrilor" data-testid="input-ai-refine" /></label>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button onClick={() => void suggest()} disabled={aiBusy || busy || !ai.communityType.trim() || !ai.goals.trim()} className="gap-2" data-testid="button-ai-suggest">
                <Sparkles className="h-4 w-4" />{aiBusy ? "Se generează..." : suggestion ? "Rafinează sugestia" : "Generează sugestie"}</Button>
              {suggestion && <>
                <Button variant="outline" onClick={() => { setDraft(suggestion); setSuggestion(null); }} data-testid="button-ai-use">Folosește sugestia</Button>
                <Button variant="ghost" onClick={() => setSuggestion(null)} data-testid="button-ai-discard">Renunță</Button>
              </>}
            </div>
            {aiError && <p role="alert" className="text-sm text-destructive md:col-span-2" data-testid="text-ai-error">{aiError}</p>}
            {suggestion && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm md:col-span-2" data-testid="panel-ai-suggestion">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">Sugestie (neaplicată în draft)</p>
                <p className="text-muted-foreground">Roluri: {suggestion.roles.map(r => r.name).join(", ") || "niciunul"}</p>
                {suggestion.categories.map(c => <p key={c.key} className="text-muted-foreground"><span className="text-foreground">{c.name}</span>: {c.channels.map(ch => `#${ch.name}`).join(", ")}</p>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Roles */}
      <section className="mod-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="font-display text-xl text-foreground">Roluri</h2>
          <Button size="sm" variant="outline" className="ml-auto gap-1" disabled={draft.roles.length >= 20}
            onClick={() => setDraft({ ...draft, roles: [...draft.roles, { key: newKey("rol", draft), name: `Rol ${draft.roles.length + 1}`, mode: "new" }] })} data-testid="button-add-role"><Plus className="h-3 w-3" /> Rol</Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Rolurile noi primesc zero permisiuni la nivel de server, inclusiv unul numit „Administrator”. Accesul vine doar din canale.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {draft.roles.map((r, i) => (
            <div key={r.key} className="space-y-2 rounded-xl border border-border/50 p-3" data-testid={`card-setup-role-${r.key}`}>
              <div className="flex gap-2">
                <Input value={r.name} disabled={r.mode === "existing"} onChange={e => setDraft({ ...draft, roles: draft.roles.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} data-testid={`input-role-${r.key}`} />
                <Button size="icon" variant="ghost" aria-label="Șterge rolul din draft" onClick={() => setDraft(removeRole(draft, r.key))} data-testid={`button-remove-role-${r.key}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-muted-foreground">Operație
                  <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={r.mode} onChange={e => {
                      const mode = e.target.value as "new" | "existing";
                      setDraft({ ...draft, roles: draft.roles.map((role, j) => j === i ? { ...role, mode, ...(mode === "new" ? { discordId: undefined } : {}) } : role) });
                    }} data-testid={`select-role-mode-${r.key}`}>
                    <option value="new">Rol nou (fără permisiuni globale)</option><option value="existing">Alege rol existent după ID</option>
                  </select>
                </label>
                {r.mode === "existing" && <label className="text-[11px] text-muted-foreground">Rol Discord · poziție
                  <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={r.discordId ?? ""} onChange={e => {
                      const discordId = e.target.value || undefined;
                      const selectedRole = resources?.roles.find(role => role.id === discordId);
                      setDraft({ ...draft, roles: draft.roles.map((role, j) => j === i ? {
                        ...role, discordId, ...(selectedRole ? { name: selectedRole.name } : {}),
                      } : role) });
                    }}
                    data-testid={`select-existing-role-${r.key}`}>
                    <option value="">Alege rol după ID</option>
                    {(resources?.roles ?? []).map(role => <option key={role.id} value={role.id} disabled={!role.usable}>
                      {role.name} · poziția {role.position} · ID {role.id}{role.usable ? "" : ` · indisponibil: ${role.reason ?? "neutilizabil"}`}
                    </option>)}
                  </select>
                </label>}
              </div>
              {r.mode === "existing" && r.discordId && <p className="break-all font-mono text-[10px] text-muted-foreground" data-testid={`text-role-id-${r.key}`}>ID selectat: {r.discordId}. Permisiunile globale și poziția rolului nu vor fi schimbate.</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="space-y-4">
        <div className="flex items-center gap-2"><FolderClosed className="h-4 w-4 text-primary" /><h2 className="font-display text-xl text-foreground">Categorii și canale</h2>
          <Button size="sm" variant="outline" className="ml-auto gap-1" disabled={draft.categories.length >= 10}
            onClick={() => setDraft({ ...draft, categories: [...draft.categories, { key: newKey("cat", draft), name: `Categorie ${draft.categories.length + 1}`, readers: [], writers: [], channels: [] }] })} data-testid="button-add-category"><Plus className="h-3 w-3" /> Categorie</Button></div>
        <p className="text-xs text-muted-foreground">Categoriile și canalele noi primesc doar accesul configurat aici. Resursele existente se aleg explicit după ID; accesul real neadministrat de panou se păstrează. Proprietarul serverului și rolurile cu Administrator real ocolesc aceste restricții.</p>
        {draft.categories.map((c, ci) => (
          <div key={c.key} className="mod-card rounded-2xl p-5" data-testid={`card-setup-category-${c.key}`}>
            <div className="flex gap-2">
              <Input className="font-display text-lg" value={c.name} disabled={Boolean(c.discordId)} onChange={e => setDraft({ ...draft, categories: draft.categories.map((x, i) => i === ci ? { ...x, name: e.target.value } : x) })} data-testid={`input-category-${c.key}`} />
              <Button size="icon" variant="ghost" aria-label="Elimină categoria din draft" onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== ci) })} data-testid={`button-remove-category-${c.key}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-[11px] text-muted-foreground">Categorie Discord existentă (opțional)
                <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  value={c.discordId ?? ""} onChange={e => {
                    const discordId = e.target.value || undefined;
                    const selectedCategory = resources?.categories.find(category => category.id === discordId);
                    setDraft({ ...draft, categories: draft.categories.map((category, j) => j === ci ? {
                      ...category,
                      discordId,
                      ...(selectedCategory ? { name: selectedCategory.name } : {}),
                      channels: category.channels.map(channel => ({ ...channel, discordId: undefined })),
                    } : category) });
                  }}
                  data-testid={`select-existing-category-${c.key}`}>
                  <option value="">Creează categorie nouă</option>
                  {(resources?.categories ?? []).map(category => <option key={category.id} value={category.id}>{category.name} · ID {category.id}</option>)}
                </select>
              </label>
              {c.discordId && <p className="self-end break-all font-mono text-[10px] text-muted-foreground" data-testid={`text-category-id-${c.key}`}>ID selectat: {c.discordId}. La aplicare se schimbă doar accesul administrat.</p>}
            </div>
            <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-3">
              <p className="text-xs font-medium text-foreground">Accesul categoriei</p>
              <AccessMatrix draft={draft} value={c} onChange={access => setDraft({ ...draft, categories: draft.categories.map((category, j) => j === ci ? { ...category, ...access } : category) })} testId={`category-access-${c.key}`} />
            </div>
            <div className="mt-4 space-y-3">
              {c.channels.map((ch, hi) => (
                <div key={ch.key} className="rounded-xl border border-border/60 bg-background/40 p-4" data-testid={`card-setup-channel-${ch.key}`}>
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Input value={ch.name} disabled={Boolean(ch.discordId)} onChange={e => updateChannel(ci, hi, { ...ch, name: slugChannel(e.target.value) })} data-testid={`input-channel-${ch.key}`} />
                    <Button size="icon" variant="ghost" aria-label="Elimină canalul din draft" onClick={() => setDraft({ ...draft, categories: draft.categories.map((x, i) => i !== ci ? x : { ...x, channels: x.channels.filter((_, j) => j !== hi) }) })} data-testid={`button-remove-channel-${ch.key}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-[11px] text-muted-foreground">Canal Discord existent (opțional)
                      <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                        value={ch.discordId ?? ""} onChange={e => {
                          const discordId = e.target.value || undefined;
                          const selectedChannel = resources?.channels.find(channel => channel.id === discordId);
                          updateChannel(ci, hi, { ...ch, discordId, ...(selectedChannel ? { name: slugChannel(selectedChannel.name) } : {}) });
                        }}
                        data-testid={`select-existing-channel-${ch.key}`}>
                        <option value="">Creează canal nou</option>
                        {(resources?.channels ?? []).filter(channel => channel.textBased && Boolean(c.discordId) && channel.parentId === c.discordId).map(channel =>
                          <option key={channel.id} value={channel.id}>#{channel.name} · ID {channel.id}</option>)}
                      </select>
                    </label>
                    {ch.discordId && <p className="self-end break-all font-mono text-[10px] text-muted-foreground" data-testid={`text-channel-id-${ch.key}`}>ID selectat: {ch.discordId}. Canalul trebuie să fie deja în categoria aleasă.</p>}
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs text-foreground">
                    <input type="checkbox" checked={ch.inheritsCategory} onChange={e => updateChannel(ci, hi, { ...ch, inheritsCategory: e.target.checked })} data-testid={`check-inherit-category-${ch.key}`} />
                    <span>Moștenește accesul categoriei <span className="block text-[11px] text-muted-foreground">Când este activ, matricea canalului este ignorată și previzualizarea afișează accesul efectiv al categoriei.</span></span>
                  </label>
                  <div className={`mt-3 rounded-lg border border-border/40 p-3 ${ch.inheritsCategory ? "opacity-60" : ""}`}>
                    <p className="text-xs font-medium text-foreground">Acces propriu canal</p>
                    {ch.inheritsCategory
                      ? <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-channel-inherited-${ch.key}`}>Acces moștenit: citește {c.readers.map(role => roleLabel(draft, role)).join(", ") || "nimeni"}; scrie {c.writers.map(role => roleLabel(draft, role)).join(", ") || "nimeni"}.</p>
                      : <AccessMatrix draft={draft} value={ch} onChange={access => updateChannel(ci, hi, { ...ch, ...access })} testId={`channel-access-${ch.key}`} />}
                  </div>
                  <Input className="mt-3 text-xs" value={ch.explanation} placeholder="Explicație pentru staff" onChange={e => updateChannel(ci, hi, { ...ch, explanation: e.target.value })} data-testid={`input-explain-${ch.key}`} />
                </div>
              ))}
              <Button size="sm" variant="ghost" className="gap-1" disabled={c.channels.length >= 30}
                 onClick={() => setDraft({ ...draft, categories: draft.categories.map((x, i) => i !== ci ? x : { ...x, channels: [...x.channels, { key: newKey("ch", draft), name: `canal-${x.channels.length + 1}`, readers: [], writers: [], inheritsCategory: true, explanation: "" }] }) })}
                data-testid={`button-add-channel-${c.key}`}><Plus className="h-3 w-3" /> Canal</Button>
            </div>
          </div>
        ))}
      </section>

      {/* Preflight */}
      <section className="mod-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2"><Eye className="h-4 w-4 text-primary" /><h2 className="font-display text-xl text-foreground">Verificare și aplicare</h2>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" className="gap-2" disabled={busy || issues.length > 0} onClick={() => void runPreview()} data-testid="button-preview"><Eye className="h-4 w-4" />{previewBusy ? "Se verifică..." : "Verifică"}</Button>
            <Button className="gap-2" disabled={busy || !preview?.ready || !preview.items.length} onClick={() => setConfirmOpen(true)} data-testid="button-open-apply"><Hammer className="h-4 w-4" />{applyBusy ? "Se aplică..." : "Aplică pe Discord"}</Button>
          </div></div>
        {issues.length > 0 && <ul className="mt-3 space-y-1 text-sm text-destructive" data-testid="list-draft-issues">{issues.map(i => <li key={i}>{i}</li>)}</ul>}
        {previewError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="text-preview-error">{previewError}</p>}
        {!preview && !result && !issues.length && <p className="mt-3 text-sm text-muted-foreground">Rulează verificarea pentru a vedea ce va fi creat și ce va fi reutilizat. Orice modificare a draftului anulează verificarea.</p>}
        {preview && (
          <div className="mt-4 space-y-3" data-testid="panel-preview">
            {preview.issues.map(i => <p key={i} className="flex gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{i}</p>)}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground" data-testid="notice-preview-scope">
              „Reutilizat” înseamnă că rolul rămâne neatins. „Actualizare” înseamnă că se schimbă doar permisiunile gestionate de panou; overwrites neadministrate sunt păstrate. Conflictele blochează aplicarea.
            </div>
            {preview.items.map(it => (
              <div key={`${it.kind}-${it.key}`} className="flex gap-3 rounded-lg border border-border/50 p-3" data-testid={`row-preview-${it.key}`}>
                <span className={`h-fit rounded px-2 py-0.5 font-mono text-[10px] uppercase ${it.status === "create" ? "bg-primary/15 text-primary" : it.status === "reuse" ? "bg-amber-500/15 text-amber-400" : it.status === "update" ? "bg-sky-500/15 text-sky-300" : "bg-destructive/15 text-destructive"}`}
                  data-testid={`status-preview-${it.key}`}>
                  {it.status === "create" ? "creare" : it.status === "reuse" ? "reutilizare" : it.status === "update" ? "actualizare" : "conflict"}</span>
                <div className="min-w-0 text-sm">
                  <p className="text-foreground">{it.kind === "channel" ? "#" : ""}{it.name} <span className="text-xs text-muted-foreground">({it.kind === "role" ? "rol" : it.kind === "category" ? "categorie" : "canal"})</span></p>
                  {it.id && <p className="break-all font-mono text-[10px] text-muted-foreground" data-testid={`text-preview-id-${it.key}`}>ID Discord {it.id}</p>}
                  <p className="text-xs text-muted-foreground">{it.detail}</p>
                  {it.inherited && <p className="mt-1 text-[11px] text-sky-300" data-testid={`text-preview-inherited-${it.key}`}>Canal existent inclus deoarece moștenește accesul categoriei; nu va fi mutat sau șters.</p>}
                  {it.effectiveAccess && <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-preview-access-${it.key}`}>
                    {it.status === "reuse" ? "Acces propus (rolul nu se modifică): " : "Acces efectiv planificat: "}
                    citesc {it.effectiveAccess.readers.map(role => roleLabel(draft, role)).join(", ") || "nimeni"}; scriu {it.effectiveAccess.writers.map(role => roleLabel(draft, role)).join(", ") || "nimeni"}.
                    {it.kind === "channel" && draft.categories.flatMap(category => category.channels).find(channel => channel.key === it.key)?.inheritsCategory ? " Moștenit de la categorie." : ""}
                  </p>}
                  {it.kind === "channel" && draft.categories.flatMap(category => category.channels).find(channel => channel.key === it.key)?.explanation &&
                    <p className="mt-1 text-xs text-muted-foreground">{draft.categories.flatMap(category => category.channels).find(channel => channel.key === it.key)?.explanation}</p>}
                </div>
              </div>
            ))}
            {preview.deletionItems.length > 0 && <section className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" data-testid="panel-preview-deletions">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground">Operație separată de ștergere · {preview.deletionItems.length} ținte</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Această listă nu este executată de „Aplică pe Discord”. Pentru ștergere trebuie apăsată acțiunea dedicată și confirmat dialogul separat.</p>
                </div>
                <Button variant="destructive" className="gap-2" disabled={!preview.ready || deleteBusy || preview.deletionItems.some(item => item.status !== "delete")}
                  onClick={() => setDeleteConfirmOpen(true)} data-testid="button-open-delete-confirmation">
                  <Trash2 className="h-4 w-4" />Șterge țintele verificate
                </Button>
              </div>
              <ul className="mt-3 space-y-2">
                {preview.deletionItems.map(item => <li key={item.id} className="rounded-lg border border-border/50 bg-background/40 p-3" data-testid={`row-preview-deletion-${item.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-sm text-foreground">{item.kind === "channel" ? "#" : ""}{item.name} <span className="text-xs text-muted-foreground">· {item.kind === "category" ? "categorie" : "canal"}</span></p>
                      <p className="break-all font-mono text-[10px] text-muted-foreground" data-testid={`text-delete-preview-id-${item.id}`}>ID {item.id}</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${item.status === "delete" ? "bg-amber-500/15 text-amber-300" : "bg-destructive/15 text-destructive"}`}
                      data-testid={`status-delete-preview-${item.id}`}>{item.status === "delete" ? "pregătit" : "conflict"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  {item.children && item.children.length > 0 && <div className="mt-2 rounded-md border border-border/40 p-2">
                    <p className="text-[11px] text-amber-300">Canalele copil rămân în Discord:</p>
                    <ul className="mt-1 space-y-1">{item.children.map(child => <li key={child.id} className="break-all text-[11px] text-muted-foreground">#{child.name} · ID {child.id}</li>)}</ul>
                  </div>}
                </li>)}
              </ul>
            </section>}
          </div>
        )}
        {applyError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="text-apply-error">{applyError} Rulează din nou verificarea înainte de a reîncerca.</p>}
        {result && (
          <div className="mt-4 space-y-2" data-testid="panel-apply-result">
            <p className={`flex items-center gap-2 text-sm ${result.complete ? "text-primary" : "text-amber-400"}`}>
              {result.complete ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {result.complete ? "Configurarea a fost aplicată complet." : "Aplicare parțială. Verifică elementele eșuate, apoi rulează o nouă verificare."}</p>
            {result.items.map(it => (
              <p key={`${it.kind}-${it.key}`} className="text-xs text-muted-foreground" data-testid={`row-apply-result-${it.key}`}><span className={it.status === "failed" ? "text-destructive" : "text-foreground"}>{it.status === "created" ? "creat" : it.status === "updated" ? "actualizat" : it.status === "reused" ? "reutilizat" : "eșuat"}</span> · {it.name} — {it.detail}</p>
            ))}
          </div>
        )}
        {deleteError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="text-delete-error">{deleteError}</p>}
        {deleteResult && <div className="mt-4 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4" data-testid="panel-delete-result">
          <p className={`text-sm ${deleteResult.complete ? "text-primary" : "text-amber-300"}`} data-testid="status-delete-result">
            {deleteResult.complete ? "Ștergerea separată s-a încheiat." : "Ștergere parțială; verifică fiecare rezultat."}
          </p>
          {deleteResult.items.map(item => <p key={`${item.kind}-${item.id ?? item.key}`} className="text-xs text-muted-foreground" data-testid={`row-delete-result-${item.id ?? item.key}`}>
            <span className={item.status === "failed" ? "text-destructive" : "text-foreground"}>{item.status === "deleted" ? "șters" : "eșuat"}</span> · {item.name} · ID {item.id ?? "necunoscut"} — {item.detail}
          </p>)}
        </div>}
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={o => !applyBusy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Aplici pe {guildName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pe „{guildName}”: {preview?.items.filter(i => i.status === "create").length ?? 0} resurse noi, {preview?.items.filter(i => i.status === "update").length ?? 0} actualizări de acces gestionat și {preview?.items.filter(i => i.status === "reuse").length ?? 0} roluri existente reutilizate. Nicio țintă din lista de ștergere nu va fi ștearsă de această acțiune. Operațiile Discord nu se anulează automat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-apply">Anulează</AlertDialogCancel>
            <AlertDialogAction disabled={applyBusy || !preview?.ready || !preview.items.length} onClick={() => void apply()} data-testid="button-confirm-apply">Confirm și aplic</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={open => !deleteBusy && setDeleteConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Confirmare separată pentru ștergere</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Acest pas va apela doar acțiunea de ștergere pentru serverul „{guildName}”. Nu este parte din aplicarea configurării. Verifică atent fiecare ID:</p>
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border/50 p-3 text-left">
                  {preview?.deletionItems.map(item => <li key={item.id} className="text-xs" data-testid={`confirm-delete-target-${item.id}`}>
                    <span className="font-medium text-foreground">{item.kind === "channel" ? "#" : ""}{item.name}</span>
                    <span className="block break-all font-mono text-[10px] text-muted-foreground">{item.kind} · ID {item.id}</span>
                    {item.children?.length ? <span className="mt-1 block text-amber-300">Canalele copil rămân în Discord, fără categorie: {item.children.map(child => `#${child.name} (ID ${child.id})`).join(", ")}</span> : null}
                  </li>)}
                </ul>
                <p className="text-amber-300">Ștergerea este distructivă și nu poate fi anulată automat.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Păstrează resursele</AlertDialogCancel>
            <AlertDialogAction disabled={deleteBusy || !preview?.ready || !preview?.deletionItems.length || preview.deletionItems.some(item => item.status !== "delete")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void deleteSelected()} data-testid="button-confirm-delete">
              {deleteBusy ? "Se șterge..." : "Confirm și șterg aceste ID-uri"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restorePending !== null} onOpenChange={open => !open && setRestorePending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiei draftul salvat?</AlertDialogTitle>
            <AlertDialogDescription>
              Versiunea {restorePending?.revision} va înlocui draftul afișat acum. Această reluare nu schimbă nimic pe Discord și anulează orice verificare anterioară. Va trebui să verifici din nou și să confirmi separat aplicarea.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-resume-setup-draft">Păstrează draftul curent</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestoreDraft} data-testid="button-confirm-resume-setup-draft">Reia draftul</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={overwriteConfirmOpen} onOpenChange={open => !draftPersistenceBusy && setOverwriteConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Înlocuiești versiunea salvată?</AlertDialogTitle>
            <AlertDialogDescription>
              O altă sesiune a salvat versiunea {savedDraft?.revision}. Dacă continui, versiunea aceea va fi înlocuită cu draftul local din această pagină. Nimic nu se aplică pe Discord.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-overwrite-saved-draft">Păstrează draftul local</AlertDialogCancel>
            <AlertDialogAction disabled={draftPersistenceBusy} onClick={() => void saveDraft(true)} data-testid="button-confirm-overwrite-saved-draft">
              Confirmă înlocuirea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAbsentKey !== null} onOpenChange={open => !reconcileBusyKey && !open && setConfirmAbsentKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Confirmi absența resursei?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const item = uncertain.find(entry => entry.key === confirmAbsentKey);
                return item ? (
                  <>Inventarul Discord tocmai a fost verificat și nu conține „{item.name}”. Confirmarea șterge doar înregistrarea locală a încercării neconfirmate, nu șterge și nu modifică nimic în Discord. Dacă resursa există dar nu a apărut în inventar, următoarea aplicare poate crea un duplicat. Verifică manual în Discord înainte să continui; o nouă creare va cere în continuare confirmarea normală.</>
                ) : null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm-absent">Anulează</AlertDialogCancel>
            <AlertDialogAction disabled={reconcileBusyKey !== null} onClick={() => {
              const item = uncertain.find(entry => entry.key === confirmAbsentKey);
              if (item) void reconcile(item, "confirm-absent");
            }} data-testid="button-acknowledge-absent">Confirmă absența</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
