/**
 * Pagina principală a site-ului: „Regatul Cenușii”.
 *
 * Aspectul vine din designul „Pagina serverului” (vezi `home.css`); cifrele,
 * raportul zilnic, recrutarea și invitația sunt cele reale ale serverului.
 */
import { useEffect, useMemo } from "react";
import {
  getGetPublicServerProfileQueryKey,
  getGetRecruitmentDashboardQueryKey,
  useGetPublicServerProfile,
  useGetRecruitmentDashboard,
} from "@workspace/api-client-react";
import { useDailyStats } from "../../../hooks/public/use-daily-stats";
import { useSoulStoneStats } from "../../../hooks/public/use-stats";
import { DISCORD_INVITE } from "../../../lib/public-constants";
import { CommunitySection } from "./CommunitySection";
import { Footer } from "./Footer";
import { formatReportDay } from "./format";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { InvitationSection } from "./InvitationSection";
import { Marquee } from "./Marquee";
import type { OracleFacts } from "./oracle/archive";
import { OracleSection } from "./oracle/OracleSection";
import { Divider } from "./parts";
import { RecruitmentSection } from "./RecruitmentSection";
import { recruitmentFact, recruitmentView } from "./recruitment";
import { ReportSection } from "./ReportSection";
import { buildAmbience } from "./sparks";
import "./home.css";

const SERVER_NAME = "Regatul Cenușii";
const TITLE = "Regatul Cenușii | Comunitate Discord";
const DESCRIPTION =
  "Descoperă comunitatea românească Oracolul Cenușii pe Discord și consultă datele reale despre prezență și activitatea zilnică.";

/** Poziția scânteilor și a cenușii: aceeași la fiecare vizită, calculată o singură dată. */
const AMBIENCE = buildAmbience();

/** Titlul filei și textele pentru previzualizări; la plecare se pun la loc. */
function usePageMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;
    const undo = [
      ['meta[name="description"]', DESCRIPTION],
      ['meta[property="og:title"]', TITLE],
      ['meta[property="og:description"]', DESCRIPTION],
      ['meta[name="twitter:title"]', TITLE],
      ['meta[name="twitter:description"]', DESCRIPTION],
    ].map(([selector, value]) => {
      const el = document.querySelector(selector);
      const before = el?.getAttribute("content") ?? "";
      el?.setAttribute("content", value);
      return () => el?.setAttribute("content", before);
    });
    return () => {
      document.title = previousTitle;
      undo.forEach((restore) => restore());
    };
  }, []);
}

/** Cât timp pagina e pe ecran, fundalul întregii file e cel din design. */
function useDocumentTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oc-home-on");
    return () => root.classList.remove("oc-home-on");
  }, []);
}

export function HomePage() {
  usePageMeta();
  useDocumentTheme();

  const stats = useSoulStoneStats();
  const daily = useDailyStats();
  const profileQuery = useGetPublicServerProfile({
    query: {
      queryKey: getGetPublicServerProfileQueryKey(),
      staleTime: 0,
      refetchOnMount: "always",
    },
    request: { cache: "no-store" },
  });
  const profile = profileQuery.data ?? { name: SERVER_NAME, iconUrl: null, inviteUrl: DISCORD_INVITE, guildId: null };
  const recruitmentQuery = useGetRecruitmentDashboard(
    { guildId: profile.guildId ?? "" },
    {
      query: {
        enabled: Boolean(profile.guildId),
        queryKey: getGetRecruitmentDashboardQueryKey({ guildId: profile.guildId ?? "" }),
      },
    },
  );

  const invite = profile.inviteUrl;
  const inviteLabel = invite.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const online = stats?.onlineCount ?? null;
  const members = stats?.totalMembers ?? null;
  // Până sosește primul răspuns nu afișăm „offline”; apare doar dacă serverul chiar nu răspunde.
  const live = stats ? stats.live : true;

  const view = recruitmentView(profileQuery, profile.guildId, recruitmentQuery);
  const recruitment = recruitmentFact(view);
  const report = daily.data?.report;

  const facts = useMemo<OracleFacts>(
    () => ({
      members,
      online,
      inviteLabel,
      report: report
        ? {
            dayLabel: formatReportDay(report.day),
            messages: report.metrics.messages,
            uniqueUsers: report.metrics.uniqueUsers,
            joins: report.metrics.joins,
            leaves: report.metrics.leaves,
            boosts: report.metrics.boosts,
            peakVoice: report.metrics.peakVoice,
            topChannels: report.topChannels.map((c) => ({ name: c.channelName, messages: c.messages })),
          }
        : null,
      recruitment,
    }),
    [members, online, inviteLabel, report, recruitment],
  );

  return (
    <div
      id="top"
      className="oc-home"
      style={{
        position: "relative",
        background: "#09090B",
        color: "#F6F1EA",
        fontFamily: "'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
        fontSize: "17px",
        lineHeight: "1.65",
        overflowX: "clip",
      }}
    >
      <a className="skip" href="#main">
        Sari la conținut
      </a>
      <Header invite={invite} />
      <Hero
        ambience={AMBIENCE}
        online={online}
        members={members}
        live={live}
        invite={invite}
        inviteLabel={inviteLabel}
        serverName={profile.name || SERVER_NAME}
      />
      <main id="main">
        <Marquee />
        <CommunitySection online={online} members={members} live={live} />
        <Divider />
        <ReportSection daily={daily} />
        <Divider />
        <OracleSection facts={facts} sparks={AMBIENCE.oracle} />
        <Divider />
        <RecruitmentSection view={view} />
        <InvitationSection invite={invite} sparks={AMBIENCE.invitation} />
      </main>
      <Footer invite={invite} inviteLabel={inviteLabel} live={live} />
    </div>
  );
}
