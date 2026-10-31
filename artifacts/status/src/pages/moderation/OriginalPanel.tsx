import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@workspace/oracolul-cenusii-ds/components/ui/button";
import { tokens } from "@workspace/oracolul-cenusii-ds/tokens";
import { useActiveGuild, useSession } from "../../hooks/use-moderation-api";
import { handleSourcePanelRequest } from "./source-panel-api";
import { buildSourcePanelDocument, SOURCE_VIEWS, type SourceServer } from "./source-panel-document";

type RpcRequest = Parameters<typeof handleSourcePanelRequest>[0];

const CHARTS = ["chart1", "chart2", "chart3", "chart4", "chart5"] as const;
const PALETTE: Array<[string, string]> = CHARTS.map((key) => [tokens.color.dark[key], tokens.color.light[key]]);

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]!.toLocaleUpperCase("ro")).join("") || "?");
}

function iconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  return /^https?:\/\//i.test(icon) ? icon : `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64`;
}

export function sourceViewFromPath(path: string): string | null {
  if (path === "/" || path === "") return "acasa";
  const match = /^\/panou\/([a-z]+)\/?$/.exec(path);
  return match && (SOURCE_VIEWS as readonly string[]).includes(match[1]!) ? match[1]! : null;
}

export function OriginalPanel({ view }: { view: string }) {
  const { guildId, setGuildId, guilds } = useActiveGuild();
  const { logout } = useSession();
  const [location, setLocation] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const locationRef = useRef(location);
  locationRef.current = location;
  const activeGuildRef = useRef(guildId);
  activeGuildRef.current = guildId;
  const readyRef = useRef(false);

  const guildKey = JSON.stringify(guilds.map((g) => [g.id, g.name, g.icon]));
  const servers = useMemo<SourceServer[]>(() => guilds.map((g, i) => {
    const [c1, c2] = PALETTE[i % PALETTE.length]!;
    return { id: g.id, name: g.name, ini: initials(g.name), icon: iconUrl(g.id, g.icon), c1, c2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [guildKey]);
  const authorizedRef = useRef<string[]>([]);
  authorizedRef.current = servers.map((s) => s.id);

  // One document per guild. View changes go through postMessage, never recreate it.
  const built = useMemo(() => {
    if (!guildId) return { doc: null, error: null };
    const channel = randomToken();
    const nonce = randomToken();
    try {
      const html = buildSourcePanelDocument({ channel, nonce, origin: window.location.origin, guildId, view: viewRef.current, servers });
      return { doc: { html, channel, nonce, guildId }, error: null };
    } catch (error) {
      return { doc: null, error: error instanceof Error ? error.message : "Panoul sursă nu a putut fi pregătit." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, servers]);
  const doc = built.doc;
  const buildError = built.error;

  useEffect(() => {
    if (!doc) return;
    readyRef.current = false;
    const post = (message: Record<string, unknown>) => {
      const target = iframeRef.current?.contentWindow;
      target?.postMessage({ ...message, channel: doc.channel, nonce: doc.nonce }, window.location.origin);
    };
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || event.source !== frame || event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.channel !== doc.channel || data.nonce !== doc.nonce) return;
      if (data.type === "ready") {
        readyRef.current = true;
        post({ type: "go", view: viewRef.current });
      } else if (data.type === "nav" && typeof data.view === "string") {
        const target = data.view === "acasa" ? "/" : `/panou/${data.view}`;
        if (locationRef.current !== target) setLocation(target);
      } else if (data.type === "guild" && typeof data.id === "string") {
        if (authorizedRef.current.includes(data.id)) setGuildId(data.id);
      } else if (data.type === "logout") {
        void logout();
      } else if (data.type === "rpc" && typeof data.id === "number") {
        const id = data.id;
        const request = data.request as RpcRequest | undefined;
        const reply = (ok: boolean, payload: { result?: unknown; error?: string }) => {
          // Never deliver a result to a document for a different guild.
          if (activeGuildRef.current !== doc.guildId || iframeRef.current?.contentWindow !== frame) return;
          post({ type: "rpc-result", id, ok, ...payload });
        };
        const valid = request && ["load", "loadOther", "save", "reset"].includes(request.method) && typeof request.guildId === "string"
          && (request.method === "loadOther" ? authorizedRef.current.includes(request.guildId) && request.guildId !== doc.guildId : request.guildId === doc.guildId);
        if (!valid || activeGuildRef.current !== doc.guildId) {
          reply(false, { error: "Cerere respinsă: serverul nu este cel activ sau nu este autorizat." });
          return;
        }
        handleSourcePanelRequest(request, {
          activeGuildId: doc.guildId,
          authorizedGuildIds: [...authorizedRef.current],
          getActiveGuildId: () => activeGuildRef.current,
        })
          .then((result) => reply(true, { result }))
          .catch((error: unknown) => reply(false, { error: error instanceof Error ? error.message : "Cererea a eșuat." }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [doc, setLocation, setGuildId, logout]);

  // Browser back/forward and direct routes drive the source router.
  useEffect(() => {
    if (!readyRef.current || !doc) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "go", view, channel: doc.channel, nonce: doc.nonce }, window.location.origin);
  }, [view, doc]);

  if (buildError) {
    return (
      <div className="mod-shell dark flex min-h-[100dvh] flex-col items-center justify-center p-4">
        <div className="mod-card w-full max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="font-display text-3xl font-semibold text-foreground">Panoul nu a putut fi încărcat</h2>
          <p className="mt-3 mb-8 text-muted-foreground" data-testid="text-source-panel-error">{buildError}</p>
          <Button onClick={() => window.location.reload()} className="gap-2" data-testid="button-reload-source-panel">
            <RefreshCw className="h-4 w-4" /> Reîncarcă
          </Button>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <iframe
      key={`${doc.guildId}:${doc.channel}`}
      ref={iframeRef}
      title="Panoul Oracolului"
      srcDoc={doc.html}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      allow="clipboard-write"
      className="fixed inset-0 h-full w-full border-0 bg-background"
      data-testid="iframe-source-panel"
    />
  );
}
