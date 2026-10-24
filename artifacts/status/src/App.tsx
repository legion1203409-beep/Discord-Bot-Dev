import { Switch, Route, Redirect } from "wouter";
import "./index.css";
import { ModerationLayout } from "./pages/moderation/ModerationLayout";
import { DashboardOverview } from "./pages/moderation/Dashboard";
import { CasesPage } from "./pages/moderation/Cases";
import { CommandsPage } from "./pages/moderation/Commands";
import { AuditPage } from "./pages/moderation/Audit";
import { AdvancedSettingsPage } from "./pages/moderation/Settings";
import { ConfigOverviewPage } from "./pages/moderation/ConfigOverview";
import { CategorySettingsPage } from "./pages/moderation/CategorySettings";
import { ProtectionPage } from "./pages/moderation/Protection";
import { BotControlPage } from "./pages/moderation/BotControl";
import { VerificationAdminPage } from "./pages/moderation/VerificationAdmin";
import { MessageTemplatesPage } from "./pages/moderation/MessageTemplates";
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

function ModerationApp() {
  const { guildId } = useActiveGuild();
  return (
    <ModerationLayout>
      <div key={guildId ?? "no-guild"}>
        <Switch>
          <Route path="/" component={DashboardOverview} />
          <Route path="/automod" component={() => <CategorySettingsPage section="automod" />} />
          <Route path="/ai" component={() => <CategorySettingsPage section="ai" />} />
          <Route path="/anti-spam" component={() => <CategorySettingsPage section="anti-spam" />} />
          <Route path="/anti-flood" component={() => <CategorySettingsPage section="anti-flood" />} />
          <Route path="/comportament-suspect" component={() => <CategorySettingsPage section="suspicious" />} />
          <Route path="/protectie" component={ProtectionPage} />
          <Route path="/anti-raid" component={() => <CategorySettingsPage section="anti-raid" />} />
          <Route path="/politici" component={() => <CategorySettingsPage section="roles-channels" />} />
          <Route path="/comenzi" component={CommandsPage} />
          <Route path="/cazuri" component={CasesPage} />
          <Route path="/audit" component={AuditPage} />
          <Route path="/config" component={ConfigOverviewPage} />
          <Route path="/config/mesaje" component={MessageTemplatesPage} />
          <Route path="/config/avansat" component={AdvancedSettingsPage} />
          <Route path="/config/unelte" component={() => <CategorySettingsPage section="tools" />} />
          <Route path="/config/cazuri-audit" component={() => <CategorySettingsPage section="cases-audit" />} />
          <Route path="/config/escaladare" component={() => <CategorySettingsPage section="escalation" />} />
          <Route path="/config/embeduri" component={() => <CategorySettingsPage section="embeds" />} />
          <Route path="/canale" component={() => <BotControlPage channelsOnly />} />
          <Route path="/provisioning" component={() => <BotControlPage provisioningOnly />} />
          <Route path="/bot" component={() => <BotControlPage />} />
          <Route path="/verificare" component={VerificationAdminPage} />
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
