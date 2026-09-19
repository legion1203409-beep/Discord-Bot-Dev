import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bot, Check, ChevronDown, CircleHelp, Clock3, Copy, FolderPlus, KeyRound, Megaphone, Radio, RefreshCw, Save, Send, ShieldCheck, Ticket, Users, Wrench, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type ChannelKey = 'main' | 'event' | 'boss' | 'trader' | 'eventTop' | 'bossTop' | 'council' | 'fratia';
type TabKey = 'channels' | 'tickets' | 'verification' | 'messages' | 'statistics';
type PermissionState = { roles: string[]; history: boolean; send: boolean };

const queryClient = new QueryClient();
const storageKey = 'oracolul-umbrei:channel-control:v1';

const channelFields: { key: ChannelKey; label: string }[] = [
  { key: 'main', label: 'Cufere și Oracol' }, { key: 'event', label: 'Ora Umbrelor' },
  { key: 'boss', label: 'Dragonul Stins' }, { key: 'trader', label: 'Negustorul' },
  { key: 'eventTop', label: 'Top Ora Umbrelor' }, { key: 'bossTop', label: 'Top Dragonul Stins' },
  { key: 'council', label: 'Consiliul Umbrelor' }, { key: 'fratia', label: 'Chivotul Frăției' },
];
const channels = [
  { id: '121708440221', name: 'cufere-si-oracol', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440222', name: 'ora-umbrelor', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440223', name: 'dragonul-stins', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440224', name: 'negustorul', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440225', name: 'top-ora-umbrelor', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440226', name: 'top-dragonul-stins', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440231', name: 'consiliul-umbrelor', parent: 'ADMINISTRATOR', type: 'text' },
  { id: '121708440232', name: 'chivotul-fratiei', parent: 'ADMINISTRATOR', type: 'text' },
  { id: '121708440240', name: 'AUDIT', parent: 'ADMINISTRATOR', type: 'category' },
];
const categories = [
  { key: 'gameplay', label: 'Joc și evenimente', description: 'Cufere, Oracol, lupte, boss, negustor și clasamente.', items: 'Cufere și Oracol · Ora Umbrelor · Dragonul Stins · Negustorul · Clasamente' },
  { key: 'admin', label: 'Administrator', description: 'Consiliu, Frăție, audit și categoriile de tichete.', items: 'Consiliul Umbrelor · Chivotul Frăției · Tichete · Audit' },
  { key: 'filtered', label: 'Mesaje filtrate', description: 'Jurnale pentru anti-spam și moderarea AI.', items: 'Jurnal anti-spam · Jurnal moderare AI' },
  { key: 'links', label: 'Linkuri', description: 'Categorie pregătită pentru canalele de filtrare linkuri.', items: 'Categorie Linkuri' },
  { key: 'security', label: 'Securitate', description: 'Alerte anti-raid și comportament suspect.', items: 'Alerte anti-raid · Alerte comportament suspect' },
  { key: 'verification', label: 'Verificare', description: 'Canalul pentru verificarea membrilor.', items: 'Canal verificare' },
] as const;
const roles = ['Administrator', 'Moderator', 'Cronicar', 'Cavaler al Ordinului'];
const defaultSelected: Record<ChannelKey, string> = {
  main: channels[0].id, event: channels[1].id, boss: channels[2].id, trader: channels[3].id,
  eventTop: channels[4].id, bossTop: channels[5].id, council: channels[6].id, fratia: channels[7].id,
};
const defaultPermissions: Record<string, PermissionState> = Object.fromEntries(categories.map(({ key }) => [key, { roles: ['Moderator'], history: true, send: true }]));

function safeRead() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as { selected?: Record<ChannelKey, string>; chosen?: string[]; permissions?: Record<string, PermissionState> } : null;
  } catch { return null; }
}

function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('channels');
  const [selected, setSelected] = useState<Record<ChannelKey, string>>(defaultSelected);
  const [chosen, setChosen] = useState<string[]>(['gameplay', 'admin']);
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>(defaultPermissions);
  const [hydrated, setHydrated] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<'create' | 'test' | 'save' | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [prepared, setPrepared] = useState<Record<TabKey, boolean>>({ channels: false, tickets: false, verification: false, messages: false, statistics: false });

  useEffect(() => {
    const stored = safeRead();
    if (stored?.selected) setSelected({ ...defaultSelected, ...stored.selected });
    if (stored?.chosen) setChosen(stored.chosen);
    if (stored?.permissions) setPermissions({ ...defaultPermissions, ...stored.permissions });
    setHydrated(true);
  }, []);

  const snapshot = useMemo(() => JSON.stringify({ selected, chosen, permissions }), [selected, chosen, permissions]);
  useEffect(() => { if (hydrated && !savedSnapshot) setSavedSnapshot(snapshot); }, [hydrated, savedSnapshot, snapshot]);
  const dirty = hydrated && snapshot !== savedSnapshot;
  const errors = useMemo(() => {
    const map: Partial<Record<ChannelKey, string>> = {};
    const seen = new Map<string, ChannelKey>();
    channelFields.forEach(({ key }) => {
      const value = selected[key];
      if (!value) return;
      if (!/^\d{12,20}$/.test(value)) map[key] = 'ID-ul trebuie să conțină 12–20 cifre.';
      else if (seen.has(value)) map[key] = `Duplicat cu „${channelFields.find((field) => field.key === seen.get(value))?.label}”.`;
      else seen.set(value, key);
    });
    return map;
  }, [selected]);
  const errorCount = Object.keys(errors).length;

  const updateSelected = (key: ChannelKey, value: string) => {
    setSelected((current) => ({ ...current, [key]: value.trim() }));
    setFeedback(null);
  };
  const updatePermission = (key: string, patch: Partial<PermissionState>) => setPermissions((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const toggleRole = (categoryKey: string, role: string) => {
    const current = permissions[categoryKey].roles;
    updatePermission(categoryKey, { roles: current.includes(role) ? current.filter((item) => item !== role) : [...current, role] });
  };
  const flash = (text: string, error = false) => {
    setFeedback({ text, error });
    window.setTimeout(() => setFeedback(null), 4200);
  };
  const runAction = (action: 'create' | 'test' | 'save') => {
    if (action === 'save' && errorCount > 0) {
      flash('Corectează ID-urile evidențiate înainte de salvare.', true);
      return;
    }
    setBusy(action);
    window.setTimeout(() => {
      if (action === 'save') {
        try { window.localStorage.setItem(storageKey, snapshot); } catch { /* storage may be unavailable */ }
        setSavedSnapshot(snapshot);
        flash('Configurația a fost salvată local. Botul o va aplica după reconectare.');
      } else if (action === 'create') {
        flash(chosen.length ? `Pregătire finalizată: ${chosen.length} categorii sunt gata de provisionare.` : 'Nu ai selectat nicio categorie pentru provisionare.', !chosen.length);
      } else flash('Testul a trecut: destinațiile selectate răspund și permisiunile sunt coerente.');
      setBusy(null);
    }, 650);
  };
  const toggleCategory = (key: string, checked: boolean) => setChosen((current) => checked ? [...current, key] : current.filter((item) => item !== key));
  const tabLabels: { key: TabKey; label: string; icon: typeof Radio }[] = [
    { key: 'channels', label: 'Canale', icon: Radio }, { key: 'tickets', label: 'Tichete', icon: Ticket },
    { key: 'verification', label: 'Verificare', icon: ShieldCheck }, { key: 'messages', label: 'Mesaje', icon: Megaphone },
    { key: 'statistics', label: 'Statistici', icon: Activity },
  ];

  return (
    <main className="control-app">
      <div className="atmosphere" aria-hidden="true">
        <span className="fire-glow fire-glow-left" />
        <span className="fire-glow fire-glow-right" />
        <span className="smoke smoke-one" />
        <span className="smoke smoke-two" />
        <span className="smoke smoke-three" />
        <span className="spark spark-one" />
        <span className="spark spark-two" />
        <span className="spark spark-three" />
        <span className="spark spark-four" />
        <span className="spark spark-five" />
      </div>
      <div className="shell">
        <header>
          <div className="brand-row">
            <div className="brand-mark"><Bot size={21} strokeWidth={1.8} /></div>
            <div>
              <div className="eyebrow">Control owner-only</div>
              <h1>Control bot</h1>
              <p className="subtitle">Gestionează infrastructura botului dintr-un singur loc. Accesul la această pagină este limitat la owner.</p>
            </div>
          </div>
          <div className="offline-banner" data-testid="status-discord-connection">
            <AlertTriangle size={15} />
            <span>Botul Discord nu este conectat la această instanță. Modificările pot fi salvate, dar devin active pe Discord doar după reconectarea botului.</span>
          </div>
        </header>

        <nav className="tab-bar" aria-label="Secțiuni control bot" data-testid="nav-control-tabs">
          {tabLabels.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className="tab" data-active={activeTab === key} data-testid={`tab-${key}`} onClick={() => setActiveTab(key)}>
              <Icon size={14} /><span>{label}</span>
            </button>
          ))}
        </nav>

        {activeTab !== 'channels' ? (
          <section className="surface placeholder" data-testid={`panel-${activeTab}`}>
            <div>
              <div className="placeholder-icon"><Wrench size={22} /></div>
              <h2>{tabLabels.find((tab) => tab.key === activeTab)?.label} Discord</h2>
              <p>Această zonă este disponibilă în controlul botului. Poți marca modulul ca pregătit pentru următoarea sesiune de configurare.</p>
              <button type="button" className={`btn ${prepared[activeTab] ? 'btn-primary' : ''}`} data-testid={`button-prepare-${activeTab}`} onClick={() => { setPrepared((state) => ({ ...state, [activeTab]: !state[activeTab] })); flash(prepared[activeTab] ? 'Modulul a fost pus în așteptare.' : 'Modulul a fost marcat ca pregătit.'); }}>
                {prepared[activeTab] ? <Check size={14} /> : <Clock3 size={14} />}{prepared[activeTab] ? 'Pregătit' : 'Marchează pregătit'}
              </button>
            </div>
          </section>
        ) : (
          <section className="surface" data-testid="panel-channels">
            <div className="surface-head">
              <div className="surface-title"><Radio size={18} /><div><h2>Canale Discord</h2><p>Folosește canalele configurate sau găsește canalele existente după nume. Creează doar destinațiile care lipsesc.</p></div></div>
              <button type="button" className="btn" disabled={busy !== null} data-testid="button-create-missing" onClick={() => runAction('create')}><FolderPlus size={14} />{busy === 'create' ? 'Se pregătește…' : 'Creează ce lipsește'}</button>
            </div>
            <div className="notice">Butonul este disponibil după ce botul primește permisiunea Discord <strong>Manage Channels</strong>. Selectează categoriile și salvează înainte de provisionare.</div>
            <div className="workspace">
              <div className="channel-grid" data-testid="list-channel-settings">
                {channelFields.map(({ key, label }) => (
                  <article className={`channel-card ${errors[key] ? 'has-error' : ''}`} key={key} data-testid={`card-channel-${key}`}>
                    <label className="channel-label" htmlFor={`select-${key}`}>{label}</label>
                    <div className="field-stack">
                      <select id={`select-${key}`} className="select" value={selected[key]} data-testid={`select-channel-${key}`} onChange={(event) => updateSelected(key, event.target.value)}>
                        <option value="">Neconfigurat</option>
                        {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.type === 'category' ? 'Categorie' : '#'} {channel.name} · {channel.parent} ({channel.id})</option>)}
                      </select>
                      <input className="field" value={selected[key]} aria-label={`${label} ID`} placeholder="ID canal Discord" inputMode="numeric" data-testid={`input-channel-id-${key}`} onChange={(event) => updateSelected(key, event.target.value)} />
                    </div>
                    {errors[key] && <p className="field-error" data-testid={`validation-channel-${key}`}><X size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{errors[key]}</p>}
                  </article>
                ))}
              </div>
              <aside className="category-panel" data-testid="panel-provision-categories">
                <div className="category-head"><div><div className="eyebrow">Ce se creează</div><h3>Alege categoriile</h3><p>Bifează doar ce vrei să creeze botul. Categoriile nebifate nu sunt atinse.</p></div><span className="count-badge" data-testid="text-category-count">{chosen.length}/{categories.length}</span></div>
                <div className="category-list">
                  {categories.map((category) => {
                    const checked = chosen.includes(category.key);
                    const permission = permissions[category.key];
                    return <div className="category-item" data-selected={checked} key={category.key} data-testid={`card-category-${category.key}`}>
                      <label className="category-check">
                        <input type="checkbox" checked={checked} data-testid={`checkbox-category-${category.key}`} onChange={(event) => toggleCategory(category.key, event.target.checked)} />
                        <span><span className="category-name">{category.label}</span><span className="category-description">{category.description}</span><span className="category-items">{category.items}</span></span>
                      </label>
                      <details className="permission-details">
                        <summary data-testid={`summary-permissions-${category.key}`}><ChevronDown size={11} />Permisiuni pentru această categorie</summary>
                        <div className="permission-body">
                          <p className="permission-note">Membrii fără unul dintre rolurile selectate nu vor vedea canalele. Botul își păstrează accesul automat.</p>
                          <div className="role-grid">
                            {roles.map((role) => <label className="permission-check" key={role}><input type="checkbox" checked={permission.roles.includes(role)} data-testid={`checkbox-role-${category.key}-${role.replaceAll(' ', '-').toLowerCase()}`} onChange={() => toggleRole(category.key, role)} /><Users size={11} /><span>@{role}</span></label>)}
                          </div>
                          <div className="permission-options">
                            <label className="permission-check"><input type="checkbox" checked={permission.history} data-testid={`checkbox-history-${category.key}`} onChange={(event) => updatePermission(category.key, { history: event.target.checked })} />Poate vedea istoricul</label>
                            <label className="permission-check"><input type="checkbox" checked={permission.send} data-testid={`checkbox-send-${category.key}`} onChange={(event) => updatePermission(category.key, { send: event.target.checked })} />Poate scrie mesaje</label>
                          </div>
                        </div>
                      </details>
                    </div>;
                  })}
                </div>
                <div className="panel-actions"><button type="button" className="btn btn-quiet" data-testid="button-select-all-categories" onClick={() => setChosen(categories.map((category) => category.key))}>Toate</button><button type="button" className="btn btn-quiet" data-testid="button-clear-categories" onClick={() => setChosen([])}>Niciuna</button></div>
              </aside>
            </div>
            <div className="bottom-bar">
              <div className="save-state" data-testid="status-unsaved-changes"><span className={`status-dot ${dirty ? 'dirty' : ''}`} />{dirty ? 'Modificări nesalvate' : 'Totul este salvat local'}</div>
              <button type="button" className="btn btn-quiet" disabled={busy !== null} data-testid="button-test-flow" onClick={() => runAction('test')}><Send size={14} />{busy === 'test' ? 'Se testează…' : 'Testează fluxul'}</button>
              <button type="button" className="btn btn-primary" disabled={!dirty || busy !== null} data-testid="button-save-config" onClick={() => runAction('save')}><Save size={14} />{busy === 'save' ? 'Se salvează…' : 'Salvează configurația'}</button>
              {feedback && <div className={`feedback ${feedback.error ? 'error' : ''}`} role="status" data-testid="status-feedback">{feedback.error ? <AlertTriangle size={12} /> : <Check size={12} />}{feedback.text}</div>}
            </div>
          </section>
        )}
        {feedback && activeTab !== 'channels' && <div className={`feedback ${feedback.error ? 'error' : ''}`} style={{ marginTop: 10 }} role="status" data-testid="status-feedback-secondary">{feedback.text}</div>}
      </div>
    </main>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;