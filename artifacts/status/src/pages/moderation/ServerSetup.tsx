import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Sparkles, Eye, Hammer, RefreshCw, AlertTriangle, Lock, ShieldCheck, Hash, FolderClosed, Users } from "lucide-react";
import { apiFetchWithMeta, useActiveGuild } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  type SetupDraft, type SetupChannel, type PreviewResult, type ApplyResult,
  newKey, slugChannel, toggleReader, toggleWriter, removeRole, validateDraft, roleLabel,
} from "../../lib/server-setup";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Eroare necunoscută.");

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
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const applying = useRef(false);
  const draftRevision = useRef(0);

  const base = `/guilds/${guildId}/server-setup`;

  const load = async () => {
    setLoading(true); setLoadError(null);
    try {
      const { data } = await apiFetchWithMeta<{ draft: SetupDraft; aiAvailable: boolean }>(base);
      setDraftState(data.draft); setAiAvailable(Boolean(data.aiAvailable));
    } catch (e) { setLoadError(msg(e)); } finally { setLoading(false); }
  };
  useEffect(() => { if (guildId) void load(); }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDraft = (d: SetupDraft) => { if (applying.current) return; draftRevision.current++; setDraftState(d); setPreview(null); setConfirmOpen(false); setPreviewError(null); };
  const issues = draft ? validateDraft(draft) : [];
  const busy = previewBusy || applyBusy;

  const suggest = async () => {
    if (!draft || aiBusy) return;
    setAiBusy(true); setAiError(null);
    try {
      const { data } = await apiFetchWithMeta<{ draft: SetupDraft }>(`${base}/suggest`, { method: "POST", body: JSON.stringify({ ...ai, draft: suggestion ?? draft }) });
      setSuggestion(data.draft);
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
      if (revision === draftRevision.current) setPreview(data);
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

  if (loading) return <div className="space-y-4" data-testid="status-setup-loading">{[0, 1, 2].map(i => <div key={i} className="mod-card h-28 animate-pulse rounded-2xl" />)}</div>;
  if (loadError || !draft) return (
    <div className="mod-card rounded-2xl p-8 text-center">
      <p className="text-destructive" data-testid="text-setup-error">{loadError ?? "Șablonul nu a putut fi încărcat."}</p>
      <Button className="mt-4 gap-2" onClick={() => void load()} data-testid="button-retry-setup"><RefreshCw className="h-4 w-4" /> Reîncearcă</Button>
    </div>
  );

  const roleOptions = ["everyone", ...draft.roles.map(r => r.key)];
  const updateChannel = (ci: number, hi: number, ch: SetupChannel) =>
    setDraft({ ...draft, categories: draft.categories.map((c, i) => i !== ci ? c : { ...c, channels: c.channels.map((x, j) => j === hi ? ch : x) }) });

  return (
    <div className="space-y-8 pb-16">
      <header>
        <p className="mod-eyebrow">Instrumente / Pornire server</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-foreground">Arhitectura serverului</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Schițează rolurile, categoriile și canalele pentru <span className="text-foreground">{guildName}</span>. Nimic nu se schimbă pe Discord până nu rulezi verificarea și confirmi explicit. Draftul trăiește doar în această pagină; dacă o închizi, se pierde.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Serverul trebuie să existe deja în Discord, iar botul să fie invitat. Asistentul amenajează serverul selectat; nu creează un server Discord nou.</p>
      </header>

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
            onClick={() => setDraft({ ...draft, roles: [...draft.roles, { key: newKey("rol", draft), name: `Rol ${draft.roles.length + 1}` }] })} data-testid="button-add-role"><Plus className="h-3 w-3" /> Rol</Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Rolurile noi primesc zero permisiuni la nivel de server, inclusiv unul numit „Administrator”. Accesul vine doar din canale.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {draft.roles.map((r, i) => (
            <div key={r.key} className="flex gap-2">
              <Input value={r.name} onChange={e => setDraft({ ...draft, roles: draft.roles.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} data-testid={`input-role-${r.key}`} />
              <Button size="icon" variant="ghost" aria-label="Șterge rolul" onClick={() => setDraft(removeRole(draft, r.key))} data-testid={`button-remove-role-${r.key}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="space-y-4">
        <div className="flex items-center gap-2"><FolderClosed className="h-4 w-4 text-primary" /><h2 className="font-display text-xl text-foreground">Categorii și canale</h2>
          <Button size="sm" variant="outline" className="ml-auto gap-1" disabled={draft.categories.length >= 10}
            onClick={() => setDraft({ ...draft, categories: [...draft.categories, { key: newKey("cat", draft), name: `Categorie ${draft.categories.length + 1}`, channels: [] }] })} data-testid="button-add-category"><Plus className="h-3 w-3" /> Categorie</Button></div>
        <p className="text-xs text-muted-foreground">Categoriile noi sunt private (vizibile doar botului); fiecare canal primește permisiuni explicite. Proprietarul serverului și rolurile cu Administrator real ocolesc aceste restricții.</p>
        {draft.categories.map((c, ci) => (
          <div key={c.key} className="mod-card rounded-2xl p-5">
            <div className="flex gap-2">
              <Input className="font-display text-lg" value={c.name} onChange={e => setDraft({ ...draft, categories: draft.categories.map((x, i) => i === ci ? { ...x, name: e.target.value } : x) })} data-testid={`input-category-${c.key}`} />
              <Button size="icon" variant="ghost" aria-label="Șterge categoria" onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== ci) })} data-testid={`button-remove-category-${c.key}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="mt-4 space-y-3">
              {c.channels.map((ch, hi) => (
                <div key={ch.key} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Input value={ch.name} onChange={e => updateChannel(ci, hi, { ...ch, name: slugChannel(e.target.value) })} data-testid={`input-channel-${ch.key}`} />
                    <Button size="icon" variant="ghost" aria-label="Șterge canalul" onClick={() => setDraft({ ...draft, categories: draft.categories.map((x, i) => i !== ci ? x : { ...x, channels: x.channels.filter((_, j) => j !== hi) }) })} data-testid={`button-remove-channel-${ch.key}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground"><th className="py-1 text-left font-normal">Rol</th><th className="font-normal">Citește</th><th className="font-normal">Scrie</th></tr></thead>
                      <tbody>{roleOptions.map(rk => (
                        <tr key={rk} className="border-t border-border/40">
                          <td className="py-1.5 text-foreground">{roleLabel(draft, rk)}</td>
                          <td className="text-center"><input type="checkbox" checked={ch.readers.includes(rk)} onChange={() => updateChannel(ci, hi, toggleReader(ch, rk))} data-testid={`check-read-${ch.key}-${rk}`} /></td>
                          <td className="text-center"><input type="checkbox" checked={ch.writers.includes(rk)} onChange={() => updateChannel(ci, hi, toggleWriter(ch, rk))} data-testid={`check-write-${ch.key}-${rk}`} /></td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                  <Input className="mt-3 text-xs" value={ch.explanation} placeholder="Explicație pentru staff" onChange={e => updateChannel(ci, hi, { ...ch, explanation: e.target.value })} data-testid={`input-explain-${ch.key}`} />
                </div>
              ))}
              <Button size="sm" variant="ghost" className="gap-1" disabled={c.channels.length >= 30}
                onClick={() => setDraft({ ...draft, categories: draft.categories.map((x, i) => i !== ci ? x : { ...x, channels: [...x.channels, { key: newKey("ch", draft), name: `canal-${x.channels.length + 1}`, readers: ["everyone"], writers: [], explanation: "" }] }) })}
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
            <Button className="gap-2" disabled={busy || !preview?.ready} onClick={() => setConfirmOpen(true)} data-testid="button-open-apply"><Hammer className="h-4 w-4" />{applyBusy ? "Se aplică..." : "Aplică pe Discord"}</Button>
          </div></div>
        {issues.length > 0 && <ul className="mt-3 space-y-1 text-sm text-destructive" data-testid="list-draft-issues">{issues.map(i => <li key={i}>{i}</li>)}</ul>}
        {previewError && <p role="alert" className="mt-3 text-sm text-destructive">{previewError}</p>}
        {!preview && !result && !issues.length && <p className="mt-3 text-sm text-muted-foreground">Rulează verificarea pentru a vedea ce va fi creat și ce va fi reutilizat. Orice modificare a draftului anulează verificarea.</p>}
        {preview && (
          <div className="mt-4 space-y-3" data-testid="panel-preview">
            {preview.issues.map(i => <p key={i} className="flex gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{i}</p>)}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              Resursele marcate „reutilizat” există deja și rămân neatinse: permisiunile lor reale pot diferi de accesul propus mai jos.
            </div>
            {preview.items.map(it => (
              <div key={`${it.kind}-${it.key}`} className="flex gap-3 rounded-lg border border-border/50 p-3" data-testid={`row-preview-${it.key}`}>
                <span className={`h-fit rounded px-2 py-0.5 font-mono text-[10px] uppercase ${it.status === "create" ? "bg-primary/15 text-primary" : it.status === "reuse" ? "bg-amber-500/15 text-amber-400" : "bg-destructive/15 text-destructive"}`}>
                  {it.status === "create" ? "nou" : it.status === "reuse" ? "reutilizat" : "conflict"}</span>
                <div className="min-w-0 text-sm">
                  <p className="text-foreground">{it.kind === "channel" ? "#" : ""}{it.name} <span className="text-xs text-muted-foreground">({it.kind === "role" ? "rol" : it.kind === "category" ? "categorie" : "canal"})</span></p>
                  <p className="text-xs text-muted-foreground">{it.detail}</p>
                  {it.kind === "channel" && (() => {
                    const ch = draft.categories.flatMap(c => c.channels).find(x => x.key === it.key);
                    if (!ch) return null;
                    return <p className="mt-1 text-xs text-muted-foreground">{it.status === "reuse" ? "Acces propus (neaplicat): " : "Acces: "}citesc {ch.readers.map(r => roleLabel(draft, r)).join(", ") || "nimeni"}; scriu {ch.writers.map(r => roleLabel(draft, r)).join(", ") || "nimeni"}.{ch.explanation && ` ${ch.explanation}`}</p>;
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
        {applyError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="text-apply-error">{applyError} Rulează din nou verificarea înainte de a reîncerca.</p>}
        {result && (
          <div className="mt-4 space-y-2" data-testid="panel-apply-result">
            <p className={`flex items-center gap-2 text-sm ${result.complete ? "text-primary" : "text-amber-400"}`}>
              {result.complete ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {result.complete ? "Configurarea a fost aplicată complet." : "Aplicare parțială. Verifică elementele eșuate, apoi rulează o nouă verificare."}</p>
            {result.items.map(it => (
              <p key={`${it.kind}-${it.key}`} className="text-xs text-muted-foreground"><span className={it.status === "failed" ? "text-destructive" : "text-foreground"}>{it.status === "created" ? "creat" : it.status === "reused" ? "reutilizat" : "eșuat"}</span> · {it.name} — {it.detail}</p>
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={o => !applyBusy && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Aplici pe {guildName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vor fi create {preview?.items.filter(i => i.status === "create").length ?? 0} resurse noi pe serverul „{guildName}”. Cele {preview?.items.filter(i => i.status === "reuse").length ?? 0} existente rămân neschimbate. Acțiunea nu se anulează automat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-apply">Anulează</AlertDialogCancel>
            <AlertDialogAction disabled={applyBusy} onClick={() => void apply()} data-testid="button-confirm-apply">Confirm și aplic</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
