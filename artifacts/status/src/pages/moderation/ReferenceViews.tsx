import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, BookOpen, Check,
  ChevronRight, CircleHelp, FileText, Gavel, History, Home, LockKeyhole,
  MessageCircle, RefreshCw, Server, Shield, ShieldAlert, Sparkles, Ticket,
  Trophy, Users, Wrench,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { Switch } from "@workspace/oracolul-cenusii-ds/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import { CommandsPage } from "./Commands";
import { CasesPage } from "./Cases";
import { AuditPage } from "./Audit";
import { CategorySettingsPage } from "./CategorySettings";
import { MessageTemplatesPage } from "./MessageTemplates";
import { BotControlPage } from "./BotControl";
import { VerificationAdminPage } from "./VerificationAdmin";
import {
  useActiveGuild, useAuditLogs, useBotControl, useCases, useGameplayState,
  useModerationConfig, type BotControlConfig,
} from "../../hooks/use-moderation-api";
import { presentAuditActor, presentAuditLog } from "../../lib/moderation-audit";
import { OfflineAssistant } from "./OfflineAssistant";
import "./reference-views.css";

type ToggleKey =
  | "protection" | "autoMod" | "wordFilter" | "linkBlock" | "antiRaid"
  | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai" | "manualTools"
  | "cases" | "audit" | "escalation" | "embeds";

type Feature = {
  id: string;
  title: string;
  description: string;
  path?: string[];
  toggle?: ToggleKey;
  editor?: string;
  children?: string[];
  readOnly?: string;
};

type ViewDefinition = {
  id: string;
  title: string;
  description: string;
  icon: typeof Home;
  features: Feature[];
  editorLabel: string;
};

const definitions: Record<string, ViewDefinition> = {
  protectie: {
    id: "protectie",
    title: "Protecție",
    description: "Filtrele care țin serverul curat: AutoMod, anti-spam, anti-flood, anti-raid și urmărirea comportamentului suspect.",
    icon: Shield,
    editorLabel: "Deschide editorul de protecție",
    features: [
      { id: "automod", title: "AutoMod pentru mesaje", description: "Filtrează mesaje, cuvinte și linkuri folosind configurația serverului.", path: ["autoMod", "enabled"], toggle: "autoMod", editor: "/automod", children: ["Filtru de cuvinte", "Blocare linkuri", "Reguli AutoMod Discord"] },
      { id: "antispam", title: "Anti-spam", description: "Oprește spamul de mențiuni și emoji și mesajele umflate cu majuscule sau simboluri.", path: ["antiSpam", "enabled"], toggle: "antiSpam", editor: "/anti-spam" },
      { id: "antiflood", title: "Anti-flood", description: "Prinde rafalele de mesaje, editări sau ștergeri într-un timp scurt.", path: ["antiFlood", "enabled"], toggle: "antiFlood", editor: "/anti-flood" },
      { id: "antiraid", title: "Anti-raid", description: "Urmărește valurile de membri și vârsta conturilor noi.", path: ["antiRaid", "enabled"], toggle: "antiRaid", editor: "/anti-raid" },
      { id: "suspect", title: "Comportament suspect", description: "Observă schimbări neobișnuite de nickname sau roluri, activitate în masă și valuri de intrări/ieșiri.", path: ["suspiciousBehavior", "enabled"], toggle: "suspiciousBehavior", editor: "/comportament-suspect" },
    ],
  },
  judecator: {
    id: "judecator",
    title: "Oracolul Judecător",
    description: "Moderarea cu AI: configurația și criteriile disponibile pentru serverul selectat.",
    icon: Gavel,
    editorLabel: "Deschide setările AI",
    features: [
      { id: "ai", title: "Oracolul Judecător", description: "Moderare AI pe categorii, cu sensibilitate, excepții și analiză OCR.", path: ["ai", "enabled"], toggle: "ai", editor: "/ai" },
    ],
  },
  sanctiuni: {
    id: "sanctiuni",
    title: "Sancțiuni",
    description: "Unelte staff și escaladarea sancțiunilor disponibile pentru serverul selectat.",
    icon: Gavel,
    editorLabel: "Deschide configurarea sancțiunilor",
    features: [
      { id: "escalation", title: "Escaladarea sancțiunilor", description: "Pedeapsa crește pe măsură ce un membru repetă abaterile.", path: ["escalation", "enabled"], toggle: "escalation", editor: "/config/escaladare" },
      { id: "manual", title: "Comenzi de moderare", description: "Comenzile de moderare pe care le poate folosi staff-ul.", path: ["manualTools", "enabled"], toggle: "manualTools", editor: "/comenzi" },
    ],
  },
  dosare: {
    id: "dosare",
    title: "Dosare și jurnale",
    description: "Dosarele de moderare și evenimentele de audit reale ale serverului.",
    icon: BookOpen,
    editorLabel: "Deschide dosarele și jurnalele",
    features: [
      { id: "cases", title: "Dosare de moderare", description: "Fiecare sancțiune devine un dosar consultabil, actualizabil și cu note.", path: ["cases", "enabled"], toggle: "cases", editor: "/cazuri" },
      { id: "audit", title: "Audit", description: "Jurnal separat, cu nivelul de detaliu configurabil.", path: ["audit", "enabled"], toggle: "audit", editor: "/audit" },
      { id: "activity-log", title: "Jurnale de activitate", description: "Categorii de evenimente cu destinații și șabloane dedicate.", path: ["activityLog", "enabled"], editor: "/config/cazuri-audit", readOnly: "Configurarea jurnalelor se face în editorul dedicat." },
    ],
  },
  tichete: {
    id: "tichete",
    title: "Verificare și tichete",
    description: "Fluxurile de verificare și tichete configurate efectiv în Control Bot pentru serverul selectat.",
    icon: Ticket,
    editorLabel: "Deschide configurarea tichetelor",
    features: [
      { id: "verification", title: "Verificarea membrilor", description: "Membrii noi își verifică contul și primesc rolul configurat.", editor: "/verificare", readOnly: "Starea publicării și activarea se gestionează în editorul de verificare; nu există un comutator rapid sigur." },
      { id: "staff", title: "Aplicații de staff", description: "Formular cu întrebările serverului și notificarea echipei.", editor: "/bot?tab=tickets" },
      { id: "partnership", title: "Cereri de parteneriat", description: "Formular pentru serverul partener și anunțul opțional de alianță.", editor: "/bot?tab=tickets" },
      { id: "help_report", title: "Ajutor și raportări", description: "Formular pentru descriere, momentul întâmplării și dovezi.", editor: "/bot?tab=tickets" },
      { id: "appeal", title: "Contestații", description: "Tichet legat de ID-ul cazului; contestația nu ridică automat sancțiunea.", editor: "/bot?tab=tickets" },
    ],
  },
  rpg: {
    id: "rpg",
    title: "Jocul RPG",
    description: "Starea reală a jocului și configurația de gameplay returnată pentru serverul selectat.",
    icon: Trophy,
    editorLabel: "Deschide setările Discord ale jocului",
    features: [
      { id: "heroes", title: "Profiluri și eroi", description: "Profiluri de jucător, clase, companioni, inventar și echipamente.", readOnly: "Indisponibil: API-ul guild-scoped nu expune configurarea profilurilor, claselor, companionilor, inventarului sau echipamentelor." },
      { id: "experience", title: "Niveluri și experiență", description: "XP-ul primit de jucători și viteza de progres.", readOnly: "Indisponibil: API-ul disponibil expune doar multiplicatorii de XP pentru monștri și boss, nu valorile definite în modulul sursă." },
      { id: "economy", title: "Oboli și magazin", description: "Moneda jocului și obiectele care se pot cumpăra.", readOnly: "Indisponibil: API-ul nu expune soldul inițial, recompensa zilnică sau catalogul magazinului; multiplicatorii de aur sunt doar valori distincte de sursă." },
      { id: "missions", title: "Misiuni, cufăr și relicve", description: "Misiunile zilnice, cufărul cu chei și relicvele rare.", readOnly: "API-ul expune țintele și recompensele actuale ale celor trei misiuni, dar nu configurarea completă a misiunilor, cufărului ori relicvelor." },
      { id: "battles", title: "Lupte și boss", description: "Evenimente de luptă și boss-ul înfruntat de server.", readOnly: "API-ul expune durata evenimentelor și intervalele boss/cufăr ca read-only; celelalte câmpuri sursă nu sunt configurabile aici." },
      { id: "rankings", title: "Clasamente, invitații și ranguri", description: "Clasamentele jocului, recompensele pentru invitații și rangurile de activitate.", readOnly: "Indisponibil: API-ul guild-scoped nu expune configurarea clasamentelor RPG, recompenselor la invitații sau rangurilor de activitate." },
    ],
  },
  oracol: {
    id: "oracol",
    title: "Oracolul",
    description: "Funcțiile conversaționale, profețiile și activitățile comunitare din referință.",
    icon: MessageCircle,
    editorLabel: "Setări conexe disponibile",
    features: [
      { id: "conversation", title: "Oracolul conversațional", description: "Răspunsurile botului la întrebările membrilor.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru conversațiile botului." },
      { id: "prophecies", title: "Profeții", description: "Nu există o configurație de profeții expusă pentru acest server.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru profeții." },
      { id: "community", title: "Activități comunitare", description: "Activitățile prin care Oracolul ține comunitatea în mișcare.", readOnly: "Indisponibil: fără endpoint sau câmp de configurare pentru activități." },
    ],
  },
  setari: {
    id: "setari",
    title: "Setări bot",
    description: "Modulele de configurare cunoscute din API-ul curent, cu stare live pentru serverul selectat.",
    icon: Wrench,
    editorLabel: "Deschide editorul complet",
    features: [
      { id: "general", title: "Setări generale", description: "Limba, fusul orar, aspectul, rolurile staff și jurnalul implicit.", editor: "/config", readOnly: "API-ul curent nu expune câmpurile generale din modulul sursă. Setările compatibile se gestionează în editorul complet." },
      { id: "messages", title: "Mesaje către membri", description: "Mesajele private trimise membrilor în urma sancțiunilor.", editor: "/config/mesaje", readOnly: "Șabloanele disponibile se gestionează în editorul de mesaje; nu există aici un comutator separat pentru sursa completă." },
    ],
  },
};

type SourceSubmodule = { title: string; fields: string[] };
type SourceSection = { title: string; fields?: string[]; submodules?: SourceSubmodule[] };
type SourceModule = { id: string; group: string; title: string; sections: SourceSection[] };

// Structural inventory transcribed from the supplied GROUPS/MODULES source.
// These are labels, not editable defaults: only the linked authenticated API
// editors below can change server state.
const sourceModules: SourceModule[] = [
  { id: "automod", group: "protectie", title: "AutoMod pentru mesaje", sections: [
    { title: "Reguli", submodules: [
      { title: "Cuvinte și expresii interzise", fields: ["Cuvinte și expresii", "Acțiuni: șterge, avertisment, mute, kick, ban, alertă staff"] },
      { title: "Linkuri interzise", fields: ["Categorii blocate", "Domenii blocate manual", "Acțiuni"] },
      { title: "Mesaje suspecte de scam", fields: ["Folosește tiparele de scam cunoscute", "Expresii proprii", "Acțiuni"] },
      { title: "Emoji, majuscule, simboluri și mențiuni", fields: ["Emoji într-un mesaj", "Majuscule", "Același caracter la rând", "Simboluri într-un mesaj", "Mențiuni într-un mesaj", "Acțiuni"] },
      { title: "Mesaje lungi și flood de caractere", fields: ["Lungimea maximă", "Rânduri într-un mesaj", "Acțiuni"] },
    ] },
    { title: "AutoMod-ul Discord", fields: ["Sincronizează cu AutoMod-ul Discord", "Ce sincronizează"] },
    { title: "Mesajele botului", fields: ["Cuvânt interzis", "Link interzis", "Mesaj de scam", "Emoji, majuscule sau mențiuni", "Mesaj prea lung", "În jurnalul AutoMod", "Șterge mesajul după (secunde)"] },
  ] },
  { id: "antispam", group: "protectie", title: "Anti-spam", sections: [
    { title: "Ce detectează", submodules: [
      { title: "Spam de mențiuni", fields: ["Mențiuni", "În interval de"] },
      { title: "Spam de emoji", fields: ["Emoji", "În interval de"] },
      { title: "Mesaje foarte lungi", fields: ["Peste"] },
      { title: "Majuscule excesive", fields: ["Peste", "În mesaje de cel puțin"] },
      { title: "Caractere sau simboluri repetate", fields: ["Același caracter de"] },
    ] },
    { title: "Ce face botul", fields: ["Acțiune: șterge, avertisment, mute, kick, ban, alertă staff", "Durata mute-ului"] },
    { title: "Jurnal", fields: ["Canal de jurnal"] },
    { title: "Mesajele botului", fields: ["Avertisment în canal", "În jurnal", "Șterge mesajul după (secunde)"] },
  ] },
  { id: "antiflood", group: "protectie", title: "Anti-flood", sections: [
    { title: "Ce detectează", submodules: [
      { title: "Prea multe mesaje", fields: ["Mesaje", "În interval de"] },
      { title: "Editări repetate", fields: ["Editări", "În interval de"] },
      { title: "Ștergeri repetate", fields: ["Ștergeri", "În interval de"] },
    ] },
    { title: "Ce face botul", fields: ["Acțiune: șterge mesajele din rafală, avertisment, mute, kick, ban, alertă staff", "Durata mute-ului"] },
    { title: "Jurnal", fields: ["Canal de jurnal"] },
    { title: "Mesajele botului", fields: ["Avertisment în canal", "În jurnal", "Șterge mesajul după (secunde)"] },
  ] },
  { id: "antiraid", group: "protectie", title: "Anti-raid", sections: [
    { title: "Detectare", fields: ["Val de intrări", "În interval de", "Cont mai nou de"] },
    { title: "Alertă și blocare", fields: ["Canal de alertă", "Blocare automată la raid", "Durata blocării"] },
    { title: "Regula anti-raid", submodules: [{ title: "Regula separată", fields: ["Prag", "Severitate", "Acțiuni: alertă, mute, kick, ban"] }] },
    { title: "Mesajele botului", fields: ["Alerta pentru staff", "Anunțul de blocare", "Anunțul de deblocare"] },
  ] },
  { id: "suspect", group: "protectie", title: "Comportament suspect", sections: [
    { title: "Ce urmărește", fields: ["Schimbări de nickname", "Schimbări de roluri", "Editări sau ștergeri în masă", "Valuri de intrări și ieșiri", "Alte activități neobișnuite"] },
    { title: "Reacție", fields: ["Sensibilitate", "Canal de alertă", "Acțiuni: alertă, mute, kick, ban", "Durata mute-ului"] },
    { title: "Mesaje", fields: ["Alerta pentru staff"] },
  ] },
  { id: "ai", group: "judecator", title: "Oracolul Judecător", sections: [
    { title: "Cum judecă", fields: ["Sensibilitate", "Tonul mesajului către membru", "Acțiune: șterge, avertisment, mute, kick, ban, alertă staff"] },
    { title: "Categorii", submodules: ["Toxicitate și vulgarități", "Atacuri și bullying", "Spam inteligent și trolling", "Scamuri", "Amenințări", "Linkuri înșelătoare"].map((title) => ({ title, fields: ["Setări proprii pentru categoria asta", "Sensibilitate proprie", "Acțiuni proprii"] })) },
    { title: "Excepții", fields: ["Canale excluse", "Roluri excluse"] },
    { title: "Imagini", fields: ["Analizează imaginile (OCR)", "Nu sancționa doar din textul nesigur al unei imagini"] },
    { title: "Mesajele botului", fields: ["Mesaj către membru, în canal", "Imagine suspectă", "În jurnalul AI", "Șterge mesajul după (secunde)"] },
  ] },
  { id: "escalation", group: "sanctiuni", title: "Escaladarea sancțiunilor", sections: [
    { title: "Niveluri", fields: ["La abaterea", "Sancțiune", "Minute de mute", "Cel mult patru niveluri", "Adaugă un nivel"] },
    { title: "Resetare", fields: ["Abaterile se uită după"] },
    { title: "Mesaje", fields: ["Nivel nou de sancțiune", "Abaterile s-au șters"] },
  ] },
  { id: "manual", group: "sanctiuni", title: "Comenzi de moderare", sections: [
    { title: "Comenzi", fields: ["/warn", "/mute", "/unmute", "/kick", "/ban", "/purge", "/slowmode", "/lock", "/unlock", "/nick", "/role", "/moderare login"] },
    { title: "Dosare", fields: ["Salvează fiecare acțiune ca dosar"] },
    { title: "Mesaje botului", fields: ["După /warn", "După /mute", "După /unmute", "După /kick", "După /ban", "După /purge", "După /slowmode", "După /lock", "După /unlock", "După /nick", "După /role", "Dosar salvat"] },
  ] },
  { id: "cases", group: "dosare", title: "Dosare de moderare", sections: [
    { title: "Păstrare", fields: ["Păstrează dosarele"] },
    { title: "Acces", fields: ["Cine poate închide dosare", "Cine poate adăuga note"] },
    { title: "Export", fields: ["Permite exportul CSV"] },
  ] },
  { id: "audit", group: "dosare", title: "Audit", sections: [
    { title: "Nivel de detaliu", fields: ["Minimal", "Standard", "Extins"] },
  ] },
  { id: "activity-log", group: "dosare", title: "Jurnale de activitate", sections: [
    { title: "Categorii", submodules: [
      { title: "Mesaje", fields: ["Canal", "Șablonul mesajului"] }, { title: "Membri", fields: ["Canal", "Șablonul mesajului"] },
      { title: "Canale", fields: ["Canal", "Șablonul mesajului"] }, { title: "Roluri", fields: ["Canal", "Șablonul mesajului"] },
      { title: "Voce", fields: ["Canal", "Șablonul mesajului"] }, { title: "Moderare", fields: ["Canal", "Șablonul mesajului"] },
      { title: "Securitate", fields: ["Canal", "Șablonul mesajului"] },
    ] },
    { title: "Jurnale dedicate", fields: ["Jurnal AutoMod", "Jurnal Oracolul Judecător", "Jurnal anti-spam"] },
  ] },
  { id: "verification", group: "tichete", title: "Verificarea membrilor", sections: [
    { title: "Panoul de verificare", fields: ["Canalul panoului", "Titlu", "Text", "Textul butonului", "Emoji pe buton", "Imagine (link)", "Previzualizare"] },
    { title: "După verificare", fields: ["Rolul primit", "Staff-ul poate verifica membri din panou"] },
    { title: "Mesaje", fields: ["După verificare", "Dacă e deja verificat", "Dacă verificarea nu merge", "Verificat de staff"] },
  ] },
  { id: "staff", group: "tichete", title: "Aplicații de staff", sections: [
    { title: "Flux", fields: ["Canalul cu butonul", "Unde se deschide tichetul", "Imagine (link)"] },
    { title: "Întrebări", fields: ["De ce vrei să intri în staff?", "Câți ani ai?", "Cât timp poți fi activ pe zi?", "Ai mai moderat un server?"] },
    { title: "La final", fields: ["La final, tichetul", "Anunță staff-ul", "Rolul anunțat"] },
    { title: "Mesaje", fields: ["Titlul panoului", "Textul panoului", "Textul butonului", "Mesajul de început", "După ce trimite formularul", "Anunțul pentru staff", "La închidere"] },
  ] },
  { id: "partnership", group: "tichete", title: "Cereri de parteneriat", sections: [
    { title: "Flux", fields: ["Canalul cu butonul", "Unde se deschide tichetul", "Imagine (link)"] },
    { title: "Întrebări", fields: ["Numele serverului", "Linkul de invitație", "Câți membri are?", "De ce vreți alianța?"] },
    { title: "Anunț", fields: ["Publică un anunț de alianță", "Canalul alianțelor"] },
    { title: "La final și mesaje", fields: ["La final, tichetul", "Anunță staff-ul", "Rolul anunțat", "Titlul panoului", "Textul panoului", "Textul butonului", "Mesajul de început", "După ce trimite formularul", "Anunțul pentru staff", "La închidere", "Anunțul de alianță"] },
  ] },
  { id: "help_report", group: "tichete", title: "Ajutor și raportări", sections: [
    { title: "Flux", fields: ["Canalul cu butonul", "Unde se deschide tichetul", "Imagine (link)"] },
    { title: "Întrebări", fields: ["Descriere obligatorie", "Momentul întâmplării", "Dovezi", "Întrebări în plus"] },
    { title: "La final și mesaje", fields: ["La final, tichetul", "Anunță staff-ul", "Rolul anunțat", "Titlul panoului", "Textul panoului", "Textul butonului", "Mesajul de început", "După ce trimite formularul", "Anunțul pentru staff", "La închidere"] },
  ] },
  { id: "appeal", group: "tichete", title: "Contestații", sections: [
    { title: "Flux", fields: ["Canalul cu butonul", "Unde se deschide tichetul", "Imagine (link)", "ID-ul cazului"] },
    { title: "Întrebări", fields: ["De ce crezi că sancțiunea ar trebui ridicată?"] },
    { title: "La final și mesaje", fields: ["La final, tichetul", "Anunță staff-ul", "Rolul anunțat", "Titlul panoului", "Textul panoului", "Textul butonului", "Mesajul de început", "După ce trimite formularul", "Anunțul pentru staff", "La închidere"] },
  ] },
  { id: "heroes", group: "rpg", title: "Profiluri și eroi", sections: [
    { title: "Unde se joacă", fields: ["Canalele jocului"] }, { title: "Eroi", fields: ["Profiluri de jucător", "Clase"] },
    { title: "Companioni", fields: ["Companioni", "Companioni pe jucător"] },
    { title: "Inventar și echipamente", fields: ["Locuri în inventar", "Echipamente"] },
    { title: "Mesaje", fields: ["Profil nou", "Companion nou", "Echipament pus", "Inventar plin"] },
  ] },
  { id: "experience", group: "rpg", title: "Niveluri și experiență", sections: [
    { title: "Progres", fields: ["XP pentru o luptă câștigată", "Nivelul maxim", "Cât de greu se urcă", "Anunță nivelurile noi în"] },
    { title: "Mesaje", fields: ["Nivel nou", "Nivel maxim"] },
  ] },
  { id: "economy", group: "rpg", title: "Oboli și magazin", sections: [
    { title: "Oboli", fields: ["Oboli la început", "Recompensa zilnică"] },
    { title: "Magazin", fields: ["Magazin", "Obiecte în magazin", "Obiect", "Preț", "Adaugă un obiect"] },
    { title: "Mesaje", fields: ["Recompensa zilnică", "Recompensa e deja luată", "Cumpărare", "Oboli prea puțini"] },
  ] },
  { id: "missions", group: "rpg", title: "Misiuni, cufăr și relicve", sections: [
    { title: "Misiuni", fields: ["Misiuni zilnice", "Misiuni pe zi", "Se schimbă la ora"] },
    { title: "Cufăr și chei", fields: ["Cufărul", "Șansă de cheie după o luptă"] },
    { title: "Relicve", fields: ["Relicve", "Șansă de relicvă din cufăr"] },
    { title: "Mesaje", fields: ["Misiunile zilei", "Misiune terminată", "Cheie găsită", "Cufăr deschis", "Relicvă găsită"] },
  ] },
  { id: "battles", group: "rpg", title: "Lupte și boss", sections: [
    { title: "Lupte", fields: ["Evenimente de luptă"] },
    { title: "Boss", fields: ["Apare un boss", "Canalul boss-ului", "Rolul anunțat", "Recompensă pentru cei care îl înving"] },
    { title: "Mesaje", fields: ["Luptă câștigată", "Luptă pierdută", "Apare boss-ul", "Boss învins", "Boss-ul pleacă"] },
  ] },
  { id: "rankings", group: "rpg", title: "Clasamente, invitații și ranguri", sections: [
    { title: "Clasamente", fields: ["Clasamente", "Clasamentul se resetează"] },
    { title: "Invitații", fields: ["Recompense pentru invitații", "Pentru fiecare membru adus"] },
    { title: "Ranguri de activitate", fields: ["Ranguri de activitate", "Rol pe nivel", "De la nivelul", "Rol", "Adaugă un rang"] },
    { title: "Mesaje", fields: ["Resetarea clasamentului", "Recompensă pentru invitație", "Rang nou"] },
  ] },
  { id: "conversation", group: "oracol", title: "Oracolul conversațional", sections: [
    { title: "Răspunsuri", fields: ["Canalele în care răspunde", "Răspunde doar când e menționat", "Tonul", "Lungimea răspunsurilor", "Pauză între răspunsuri pentru același membru"] },
    { title: "Mesaje", fields: ["Pauză între întrebări", "Canal în care nu răspunde"] },
  ] },
  { id: "prophecies", group: "oracol", title: "Profeții", sections: [
    { title: "Zilnic", fields: ["Profeția zilei", "Canal", "Ora"] },
    { title: "La cerere", fields: ["Membrii pot cere o profeție", "Profeții pe zi pentru un membru"] },
    { title: "Mesaje", fields: ["Profeția zilei", "Profeție cerută", "Limita zilnică"] },
  ] },
  { id: "community", group: "oracol", title: "Activități comunitare", sections: [
    { title: "Activitate", fields: ["Canal", "Cât de des", "Anunță cu un rol", "Rol"] },
    { title: "Mesaje", fields: ["Anunțul activității"] },
  ] },
  { id: "general", group: "setari", title: "Setări generale", sections: [
    { title: "Limbă și oră", fields: ["Limba botului", "Fusul orar"] },
    { title: "Aspect", fields: ["Culoarea mesajelor embed", "Trimite mesajele botului ca embed", "Răspunsurile la comenzi se văd doar de cel care le folosește"] },
    { title: "Staff", fields: ["Roluri de admin", "Roluri de moderator"] },
    { title: "Jurnal", fields: ["Canal de jurnal implicit"] },
    { title: "Mesaje", fields: ["Fără permisiune", "Comandă folosită prea des", "Eroare"] },
  ] },
  { id: "messages", group: "setari", title: "Mesaje către membri", sections: [
    { title: "Preferințe", fields: ["Trimite mesaj privat la sancțiune", "Spune-i membrului cum poate contesta"] },
    { title: "Mesaje private", fields: ["La avertisment", "La mute", "Când se termină mute-ul", "La kick", "La ban", "Textul despre contestație"] },
  ] },
];

const viewLinks = [
  { id: "protectie", title: "Protecție", href: "/panou/protectie", icon: Shield, keys: ["protection", "autoMod", "antiSpam", "antiFlood", "antiRaid", "suspiciousBehavior"] },
  { id: "judecator", title: "Oracolul Judecător", href: "/panou/judecator", icon: Gavel, keys: ["ai"] },
  { id: "sanctiuni", title: "Sancțiuni", href: "/panou/sanctiuni", icon: ShieldAlert, keys: ["manualTools", "escalation"] },
  { id: "dosare", title: "Dosare și jurnale", href: "/panou/dosare", icon: History, keys: ["cases", "audit"] },
  { id: "tichete", title: "Verificare și tichete", href: "/panou/tichete", icon: Ticket, keys: [] },
  { id: "rpg", title: "Jocul RPG", href: "/panou/rpg", icon: Trophy, keys: [] },
  { id: "oracol", title: "Oracolul", href: "/panou/oracol", icon: MessageCircle, keys: [] },
  { id: "setari", title: "Setări bot", href: "/panou/setari", icon: Wrench, keys: [] },
];

function readPath(source: unknown, path: string[]) {
  let value: unknown = source;
  for (const part of path) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Nu am putut încărca datele serverului.";
}

function SkeletonCards({ count = 4 }: { count?: number }) {
  return <div className="ref-module-skeletons" aria-label="Se încarcă datele serverului">
    {Array.from({ length: count }, (_, index) => <div className="ref-skeleton-card" key={index}><i /><i /><i /></div>)}
  </div>;
}

function OverviewView() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading, error, refetch } = useModerationConfig(guildId);
  const { data: cases, loading: casesLoading, error: casesError, refetch: refetchCases } = useCases(guildId, { limit: 10 });
  const { data: logs, loading: logsLoading, error: logsError, refetch: refetchLogs } = useAuditLogs(guildId, { limit: 8 });
  const currentGuild = guilds.find((guild) => guild.id === guildId);
  const checks = [
    "protection", "autoMod", "antiRaid", "antiSpam", "antiFlood", "suspiciousBehavior",
    "ai", "manualTools", "cases", "audit", "escalation", "embeds",
  ];
  const enabled = checks.filter((key) => readPath(config, [key, "enabled"]) === true).length;
  const openCases = cases.filter((item) => item.status === "open").length;

  return <div className="ref-overview">
    <section className="ref-overview-hero">
      <div className="ref-overview-copy">
        <p className="ref-eyebrow"><span className="ref-live-dot" /> {loading ? "Se încarcă serverul" : "Server selectat"} · {currentGuild?.name || "Alege un server"}</p>
        <h1>Panoul<br />Oracolului</h1>
        <p>Pornește, oprește și reglează modulele disponibile pentru serverul selectat. Setările operaționale rămân server-side și folosesc API-urile autentificate ale panoului.</p>
        <div className="ref-overview-meter">
          <div className="ref-meter" role="img" aria-label={`${enabled} din ${checks.length} module configurate ca pornite`} style={{ "--ref-progress": `${checks.length ? (enabled / checks.length) * 100 : 0}%` } as CSSProperties}>
            <div><strong>{loading ? "—" : enabled}</strong><small>din {checks.length}<br />pornite</small></div>
          </div>
          <div className="ref-overview-chips">
            {viewLinks.map((item) => <Link key={item.id} href={item.href} className="ref-overview-chip"><item.icon aria-hidden="true" /><span>{item.title}</span></Link>)}
          </div>
        </div>
      </div>
      <div className="ref-overview-mark" aria-hidden="true"><span className="ref-mark-ring" /><span className="ref-mark-core"><EyeMark /></span></div>
    </section>

    {error && <div className="ref-error" role="alert"><span>{errorText(error)}</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div>}
    {loading ? <SkeletonCards count={6} /> : config ? <section className="ref-overview-grid" aria-label="Module pe categorii">
      {viewLinks.map((group, index) => {
        const total = group.keys.length;
        const count = group.keys.filter((key) => readPath(config, [key, "enabled"]) === true).length;
        const Icon = group.icon;
        const groupItems = definitions[group.id]?.features ?? [];
        return <article className="ref-overview-card" key={group.id} style={{ "--ref-index": index } as CSSProperties}>
          <header><span className="ref-group-icon"><Icon aria-hidden="true" /></span><div><h2>{group.title}</h2><p>{total ? `${count} din ${total} module pornite` : "Stare disponibilă în editorul dedicat"}</p></div><Link href={group.href} aria-label={`Deschide ${group.title}`}><ArrowUpRight aria-hidden="true" /></Link></header>
          {total > 0 && <div className="ref-progress"><i style={{ width: `${(count / total) * 100}%` }} /></div>}
          <ul>{groupItems.map((feature) => {
            const status = feature.path ? readPath(config, feature.path) : undefined;
            return <li key={feature.id}><Link href={feature.editor || group.href}><span>{feature.title}</span><small>{typeof status === "boolean" ? status ? "Pornit" : "Oprit" : "Detalii"}</small></Link></li>;
          })}</ul>
        </article>;
      })}
      <article className="ref-overview-card ref-overview-card--facts">
        <header><span className="ref-group-icon"><Server aria-hidden="true" /></span><div><h2>Serverul selectat</h2><p>Doar date confirmate de API</p></div></header>
        <dl><div><dt>Cazuri deschise</dt><dd>{casesLoading ? "…" : casesError ? "Eroare" : openCases}</dd></div><div><dt>Evenimente de audit returnate</dt><dd>{logsLoading ? "…" : logsError ? "Eroare" : logs.length}</dd></div><div><dt>Identificator</dt><dd className="ref-id">{guildId || "—"}</dd></div></dl>
        {casesError && <p className="ref-muted" role="alert">Dosarele nu s-au putut încărca. <Button variant="link" size="sm" className="ref-inline-retry" onClick={() => void refetchCases()}>Reîncearcă</Button></p>}
        {!casesLoading && !casesError && !openCases && <p className="ref-muted">Nu există cazuri deschise returnate de API pentru serverul selectat.</p>}
        {logsError && <p className="ref-muted" role="alert">Auditul nu s-a putut încărca. <Button variant="link" size="sm" className="ref-inline-retry" onClick={() => void refetchLogs()}>Reîncearcă</Button></p>}
        {!logsLoading && !logsError && logs.length === 0 && <p className="ref-muted">Nu există evenimente returnate în această citire. Istoricul complet este disponibil în pagina Audit.</p>}
      </article>
      <article className="ref-overview-card ref-overview-card--log">
        <header><span className="ref-group-icon"><History aria-hidden="true" /></span><div><h2>Ultimele evenimente</h2><p>Jurnal live al serverului · nu date demonstrative</p></div><Button variant="ghost" size="icon" aria-label="Reîncarcă evenimentele" onClick={() => { void refetchCases(); void refetchLogs(); }} disabled={casesLoading || logsLoading}><RefreshCw aria-hidden="true" /></Button></header>
        {casesLoading || logsLoading ? <div className="ref-log-loading"><i /><i /><i /></div> : logsError ? <div className="ref-error" role="alert"><span>{logsError.message}</span><Button variant="outline" size="sm" onClick={() => void refetchLogs()}>Reîncearcă auditul</Button></div> : logs.length > 0 ? <ol>{logs.slice(0, 6).map((log) => {
          const presentation = presentAuditLog(log);
          return <li key={log.id}><span className="ref-log-dot" /><div><b>{presentation.title}</b><small>{presentAuditActor(log)} · {presentation.details}</small></div><time>{new Date(log.createdAt).toLocaleString("ro-RO")}</time></li>;
        })}</ol> : <div className="ref-empty-state"><History aria-hidden="true" /><p>Nicio intrare returnată în această citire.</p><Link href="/audit">Deschide jurnalul complet <ChevronRight aria-hidden="true" /></Link></div>}
        <Link className="ref-card-link" href="/audit">Deschide auditul complet <ChevronRight aria-hidden="true" /></Link>
      </article>
    </section> : !error ? <div className="ref-error" role="status">Alege un server autorizat pentru a încărca modulele.</div> : null}
  </div>;
}

function EyeMark() {
  return <svg viewBox="0 0 100 100" role="img" aria-label="Simbolul Oracolului"><circle cx="50" cy="50" r="44" /><path d="M19 50c14-20 48-20 62 0-14 20-48 20-62 0Z" /><circle cx="50" cy="50" r="14" /><path d="M50 39c5 7 5 15 0 22-5-7-5-15 0-22Z" /></svg>;
}

function ModuleStatus({ feature, config }: { feature: Feature; config: unknown }) {
  if (feature.readOnly && !feature.path) return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> Read-only</span>;
  if (!feature.path) return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> API fără stare</span>;
  const value = readPath(config, feature.path);
  if (typeof value !== "boolean") return <span className="ref-status ref-status--unknown"><CircleHelp aria-hidden="true" /> Stare necunoscută</span>;
  return <span className={`ref-status ${value ? "ref-status--on" : "ref-status--off"}`}><i />{value ? "Pornit" : "Oprit"}</span>;
}

function SourceModuleDetail({ moduleId }: { moduleId: string }) {
  const module = sourceModules.find((candidate) => candidate.id === moduleId);
  if (!module) return null;
  return <section className="ref-source-detail" aria-label={`Structura sursă ${module.title}`}>
    <div className="ref-source-detail-heading">
      <div><p className="ref-eyebrow">Structura din HTML-ul de referință</p><h3>Setări și câmpuri</h3></div>
      <span>{module.sections.length} secțiuni</span>
    </div>
    <div className="ref-source-sections">
      {module.sections.map((section) => <section className="ref-source-section" key={section.title}>
        <h4>{section.title}</h4>
        {section.fields && <ul>{section.fields.map((field) => <li key={field}>{field}</li>)}</ul>}
        {section.submodules?.map((submodule) => <article className="ref-source-submodule" key={submodule.title}>
          <h5>{submodule.title}</h5>
          <ul>{submodule.fields.map((field) => <li key={field}>{field}</li>)}</ul>
        </article>)}
      </section>)}
    </div>
    <p className="ref-source-caption">Structura descrie setările definite în sursă; nu este un editor și nu preîncarcă valori demonstrative.</p>
  </section>;
}

function GroupPage({ view }: { view: string }) {
  const definition = definitions[view];
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading, error, refetch, updateProtectionToggle } = useModerationConfig(guildId);
  const [selectedId, setSelectedId] = useState(definition?.features[0]?.id ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [globalProtectionBusy, setGlobalProtectionBusy] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const currentGuild = guilds.find((guild) => guild.id === guildId);
  const selected = definition?.features.find((feature) => feature.id === selectedId) ?? definition?.features[0];
  const enabledCount = definition?.features.filter((feature) => feature.path && readPath(config, feature.path) === true).length ?? 0;
  const knownStates = definition?.features.filter((feature) => feature.path).length ?? 0;
  const toggles = definition?.features.filter((feature) => feature.toggle).length ?? 0;

  if (!definition) return <div className="ref-error" role="alert">Această vedere nu există. Folosește căutarea pentru a deschide o pagină disponibilă.</div>;

  const setModule = async (feature: Feature, enabled: boolean) => {
    if (!feature.toggle || !guildId) return;
    setSaving(feature.id);
    setActionError("");
    try { await updateProtectionToggle(feature.toggle, enabled); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setSaving(null); }
  };
  const setGlobalProtection = async (enabled: boolean) => {
    if (!guildId) return;
    setGlobalProtectionBusy(true);
    setGlobalError("");
    try { await updateProtectionToggle("protection", enabled); }
    catch (cause) { setGlobalError(errorText(cause)); }
    finally { setGlobalProtectionBusy(false); }
  };

  return <div className="ref-group-view">
    <header className="ref-group-head">
      <div>
        <p className="ref-eyebrow"><span className="ref-live-dot" /> {currentGuild?.name || "Server neselectat"}</p>
        <h1>{definition.title}</h1>
        <p>{definition.description}</p>
      </div>
      <div className="ref-group-counter"><strong>{loading ? "—" : knownStates ? `${enabledCount}/${knownStates}` : "API"}</strong><span>{knownStates ? <>module<br />pornite</> : <>stare<br />live</>}</span><i style={{ "--ref-progress": `${knownStates ? (enabledCount / knownStates) * 100 : 0}%` } as CSSProperties} /></div>
    </header>

    {view === "protectie" && <section className="ref-master-toggle" aria-label="Protecție globală">
      <span className="ref-master-icon"><Shield aria-hidden="true" /></span>
      <div><p className="ref-eyebrow">Protecție globală</p><h2>Control pentru modulele automate</h2><p>Starea modulelor se păstrează; dezactivarea globală suspendă protecția fără a rescrie setările individuale.</p></div>
      <Switch checked={readPath(config, ["protection", "enabled"]) === true} disabled={loading || globalProtectionBusy || !config} onCheckedChange={(enabled) => void setGlobalProtection(enabled)} aria-label="Activează protecția globală" />
      {globalError && <p className="ref-inline-error" role="alert">{globalError}</p>}
    </section>}

    {loading && view !== "rpg" && view !== "tichete" ? <SkeletonCards count={4} /> : error && view !== "rpg" && view !== "tichete" ? <div className="ref-error" role="alert"><span>{error.message}</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div> : <>
      {error && (view === "rpg" || view === "tichete") && <div className="ref-error" role="status"><span>Configurația de moderare nu este disponibilă; datele specifice acestui modul sunt citite separat.</span><Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden="true" /> Reîncearcă</Button></div>}
      <div className="ref-group-layout">
        <nav className="ref-module-nav" aria-label={`Modulele din ${definition.title}`}>
          <div className="ref-module-nav-head"><b>Module</b><span>{definition.features.length.toString().padStart(2, "0")}</span></div>
          {definition.features.map((feature) => <Button key={feature.id} type="button" variant="ghost" size="sm" className={`ref-module-nav-item ${feature.id === selected?.id ? "is-selected" : ""}`} aria-current={feature.id === selected?.id ? "true" : undefined} onClick={() => setSelectedId(feature.id)}>
            <span className="ref-module-nav-icon"><ModuleIcon id={feature.id} /></span>
            <span><b>{feature.title}</b><small><ModuleStatus feature={feature} config={config} /></small></span>
            <ChevronRight aria-hidden="true" />
          </Button>)}
        </nav>

        {selected && <section className="ref-module-detail" aria-labelledby={`ref-title-${selected.id}`}>
          <header className="ref-module-heading">
            <span className="ref-module-heading-icon"><ModuleIcon id={selected.id} /></span>
            <div><p className="ref-eyebrow">{definition.title} · {currentGuild?.name || "Server"}</p><h2 id={`ref-title-${selected.id}`}>{selected.title}</h2><p>{selected.description}</p></div>
            {selected.toggle && <div className="ref-module-toggle"><span>{readPath(config, selected.path || []) === true ? "Pornit" : "Oprit"}</span><Switch checked={readPath(config, selected.path || []) === true} disabled={loading || saving === selected.id || !config} onCheckedChange={(enabled) => void setModule(selected, enabled)} aria-label={`${readPath(config, selected.path || []) === true ? "Oprește" : "Pornește"} ${selected.title}`} /></div>}
          </header>
          {actionError && <div className="ref-error" role="alert"><span>{actionError}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncarcă starea</Button></div>}
          {!selected.toggle && selected.readOnly && <div className="ref-readonly"><LockKeyhole aria-hidden="true" /><p>{selected.readOnly}</p></div>}
          <SourceModuleDetail moduleId={selected.id} />
          {view === "rpg" && ["experience", "economy", "missions", "battles"].includes(selected.id) && <RpgLivePanel moduleId={selected.id} />}
          {selected.id === "staff" || selected.id === "partnership" || selected.id === "help_report" || selected.id === "appeal" || selected.id === "verification" ? <TicketLivePanel moduleId={selected.id} /> : null}
          {selected.id === "activity-log" && <ActivityLogSnapshot config={config} />}
          <FeatureEditor view={view} moduleId={selected.id} />
          {selected.editor && <Link className="ref-editor-link" href={selected.editor}><span>{definition.editorLabel}</span><ArrowUpRight aria-hidden="true" /></Link>}
        </section>}
      </div>
      {loading && <div role="status" className="ref-inline-loading"><i /> Se citesc stările modulelor de moderare…</div>}
      {toggles > 0 && <p className="ref-save-note"><Check aria-hidden="true" /> Comutatoarele actualizează configurația serverului prin API; pentru câmpurile detaliate deschide editorul modulului.</p>}
    </>}
  </div>;
}

function FeatureEditor({ view, moduleId }: { view: string; moduleId: string }) {
  let content: ReactNode = null;
  const categoryByModule: Record<string, "automod" | "anti-spam" | "anti-flood" | "anti-raid" | "suspicious" | "ai" | "tools" | "cases-audit" | "escalation" | "embeds"> = {
    automod: "automod", antispam: "anti-spam", antiflood: "anti-flood", antiraid: "anti-raid",
    suspect: "suspicious", ai: "ai", escalation: "escalation", manualTools: "tools",
    cases: "cases-audit", audit: "cases-audit", "activity-log": "cases-audit",
    autoMod: "automod", embeds: "embeds",
  };

  if (view === "sanctiuni" && moduleId === "manual") content = <CommandsPage />;
  else if (view === "dosare" && moduleId === "cases") content = <CasesPage />;
  else if (view === "dosare" && moduleId === "audit") content = <AuditPage />;
  else if (view === "tichete" && moduleId === "verification") content = <VerificationAdminPage />;
  else if (view === "tichete") content = <BotControlPage initialTab="tickets" />;
  else if (view === "setari" && moduleId === "channels") content = <BotControlPage channelsOnly />;
  else if (view === "setari" && moduleId === "messages") content = <MessageTemplatesPage />;
  else if (view === "setari" && moduleId === "general") content = <CategorySettingsPage section="embeds" />;
  else if (view === "protectie" || view === "judecator" || view === "sanctiuni" || view === "dosare" || view === "setari") {
    const section = categoryByModule[moduleId];
    if (section && !(view === "sanctiuni" && moduleId === "manual")) content = <CategorySettingsPage section={section} />;
  }

  if (!content) return null;
  return <section className="ref-embedded-editor" aria-label="Editorul funcțional al modulului">
    <div className="ref-embedded-editor-head"><span className="ref-eyebrow">Editor funcțional · API server</span><p>Formularul reutilizat din pagina operațională existentă.</p></div>
    {content}
  </section>;
}

function ModuleIcon({ id }: { id: string }) {
  const icons: Record<string, typeof Activity> = {
    automod: Bot, antispam: Activity, antiflood: Activity, antiraid: ShieldAlert, suspect: AlertTriangle,
    ai: Sparkles, escalation: Gavel, manual: Wrench, cases: BookOpen, audit: History,
    "activity-log": Activity, verification: Shield, staff: Users, partnership: Users,
    help_report: CircleHelp, appeal: Gavel, heroes: Users,
    experience: Activity, economy: Trophy, missions: BookOpen, battles: ShieldAlert,
    rankings: Trophy, conversation: MessageCircle, prophecies: Sparkles, community: Users,
    general: Wrench, messages: MessageCircle,
    autoMod: Bot, manualTools: Wrench, embeds: FileText, channels: Server,
  };
  const Icon = icons[id] ?? CircleHelp;
  return <Icon aria-hidden="true" />;
}

function TicketLivePanel({ moduleId }: { moduleId: string }) {
  const { guildId } = useActiveGuild();
  const { data, loading, error, refetch } = useBotControl(guildId);
  if (loading) return <div className="ref-inline-loading"><i /> Se citesc setările Control Bot…</div>;
  if (error || !data) return <div className="ref-error" role="alert"><span>{error?.message || "Configurația Control Bot nu este disponibilă."}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncearcă</Button></div>;
  if (moduleId === "verification") return <div className="ref-live-data"><h3>Configurație verificare</h3><dl>
    <div><dt>Activată în configurație</dt><dd>{data.verification.enabled ? "Da" : "Nu"}</dd></div>
    <div><dt>Canal</dt><dd>{data.verification.channelId || "Neconfigurat"}</dd></div>
    <div><dt>Rol primit</dt><dd>{data.verification.roleId || "Neconfigurat"}</dd></div>
    <div><dt>Panou publicat</dt><dd>{data.verification.panelMessageId ? "ID confirmat" : "Fără ID confirmat"}</dd></div>
  </dl></div>;
  const kind = moduleId as keyof BotControlConfig["tickets"]["flows"];
  const flow = data.tickets.flows[kind];
  const category = data.tickets.categories[kind];
  return <div className="ref-live-data"><h3>Configurația fluxului</h3><dl>
    <div><dt>Categorie Discord</dt><dd>{category || "Neconfigurată"}</dd></div>
    <div><dt>Mod</dt><dd>{flow.mode === "custom" ? "Personalizat" : "Legacy"}</dd></div>
    <div><dt>Titlu panou</dt><dd>{flow.title || "Neconfigurat"}</dd></div>
    <div><dt>Întrebări personalizate</dt><dd>{flow.questions.length}</dd></div>
    <div><dt>Acțiune finală</dt><dd>{flow.completionAction}</dd></div>
  </dl><p>API-ul expune acest flux prin configurația Control Bot. Modificările se fac în editorul dedicat, unde validarea și salvarea sunt deja implementate.</p></div>;
}

function RpgLivePanel({ moduleId }: { moduleId: string }) {
  const { guildId } = useActiveGuild();
  const { paused, loading, error, update, refetch } = useGameplayState(guildId);
  const { data, loading: configLoading, error: configError, refetch: refetchConfig } = useBotControl(guildId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gameplay = data?.gameplayConfig;
  const toggle = async () => {
    if (paused === null) return;
    setConfirmOpen(false);
    setBusy(true); setActionError("");
    try { await update(!paused); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setBusy(false); }
  };
  return <div className="ref-live-data">
    {moduleId === "battles" && <div className={`ref-game-state ${paused === false ? "is-running" : paused === true ? "is-paused" : ""}`}>
      <div><p className="ref-eyebrow">Stare gameplay · API server</p><h3>{loading ? "Se verifică starea" : paused === null ? "Stare necunoscută" : paused ? "Joc oprit" : "Joc activ"}</h3><p>Nu se folosește starea rangurilor de activitate pentru acest modul.</p></div>
      <div className="ref-game-actions">
        <Button variant={paused ? "default" : "destructive"} onClick={() => setConfirmOpen(true)} disabled={loading || busy || paused === null}>{busy ? "Se salvează…" : paused ? "Pornește jocul" : "Oprește jocul"}</Button>
        <Button variant="outline" size="icon" aria-label="Reîncarcă starea jocului" onClick={() => void refetch()} disabled={loading}><RefreshCw aria-hidden="true" /></Button>
      </div>
    </div>}
    {moduleId === "battles" && (error || actionError) && <div role="alert" className="ref-inline-error">{actionError || error?.message}</div>}
    {configLoading ? <div className="ref-inline-loading"><i /> Se citesc valorile de gameplay…</div> : configError || !gameplay ? <div className="ref-error" role="alert"><span>{configError?.message || "Configurația de gameplay nu este disponibilă."}</span><Button variant="outline" size="sm" onClick={() => void refetchConfig()}>Reîncearcă</Button></div> : <>
      <h3>Valori de gameplay returnate de API · read-only</h3>
      <dl>
        {moduleId === "experience" && <div><dt>Multiplicatori XP (nu XP per luptă)</dt><dd>Monștri ×{gameplay.economy.monsterXpMultiplier} · boss ×{gameplay.economy.bossXpMultiplier}</dd></div>}
        {moduleId === "economy" && <>
          <div><dt>Multiplicator aur · monștri (nu Oboli)</dt><dd>×{gameplay.economy.monsterGoldMultiplier}</dd></div>
          <div><dt>Multiplicator aur · boss (nu Oboli)</dt><dd>×{gameplay.economy.bossGoldMultiplier}</dd></div>
        </>}
        {moduleId === "missions" && <>
          <div><dt>Misiune · monștri</dt><dd>Țintă {gameplay.missions.kill_10.target} · recompensă {gameplay.missions.kill_10.rewardQty}</dd></div>
          <div><dt>Misiune · obiecte rare</dt><dd>Țintă {gameplay.missions.rare_3.target} · recompensă {gameplay.missions.rare_3.rewardQty}</dd></div>
          <div><dt>Misiune · boss</dt><dd>Țintă {gameplay.missions.boss_1.target} · recompensă {gameplay.missions.boss_1.rewardQty}</dd></div>
        </>}
        {moduleId === "battles" && <>
          <div><dt>Durata evenimentului</dt><dd>{gameplay.events.eventDurationMinutes} min</dd></div>
          <div><dt>Intervalul boss-ului</dt><dd>{gameplay.events.standaloneBossIntervalMinMinutes}–{gameplay.events.standaloneBossIntervalMaxMinutes} min</dd></div>
          <div><dt>Intervalul cuferelor</dt><dd>{gameplay.events.chestIntervalMinutes} min</dd></div>
        </>}
      </dl>
      <p>Acestea sunt valori actuale citite de la API, distincte de setările-sursă care nu sunt configurabile prin API-ul disponibil.</p>
      {moduleId === "battles" && <Link className="ref-editor-link" href="/bot?tab=messages"><span>Editează mesajele reale pentru „Joc oprit”</span><ArrowUpRight aria-hidden="true" /></Link>}
    </>}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{paused ? "Repornești jocul RPG?" : "Oprești jocul RPG?"}</DialogTitle>
          <DialogDescription>{paused ? "Activitățile de gameplay vor fi repornite pentru serverul selectat." : "Activitățile de gameplay vor fi puse pe pauză pentru serverul selectat."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>Anulează</Button>
          <Button variant={paused ? "default" : "destructive"} onClick={() => void toggle()}>{paused ? "Pornește jocul" : "Oprește jocul"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function ActivityLogSnapshot({ config }: { config: unknown }) {
  const { guildId } = useActiveGuild();
  const { data: logs, loading, error, refetch } = useAuditLogs(guildId, { limit: 6 });
  const enabled = readPath(config, ["activityLog", "enabled"]) === true;
  return <div className="ref-live-data"><h3>Jurnalul serverului</h3><p>{enabled ? "Jurnalizarea este activă în configurația serverului." : "Jurnalizarea este oprită în configurația serverului."}</p>
    {loading ? <div className="ref-inline-loading"><i /> Se citesc evenimentele…</div> : error ? <div className="ref-error" role="alert"><span>{error.message}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>Reîncearcă</Button></div> : logs.length ? <ul>{logs.slice(0, 4).map((log) => <li key={log.id}>{presentAuditLog(log).title} · {new Date(log.createdAt).toLocaleString("ro-RO")}</li>)}</ul> : <p>Nicio înregistrare returnată de API.</p>}
    <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}><RefreshCw aria-hidden="true" /> Reîncarcă jurnalul</Button>
  </div>;
}

function AssistantView() {
  return <div className="ref-assistant-view"><div className="ref-group-head"><div><p className="ref-eyebrow">Ajutor pentru operatori</p><h1>Asistent AI</h1><p>Căutare locală de navigare; nu pretinde acces la un model AI sau la API-ul de configurare.</p></div><span className="ref-group-icon"><Bot aria-hidden="true" /></span></div><OfflineAssistant /></div>;
}

function ReferenceView({ view }: { view: string }) {
  if (view === "acasa") return <OverviewView />;
  if (view === "asistent") return <AssistantView />;
  return <GroupPage view={view} />;
}

export function ReferenceViewRoute() {
  const params = useParams<{ view: string }>();
  return <ReferenceView view={params.view || "acasa"} />;
}

export function ReferenceHomeView() {
  return <ReferenceView view="acasa" />;
}
