import { Switch, Route, Redirect, useSearch } from "wouter";
import "./index.css";
import { ModerationLayout } from "./pages/moderation/ModerationLayout";
import { OverviewPage } from "./pages/moderation/panel/overview";
import { ConfigOverviewPage } from "./pages/moderation/ConfigOverview";
import { ProtectionGroupPage } from "./pages/moderation/panel/ProtectionGroup";
import { JudgePage } from "./pages/moderation/panel/JudgePage";
import { SanctionsGroupPage } from "./pages/moderation/panel/SanctionsGroup";
import { LogsGroupPage } from "./pages/moderation/panel/LogsGroup";
import { RecordsGroupPage } from "./pages/moderation/panel/RecordsGroup";
import { CommandsPanelPage } from "./pages/moderation/panel/commands";
import { VerificationGroupPage } from "./pages/moderation/panel/VerificationGroup";
import { TicketsGroupPage } from "./pages/moderation/panel/TicketsGroup";
import { OracleGroupPage } from "./pages/moderation/panel/OracleGroup";
import { SettingsGroupPage } from "./pages/moderation/panel/SettingsGroup";
import { ControlGroupPage } from "./pages/moderation/panel/ControlGroup";
import { MessagesGroupPage } from "./pages/moderation/panel/MessagesGroup";
import { GameGroupPage } from "./pages/moderation/panel/GameGroup";
import { ServerSetupPage } from "./pages/moderation/ServerSetup";
import { ActivityRanksPage } from "./pages/moderation/ActivityRanks";
import { OfflineAssistant } from "./pages/moderation/OfflineAssistant";
import { useActiveGuild } from "./hooks/use-moderation-api";
import { Toaster } from "./components/ui/toaster";
import { SwordCursor } from "./components/SwordCursor";

// Public pages
import { PublicLayout } from "./components/public/PublicLayout";
import { HomePage } from "./pages/public/home/HomePage";
import { StartPage } from "./pages/public/StartPage";
import { OperatorHealthPage } from "./pages/public/OperatorHealthPage";
import { VerificationPage } from "./pages/public/VerificationPage";
import { AppealPage } from "./pages/public/AppealPage";
import { DailyStatsPage } from "./pages/public/DailyStatsPage";
import { useEffect, useState } from "react";

function ScrollAnimations() {
  useEffect(() => {
    const elements = () => Array.from(document.querySelectorAll<HTMLElement>("[data-aos]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealAll = () => elements().forEach((element) => element.classList.add("aos-animate"));

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("aos-animate");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -7% 0px" });

    const observeElements = () => elements()
      .filter((element) => !element.classList.contains("aos-animate"))
      .forEach((element) => observer.observe(element));
    observeElements();

    const mutations = new MutationObserver(observeElements);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}

// Root: the start page with the two doors (the official community and the bot panel).
// The community page itself is /server; the operator status view lives behind #status / #ops.
function HomeApp() {
  const [hash, setHash] = useState(window.location.hash);
  
  useEffect(() => {
    const handleHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (hash === "#ops" || hash === "#status") {
    return <OperatorHealthPage />;
  }

  return <StartPage />;
}

/** Where the tabs of the old bot control page (/bot?tab=…) live now. */
const OLD_BOT_TABS: Record<string, string> = {
  roles: "/control/canale", statistics: "/control/invitatii", verification: "/verificare", tickets: "/tichete",
  channels: "/joc/canale", messages: "/joc",
};

function OldBotControlRedirect() {
  const tab = new URLSearchParams(useSearch()).get("tab") ?? "";
  return <Redirect to={OLD_BOT_TABS[tab] ?? "/joc"} replace />;
}

function ModerationApp() {
  const { guildId } = useActiveGuild();
  return (
    <ModerationLayout>
      <div key={guildId ?? "no-guild"}>
        <Switch>
          <Route path="/" component={OverviewPage} />
          {/* The protection group is one page: the same component on all six routes keeps unsaved changes while moving between modules. */}
          <Route path="/protectie" component={ProtectionGroupPage} />
          <Route path="/automod" component={ProtectionGroupPage} />
          <Route path="/anti-spam" component={ProtectionGroupPage} />
          <Route path="/anti-flood" component={ProtectionGroupPage} />
          <Route path="/anti-raid" component={ProtectionGroupPage} />
          <Route path="/comportament-suspect" component={ProtectionGroupPage} />
          <Route path="/ai" component={JudgePage} />
          {/* The sanctions group is one page too: escalation, staff commands, roles and channels, and the schedule. */}
          <Route path="/sanctiuni" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/escaladare" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/comenzi" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/roluri-canale" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/program" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/contestatii" component={SanctionsGroupPage} />
          <Route path="/sanctiuni/ocolire-ban" component={SanctionsGroupPage} />
          {/* Older addresses of the same settings, kept for bookmarks and links. */}
          <Route path="/politici" component={() => <Redirect to="/sanctiuni/roluri-canale" replace />} />
          <Route path="/config/escaladare" component={() => <Redirect to="/sanctiuni/escaladare" replace />} />
          <Route path="/config/unelte" component={() => <Redirect to="/sanctiuni/comenzi" replace />} />
          {/* Cases and logs: the settings of cases, the audit and the activity logs, as one page. */}
          <Route path="/jurnale" component={LogsGroupPage} />
          <Route path="/jurnale/cazuri" component={LogsGroupPage} />
          <Route path="/jurnale/audit" component={LogsGroupPage} />
          <Route path="/jurnale/activitate" component={LogsGroupPage} />
          <Route path="/config/cazuri-audit" component={() => <Redirect to="/jurnale/cazuri" replace />} />
          <Route path="/comenzi" component={CommandsPanelPage} />
          {/* The case list and the audit log: one page, two modules. */}
          <Route path="/cazuri" component={RecordsGroupPage} />
          <Route path="/audit" component={RecordsGroupPage} />
          <Route path="/config" component={ConfigOverviewPage} />
          <Route path="/config/mesaje" component={MessagesGroupPage} />
          <Route path="/config/mesaje/jurnale" component={MessagesGroupPage} />
          <Route path="/config/mesaje/alianta" component={MessagesGroupPage} />
          <Route path="/config/avansat" component={() => <Redirect to="/setari/acces" replace />} />
          <Route path="/config/embeduri" component={() => <Redirect to="/setari/notificari" replace />} />
          <Route path="/joc" component={GameGroupPage} />
          <Route path="/joc/canale" component={GameGroupPage} />
          <Route path="/joc/evenimente" component={GameGroupPage} />
          <Route path="/joc/misiuni" component={GameGroupPage} />
          <Route path="/joc/economie" component={GameGroupPage} />
          <Route path="/joc/progres" component={GameGroupPage} />
          <Route path="/joc/sezoane" component={GameGroupPage} />
          <Route path="/joc/raid" component={GameGroupPage} />
          <Route path="/joc/dueluri" component={GameGroupPage} />
          <Route path="/joc/expeditii" component={GameGroupPage} />
          <Route path="/joc/bresle" component={GameGroupPage} />
          {/* The old game pages open the new one. */}
          <Route path="/canale" component={() => <Redirect to="/joc/canale" replace />} />
          <Route path="/provisioning" component={() => <Redirect to="/control/canale" replace />} />
          <Route path="/bot" component={OldBotControlRedirect} />
          <Route path="/verificare" component={VerificationGroupPage} />
          <Route path="/verificare/setari" component={VerificationGroupPage} />
          <Route path="/verificare/mesaje" component={VerificationGroupPage} />
          <Route path="/verificare/membri" component={VerificationGroupPage} />
          <Route path="/tichete" component={TicketsGroupPage} />
          <Route path="/tichete/aplicatii" component={TicketsGroupPage} />
          <Route path="/tichete/parteneriate" component={TicketsGroupPage} />
          <Route path="/tichete/ajutor" component={TicketsGroupPage} />
          <Route path="/tichete/contestatii" component={TicketsGroupPage} />
          <Route path="/tichete/setari" component={TicketsGroupPage} />
          <Route path="/oracol" component={OracleGroupPage} />
          <Route path="/oracol/pornire" component={OracleGroupPage} />
          <Route path="/oracol/conversatie" component={OracleGroupPage} />
          <Route path="/oracol/ton" component={OracleGroupPage} />
          <Route path="/oracol/profetii" component={OracleGroupPage} />
          <Route path="/setari" component={SettingsGroupPage} />
          <Route path="/setari/acces" component={SettingsGroupPage} />
          <Route path="/setari/notificari" component={SettingsGroupPage} />
          <Route path="/setari/privat" component={SettingsGroupPage} />
          <Route path="/setari/bun-venit" component={SettingsGroupPage} />
          <Route path="/control" component={ControlGroupPage} />
          <Route path="/control/invitatii" component={ControlGroupPage} />
          <Route path="/control/recrutare" component={ControlGroupPage} />
          <Route path="/control/raport" component={ControlGroupPage} />
          <Route path="/control/canale" component={ControlGroupPage} />
          <Route path="/control/bot" component={ControlGroupPage} />
          <Route path="/pornire-server" component={ServerSetupPage} />
          <Route path="/ranguri-activitate" component={ActivityRanksPage} />
          <Route path="/asistent" component={OfflineAssistant} />
          <Route component={() => <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-xl">Această secțiune este în lucru.</div>} />
        </Switch>
      </div>
    </ModerationLayout>
  );
}

function NotFound() {
  return (
    <div className="public-not-found flex min-h-[100dvh] items-center justify-center p-6">
      <div className="public-not-found__card w-full max-w-md rounded-2xl p-8 text-center">
        <h1 className="mb-4 font-display text-5xl text-[var(--ember-light)]">404</h1>
        <p>Poarta a fost închisă.</p>
        <a href="/" className="mt-6 inline-block text-[var(--gold-light)] underline underline-offset-4">Întoarce-te în regat</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollAnimations />
      <Switch>
        <Route path="/" component={HomeApp} />
        <Route path="/server" component={HomePage} />
        <Route path="/joc" component={() => <Redirect to="/server" replace />} />
        <Route path="/verificare" component={VerificationPage} />
        <Route path="/contestatie" component={AppealPage} />
        <Route path="/statistici" component={() => <PublicLayout><DailyStatsPage /></PublicLayout>} />
        <Route path="/moderare" nest>
          <ModerationApp />
        </Route>
        <Route component={NotFound} />
      </Switch>
      <Toaster />
      <SwordCursor />
    </>
  );
}
