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

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-12 sm:px-8 lg:pt-20">
      <div className="mb-12 flex flex-col gap-6 border-b border-white/10 pb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#D94A2B]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Observatorul regatului
          </div>
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] text-white sm:text-7xl">
            Statistici zilnice
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#B0B0B0] sm:text-base">
            Activitatea comunității, într-un singur raport. Datele sunt agregate de bot și
            sunt aceleași cu raportul publicat în Discord.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#1E1E1E] px-4 py-2.5 text-sm text-white transition-colors hover:border-[#D94A2B]/60 hover:bg-[#D94A2B]/10 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Actualizează
          </button>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#D94A2B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B33C24]"
          >
            Intră pe Discord <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-6" aria-label="Se încarcă statisticile">
          <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
          <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-300/20 bg-red-400/5 p-8 text-center">
          <p className="font-display text-2xl text-white">Raport indisponibil</p>
          <p className="mt-2 text-sm text-[#B0B0B0]">{error}</p>
          <button type="button" onClick={() => void refresh()} className="mt-6 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10">
            Încearcă din nou
          </button>
        </div>
      ) : report && data ? (
        <>
          <section className="mb-6 rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 shadow-2xl shadow-black/30 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D94A2B]">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Raport server
                </div>
                <h2 className="mt-2 font-display text-3xl text-white">{data.guildName}</h2>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left sm:text-right">
                 <p className="text-xs uppercase tracking-[0.15em] text-[#B0B0B0]">Ziua raportată</p>
                 <p className="mt-1 text-sm font-semibold text-[#B0B0B0]">{longDayLabel(report.day)}</p>
              </div>
            </div>
          </section>

          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Mesaje", value: report.metrics.messages, icon: MessageSquare, tone: "text-[#D94A2B]" },
              { label: "Utilizatori unici", value: report.metrics.uniqueUsers, icon: Users, tone: "text-[#D94A2B]" },
              { label: "Boost-uri", value: report.metrics.boosts, icon: Zap, tone: "text-[#D94A2B]" },
              { label: "Intrări", value: report.metrics.joins, icon: UserPlus, tone: "text-[#D94A2B]" },
              { label: "Ieșiri", value: report.metrics.leaves, icon: UserMinus, tone: "text-[#D94A2B]" },
              { label: "Vârf vocal", value: report.metrics.peakVoice, icon: Volume2, tone: "text-[#D94A2B]" },
            ].map((metric) => (
              <article key={metric.label} className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 transition-colors hover:border-[#D94A2B]/35">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#B0B0B0]">{metric.label}</p>
                  <metric.icon className={`h-4 w-4 ${metric.tone}`} aria-hidden="true" />
                </div>
                <p className="mt-5 font-display text-4xl text-white">{number(metric.value)}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
            <article className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 sm:p-7">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D94A2B]">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Ritm comunitate
                  </div>
                  <h2 className="mt-2 font-display text-2xl text-white">Activitate în ultimele 7 zile</h2>
                </div>
                <span className="hidden rounded-full border border-[#D94A2B]/25 bg-[#D94A2B]/10 px-3 py-1 font-mono text-[10px] text-[#D94A2B] sm:block">
                  MESaje / ZI
                </span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.activity} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="statsActivityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D94A2B" stopOpacity={0.42} />
                        <stop offset="100%" stopColor="#B33C24" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#ffffff" strokeOpacity={0.08} vertical={false} />
                    <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "#B0B0B0", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#B0B0B0", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(value) => dayLabel(String(value))}
                      formatter={(value) => [number(Number(value)), "mesaje"]}
                      contentStyle={{ background: "#1E1E1E", border: "1px solid rgba(217,74,43,.3)", borderRadius: 10, color: "#FFFFFF" }}
                    />
                    <Area type="monotone" dataKey="messages" stroke="#D94A2B" strokeWidth={3} fill="url(#statsActivityFill)" activeDot={{ r: 5, fill: "#D94A2B", stroke: "#1E1E1E", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-5 sm:p-7">
              <div className="mb-7">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D94A2B]">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  Canale active
                </div>
                <h2 className="mt-2 font-display text-2xl text-white">Top 5 canale</h2>
              </div>
              <div className="space-y-5">
                {report.topChannels.length > 0 ? report.topChannels.map((channel, index) => (
                  <div key={channel.channelId}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-[#B0B0B0]"><span className="mr-2 font-mono text-xs text-[#D94A2B]">0{index + 1}</span>#{channel.channelName}</span>
                      <span className="shrink-0 font-mono text-xs text-[#B0B0B0]">{number(channel.messages)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#B33C24] to-[#D94A2B]" style={{ width: `${Math.max(4, (channel.messages / maxChannelMessages) * 100)}%` }} />
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm leading-6 text-[#B0B0B0]">
                    Nu există încă mesaje înregistrate pentru această zi.
                  </div>
                )}
              </div>
            </article>
          </section>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#7E7E7E]">
            <span>Actualizare manuală · fus orar {data.timezone}</span>
            <Link href="/joc" className="inline-flex items-center gap-1 text-[#D94A2B] hover:text-white">
              Vezi lumea jocului <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}