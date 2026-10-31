// Builds the authoritative source panel document (attached HTML, imported raw)
// with strictly checked replacements of its runtime integration points:
// demo servers -> authorized guilds, Claude DB / localStorage settings -> host RPC.
// Every anchor must match exactly once; otherwise we throw visibly.
import sourceHtml from "../../../../../attached_assets/panoul-oracolului_1792758552669.html?raw";

export type SourceServer = { id: string; name: string; ini: string; icon: string | null; c1: string; c2: string };
export type SourcePanelBoot = {
  channel: string;
  nonce: string;
  origin: string;
  guildId: string;
  view: string;
  servers: SourceServer[];
};

export const SOURCE_VIEWS = ["acasa", "protectie", "judecator", "sanctiuni", "dosare", "tichete", "rpg", "oracol", "setari", "asistent"] as const;

export class SourcePanelTransformError extends Error {
  constructor(anchor: string, count: number) {
    super(`Panoul sursă s-a schimbat: ancora „${anchor.slice(0, 80)}” apare de ${count} ori (se aștepta o dată).`);
    this.name = "SourcePanelTransformError";
  }
}

function replaceOnce(source: string, anchor: string, replacement: string): string {
  const first = source.indexOf(anchor);
  const count = first < 0 ? 0 : source.split(anchor).length - 1;
  if (count !== 1) throw new SourcePanelTransformError(anchor, count);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function replaceBetween(source: string, start: string, end: string, replacement: string): string {
  const a = source.indexOf(start);
  if (a < 0 || source.indexOf(start, a + 1) >= 0) throw new SourcePanelTransformError(start, a < 0 ? 0 : 2);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) throw new SourcePanelTransformError(end, 0);
  return source.slice(0, a) + replacement + source.slice(b);
}

// ---------- storage layer replacement (runs inside the source IIFE) ----------
const STORAGE_LAYER = String.raw`let CONF = null;
let SUP = new Set();
let READ = new Set();
let NOTES = {};
let ocLogError = '';
let ocGen = 0;
const ocPath = (m, s, k) => m + '/' + (s || '') + '/' + k;
const ocSup = (m, s, k) => SUP.has(ocPath(m, s, k));
const ocRead = (m, s, k) => SUP.has(ocPath(m, s, k)) || READ.has(ocPath(m, s, k));
function __ocKnown(id) { return !CONF || ocRead(id, '', '@on'); }
function ocPaths(mid) {
  const m = MOD[mid], out = [];
  if (!m.always) out.push(['', '@on']);
  DATA_FIELDS(m.fields).forEach((fd) => out.push(['', fd.k]));
  (m.subs || []).forEach((sd) => { out.push([sd.k, '@on']); DATA_FIELDS(sd.fields).forEach((fd) => out.push([sd.k, fd.k])); });
  return out;
}
function ocGet(st, s, k) { if (k === '@on') return s ? st.s[s].on : st.on; return s ? st.s[s].f[k] : st.f[k]; }
function ocPut(st, s, k, v) { if (k === '@on') { if (s) st.s[s].on = v; else st.on = v; return; } if (s) st.s[s].f[k] = v; else st.f[k] = v; }
function __ocOnlySupported(mid, next) {
  const out = clone(CUR[mid]);
  ocPaths(mid).forEach(([s, k]) => { if (ocSup(mid, s, k)) ocPut(out, s, k, clone(ocGet(next, s, k))); });
  return out;
}
function ocApply(snap, keepDirty) {
  SUP = new Set(Array.isArray(snap && snap.supported) ? snap.supported : []);
  READ = new Set(Array.isArray(snap && snap.readable) ? snap.readable : []);
  NOTES = snap && snap.notes && typeof snap.notes === 'object' ? snap.notes : {};
  CONF = {};
  MODULES.forEach((m) => {
    const raw = snap && snap.modules ? snap.modules[m.id] : null;
    CONF[m.id] = mergeState(m, raw);
    if (!raw) return;
    ocPaths(m.id).forEach(([s, k]) => {
      if (!ocRead(m.id, s, k)) return;
      const state = s ? raw.s && raw.s[s] : raw;
      const value = state && (k === '@on' ? state.on : state.f && state.f[k]);
      if (value === undefined) return;
      // Source demo bounds/options must never disguise a real API value
      // (for example UTC or a retention duration not in the demo presets).
      const fd = k === '@on' ? null : fieldDef(m.id, s, k);
      if (fd && fd.t === 'sel' && Array.isArray(fd.opts) && !fd.opts.some((opt) => String(opt[0]) === String(value))) fd.opts.push([String(value), String(value)]);
      ocPut(CONF[m.id], s, k, clone(value));
    });
  });
  const next = clone(CONF);
  if (keepDirty) new Set([...dirty, ...failed]).forEach((id) => { if (CUR[id]) next[id] = CUR[id]; });
  CUR = next;
  LOG = sanitizeLog(snap && snap.log);
  ocLogError = snap && typeof snap.logError === 'string' ? snap.logError : '';
}
const ocErr = (e) => (e && e.message ? String(e.message) : 'eroare necunoscută');
async function initStore() {
  canWrite = true;
  applyReadOnly();
  subscribe(S.srv);
}
function applyReadOnly() { $('#main').classList.toggle('ro', !canWrite); }
function ocMark() {
  if (!CONF) return;
  $$('[data-m][data-k]').forEach((el) => {
    const path = ocPath(el.dataset.m, el.dataset.s || '', el.dataset.k);
    const note = NOTES[path];
    if (note && el.dataset.ocNote !== note) {
      el.dataset.ocNote = note; el.title = note;
      const h = document.createElement('small'); h.className = 'oc-hint'; h.textContent = note;
      // Overview rows are flex layouts; adding a help note beside their title
      // steals the available width and makes names/descriptions overlap.
      // Keep those notes available as the control tooltip instead.
      const row = el.closest('.fld, .field, .set, .sub');
      if (row && !row.querySelector(':scope > .oc-hint')) row.appendChild(h);
    }
    if (SUP.has(path) || el.hasAttribute('data-oc-unav')) return;
    const readable = READ.has(path);
    el.setAttribute('data-oc-unav', readable ? 'citire' : 'implicit');
    el.setAttribute('aria-disabled', 'true');
    if ('disabled' in el) el.disabled = true;
    if (!note) el.title = readable ? 'Valoare reală, doar pentru citire aici.' : 'Indisponibil: botul nu are încă această setare.';
  });
  MODULES.forEach((m) => {
    if (m.always || ocRead(m.id, '', '@on')) return;
    $$('.mod[data-m="' + m.id + '"]').forEach((box) => {
      const sp = $('.mod-pw span', box); if (sp && sp.textContent !== 'Stare necunoscută') sp.textContent = 'Stare necunoscută';
      const off = $('.mod-off', box); if (off) off.remove();
    });
    $$('[data-row="' + m.id + '"]').forEach((r) => r.classList.remove('off'));
  });
  $$('.mod[data-m]').forEach((box) => {
    if (!$('[data-oc-unav="implicit"]', box) || $('.oc-unav-note', box)) return;
    const n = document.createElement('div');
    n.className = 'ro-note oc-unav-note';
    n.innerHTML = ico('i-lock') + '<span>Controalele estompate nu sunt încă disponibile pentru bot. Valorile lor sunt cele implicite din panou, nu setări salvate.</span>';
    const body = $('.mod-body', box); if (body) body.before(n);
  });
}
let ocMarkRAF = 0;
new MutationObserver(() => { cancelAnimationFrame(ocMarkRAF); ocMarkRAF = requestAnimationFrame(ocMark); }).observe(document.body, { childList: true, subtree: true });
setInterval(async () => {
  if (document.hidden || !loaded || !CONF || ocSaving || dirty.size || failed.size) return;
  const gen = ocGen, sid = S.srv;
  try {
    const snap = await window.__OC.rpc('load', { guildId: sid, defaults: allDefaults() });
    if (gen !== ocGen || sid !== S.srv || ocSaving || dirty.size || failed.size) return;
    const prev = CUR;
    ocApply(snap, false);
    MODULES.forEach((m) => {
      if (JSON.stringify(prev[m.id]) === JSON.stringify(CUR[m.id])) return;
      const box = $('.mod[data-m="' + m.id + '"]');
      if (box && box.contains(document.activeElement)) STALE.add(m.id); else refreshModule(m.id);
    });
    refreshCounts(); renderLog();
  } catch (e) {
    if (gen === ocGen && sid === S.srv && !ocSaving && !dirty.size) setSave('err');
  }
}, 60000);
`;

const SUBSCRIBE = String.raw`function subscribe(sid) {
  const gen = ++ocGen;
  loaded = false; CONF = null; SUP = new Set(); READ = new Set(); NOTES = {}; ocLogError = '';
  dirty.clear(); failed.clear();
  CUR = allDefaults(); LOG = [];
  setSave('load');
  renderEverything();
  window.__OC.rpc('load', { guildId: sid, defaults: allDefaults() }).then((snap) => {
    if (gen !== ocGen || sid !== S.srv) return;
    ocApply(snap, false);
    loaded = true;
    setSave('ok');
    renderEverything();
  }).catch((e) => {
    if (gen !== ocGen) return;
    setSave('err');
    toast('Nu am putut citi setările serverului (' + ocErr(e) + '). Apasă pe stare ca să reîncerci.', 'warn');
  });
}
`;

const FLUSH = String.raw`let ocSaving = null;
async function flush() {
  clearTimeout(flushT);
  if (!CONF) { subscribe(S.srv); return false; }
  if (ocSaving) { try { await ocSaving; } catch (e) { /* raportat deja */ } }
  const mods = [...dirty];
  if (!mods.length) { if ($('#saveSt').dataset.s === 'err' && !failed.size) subscribe(S.srv); return !failed.size; }
  dirty.clear();
  const sid = S.srv, gen = ocGen;
  const changes = []; let rejected = 0;
  mods.forEach((m) => {
    ocPaths(m).forEach(([s, k]) => {
      const a = ocGet(CUR[m], s, k), b = ocGet(CONF[m], s, k);
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (!ocSup(m, s, k)) { rejected++; ocPut(CUR[m], s, k, clone(b)); return; }
      changes.push({ m, s: s || '', k, value: clone(a) });
    });
    delete pendingDesc[m];
  });
  if (rejected) {
    mods.forEach((m) => refreshModule(m)); refreshCounts();
    toast(rejected === 1 ? 'O setare nu este disponibilă pentru bot și nu a fost trimisă.' : rejected + ' setări nu sunt disponibile pentru bot și nu au fost trimise.', 'warn');
  }
  if (!changes.length) { if (!dirty.size && !failed.size) setSave('ok'); return !rejected; }
  setSave('busy');
  const p = window.__OC.rpc('save', { guildId: sid, defaults: allDefaults(), changes });
  ocSaving = p;
  try {
    const snap = await p;
    if (gen !== ocGen || sid !== S.srv) return false;
    mods.forEach((m) => failed.delete(m));
    const prev = CUR;
    ocApply(snap, true);
    MODULES.forEach((m) => {
      if (JSON.stringify(prev[m.id]) === JSON.stringify(CUR[m.id])) return;
      const box = $('.mod[data-m="' + m.id + '"]');
      if (box && box.contains(document.activeElement)) STALE.add(m.id); else refreshModule(m.id);
    });
    refreshCounts(); renderLog();
    if (!dirty.size && !failed.size) setSave('ok');
    return !rejected;
  } catch (e) {
    if (gen !== ocGen || sid !== S.srv) return false;
    mods.forEach((m) => failed.add(m));
    setSave('err');
    toast('Nu s-a salvat: ' + ocErr(e) + '. Apasă pe „Nu s-a salvat” ca să reîncerci.', 'warn');
    return false;
  } finally { if (ocSaving === p) ocSaving = null; }
}
async function writeAll(desc) {
  MODULES.forEach((m) => { dirty.add(m.id); (pendingDesc[m.id] = pendingDesc[m.id] || new Set()).add(desc); });
  setSave('busy');
  return flush();
}
async function __ocReset(sv) {
  if (!editable()) return;
  const sid = S.srv, gen = ocGen;
  dirty.clear(); failed.clear();
  setSave('busy');
  try {
    const snap = await window.__OC.rpc('reset', { guildId: sid, defaults: allDefaults() });
    if (gen !== ocGen || sid !== S.srv) return;
    ocApply(snap, false);
    setSave('ok'); renderEverything();
    toast(sv.name + ' a revenit la setările implicite.');
  } catch (e) {
    if (gen !== ocGen) return;
    setSave('err');
    toast('Resetarea nu a fost aplicată: ' + ocErr(e) + '.', 'warn');
  }
}
async function loadOther(sid) {
  const snap = await window.__OC.rpc('loadOther', { guildId: sid, defaults: allDefaults() });
  return snap && snap.modules && typeof snap.modules === 'object' ? snap.modules : {};
}
`;

const SWITCH_SERVER = String.raw`async function switchServer(sid) {
  if (!SERVER[sid] || sid === S.srv) return;
  if (!await flush() || failed.size) {
    toast('Serverul nu a fost schimbat: există modificări nesalvate. Reîncearcă salvarea înainte de a continua.', 'warn');
    return;
  }
  ocGen++;
  dirty.clear();
  window.__OC.send({ type: 'guild', id: sid });
}

`;

const BRIDGE_CSS = `<style>
[data-oc-unav]{opacity:.42;cursor:not-allowed!important;pointer-events:none;filter:grayscale(.6)}
.sw[data-oc-unav="implicit"]{border-style:dashed;background:rgba(255,255,255,.04)!important}
.sw[data-oc-unav="implicit"]::after{transform:translateX(9px)!important;background:var(--ink-4)!important}
[data-oc-unav="citire"]{opacity:.72;filter:none}
.oc-hint{display:block;margin-top:4px;color:var(--ink-3);font:400 12px/1.4 var(--body)}
.sw:not([data-oc-unav]){cursor:pointer}
</style>`;

function bridgeScript(boot: SourcePanelBoot): string {
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");
  return `<script>
(function () {
  'use strict';
  var BOOT = ${json};
  try { Object.defineProperty(window, 'claude', { value: undefined, writable: false, configurable: false }); } catch (e) {}
  var seq = 0, waiting = {};
  function send(msg) {
    msg.channel = BOOT.channel; msg.nonce = BOOT.nonce;
    window.parent.postMessage(msg, BOOT.origin);
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== BOOT.origin) return;
    var d = e.data;
    if (!d || d.channel !== BOOT.channel || d.nonce !== BOOT.nonce) return;
    if (d.type === 'rpc-result' && waiting[d.id]) {
      var w = waiting[d.id]; delete waiting[d.id];
      if (d.ok) w.resolve(d.result); else w.reject(new Error(d.error || 'Cererea a eșuat.'));
    } else if (d.type === 'go' && typeof window.__OC.go === 'function') {
      window.__OC.go(d.view);
    }
  });
  window.__OC = {
    servers: BOOT.servers,
    guildId: BOOT.guildId,
    view: BOOT.view,
    send: send,
    go: null,
    rpc: function (method, request) {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        var timer = setTimeout(function () { if (waiting[id]) { delete waiting[id]; reject(new Error('Serverul nu a răspuns la timp. Reîncearcă.')); } }, 30000);
        waiting[id] = {
          resolve: function (value) { clearTimeout(timer); resolve(value); },
          reject: function (error) { clearTimeout(timer); reject(error); }
        };
        request.method = method;
        send({ type: 'rpc', id: id, request: request });
      });
    }
  };
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#ocLogout')) send({ type: 'logout' });
  });
})();
</script>`;
}

const LOGOUT_BUTTON = '<button class="icon-btn" id="ocLogout" type="button" aria-label="Deconectare" title="Deconectare"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg></button>';

export function buildSourcePanelDocument(boot: SourcePanelBoot): string {
  let s = sourceHtml as string;
  // Servers: authorized Discord guilds only.
  s = replaceBetween(s, "const SERVERS = [", "const SERVER = Object.fromEntries", "const SERVERS = window.__OC.servers;\n");
  s = replaceOnce(s, "const avInner = (s) => (s.img && CREST ? '<img src=\"' + CREST + '\" alt=\"\">' : esc(s.ini));",
    "const avInner = (s) => (s.icon ? '<img src=\"' + esc(s.icon) + '\" alt=\"\">' : esc(s.ini));");
  s = replaceOnce(s, "if (!SERVER[s.srv]) s.srv = 'regat';", "s.srv = window.__OC.guildId;");
  s = replaceOnce(s, "if (sv.id === 'regat') {", "if (false) {");
  // Storage: no Claude DB, no localStorage bot settings; RPC to host.
  s = replaceBetween(s, "async function initStore() {", "const sanitizeLog", STORAGE_LAYER);
  s = replaceBetween(s, "function subscribe(sid) {", "const STALE = new Set();", SUBSCRIBE);
  s = replaceBetween(s, "async function flush() {", "function exportObj() {", FLUSH);
  s = replaceBetween(s, "async function switchServer(sid) {", "/* ================= RENDER", SWITCH_SERVER);
  s = replaceOnce(s, "const groupCounts = (gid) => { const t = modsOf(gid).filter((m) => !m.always);",
    "const groupCounts = (gid) => { const t = modsOf(gid).filter((m) => !m.always && __ocKnown(m.id));");
  s = replaceOnce(s, "  if (!LOG.length) { el.innerHTML =",
    "  if (ocLogError) { el.innerHTML = '<li style=\"border:0;padding-left:0\"><p class=\"log-empty\" style=\"margin:0\">' + esc(ocLogError) + '</p></li>'; return; }\n  if (!LOG.length) { el.innerHTML =");
  // Resets and imports: only supported paths, real results.
  s = replaceOnce(s, "CUR[mid] = defaultsOf(m); touch(mid, 'Setările implicite');",
    "closeModal(); toast('Revenirea la implicit pentru un singur modul nu este disponibilă prin API. Nicio setare nu a fost schimbată.', 'warn'); return;");
  // Assistant: mark applied only after a confirmed save.
  s = replaceOnce(s, "    touched.forEach((m) => refreshModule(m));\n    refreshCounts();\n    turn.status = 'applied'; saveChat();\n    const nn = propNode(turn); n.replaceWith(nn);\n    if (motionOK()) nn.animate([{ boxShadow: '0 0 0 0 rgba(61,220,132,.5)' }, { boxShadow: '0 0 0 14px rgba(61,220,132,0)' }], { duration: 900, easing: 'ease-out' });\n    toast(applied ? (applied === 1 ? 'O modificare aplicată pe ' : applied + ' modificări aplicate pe ') + SERVER[S.srv].name + '.' : 'Setările erau deja așa. Nimic de schimbat.');\n    announce(applied + ' modificări aplicate');",
    "    touched.forEach((m) => refreshModule(m));\n    refreshCounts();\n    const srvName = SERVER[S.srv].name;\n    (applied ? flush() : Promise.resolve(true)).then((ok) => {\n      if (!ok || turn.status !== 'pending') return;\n      turn.status = 'applied'; saveChat();\n      const nn = propNode(turn); n.replaceWith(nn);\n      if (motionOK()) nn.animate([{ boxShadow: '0 0 0 0 rgba(61,220,132,.5)' }, { boxShadow: '0 0 0 14px rgba(61,220,132,0)' }], { duration: 900, easing: 'ease-out' });\n      toast(applied ? (applied === 1 ? 'O modificare aplicată pe ' : applied + ' modificări aplicate pe ') + srvName + '.' : 'Setările erau deja așa. Nimic de schimbat.');\n      announce(applied + ' modificări aplicate');\n    });");
  s = replaceOnce(s, "CUR = allDefaults(); writeAll('Setările implicite');\n        closeModal(); renderEverything();\n        toast(sv.name + ' a revenit la setările implicite.');",
    "closeModal(); __ocReset(sv);");
  s = replaceOnce(s, "next[m.id] = mergeState(m, mods[m.id]);", "next[m.id] = __ocOnlySupported(m.id, mergeState(m, mods[m.id]));");
  s = replaceOnce(s, "next[m.id] = mergeState(m, raw[m.id]);", "next[m.id] = __ocOnlySupported(m.id, mergeState(m, raw[m.id]));");
  s = replaceOnce(s, "setSave('busy'); flush();\n        closeModal(); renderEverything();\n        toast('Configurarea a fost importată pe ' + sv.name + '.');",
    "closeModal(); renderEverything(); setSave('busy');\n        flush().then((ok) => { if (ok) toast('Configurarea a fost importată pe ' + sv.name + '.'); });");
  s = replaceOnce(s, "setSave('busy'); flush();\n        closeModal(); renderEverything();\n        toast('Setările de pe ' + SERVER[fromId].name + ' au fost copiate pe ' + sv.name + '.');",
    "closeModal(); renderEverything(); setSave('busy');\n        const fromName = SERVER[fromId].name;\n        flush().then((ok) => { if (ok) toast('Setările de pe ' + fromName + ' au fost copiate pe ' + sv.name + '.'); });");
  // Routing: host owns the URL.
  s = replaceOnce(s, "current = id; S.view = id; save();\n  markDock();", "current = id; S.view = id; save();\n  window.__OC.send({ type: 'nav', view: id });\n  markDock();");
  s = replaceOnce(s, "const h = (location.hash || '').replace('#', '');\n  const id = TOOL[h] ? h : (TOOL[S.view] ? S.view : 'acasa');",
    "const h = window.__OC.view;\n  const id = TOOL[h] ? h : 'acasa';");
  s = replaceOnce(s, "window.addEventListener('hashchange', () => { const h = (location.hash || '').replace('#', ''); if (TOOL[h]) go(h); });",
    "window.__OC.go = (v) => { if (TOOL[v]) go(v); };\nwindow.__OC.send({ type: 'ready' });");
  // No emoji in UI defaults.
  s = replaceOnce(s, "F.text('emoji', 'Emoji pe buton', '✅',", "F.text('emoji', 'Emoji pe buton', '',");
  // Header: logout access.
  s = replaceOnce(s, "<kbd>Ctrl K</kbd></button>\n    </div>\n  </div>\n</header>",
    "<kbd>Ctrl K</kbd></button>\n      " + LOGOUT_BUTTON + "\n    </div>\n  </div>\n</header>");
  // Bridge before the source script.
  s = replaceOnce(s, "<script>\n", BRIDGE_CSS + bridgeScript(boot) + "\n<script>\n");
  return "<!doctype html><html lang=\"ro\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">" + s;
}
