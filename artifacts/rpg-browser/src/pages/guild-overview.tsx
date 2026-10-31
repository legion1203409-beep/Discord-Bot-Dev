import { Link } from "wouter";
import { Backpack, BookOpen, Coins, Heart, Shield, Skull, Swords } from "lucide-react";
import type { GameOverview } from "@workspace/api-client-react";
import { EmptyState, RankBadge, SectionHeading, Stat } from "@/components/game-ui";
import { GuildPage } from "@/components/guild-page";

function OverviewContent({ overview, guildId }: { overview: GameOverview; guildId: string }) {
  const player = overview.player;
  const encounter = overview.encounter;
  return (
    <div>
      <SectionHeading eyebrow="Foaia de personaj" title={player.username} detail="Starea personajului tău în această breaslă, sincronizată cu cronica jocului." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Experiență" value={player.xp} icon={Shield} />
        <Stat label="Oboli" value={player.gold} icon={Coins} />
        <Stat label="Reputație" value={player.reputation} icon={BookOpen} />
        <Stat label="Clasă" value={player.class ?? "Nealeasă"} icon={Swords} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">Starea eroului</p><h2 className="mt-1 font-serif text-2xl">Călător de nivel {player.classLevel}</h2></div><RankBadge label={`Limită nivel ${player.maxLevel}`} /></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Stat label="Puncte de viață" value={player.hp} icon={Heart} />
            <Stat label="Mană" value={player.mana} icon={Heart} />
            <Stat label="Morți" value={player.deaths} icon={Skull} />
            <Stat label="Retrageri" value={player.retreats} icon={Shield} />
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">Echipare</p><h2 className="mt-1 font-serif text-2xl">La îndemână</h2></div><Backpack className="size-5 text-accent" /></div>
          <dl className="mt-5 divide-y divide-border">
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">Armă</dt><dd className="text-right">{player.equippedWeapon ?? "Nimic echipat"}</dd></div>
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">Armură</dt><dd className="text-right">{player.equippedArmor ?? "Nicio armură echipată"}</dd></div>
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">Bonusuri de luptă</dt><dd className="text-right">Atac {player.attackBonus} · Apărare {player.defenseBonus} · Eschivă {player.dodgeBonus} · Critic {player.critBonus}</dd></div>
          </dl>
          <Link href={`/guild/${guildId}/inventory`} className="mt-2 inline-flex items-center gap-2 text-sm text-primary no-underline hover:underline" data-testid="link-open-inventory">Deschide inventarul <Backpack className="size-4" /></Link>
        </section>
      </div>
      <section className="mt-5 rounded-lg border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-widest text-accent">Întâlnirea breslei</p><h2 className="mt-1 font-serif text-2xl">{encounter ? encounter.type : "Nicio întâlnire activă"}</h2></div>{encounter && <Link href={`/guild/${guildId}/combat`} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground no-underline" data-testid="link-open-combat"><Swords className="size-4" /> Vezi confruntarea</Link>}</div>
        <div className="mt-4">{encounter ? <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3"><p>Stare: <span className="text-foreground">{encounter.joined ? "Ești alăturat" : encounter.canJoin ? "Poți intra" : "Nu te poți alătura"}</span></p><p>Atac: <span className="text-foreground">{encounter.canAttack ? "Disponibil" : "Indisponibil"}</span></p><p>Expiră: <span className="text-foreground">{new Date(encounter.expiresAt).toLocaleString()}</span></p></div> : <EmptyState title="Liniște în cenușă" detail="Nu există o întâlnire activă pentru această breaslă în acest moment." />}</div>
      </section>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Link href={`/guild/${guildId}/missions`} className="flex items-center justify-between rounded-lg border border-border bg-card p-5 text-foreground no-underline hover:border-primary/50" data-testid="link-open-missions"><span><span className="block font-mono text-xs uppercase tracking-widest text-accent">Obiectivele zilei</span><span className="mt-1 block font-serif text-2xl">Misiunile breslei</span></span><BookOpen className="size-5 text-primary" /></Link>
        <Link href={`/guild/${guildId}/inventory`} className="flex items-center justify-between rounded-lg border border-border bg-card p-5 text-foreground no-underline hover:border-primary/50" data-testid="link-open-bag"><span><span className="block font-mono text-xs uppercase tracking-widest text-accent">Obiecte salvate</span><span className="mt-1 block font-serif text-2xl">{overview.inventory.length} intrări în inventar</span></span><Backpack className="size-5 text-primary" /></Link>
      </div>
    </div>
  );
}

export default function GuildOverviewPage() {
  return <GuildPage>{(overview, guildId) => <OverviewContent overview={overview} guildId={guildId} />}</GuildPage>;
}
