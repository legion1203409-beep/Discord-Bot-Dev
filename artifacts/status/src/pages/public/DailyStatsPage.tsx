import { useMemo } from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  UserPlus,
  UserMinus,
  Volume2,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
import { useDailyStats } from "../../hooks/public/use-daily-stats";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { usePublicToolbarAction } from "../../components/public/PublicToolbarActionContext";

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short" }).format(
    new Date(`${day}T12:00:00.000Z`),
  );
}

function longDayLabel(day: string): string {
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "long" }).format(
    new Date(`${day}T12:00:00.000Z`),
  );
}

function number(value: number): string {
  return value.toLocaleString("ro-RO");
}

export function DailyStatsPage() {
  const { data, loading, error, refresh } = useDailyStats();
  const report = data?.report;
  const maxChannelMessages = Math.max(...(report?.topChannels.map((channel) => channel.messages) ?? [1]), 1);
  const toolbarRefreshAction = useMemo(() => (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={loading}
      aria-label="Actualizează statisticile zilnice"
      title="Actualizează statisticile zilnice"
      data-testid="button-refresh-daily-stats"
      className="nav-refresh-action"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
      <span className="nav-refresh-action__label">Actualizează</span>
    </button>
  ), [loading, refresh]);
  usePublicToolbarAction(toolbarRefreshAction);

  return (
    <div className="public-statistics-page mx-auto w-full max-w-6xl px-5 pb-20 pt-12 sm:px-8 lg:pt-20">
      <div className="public-statistics-header mb-12 flex flex-col gap-6 pb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="public-statistics-kicker mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Observatorul regatului
          </div>
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] text-[var(--paper)] sm:text-7xl">
            Statistici zilnice
          </h1>
          <p className="public-statistics-muted mt-5 max-w-2xl text-sm leading-7 sm:text-base">
            Activitatea comunității, într-un singur raport. Datele sunt agregate de bot și
            sunt aceleași cu raportul publicat în Discord.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="public-statistics-cta inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            Intră pe Discord <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-6" aria-label="Se încarcă statisticile">
          <div className="public-skeleton h-24 animate-pulse rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="public-skeleton h-32 animate-pulse rounded-2xl" />)}
          </div>
          <div className="public-skeleton h-96 animate-pulse rounded-2xl" />
        </div>
      ) : error ? (
        <div className="public-statistics-error rounded-2xl p-8 text-center">
          <p className="font-display text-2xl text-[var(--paper)]">Raport indisponibil</p>
          <p className="public-statistics-muted mt-2 text-sm">{error}</p>
          <button type="button" onClick={() => void refresh()} className="public-statistics-button mt-6 rounded-lg px-4 py-2 text-sm">
            Încearcă din nou
          </button>
        </div>
      ) : report && data ? (
        <>
          <section className="public-statistics-surface mb-6 rounded-2xl p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="public-statistics-kicker flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Raport server
                </div>
                <h2 className="mt-2 font-display text-3xl text-[var(--paper)]">{data.guildName}</h2>
              </div>
              <div className="public-statistics-date rounded-xl px-4 py-3 text-left sm:text-right">
                 <p className="public-statistics-muted text-xs uppercase tracking-[0.15em]">Ziua raportată</p>
                 <p className="public-statistics-muted mt-1 text-sm font-semibold">{longDayLabel(report.day)}</p>
              </div>
            </div>
          </section>

          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Mesaje", value: report.metrics.messages, icon: MessageSquare },
              { label: "Utilizatori unici", value: report.metrics.uniqueUsers, icon: Users },
              { label: "Boost-uri", value: report.metrics.boosts, icon: Zap },
              { label: "Intrări", value: report.metrics.joins, icon: UserPlus },
              { label: "Ieșiri", value: report.metrics.leaves, icon: UserMinus },
              { label: "Vârf vocal", value: report.metrics.peakVoice, icon: Volume2 },
            ].map((metric) => (
              <article key={metric.label} className="public-statistics-metric rounded-2xl p-5 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="public-statistics-muted text-sm">{metric.label}</p>
                  <metric.icon className="h-4 w-4 text-[var(--ember-light)]" aria-hidden="true" />
                </div>
                <p className="mt-5 font-display text-4xl text-[var(--paper)]">{number(metric.value)}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
            <article className="public-statistics-surface rounded-2xl p-5 sm:p-7">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <div className="public-statistics-kicker flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Ritm comunitate
                  </div>
                  <h2 className="mt-2 font-display text-2xl text-[var(--paper)]">Activitate în ultimele 7 zile</h2>
                </div>
                <span className="public-statistics-badge hidden rounded-full px-3 py-1 font-mono text-[10px] sm:block">
                  MESaje / ZI
                </span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.activity} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="statsActivityFill" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="var(--ember-light)" stopOpacity={0.42} />
                         <stop offset="100%" stopColor="var(--ember)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                     <CartesianGrid stroke="var(--paper)" strokeOpacity={0.08} vertical={false} />
                     <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "var(--ash)", fontSize: 11 }} axisLine={false} tickLine={false} />
                     <YAxis allowDecimals={false} tick={{ fill: "var(--ash)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(value) => dayLabel(String(value))}
                      formatter={(value) => [number(Number(value)), "mesaje"]}
                       contentStyle={{ background: "var(--panel)", border: "1px solid color-mix(in srgb, var(--ember-light) 35%, transparent)", borderRadius: 10, color: "var(--paper)" }}
                    />
                     <Area type="monotone" dataKey="messages" stroke="var(--ember-light)" strokeWidth={3} fill="url(#statsActivityFill)" activeDot={{ r: 5, fill: "var(--ember-light)", stroke: "var(--panel)", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="public-statistics-surface rounded-2xl p-5 sm:p-7">
              <div className="mb-7">
                <div className="public-statistics-kicker flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Canale active
                </div>
                <h2 className="mt-2 font-display text-2xl text-[var(--paper)]">Top 5 canale</h2>
              </div>
              <div className="space-y-5">
                {report.topChannels.length > 0 ? report.topChannels.map((channel, index) => (
                  <div key={channel.channelId}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="public-statistics-muted min-w-0 truncate"><span className="public-statistics-rank mr-2 font-mono text-xs">0{index + 1}</span>#{channel.channelName}</span>
                      <span className="public-statistics-muted shrink-0 font-mono text-xs">{number(channel.messages)}</span>
                    </div>
                    <div className="public-statistics-bar h-2 overflow-hidden rounded-full">
                      <div className="public-statistics-bar__fill h-full rounded-full" style={{ width: `${Math.max(4, (channel.messages / maxChannelMessages) * 100)}%` }} />
                    </div>
                  </div>
                )) : (
                  <div className="public-statistics-empty rounded-xl p-6 text-center text-sm leading-6">
                    Nu există încă mesaje înregistrate pentru această zi.
                  </div>
                )}
              </div>
            </article>
          </section>

          <div className="public-statistics-footer mt-8 flex items-center justify-between gap-4 pt-6 text-xs">
            <span>Actualizare manuală · fus orar {data.timezone}</span>
            <Link href="/server" className="inline-flex items-center gap-1 text-[var(--ember-light)] hover:text-[var(--paper)]" data-testid="link-daily-stats-server-guide">
              Ghidul serverului <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}