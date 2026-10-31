import { useParams } from "wouter";
import { Backpack, PackageOpen, Shield, Sparkles, Swords } from "lucide-react";
import { EmptyState, SectionHeading } from "@/components/game-ui";
import { GuildPage } from "@/components/guild-page";

export default function InventoryPage() {
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId ?? "";
  return <GuildPage>{(overview) => (
    <section>
      <SectionHeading eyebrow="Purtat prin cenușă" title="Inventar" detail="Obiectele salvate pentru personajul tău în această breaslă." />
      {overview.inventory.length === 0 ? <EmptyState title="Inventarul este gol" detail="Nu există obiecte salvate pentru personajul tău în această breaslă." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.inventory.map((item) => {
            const icon = item.itemKey.toLowerCase().includes("armor") || item.itemKey.toLowerCase().includes("armour") ? Shield : item.itemKey.toLowerCase().includes("weapon") ? Swords : Sparkles;
            const Icon = icon;
            return <article key={`${item.itemKey}-${item.level}`} className="rounded-lg border border-border bg-card p-5" data-testid={`item-inventory-${item.itemKey}`}>
              <div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-md bg-secondary text-accent"><Icon className="size-5" /></span><span className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground">Nivel {item.level}</span></div>
              <h2 className="mt-4 font-serif text-2xl">{item.itemKey}</h2>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm"><span className="inline-flex items-center gap-2 text-muted-foreground"><Backpack className="size-4" /> Cantitate</span><span className="font-mono">{item.quantity}</span></div>
            </article>;
          })}
        </div>
      )}
      <div className="mt-8 flex items-center gap-3 rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground"><PackageOpen className="size-5 shrink-0 text-accent" /><p>Inventarul reflectă obiectele raportate de jocul breslei. Gestionarea obiectelor rămâne în regulile existente ale jocului.</p></div>
      <span className="sr-only" data-testid={`text-inventory-guild-${guildId}`}>Inventarul breslei</span>
    </section>
  )}</GuildPage>;
}
