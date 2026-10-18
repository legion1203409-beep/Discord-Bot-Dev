import { useState } from "react";

const doors = [
  { name: "Ușa felinarului", symbol: "✦", flavor: "Lumina felinarului dansează pe pereți." },
  { name: "Ușa craniului", symbol: "◈", flavor: "Craniul de pe ușă clănțăne în urma ta." },
  { name: "Ușa pânzei", symbol: "⌁", flavor: "Firele de pânză se strâng, apoi se destramă." },
];

const outcomes = [
  {
    title: "Cutia cu bomboane",
    detail: "Ai găsit o cutie ascunsă sub praful vechi.",
    candies: 8,
    points: 7,
    chance: 0.1,
    tone: "gold",
  },
  {
    title: "Umbra prietenoasă",
    detail: "O umbră îți lasă câteva bomboane pe prag.",
    candies: 5,
    points: 4,
    chance: 0.25,
    tone: "gold",
  },
  {
    title: "Ecoul casei",
    detail: "Ecoul îți dă curaj, dar nicio bomboană.",
    candies: 0,
    points: 2,
    chance: 0.35,
    tone: "quiet",
  },
  {
    title: "Păianjenul șugubăț",
    detail: "Un păianjen îți fură o bomboană și fuge râzând.",
    candies: -1,
    points: 1,
    chance: 0.2,
    tone: "quiet",
  },
  {
    title: "Umbra lacomă",
    detail: "O umbră îți smulge două bomboane din palmă și dispare prin perete.",
    candies: -2,
    points: 0,
    chance: 0.1,
    tone: "quiet",
  },
];

type Outcome = (typeof outcomes)[number];

function rollOutcome(): Outcome {
  const roll = Math.random();
  let threshold = 0;
  return outcomes.find((outcome) => {
    threshold += outcome.chance;
    return roll < threshold;
  }) ?? outcomes[outcomes.length - 1]!;
}

export function DiscordEvent() {
  const [selectedDoor, setSelectedDoor] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [entered, setEntered] = useState(false);
  const [score, setScore] = useState({ points: 0, candies: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [eventPhase, setEventPhase] = useState<"open" | "resting">("open");

  function chooseDoor(index: number) {
    const result = rollOutcome();
    setSelectedDoor(index);
    setOutcome(result);
    setScore((current) => ({
      points: current.points + result.points,
      candies: Math.max(0, current.candies + result.candies),
    }));
  }

  function simulateNextAttempt() {
    setAttempt((current) => current + 1);
    setSelectedDoor(null);
    setOutcome(null);
  }

  function restartPreview() {
    setAttempt(1);
    setSelectedDoor(null);
    setOutcome(null);
    setScore({ points: 0, candies: 0 });
    setEventPhase("open");
    setEntered(false);
  }

  function simulateClose() {
    setSelectedDoor(null);
    setOutcome(null);
    setEventPhase("resting");
  }

  return (
    <main className="min-h-screen bg-[#17181b] px-4 py-6 text-[#dbdee1] sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c79a5d]">Previzualizare interactivă</p>
            <h1 className="font-['DM_Sans'] text-2xl font-semibold tracking-tight text-[#f2eee7] sm:text-3xl">O noapte la Castelul Bântuit</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#9b9ca2]">Așa arată experiența unui jucător în Discord. Apasă o ușă ca să vezi un rezultat posibil.</p>
          </div>
          <button
            type="button"
            onClick={restartPreview}
            className="rounded-md border border-[#46454a] px-3 py-2 text-xs font-semibold text-[#d6d1c9] transition hover:border-[#a67d4d] hover:bg-[#29272a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1a568]"
          >
            Reia simularea
          </button>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="overflow-hidden rounded-xl border border-[#37383d] bg-[#25262a] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <header className="flex min-h-[62px] items-center gap-3 border-b border-[#35363b] px-4 sm:px-5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#3b3025] text-sm font-bold text-[#d7ae76]" aria-hidden="true">#</span>
              <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-[#f2eee7]">chat-joc</h2>
                <p className="text-[11px] text-[#96979e]">Conversația jocului · Castelul Bântuit</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${eventPhase === "open" ? "border-[#475548] bg-[#27322a] text-[#a8c19f]" : "border-[#5a4934] bg-[#30291f] text-[#d0a76d]"}`}>
                <span className={`size-1.5 rounded-full ${eventPhase === "open" ? "bg-[#9ab58d]" : "bg-[#d0a76d]"}`} />
                {eventPhase === "open" ? "Deschis · 10:00" : "Pauză · 2–4 h"}
              </span>
            </header>

            <div className="flex min-h-[460px] flex-col justify-end gap-5 px-4 py-6 sm:px-7">
              <article className="mx-auto w-full max-w-[510px] rounded-lg border border-[#514330] bg-[#30291f] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#d0a76d]">Castelul Bântuit · deschis 10 minute</p>
                <p className="mt-1 text-sm leading-6 text-[#e4e1dc]">Intră în castel și alege una dintre cele trei uși.</p>
                <button
                  type="button"
                  onClick={() => setEntered(true)}
                  className="mt-2 rounded-md bg-[#5865f2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1a568]"
                >
                  Intră în casă
                </button>
              </article>

              <div className="self-center rounded-full bg-[#303136] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#aaaab0]">
                Canal de chat · povestea AI este publică în conversație
              </div>

              <article className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#59442b] bg-[#392d21] text-sm font-bold text-[#dfbb82]" aria-hidden="true">OC</div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#f2eee7]">Oracolul Cenușii</span>
                    <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">BOT</span>
                    <time className="text-[10px] text-[#8d8e95]">22:00 · poveste din chat</time>
                  </div>
                  <div className="max-w-[510px] rounded-r-lg rounded-bl-lg border-l-[3px] border-[#76634d] bg-[#303136] px-4 py-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#c9ab80]">Șoapta horror · AI · la fiecare 2 ore</p>
                    <p className="text-sm leading-6 text-[#e4e1dc]">„La etaj, o ușă se închide încet. Pe clanță rămâne o urmă de cenușă, încă fierbinte.”</p>
                  </div>
                </div>
              </article>

              {entered && <div className="self-center rounded-full bg-[#303136] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#aaaab0]">
                Următoarea alegere · mesaj privat
              </div>}

              {entered && (
              <article className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#59442b] bg-[#392d21] text-sm font-bold text-[#dfbb82]" aria-hidden="true">OC</div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#f2eee7]">Oracolul Cenușii</span>
                    <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">BOT</span>
                    <time className="text-[10px] text-[#8d8e95]">acum</time>
                  </div>

                  {eventPhase === "resting" ? (
                    <div className="max-w-[510px] rounded-r-lg rounded-bl-lg border-l-[3px] border-[#82705b] bg-[#303136] px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c9ab80]">Castelul s-a închis</p>
                      <p className="mt-2 text-sm leading-6 text-[#e4e1dc]">🕯️ Cele 10 minute s-au încheiat. Scorurile rămân păstrate pentru clasamentul final.</p>
                      <div className="mt-3 rounded-md border border-[#49433a] bg-[#292a2f] px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#aaaab0]">Următoarea apariție</p>
                        <p className="mt-1 text-sm font-semibold text-[#f0ece5]">Aleatoriu, în 2–4 ore</p>
                        <p className="mt-1 text-[10px] text-[#898a91]">Exemplu vizual: aproximativ 2 h 37 min.</p>
                      </div>
                      <button type="button" onClick={restartPreview} className="mt-3 rounded-md border border-[#655039] bg-[#403426] px-3 py-2 text-xs font-semibold text-[#e5c798] transition hover:bg-[#4d3e2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1a568]">Simulează următoarea apariție</button>
                    </div>
                  ) : selectedDoor === null ? (
                    <div className="max-w-[510px] rounded-r-lg rounded-bl-lg border-l-[3px] border-[#bd8f54] bg-[#303136] px-4 py-4">
                       <div className="mb-3 flex items-center justify-between gap-3">
                         <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cea56f]">Explorare · încercarea {attempt}/3</span>
                         <span className="font-mono text-[10px] text-[#e0bd8b]">10:00 rămase</span>
                      </div>
                      <p className="text-sm leading-6 text-[#e4e1dc]">🚪 Trei uși se deschid spre întuneric. Alege una; fantoma îți va lăsa o narațiune și un indiciu.</p>
                      <div className="mt-4 grid gap-2">
                        {doors.map((door, index) => (
                          <button
                            key={door.name}
                            type="button"
                            onClick={() => chooseDoor(index)}
                            className="group flex min-h-11 items-center gap-3 rounded-md border border-[#48494f] bg-[#3a3b41] px-3 text-left text-sm font-medium text-[#e8e5df] transition duration-150 hover:-translate-y-0.5 hover:border-[#a77b49] hover:bg-[#454247] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1a568]"
                          >
                            <span className="flex size-7 items-center justify-center rounded bg-[#4b4034] text-sm text-[#d9b984]" aria-hidden="true">{door.symbol}</span>
                            <span className="flex-1">{door.name}</span>
                            <span className="text-xs text-[#83848b] transition group-hover:translate-x-0.5 group-hover:text-[#d1aa75]" aria-hidden="true">→</span>
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-[10px] leading-5 text-[#86878e]">Ai maximum 3 încercări. Între două alegeri există o pauză de 30 de secunde.</p>
                       <button type="button" onClick={simulateClose} className="mt-3 text-[10px] font-medium text-[#aaa6a0] underline decoration-[#66636a] underline-offset-2 hover:text-white">Simulează închiderea după 10 minute</button>
                    </div>
                  ) : (
                    <div className="max-w-[510px] rounded-r-lg rounded-bl-lg border-l-[3px] border-[#bd8f54] bg-[#303136] px-4 py-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#cea56f]">Rezultatul încercării {attempt}/3</span>
                        <button type="button" onClick={restartPreview} className="text-[10px] font-medium text-[#aaa6a0] underline decoration-[#66636a] underline-offset-2 hover:text-white">Resetează</button>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#cbb18a]">Șoapta fantomei · AI</span>
                        <span className="rounded-full border border-[#4b4337] bg-[#39332a] px-2 py-0.5 text-[9px] text-[#c7ad82]">narațiune, nu scor</span>
                      </div>
                      <p className="text-sm leading-6 text-[#e4e1dc]">👻 <strong className="text-[#f4eee4]">Fantoma șoptește:</strong> {selectedDoor === 0 ? "Flacăra felinarului se apleacă spre tine." : selectedDoor === 1 ? "Craniul își deschide fălcile fără glas." : "Pânza se leagănă, deși aerul stă nemișcat."} Un pas ușor răsună în întuneric.</p>
                      <div className="my-3 border-t border-[#46474d]" />
                      <p className="text-sm leading-6 text-[#e4e1dc]">🚪 <strong className="text-[#f4eee4]">{doors[selectedDoor].name}</strong> — {outcome?.detail} {doors[selectedDoor].flavor}</p>
                      <div className={`mt-3 rounded-md px-3 py-2.5 ${outcome?.tone === "gold" ? "bg-[#403628]" : "bg-[#292a2f]"}`}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#c8a776]">{outcome?.title}</p>
                         <p className="mt-1 text-sm text-[#e7e3dc]">🍬 Bomboane: <strong className="text-white">{outcome && outcome.candies > 0 ? "+" : ""}{outcome?.candies}</strong><span className="mx-2 text-[#77777e]">·</span>🎃 Puncte: <strong className="text-white">+{outcome?.points}</strong></p>
                      </div>
                      <div className="mt-3 rounded-md border border-[#414248] bg-[#292a2f] px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#aaaab0]">Totalul tău în acest eveniment</p>
                        <p className="mt-1 text-sm font-semibold text-[#f0ece5]">{score.points} puncte <span className="mx-1 text-[#76777e]">·</span> {score.candies} bomboane</p>
                        <p className="mt-1 text-[10px] text-[#898a91]">Încercarea {attempt} din 3</p>
                      </div>
                      {attempt < 3 ? (
                        <div className="mt-3 rounded-md border border-[#45434a] bg-[#29282c] p-3">
                          <p className="text-xs leading-5 text-[#b4b0a9]">În Discord, următoarea alegere devine disponibilă după 30 de secunde.</p>
                          <button type="button" onClick={simulateNextAttempt} className="mt-2 text-xs font-semibold text-[#d7b17b] underline decoration-[#826847] underline-offset-2 hover:text-[#f0d5ac]">Continuă simularea după pauză →</button>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-md bg-[#292a2f] px-3 py-2.5 text-xs leading-5 text-[#b8b5ae]">Ai folosit toate cele trei încercări. Scorul rămâne în clasamentul evenimentului.</p>
                      )}
                    </div>
                  )}
                </div>
              </article>
              )}
            </div>

            <footer className="border-t border-[#35363b] px-4 py-3 text-center text-[10px] leading-5 text-[#888990] sm:px-5">
              Exemplu de interacțiune · recompensele sunt aleatorii; rezultatul din simulare nu se trimite în Discord.
            </footer>
          </section>

          <aside className="space-y-3">
            <section className="rounded-xl border border-[#37383d] bg-[#25262a] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c79a5d]">Cum funcționează</p>
              <ol className="mt-4 space-y-4">
                {[
                  ["01", "Intrarea", "Jucătorul apasă „Intră în casă” în anunțul public."],
                  ["02", "Alegerea", "Primește mesajul privat și alege una dintre cele 3 uși."],
                  ["03", "Rezultatul", "Fantoma spune o poveste; bomboanele și punctele intră în scor."],
                  ["04", "Clasamentul", "O singură postare se actualizează automat după fiecare rezultat și devine finală la închidere."],
                ].map(([number, title, description]) => (
                  <li key={number} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-[10px] text-[#bc9565]">{number}</span>
                    <div>
                      <p className="text-xs font-semibold text-[#ebe7df]">{title}</p>
                      <p className="mt-1 text-[11px] leading-[1.6] text-[#9999a0]">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-[#37383d] bg-[#25262a] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c79a5d]">Când apare clasamentul?</p>
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-[#45464c] bg-[#2d2e33] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#bda17b]">Se actualizează automat</p>
                  <p className="mt-1 text-xs leading-5 text-[#e1ded8]">Un singur mesaj în canalul configurat se editează după fiecare rezultat; nu trebuie folosită o comandă pentru clasament.</p>
                </div>
                <div className="rounded-md border border-[#514330] bg-[#30291f] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#d0a76d]">La închiderea evenimentului</p>
                  <p className="mt-1 text-xs leading-5 text-[#e1d6c5]">După 10 minute, clasamentul final se publică automat în canalul configurat. Evenimentul revine apoi după o pauză aleatorie de 2–4 ore.</p>
                </div>
                <div className="rounded-md border border-[#45464c] bg-[#292a2f] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#aaaab0]">Exemplu de clasament live</p>
                  <p className="mt-2 text-xs leading-5 text-[#e4e1dc]"><strong className="text-white">1.</strong> Mara — 14 puncte · 6 bomboane</p>
                  <p className="text-xs leading-5 text-[#e4e1dc]"><strong className="text-white">2.</strong> Vlad — 9 puncte · 3 bomboane</p>
                  <p className="text-[10px] leading-5 text-[#85868d]">Nume și scoruri demonstrative.</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#5a4934] bg-[#30291f] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d0a76d]">AI-ul fantomei</p>
               <p className="mt-1 text-[10px] uppercase tracking-wide text-[#b7a88f]">mesaj obișnuit în chat · la 2 ore</p>
               <p className="mt-3 text-xs leading-[1.7] text-[#e1d6c5]">Oracolul lasă o poveste horror direct în conversația jocului. Nu este postare în canalul de anunțuri, nu dă puncte și nu schimbă bomboanele.</p>
               <p className="mt-2 rounded-md border border-[#514330] bg-[#29251f] px-3 py-2 text-[10px] leading-[1.6] text-[#b7a88f]">Alegerea unei uși primește în continuare propria narațiune AI, în răspunsul privat al jucătorului.</p>
            </section>

            <section className="rounded-xl border border-[#5a4934] bg-[#30291f] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d0a76d]">Ritmul evenimentului</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[#e1d6c5]">Casa rămâne deschisă</span>
                  <span className="font-mono text-xs font-semibold text-[#f0d2a3]">10 minute</span>
                </div>
                <div className="h-px bg-[#514330]" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[#e1d6c5]">Pauză până reapare</span>
                  <span className="font-mono text-xs font-semibold text-[#f0d2a3]">2–4 ore</span>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-[1.6] text-[#b7a88f]">
                După închidere, următorul interval se alege aleatoriu. Simularea arată stările; programarea automată nu este încă implementată în bot.
              </p>
              <p className="mt-2 text-[10px] leading-[1.6] text-[#b7a88f]">
                Pornirea manuală rămâne disponibilă din panou sau cu <span className="font-mono text-[#f0d2a3]">/casabantuita start</span>.
              </p>
            </section>

            <section className="rounded-xl border border-[#37383d] bg-[#25262a] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c79a5d]">Rezultate posibile</p>
              <div className="mt-3 space-y-2">
                {outcomes.map((item) => (
                  <div key={item.title} className="flex items-center justify-between gap-3 border-b border-[#38393e] pb-2 last:border-0 last:pb-0">
                    <span className="text-[11px] text-[#c8c5bf]">{item.title}</span>
                    <span className="whitespace-nowrap font-mono text-[10px] text-[#b9a27f]">{item.points} pct · {item.chance * 100}%</span>
                  </div>
                ))}
              </div>
               <p className="mt-3 text-[10px] leading-5 text-[#81828a]">Fiecare ușă trage un rezultat aleatoriu: poți câștiga bomboane, găsi zero sau pierde 1–2. Scorul de bomboane nu scade sub zero.</p>
            </section>

            <div className="rounded-lg border border-[#5a4934] bg-[#30291f] px-3.5 py-3">
              <p className="text-[11px] font-semibold text-[#e1c18f]">Aceasta este doar o simulare vizuală.</p>
              <p className="mt-1 text-[10px] leading-5 text-[#b7a88f]">Butoanele demonstrează fluxul. Nu pornesc evenimentul real, nu cronometrează și nu modifică scoruri.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
