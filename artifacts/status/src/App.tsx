import { Switch, Route, Redirect } from "wouter";
import "./index.css";
import { ModerationLayout } from "./pages/moderation/ModerationLayout";
import { DashboardOverview } from "./pages/moderation/Dashboard";
import { AutoModPage } from "./pages/moderation/AutoMod";
import { CasesPage } from "./pages/moderation/Cases";
import { CommandsPage } from "./pages/moderation/Commands";
import { AuditPage } from "./pages/moderation/Audit";
import { SettingsPage } from "./pages/moderation/Settings";
import { ProtectionPage } from "./pages/moderation/Protection";
import { PoliciesPage } from "./pages/moderation/Policies";
import { BotControlPage } from "./pages/moderation/BotControl";
import { useActiveGuild } from "./hooks/use-moderation-api";

// Public pages
import { PublicLayout } from "./components/public/PublicLayout";
import { GameGuidePage } from "./pages/public/GameGuidePage";
import { OperatorHealthPage } from "./pages/public/OperatorHealthPage";
import { useEffect, useState } from "react";

// The legacy operator/status logic uses hashes on root
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

  return <Redirect to={`/moderare${window.location.search}`} replace />;
}

function GameApp() {
  return (
    <PublicLayout>
      <GameGuidePage />
    </PublicLayout>
  );
}

function ModerationApp() {
  const { guildId } = useActiveGuild();
  return (
    <ModerationLayout>
      <div key={guildId ?? "no-guild"}>
        <Switch>
          <Route path="/" component={DashboardOverview} />
          <Route path="/automod" component={AutoModPage} />
          <Route path="/protectie" component={ProtectionPage} />
          <Route path="/politici" component={PoliciesPage} />
          <Route path="/comenzi" component={CommandsPage} />
          <Route path="/cazuri" component={CasesPage} />
          <Route path="/audit" component={AuditPage} />
          <Route path="/config" component={SettingsPage} />
          <Route path="/bot" component={BotControlPage} />
          <Route component={() => <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-xl">Această secțiune este în lucru.</div>} />
        </Switch>
      </div>
    </ModerationLayout>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-void text-paper">
      <div className="text-center">
        <h1 className="text-4xl font-display text-ember-light mb-4">404</h1>
        <p>Poarta a fost închisă.</p>
        <a href="/" className="mt-6 inline-block text-gold underline">Întoarce-te în regat</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={HomeApp} />
      <Route path="/joc" component={GameApp} />
      <Route path="/moderare" nest>
        <ModerationApp />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}
