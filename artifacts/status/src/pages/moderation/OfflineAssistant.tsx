import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Bot, Search, ShieldCheck } from "lucide-react";
import { Input } from "../../components/ui/input";

const helperLinks = [
  { title: "Activează protecția AutoMod", detail: "Deschide filtrarea mesajelor, linkurilor și cuvintelor.", href: "/automod", words: "automod filtru protectie" },
  { title: "Configurează moderarea AI", detail: "Alege categoriile și sensibilitatea analizei AI.", href: "/ai", words: "ai judge judecator" },
  { title: "Setează sancțiunile", detail: "Escaladarea, comenzile staff-ului, rolurile protejate și programul.", href: "/sanctiuni", words: "sanctiuni sancțiuni escaladare comenzi staff warn mute ban roluri canale program noapte" },
  { title: "Găsește cazurile deschise", detail: "Consultă dosarele și istoricul intervențiilor.", href: "/cazuri", words: "cazuri dosare sancțiuni" },
  { title: "Gestionează verificarea membrilor", detail: "Canalul panoului, rolul standard și rolurile în plus.", href: "/verificare", words: "verificare membri roluri categorie panou" },
  { title: "Verifică membri manual", detail: "Bifezi membri sau pe toți și le dai rolul de verificare și rolurile lipsă.", href: "/verificare/membri", words: "verificare manuala membri roluri lipsa bifeaza toti" },
  { title: "Configurează tichetele", detail: "Aplicații staff, parteneriate, ajutor, contestații și termenele.", href: "/tichete", words: "tichete tickets aplicatii parteneriate ajutor contestatii termene" },
  { title: "Setează canalele botului", detail: "Alege destinațiile Discord existente.", href: "/canale", words: "canale bot destination" },
  { title: "Deschide setările serverului", detail: "Module și configurații avansate.", href: "/config", words: "setari config" },
];

export function OfflineAssistant() {
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ro");
    return helperLinks.filter((item) => !term || `${item.title} ${item.detail} ${item.words}`.toLocaleLowerCase("ro").includes(term));
  }, [query]);

  return <section className="oracle-assistant" aria-labelledby="assistant-title">
    <header className="oracle-assistant-head"><span className="oracle-assistant-mark"><Bot aria-hidden="true" /></span><div><p className="oracle-eyebrow">Ajutor pentru operatori</p><h1 id="assistant-title">Asistentul Oracolului</h1><p>Ajutor offline pentru navigarea în panou. Nu este conectat la un model AI și nu modifică setările.</p></div></header>
    <div className="oracle-assistant-card">
      <div className="oracle-offline-notice"><ShieldCheck aria-hidden="true" /><span><b>Mod navigare offline</b><small>Claude host integration nu este disponibilă aici. Căutarea rămâne pe dispozitiv.</small></span></div>
      <label className="oracle-assistant-search"><span>Cum te pot ajuta să găsești?</span><span className="oracle-search-field"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. configurează anti-raid" aria-label="Caută în ajutorul offline" data-testid="input-assistant-search" /></span></label>
      <h2>Pagini potrivite</h2>
      <div className="oracle-helper-results">{suggestions.map((item) => <Link key={item.href} href={item.href} data-testid={`assistant-link-${item.href.slice(1) || "overview"}`}><span><b>{item.title}</b><small>{item.detail}</small></span><ArrowRight aria-hidden="true" /></Link>)}
        {!suggestions.length && <p role="status">Nu am găsit o pagină potrivită. Încearcă o altă expresie sau folosește căutarea globală.</p>}
      </div>
    </div>
  </section>;
}
