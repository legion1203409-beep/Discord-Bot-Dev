import { useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { SERIF } from "../parts";
import { GREETING, SUGGESTIONS } from "./archive";
import { Avatar } from "./MiniEye";
import { toBlocks, trimDangling, type Block } from "./text";
import type { OracleChatState } from "./useOracleChat";

function Bubble({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className={block.list ? "li" : ""}>
          <span>
            {block.runs.map((run, j) =>
              run.kind === "bold" ? (
                <strong key={j}>{run.text}</strong>
              ) : run.kind === "code" ? (
                <code key={j}>{run.text}</code>
              ) : (
                run.text
              ),
            )}
          </span>
        </p>
      ))}
    </>
  );
}

function OracleSays({ children, className = "oMsg o" }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Avatar size={28} />
      <div className="oCol">{children}</div>
    </div>
  );
}

export function OracleChat({ chat }: { chat: OracleChatState }) {
  const { messages, draft, setDraft, busy, stream, error, thinking, send, stop, newConversation, retry, stickToBottom } = chat;
  const log = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // Rămâne la ultimul mesaj, afară de cazul în care cititorul a derulat în sus.
  // Cât timp nu s-a scris nimic, se vede începutul salutului, nu sfârșitul lui.
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (messages.length === 0 && !busy && !error) el.scrollTop = 0;
    else if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, stream, busy, error, stickToBottom]);

  // Câmpul crește cu textul, până la 140 px.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !el.offsetParent) return;
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }, [draft]);

  const onScroll = () => {
    const el = log.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) stop();
    else send(draft);
  };

  const thinkingNow = busy && !stream;
  const streaming = busy && !!stream;
  const showSuggestions = messages.length === 0 && !busy;
  const sendDisabled = !busy && !draft.trim();

  return (
    <div
      className={busy ? "orcChat busy" : "orcChat"}
      data-testid="section-oracle-chat"
      style={{
        flex: "1 1 460px",
        minWidth: "0",
        height: "clamp(540px,60vw,600px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: "24px",
        border: "1px solid rgba(255,255,255,.09)",
        background:
          "radial-gradient(90% 60% at 100% 0%, rgba(255,107,61,.1) 0%, rgba(255,107,61,0) 60%), linear-gradient(180deg,#16181C 0%,#101215 100%)",
        overflow: "hidden",
      }}
    >
      <div
        className="oHead"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "16px clamp(14px,2.4vw,24px)",
          borderBottom: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "0" }}>
          <Avatar size={38} />
          <div style={{ minWidth: "0" }}>
            <h3 style={{ margin: "0", fontFamily: SERIF, fontWeight: "600", fontSize: "26px", lineHeight: "1.05", color: "#F6F1EA" }}>
              Oracolul Cenușii
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13.5px",
                lineHeight: "1.3",
                color: "#8F8B86",
              }}
            >
              <span className="oStat off" aria-hidden="true" />
              <span>Răspunde din arhivă</span>
            </p>
          </div>
        </div>
        <button
          className="oNew"
          type="button"
          onClick={newConversation}
          aria-label="Conversație nouă"
          title="Conversație nouă"
          data-testid="button-oracle-new"
        >
          <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
            <path d="M20 11a8 8 0 0 0-14.7-4.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16M20 20v-4h-4" />
          </svg>
        </button>
      </div>

      <div className="orcLog" ref={log} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversația cu Oracolul">
        <OracleSays>
          <div className="oBub">
            <Bubble blocks={toBlocks(GREETING)} />
          </div>
        </OracleSays>

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="oMsg u">
              <div className="oBub" data-testid="text-oracle-question">
                {m.text}
              </div>
            </div>
          ) : (
            <OracleSays key={i}>
              <div className="oBub" data-testid="text-oracle-reply">
                <Bubble blocks={toBlocks(m.text)} />
              </div>
              {m.meta ? <p className="oMeta">{m.meta}</p> : null}
            </OracleSays>
          ),
        )}

        {thinkingNow ? (
          <OracleSays>
            <div className="oBub">
              <div className="oThinking">
                <span className="oDots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{thinking}</span>
              </div>
            </div>
          </OracleSays>
        ) : null}

        {streaming ? (
          <OracleSays className="oMsg o oStream">
            <div className="oBub">
              <Bubble blocks={toBlocks(trimDangling(stream))} />
            </div>
          </OracleSays>
        ) : null}

        {error ? (
          <p className="oNote" role="alert">
            <span>{error.message}</span>
            {error.retry ? (
              <button type="button" onClick={retry} data-testid="button-oracle-retry">
                Încearcă din nou
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      {showSuggestions ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "0 clamp(14px,2.4vw,24px) 12px" }}>
          {SUGGESTIONS.map((text, i) => (
            <button key={text} className="oSg" type="button" onClick={() => send(text)} data-testid={`button-oracle-suggestion-${i}`}>
              {text}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ margin: "0", padding: "0 clamp(12px,2vw,20px)" }}>
        <div className="oComp">
          <label className="sr" htmlFor="orcIn">
            Întrebarea ta pentru Oracol
          </label>
          <textarea
            id="orcIn"
            ref={area}
            rows={1}
            maxLength={1500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Întreabă-l ceva, de exemplu „ce face botul?”"
            data-testid="input-oracle-question"
          />
          <button
            className={busy ? "oSend stop" : "oSend"}
            type="submit"
            aria-label={busy ? "Oprește răspunsul" : "Trimite întrebarea"}
            disabled={sendDisabled}
            data-testid="button-oracle-send"
          >
            {busy ? (
              <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <path d="M8.5 7h7A1.5 1.5 0 0 1 17 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7z" />
              </svg>
            ) : (
              <svg className="ico" aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </form>
      <p style={{ margin: "0", padding: "10px 20px 14px", textAlign: "center", fontSize: "12.5px", lineHeight: "1.45", color: "#8F8B86" }}>
        Răspunsurile vin din arhiva Oracolului. Pentru reguli și sancțiuni, întreabă staff-ul pe Discord.
      </p>
    </div>
  );
}
