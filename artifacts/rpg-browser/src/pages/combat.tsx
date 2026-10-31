import { useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { GameLevelUpInputBonus, getGetGameOverviewQueryKey, useAttackGameEncounter, useChooseGameLevelUp, useJoinGameEncounter } from "@workspace/api-client-react";
import type { GameAttackResponse, GameLevelUpInputBonus as LevelBonus, GameOverview } from "@workspace/api-client-react";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { AlertTriangle, ArrowDown, ArrowUp, Clock3, Flame, Heart, Shield, Swords, Trophy } from "lucide-react";
import { EmptyState, SectionHeading } from "@/components/game-ui";
import { GuildPage, updateGuildOverview } from "@/components/guild-page";

const levelChoices: { value: LevelBonus; label: string }[] = [
  { value: GameLevelUpInputBonus.xp, label: "Experiență" },
  { value: GameLevelUpInputBonus.dodge, label: "Eschivă" },
  { value: GameLevelUpInputBonus.attack, label: "Atac" },
  { value: GameLevelUpInputBonus.hp, label: "Puncte de viață" },
  { value: GameLevelUpInputBonus.crit, label: "Lovitură critică" },
];

function CombatContent({ guildId, overview, csrfToken }: { guildId: string; overview: GameOverview; csrfToken: string }) {
  const queryClient = useQueryClient();
  const csrfRequest = { request: { headers: { "X-CSRF-Token": csrfToken } } };
  const join = useJoinGameEncounter(csrfRequest);
  const attack = useAttackGameEncounter(csrfRequest);
  const chooseLevel = useChooseGameLevelUp(csrfRequest);
  const [lastResult, setLastResult] = useState<GameAttackResponse["result"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const joinKey = useRef<string | null>(null);
  const attackKey = useRef<string | null>(null);
  const encounter = overview.encounter;
  const participant = encounter?.participant;
  const busy = join.isPending || attack.isPending || chooseLevel.isPending || refreshing;
  const recoverState = (key: { current: string | null }) => {
    setRefreshing(true);
    void queryClient.invalidateQueries({ queryKey: getGetGameOverviewQueryKey(guildId) }).finally(() => {
      key.current = null;
      setRefreshing(false);
    });
  };

  const joinEncounter = () => {
    if (!encounter || !encounter.canJoin) return;
    joinKey.current ??= crypto.randomUUID();
    join.mutate({ guildId, eventId: encounter.id, data: { idempotencyKey: joinKey.current } }, {
      onSuccess: (refreshed) => {
        joinKey.current = null;
        updateGuildOverview(queryClient, guildId, refreshed);
      },
      onError: () => recoverState(joinKey),
    });
  };

  const attackEncounter = () => {
    if (!encounter || !encounter.canAttack) return;
    attackKey.current ??= crypto.randomUUID();
    setLastResult(null);
    attack.mutate({ guildId, eventId: encounter.id, data: { idempotencyKey: attackKey.current } }, {
      onSuccess: (response) => {
        attackKey.current = null;
        updateGuildOverview(queryClient, guildId, response.overview);
        setLastResult(response.result);
      },
      onError: () => recoverState(attackKey),
    });
  };

  const chooseBonus = (bonus: LevelBonus) => {
    if (!encounter) return;
    chooseLevel.mutate({ guildId, eventId: encounter.id, data: { bonus } }, {
      onSuccess: (refreshed) => updateGuildOverview(queryClient, guildId, refreshed),
      onError: () => {
        setRefreshing(true);
        void queryClient.invalidateQueries({ queryKey: getGetGameOverviewQueryKey(guildId) })
          .finally(() => setRefreshing(false));
      },
    });
  };

  if (!encounter) return <section><SectionHeading eyebrow="Întâlnirea activă" title="Confruntare" detail="Alătură-te întâlnirii active a breslei și acționează conform stării serverului." /><EmptyState title="Nu există o întâlnire activă" detail="Nu este disponibilă nicio confruntare pentru această breaslă acum." /></section>;

  return (
    <section>
      <SectionHeading eyebrow="Întâlnirea activă" title={encounter.type} detail="Acțiunile sunt procesate de jocul serverului și actualizează aceeași stare a personajului folosită în Discord." />
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-lg border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div><p className="font-mono text-xs uppercase tracking-widest text-accent">Confruntare de breaslă</p><h2 className="mt-2 font-serif text-3xl">{encounter.type}</h2><p className="mt-2 text-sm text-muted-foreground">Întâlnire #{encounter.id}</p></div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"><Clock3 className="size-4" /> Expiră {new Date(encounter.expiresAt).toLocaleString()}</span>
          </div>
          {participant ? (
            <div className="mt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md bg-secondary p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Heart className="size-4 text-primary" /> Starea ta</div><p className="mt-3 font-serif text-2xl">{participant.currentHp} / {participant.maxHp} HP</p><p className="mt-1 text-xs text-muted-foreground">{participant.isAlive ? "În viață" : "Înfrânt"}</p></div>
                <div className="rounded-md bg-secondary p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Flame className="size-4 text-primary" /> Adversar</div><p className="mt-3 font-serif text-2xl">Nivel {participant.monsterLevel}</p><p className="mt-1 text-xs text-muted-foreground">{participant.monsterRarity} · {participant.monsterCurrentHp} HP</p></div>
              </div>
              <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                <p className="flex items-center gap-2 text-muted-foreground"><Swords className="size-4 text-accent" /> Daune totale <span className="font-mono text-foreground">{participant.totalDamage}</span></p>
                <p className="flex items-center gap-2 text-muted-foreground"><Trophy className="size-4 text-accent" /> XP <span className="font-mono text-foreground">{participant.xp}</span></p>
                <p className="flex items-center gap-2 text-muted-foreground"><Shield className="size-4 text-accent" /> Oboli <span className="font-mono text-foreground">{participant.oboli}</span></p>
              </div>
            </div>
          ) : <div className="mt-6 rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">Nu există încă o stare de participant pentru această întâlnire.</div>}

          {lastResult && <div className="mt-5 rounded-md border border-accent/40 bg-accent/10 p-4" role="status" data-testid="combat-last-result"><p className="font-medium text-foreground">{lastResult.message}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><ArrowDown className="size-3" /> Daune primite: {lastResult.playerDamage}</span><span className="inline-flex items-center gap-1"><ArrowUp className="size-3" /> Daune provocate: {lastResult.monsterDamage}</span><span>XP: {lastResult.xpGained}</span><span>Oboli: {lastResult.oboliGained}</span>{lastResult.monsterDefeated && <span>Adversar învins</span>}{lastResult.playerDied && <span>Personaj înfrânt</span>}</div></div>}

          <div className="mt-6 flex flex-wrap gap-3">
            {!encounter.joined && <Button onClick={joinEncounter} disabled={!encounter.canJoin || busy} data-testid="button-join-encounter">{join.isPending ? "Alăturare..." : "Alătură-te întâlnirii"}</Button>}
            {encounter.joined && <Button onClick={attackEncounter} disabled={!encounter.canAttack || busy || !participant?.isAlive} data-testid="button-attack">{attack.isPending ? "Rezolvare..." : "Atacă"}</Button>}
          </div>
          {join.isError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive" role="alert"><AlertTriangle className="size-4" /> Alăturarea nu a fost confirmată. Starea întâlnirii a fost reîncărcată.</p>}
          {attack.isError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive" role="alert"><AlertTriangle className="size-4" /> Rezultatul luptei nu a fost confirmat. Starea personajului a fost reîncărcată.</p>}
        </article>

        <aside className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Alegerea eroului</p><h2 className="mt-2 font-serif text-2xl">Creștere de nivel</h2>
          {participant?.pendingLevelup ? <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Alege una dintre opțiunile disponibile pentru această creștere.</p>
            <div className="mt-5 grid gap-2">{levelChoices.map((choice) => <Button key={choice.value} variant="outline" className="justify-between" disabled={busy} onClick={() => chooseBonus(choice.value)} data-testid={`button-levelup-${choice.value}`}>{choice.label}<ArrowUp className="size-4 text-accent" /></Button>)}</div>
            {chooseLevel.isError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive" role="alert"><AlertTriangle className="size-4" /> Alegerea nu a putut fi salvată. Încearcă din nou.</p>}
          </> : <div className="mt-4 rounded-md bg-secondary p-4 text-sm text-muted-foreground">Nu există o alegere de nivel în așteptare.</div>}
          <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">Stările și rezultatele sunt furnizate de joc; pagina nu simulează reguli de luptă local.</p>
        </aside>
      </div>
    </section>
  );
}

export default function CombatPage() {
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId ?? "";
  return <GuildPage>{(overview, _guildId, csrfToken) => <CombatContent guildId={guildId} overview={overview} csrfToken={csrfToken} />}</GuildPage>;
}
