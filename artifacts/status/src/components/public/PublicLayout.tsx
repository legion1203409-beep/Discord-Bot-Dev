import { type ReactNode, useMemo, useState } from "react";
import { Navigation } from "./Navigation";
import { Footer } from "./Footer";
import { useOracleHealth } from "../../hooks/public/use-health";
import { PublicToolbarActionContext } from "./PublicToolbarActionContext";

export function PublicLayout({ children }: { children: ReactNode }) {
  const health = useOracleHealth();
  const [toolbarAction, setToolbarAction] = useState<ReactNode | null>(null);
  const toolbarContext = useMemo(
    () => ({ action: toolbarAction, setAction: setToolbarAction }),
    [toolbarAction],
  );

  return (
    <PublicToolbarActionContext.Provider value={toolbarContext}>
      <div className="landing-page">
        <div className="landing-noise" aria-hidden="true" />
        <div className="landing-particles" aria-hidden="true" />
        <div className="landing-orbit landing-orbit--one" aria-hidden="true" />
        <div className="landing-orbit landing-orbit--two" aria-hidden="true" />
        <div className="smoke-layer smoke-layer--one" aria-hidden="true" />
        <div className="smoke-layer smoke-layer--two" aria-hidden="true" />

        <Navigation />

        <main>
          {children}
        </main>

        <Footer health={health} />
      </div>
    </PublicToolbarActionContext.Provider>
  );
}
