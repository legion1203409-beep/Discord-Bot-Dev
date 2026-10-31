import { useParams } from "wouter";
import { Check, Circle, ScrollText, Sparkles } from "lucide-react";
import { EmptyState, SectionHeading } from "@/components/game-ui";
import { GuildPage } from "@/components/guild-page";

export default function MissionsPage() {
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId ?? "";
  return <GuildPage>{(overview) => (
    <section>
      <SectionHeading eyebrow="Cronica de azi" title="Misiunile breslei" detail="Obiectivele și progresul tău curent, așa cum sunt înregistrate în joc." />
      {overview.missions.length === 0 ? <EmptyState title="Nicio misiune disponibilă" detail="Nu există misiuni active afișate pentru această breaslă." /> : (
        <div className="space-y-4">
          {overview.missions.map((mission) => {
            const progress = mission.target > 0 ? Math.max(0, Math.min(100, mission.progress / mission.target * 100)) : 0;
            return <article key={mission.key} className="rounded-lg border border-border bg-card p-5 sm:p-6" data-testid={`card-mission-${mission.key}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-3"><span className={`mt-1 grid size-9 shrink-0 place-items-center rounded-full ${mission.completed ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>{mission.completed ? <Check className="size-4" /> : <ScrollText className="size-4" />}</span><div><h2 className="font-serif text-2xl">{mission.title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{mission.description}</p></div></div>
                <span className={`rounded-full border px-3 py-1 text-xs ${mission.completed ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}>{mission.completed ? "Completată" : "În desfășurare"}</span>
              </div>
              <div className="mt-6">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Progres</span><span className="font-mono text-foreground" data-testid={`text-mission-progress-${mission.key}`}>{mission.progress} / {mission.target}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`Progres ${mission.title}`} aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={mission.progress}><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground"><Sparkles className="size-4 text-accent" /> Recompensă: {mission.rewardItemKey} × {mission.rewardQuantity}</span>
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">{mission.rewardGiven ? <Check className="size-4" /> : <Circle className="size-3" />}{mission.rewardGiven ? "Recompensă acordată" : "Recompensă neacordată"}</span>
              </div>
            </article>;
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground" data-testid={`text-missions-guild-${guildId}`}>Misiuni pentru această breaslă; progresul este comun cu jocul din Discord.</p>
    </section>
  )}</GuildPage>;
}
