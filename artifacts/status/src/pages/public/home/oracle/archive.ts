/**
 * „Arhiva Oracolului”: răspunsurile scrise dinainte, pe care Oracolul le dă
 * vizitatorilor paginii. Alege răspunsul după cuvinte-cheie și completează
 * cifrele din datele reale ale serverului. Nu inventează nimic: ce nu știe,
 * trimite la staff.
 */
import { countLabel, fmt } from "../format";

export interface OracleFacts {
  members: number | null;
  online: number | null;
  /** Invitația fără https://, ca în pagină: discord.gg/regatulcenusii */
  inviteLabel: string;
  /** Ultimul raport zilnic, dacă a putut fi citit. */
  report: null | {
    dayLabel: string;
    messages: number;
    uniqueUsers: number;
    joins: number;
    leaves: number;
    boosts: number;
    peakVoice: number;
    topChannels: Array<{ name: string; messages: number }>;
  };
  recruitment: "active" | "inactive" | "unknown";
}

export const SUGGESTIONS = [
  "Ce face Oracolul pe server?",
  "Cum intru în comunitate?",
  "Cât de activ e serverul?",
  "Cum funcționează jocul RPG?",
  "Spune-mi o profeție",
] as const;

export const GREETING =
  "Bine ai venit în **Regatul Cenușii**. Sunt Oracolul, botul serverului. Întreabă-mă ce fac pe Discord, cum intri în comunitate sau cere-mi o profeție.";

export const THINKING = [
  "Oracolul privește în cenușă…",
  "Oracolul răsfoiește cronicile…",
  "Jarul se aprinde…",
  "Oracolul ascultă vântul din turn…",
] as const;

const PROPHECIES = [
  "Jarul de sub cenușă e încă viu. Un cuvânt spus azi poate aprinde o prietenie care ține mult.",
  "Vântul din turn aduce vești bune. Cine întinde primul mâna găsește ușa deschisă.",
  "Runa Sowilo strălucește peste tine: drumul de azi e mai scurt decât pare.",
  "Văd o masă lungă și multe voci. Fă-ți loc la ea, scaunul e și al tău.",
  "Cenușa se așază, focul rămâne. Ce ai lăsat neterminat te așteaptă cu răbdare.",
  "O scânteie mică pornește un foc mare. Azi, curiozitatea ta e scânteia.",
  "Runele tac, dar nu dorm. Răspunsul pe care îl cauți vine dintr-o conversație neașteptată.",
  "Drumul spre regat e luminat. Pășește fără grabă: cine vine încet rămâne mult.",
];

export function prophecy(random: () => number = Math.random): string {
  return "**Profeția ta:** " + PROPHECIES[Math.floor(random() * PROPHECIES.length)];
}

/** Fără diacritice, litere mici: „Profeție” și „profetie” se potrivesc la fel. */
export function normalize(question: string): string {
  return String(question)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function activity(facts: OracleFacts): string {
  const people =
    facts.members == null
      ? "Numărul de membri nu mi-e la îndemână chiar acum."
      : `Regatul are **${countLabel(facts.members, "membru", "membri")}**` +
        (facts.online == null ? "." : `, iar acum sunt cam **${fmt(facts.online)} online**.`);
  const r = facts.report;
  if (!r) return people + " Raportul zilnic nu e disponibil acum.";
  const top = r.topChannels[0];
  const where = top ? `, cele mai multe în #${top.name}` : "";
  return (
    `${people} În raportul din ${r.dayLabel} s-au scris **${countLabel(r.messages, "mesaj", "mesaje")}**${where}, ` +
    `și au fost activi ${countLabel(r.uniqueUsers, "membru", "membri")}.`
  );
}

function recruitment(facts: OracleFacts): string {
  if (facts.recruitment === "active") {
    return "Programul de recrutare prin recomandări e activ acum. Clasamentul public îl găsești mai jos, în secțiunea Recrutare.";
  }
  if (facts.recruitment === "inactive") return "Programul de recrutare prin recomandări nu e activ acum.";
  return "Nu pot vedea acum starea programului de recrutare. Staff-ul îți spune pe Discord.";
}

function joining(facts: OracleFacts): string {
  const top = facts.report?.topChannels[0];
  const start = top
    ? `începe cu un salut în #${top.name}, acolo a fost cea mai multă viață în ultimul raport.`
    : "începe cu un salut, comunitatea te primește.";
  return `Intră prin invitația **${facts.inviteLabel}** și ${start}`;
}

/** Răspunsul din arhivă la o întrebare. */
export function answer(question: string, facts: OracleFacts, random: () => number = Math.random): string {
  const n = normalize(question);
  const has = (...words: string[]) => words.some((w) => n.includes(w));

  if (has("profet", "runa", "rune", "noroc", "viitor", "soarta", "prezic", "horoscop")) return prophecy(random);
  if (has("rpg", "joc", "clasa", "clase", "oboli", "boss", "misiun", "relicv", "cufar", "companion", "aventur", "nivel")) {
    return "Oracolul ține un joc RPG chiar pe Discord:\n- **Eroi**: profiluri, clase, companioni, inventar și echipamente\n- **Progres**: niveluri, experiență și moneda **Oboli**\n- **Aventură**: magazin, misiuni zilnice, cufăr, chei și relicve\n- **Zi de zi**: seria zilnică (bonus la cufăr pentru zile la rând) și realizări cu insigne (`/realizari`)\n- **Lupte**: evenimente de luptă, boss și clasamente\n\nPe ce canale se joacă hotărăște staff-ul serverului.";
  }
  if (has("comand", "comenz", "slash")) {
    return "Comenzile de moderare ale Oracolului sunt pentru staff: `/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/nick`, `/role` și `/moderare login`. Despre celelalte funcții te lămurește staff-ul pe Discord.";
  }
  if (has("verific", "tichet", "ticket", "ajutor", "raportez", "contest", "parteneri", "alianta", "aplic", "staff")) {
    return "Prin Oracol poți deschide tichete: **ajutor și raportări**, **contestații** pentru o sancțiune, **cereri de parteneriat** și **aplicații de staff**. Membrii noi trec printr-o **verificare** scurtă. Unde le găsești pe server îți spune staff-ul.";
  }
  if (has("moder", "regul", "ban", "warn", "mute", "spam", "raid", "scam", "sanctiun", "pedeaps")) {
    return "Oracolul păzește regatul cu **AutoMod** (cuvinte interzise, linkuri, scamuri, prea multe emoji sau mențiuni), cu **anti-spam**, **anti-flood** și **anti-raid**, și cu **Oracolul Judecător**, o moderare cu AI. Sancțiunile pot crește treptat și fiecare rămâne într-un dosar. Regulile exacte ți le spune staff-ul.";
  }
  // „Recrutare” înaintea „activ”: „e activ programul de recrutare?” e o întrebare despre recrutare.
  if (has("recrut", "recomand")) return recruitment(facts);
  if (has("activ", "statist", "membri", "online", "mesaje", "cati ", "cate ")) return activity(facts);
  if (has("intru", "intra ", "intrare", "invit", "link", "alatur", "discord", "cum ajung")) return joining(facts);
  if (has("salut", "buna", "hey", "hello", "neata", "servus", "ciao")) {
    return "Bine te-am găsit, călătorule. Întreabă-mă despre comunitate, despre ce face botul sau cere-mi o profeție.";
  }
  if (has("cine esti", "ce esti", "ce faci", "ce stii", "ce poti", "oracol", "bot")) {
    return "Sunt **Oracolul Cenușii**, botul regatului. Pe Discord păzesc serverul, țin jocul RPG, deschid tichete, verific membrii noi și răspund când sunt întrebat. Aici îți spun ce se întâmplă în comunitate sau îți citesc o profeție.";
  }
  return "Arhiva mea nu are încă un răspuns la asta. Întreabă-mă despre **comunitate**, despre **ce face botul**, despre **jocul RPG** sau cere-mi o **profeție**. Pentru restul te ajută staff-ul pe Discord.";
}
