import { useState } from "react";
import {
  Activity, ArrowRight, Bot, BookOpen, Boxes, BrainCircuit, BriefcaseBusiness, ChartNoAxesColumn,
  ChevronRight, CircleHelp, ClipboardList, FileText, Gavel, Gamepad2, Hammer, History, LockKeyhole,
  MessageSquare, MessageSquareText, Pause, Play, Radio, Settings2, Shield, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, UserRoundCog, Users, Vote, Wrench, Zap,
} from "lucide-react";
import "./_group.css";

type Icon = typeof Activity;
type NavItem = { href: string; label: string; icon: Icon };
const navGroups: Array<{ title: string; items: NavItem[] }> = [
  { title: "Centru de comandă", items: [
    { href: "/", label: "Privire generală", icon: Activity },
    { href: "/comenzi", label: "Acțiuni manuale", icon: Zap },
  ] },
  { title: "Apărare", items: [
    { href: "/protectie", label: "Protecție server", icon: Shield }, { href: "/automod", label: "AutoMod", icon: Bot },
    { href: "/ai", label: "Moderare AI", icon: Sparkles }, { href: "/anti-raid", label: "Anti-Raid", icon: ShieldAlert },
    { href: "/anti-spam", label: "Anti-Spam", icon: MessageSquare }, { href: "/anti-flood", label: "Anti-Flood", icon: Activity },
    { href: "/comportament-suspect", label: "Comportament suspect", icon: CircleHelp },
  ] },
  { title: "Intervenții și evidențe", items: [
    { href: "/politici", label: "Politici", icon: BookOpen },
    { href: "/cazuri", label: "Cazuri", icon: BriefcaseBusiness }, { href: "/audit", label: "Jurnal de audit", icon: History },
  ] },
  { title: "Reguli și configurare", items: [
    { href: "/config", label: "Module", icon: Settings2 }, { href: "/config/mesaje", label: "Mesaje", icon: FileText },
    { href: "/config/avansat", label: "Setări avansate", icon: SlidersHorizontal }, { href: "/config/unelte", label: "Unelte staff", icon: Wrench },
    { href: "/config/cazuri-audit", label: "Cazuri și audit", icon: ClipboardList }, { href: "/config/escaladare", label: "Escaladare", icon: Gavel },
    { href: "/config/embeduri", label: "Embed-uri", icon: MessageSquareText },
  ] },
  { title: "Configurare server", items: [{ href: "/pornire-server", label: "Ghid de pornire", icon: Hammer }] },
  { title: "Servicii Discord", items: [
    { href: "/canale", label: "Panouri și destinații", icon: Radio }, { href: "/provisioning", label: "Canale și permisiuni", icon: Wrench },
    { href: "/bot?tab=roles", label: "Roluri", icon: Users }, { href: "/bot?tab=tickets", label: "Tichete", icon: LockKeyhole },
    { href: "/bot?tab=messages", label: "Mesaje bot", icon: MessageSquareText }, { href: "/bot?tab=statistics", label: "Statistici bot", icon: ChartNoAxesColumn },
  ] },
  { title: "Membri și progres", items: [
    { href: "/verificare", label: "Verificare membri · staff", icon: ShieldCheck }, { href: "/ranguri-activitate", label: "Ranguri de activitate", icon: Vote },
  ] },
];
const functions: Array<{ title: string; desc: string; href: string; icon: Icon; meta?: string }>[] = [
  [
    { title: "Protecție server", desc: "Control general pentru modulele automate.", href: "/protectie", icon: Shield },
    { title: "AutoMod", desc: "Filtre clasice și reguli Discord native.", href: "/automod", icon: Bot, meta: "ON · configurat" },
    { title: "Filtru de cuvinte", desc: "Cuvinte interzise și acțiunea aplicată.", href: "/automod", icon: BookOpen, meta: "ON · configurat" },
    { title: "Blocare linkuri", desc: "Categorii de linkuri și răspuns automat.", href: "/automod", icon: LockKeyhole, meta: "OFF · configurat" },
    { title: "Politici", desc: "Reguli generale și politici de moderare.", href: "/politici", icon: FileText },
    { title: "Anti-Raid", desc: "Valuri de intrări și conturi prea noi.", href: "/anti-raid", icon: ShieldAlert, meta: "OFF · configurat" },
    { title: "Anti-Spam", desc: "Mesaje, editări, mențiuni și repetiții.", href: "/anti-spam", icon: MessageSquare, meta: "ON · configurat" },
    { title: "Anti-Flood", desc: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", icon: Activity, meta: "ON · configurat" },
    { title: "Comportament suspect", desc: "Alerte pentru activitate neobișnuită.", href: "/comportament-suspect", icon: CircleHelp, meta: "OFF · configurat" },
    { title: "Moderare AI", desc: "Analiză separată de filtrele AutoMod.", href: "/ai", icon: BrainCircuit, meta: "ON · configurat" },
    { title: "Cazuri", desc: "Dosare de moderare și drepturi staff.", href: "/cazuri", icon: BriefcaseBusiness },
    { title: "Jurnal de audit", desc: "Istoricul acțiunilor de moderare.", href: "/audit", icon: History },
    { title: "Escaladare", desc: "Sancțiuni progresive și reguli.", href: "/config/escaladare", icon: Gavel },
    { title: "Embed-uri", desc: "Aspect, media și animații.", href: "/config/embeduri", icon: MessageSquareText },
    { title: "Unelte staff", desc: "Comenzi și permisiuni manuale.", href: "/config/unelte", icon: UserRoundCog },
  ],
  [
    { title: "Canale și permisiuni", desc: "Provisioning, categorii și acces.", href: "/provisioning", icon: Boxes },
    { title: "Panouri și destinații", desc: "Configurează canalele pentru funcțiile botului.", href: "/canale", icon: Radio },
    { title: "Roluri", desc: "Roluri gestionate de bot și atribuiri.", href: "/bot?tab=roles", icon: Users },
    { title: "Tichete", desc: "Panoul și fluxul de suport.", href: "/bot?tab=tickets", icon: LockKeyhole },
    { title: "Mesaje bot", desc: "Mesaje automate și conținut publicat.", href: "/bot?tab=messages", icon: MessageSquareText },
    { title: "Statistici bot", desc: "Activitate și indicatori ai serverului.", href: "/bot?tab=statistics", icon: ChartNoAxesColumn },
  ],
  [
    { title: "Verificare membri · staff", desc: "Flux de verificare și intervenție staff.", href: "/verificare", icon: ShieldCheck },
    { title: "Ranguri de activitate", desc: "Progres și recompense de comunitate.", href: "/ranguri-activitate", icon: Vote },
  ],
  [{ title: "Ghid de pornire", desc: "Pașii de configurare pentru server.", href: "/pornire-server", icon: Hammer }],
];
const sectionInfo = [
  { title: "Securitate și moderare", icon: ShieldAlert, count: "15 funcții" },
  { title: "Servicii Discord", icon: Radio, count: "6 funcții" },
  { title: "Comunitate", icon: Users, count: "2 funcții" },
  { title: "Configurare server", icon: Hammer, count: "1 funcție" },
];

function FunctionCard({ item }: { item: (typeof functions)[number][number] }) {
  return <a href={item.href} onClick={(event) => event.preventDefault()} className="cc-function">
    <span className="cc-function-icon"><item.icon aria-hidden="true" /></span>
    <span><h3>{item.title}</h3><p>{item.desc}</p>{item.meta && <span className="cc-card-meta">{item.meta}</span>}</span>
  </a>;
}

export function CommandCenter() {
  const [gamePaused, setGamePaused] = useState(false);
  const [hauntedActive, setHauntedActive] = useState(false);
  const [activeRoute, setActiveRoute] = useState("/");
  const goLocal = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    setActiveRoute(href);
  };

  return <div className="cc-preview">
    <div className="cc-layout">
      <aside className="cc-sidebar">
        <div className="cc-brand"><span className="cc-brand-mark"><Sparkles size={17} /></span><div><div className="cc-brand-name">ORACOLUL CENUȘII</div><div className="cc-brand-sub">MODERATION CONSOLE</div></div></div>
        <div className="cc-side-content">
          <div className="cc-label">Server selectat</div>
          <div className="cc-server"><span className="cc-server-icon"><Shield size={17} /></span><span><strong>Serverul lui LEGION</strong><small>discord.gg/oracolul</small></span><ChevronRight size={13} /></div>
          {navGroups.map((group) => <section key={group.title}>
            <div className="cc-nav-title"><span>{group.title}</span><span>{String(group.items.length).padStart(2,"0")}</span></div>
            {group.items.map((item) => <a key={item.href} href={item.href} onClick={(event) => goLocal(event, item.href)} className={`cc-nav-link ${activeRoute === item.href ? "active" : ""}`}><item.icon /><span>{item.label}</span></a>)}
          </section>)}
        </div>
        <div className="cc-sidebar-foot">CONEXIUNE DISCORD · SESIUNE ACTIVĂ</div>
      </aside>
      <main className="cc-main">
        <div className="cc-topbar"><div className="cc-breadcrumb">Oracolul / <b>Centru de comandă</b></div><div className="cc-top-right"><span className="cc-online"><i /> conectat</span><span>Operator</span><span className="cc-avatar">OP</span></div></div>
        <div className="cc-page">
          <header className="cc-hero">
            <div><div className="cc-kicker">Spațiul operatorului · server selectat</div><h1 className="cc-display">Centru de comandă</h1><p>O singură vedere pentru protecție, intervenții și serviciile comunității.</p></div>
            <div className="cc-hero-actions"><a href="/config" onClick={(event) => goLocal(event, "/config")} className="cc-button"><Settings2 /> Configurare</a></div>
          </header>

          <a href="/comenzi" onClick={(event) => goLocal(event, "/comenzi")} className="cc-command-cta">
            <span className="cc-command-icon"><Zap size={17} /></span>
            <span className="cc-command-copy"><strong>Acțiuni manuale · comandă directă</strong><span>Execută o intervenție staff din consolă, cu motiv și confirmare.</span></span>
            <span className="cc-button primary">Deschide /comenzi <ArrowRight /></span>
          </a>

          <div className="cc-status-strip">
            <div className="cc-status icon-status"><span className="cc-status-icon"><ShieldCheck /></span><span className="cc-status-copy"><small>Protecție globală</small><strong>Automatizările sunt pornite</strong><span>Modulele automate pot procesa evenimente.</span></span><b className="cc-live-tag">ON</b></div>
            <div className={`cc-status ${gamePaused ? "warn" : ""}`}><span className="cc-status-icon"><Gamepad2 /></span><span className="cc-status-copy"><small>Stare joc · live</small><strong>{gamePaused ? "Activități suspendate" : "Joc activ"}</strong><span>Stare din controlul jocului.</span></span><b className={`cc-live-tag ${gamePaused ? "off" : ""}`}>{gamePaused ? "PAUZĂ" : "ACTIV"}</b></div>
            <div className="cc-status"><span className="cc-status-icon"><Activity /></span><span className="cc-status-copy"><small>Scut AutoMod</small><strong>Activ · reguli clasice</strong><span>Configurația serverului selectat.</span></span><b className="cc-live-tag">ON</b></div>
          </div>

          <section>
            <div className="cc-section-head"><span className="cc-section-mark"><ShieldAlert /></span><h2>{sectionInfo[0].title}</h2><span>{sectionInfo[0].count}</span></div>
            <div className="cc-section-grid">{functions[0].map((item) => <FunctionCard key={item.title} item={item} />)}</div>
          </section>

          <section>
            <div className="cc-section-head"><span className="cc-section-mark"><Gamepad2 /></span><h2>Joc și evenimente</h2><span>2 controale · previzualizare locală</span></div>
            <div className="cc-section-grid game-grid">
              <div className="cc-game-control"><span className="cc-function-icon"><Gamepad2 /></span><span><strong>{gamePaused ? "Joc suspendat" : "Joc activ"}</strong><small>Evenimente, lupte, cufere și recompense</small></span><button type="button" className="cc-button" onClick={() => setGamePaused((paused) => !paused)}>{gamePaused ? <Play /> : <Pause />}{gamePaused ? "Pornește" : "Pauză"}</button></div>
              <div className="cc-game-control"><span className="cc-function-icon"><Sparkles /></span><span><strong>Castelul Bântuit</strong><small>Start, clasament și șoapte AI</small></span><span className="cc-event-status">{hauntedActive ? "ACTIV" : "INACTIV"}</span><a href="/#" onClick={(event) => event.preventDefault()} className="cc-button">Configurează</a><button type="button" className="cc-button" onClick={() => setHauntedActive((active) => !active)}>{hauntedActive ? "Oprește" : "Pornește"}</button></div>
            </div>
          </section>

          <div className="cc-bottom-grid">
            <section>
              <div className="cc-section-head"><span className="cc-section-mark"><Radio /></span><h2>{sectionInfo[1].title}</h2><span>{sectionInfo[1].count}</span></div>
              <div className="cc-section-grid cc-services-grid">{functions[1].map((item) => <FunctionCard key={item.title} item={item} />)}</div>
            </section>
            <div className="cc-community-stack">
              <section>
                <div className="cc-section-head"><span className="cc-section-mark"><Users /></span><h2>{sectionInfo[2].title}</h2><span>{sectionInfo[2].count}</span></div>
                <div className="cc-section-grid cc-community-grid">{functions[2].map((item) => <FunctionCard key={item.title} item={item} />)}</div>
              </section>
              <section>
                <div className="cc-section-head"><span className="cc-section-mark"><Hammer /></span><h2>{sectionInfo[3].title}</h2><span>{sectionInfo[3].count}</span></div>
                <div className="cc-section-grid cc-setup-grid">{functions[3].map((item) => <FunctionCard key={item.title} item={item} />)}</div>
              </section>
            </div>
          </div>
          <div className="cc-footer-note"><ShieldCheck /> Stările ON/OFF sunt afișate doar pentru setări și controale cu stare disponibilă. Celelalte intrări deschid setările sau managementul funcției.</div>
        </div>
      </main>
    </div>
  </div>;
}
