import { Link } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { PageFrame } from "@/components/game-ui";

export default function NotFound() {
  return <PageFrame><main className="mx-auto grid max-w-xl content-center py-24 text-center">
    <Compass className="mx-auto size-10 text-accent" />
    <p className="mt-5 font-mono text-xs uppercase tracking-widest text-accent">Drum necunoscut</p>
    <h1 className="mt-2 font-serif text-4xl">Pagina nu se află în cronică</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Adresa nu corespunde unei pagini disponibile în această lume.</p>
    <Button asChild className="mx-auto mt-6" variant="outline"><Link href="/" data-testid="link-not-found-home"><ArrowLeft /> Înapoi la intrare</Link></Button>
  </main></PageFrame>;
}
