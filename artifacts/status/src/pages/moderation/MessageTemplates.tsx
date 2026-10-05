import { ChevronRight } from "lucide-react";
import { Link } from "wouter";

const messageEditors = [
  {
    title: "Intrare și plecare membri",
    description: "Personalizează mesajele din jurnalul membrilor, chiar dacă jurnalizarea este oprită.",
    href: "/config/cazuri-audit#member-join-template",
  },
  {
    title: "Mesaje de moderare",
    description: "Editează titlul și textul din embed-urile de moderare.",
    href: "/config/embeduri#moderation-embed-template",
  },
  {
    title: "Raport zilnic",
    description: "Schimbă textele, titlurile și etichetele statisticilor zilnice.",
    href: "/bot?tab=statistics#daily-stats-template",
  },
  {
    title: "Anunțul parteneriatului",
    description: "Personalizează mesajul publicat când stafful aprobă un parteneriat.",
    href: "/bot?tab=tickets#alliance-announcement-template",
  },
];

export function MessageTemplatesPage() {
  return (
    <div className="max-w-5xl space-y-6 animate-stagger-1">
      <header className="animate-stagger-2">
        <h1 className="text-3xl font-bold mod-heading">Personalizare mesaje</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Alege textul pe care vrei să-l modifici. Fiecare editor deschide direct mesajul potrivit.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {messageEditors.map((editor) => (
          <section key={editor.href} className="flex min-h-40 flex-col justify-between gap-5 rounded-xl border border-border bg-card p-5">
            <div>
              <h2 className="font-semibold">{editor.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{editor.description}</p>
            </div>
            <Link
              href={editor.href}
              className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"
              aria-label={`Deschide editorul: ${editor.title}`}
            >
              Deschide editorul <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}
