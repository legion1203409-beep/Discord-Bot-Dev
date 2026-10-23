import { useCallback, useEffect, useRef, useState } from "react";
import { THINKING, answer, type OracleFacts } from "./archive";
import { trimDangling } from "./text";

export interface ChatMessage {
  role: "user" | "bot";
  text: string;
  /** Mică precizare sub răspuns: de unde vine sau dacă a fost oprit. */
  meta?: string;
}

export interface ChatError {
  message: string;
  /** Întrebarea de reluat; gol dacă nu are sens să o reiei. */
  retry: string;
}

const MAX_MESSAGES = 30;
/** Cât de lungă poate fi o întrebare; câmpul de text folosește aceeași limită. */
export const MAX_QUESTION = 1500;
const SOURCE = "Arhiva Oracolului";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function keepRecent(list: ChatMessage[]): ChatMessage[] {
  return list.slice(-MAX_MESSAGES);
}

/**
 * Conversația cu Oracolul. Răspunsurile vin din arhiva scrisă dinainte
 * (`archive.ts`) și se așază pe ecran cuvânt cu cuvânt, ca și cum Oracolul ar
 * scrie. Nimic nu pleacă din browser către un server.
 */
export function useOracleChat(facts: OracleFacts) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [error, setError] = useState<ChatError | null>(null);
  const [thinking, setThinking] = useState<string>(THINKING[0]);
  const [spoke, setSpoke] = useState(false);

  /** Faptele cele mai noi, fără să refacă funcțiile de mai jos la fiecare cifră nouă. */
  const factsRef = useRef(facts);
  useEffect(() => {
    factsRef.current = facts;
  }, [facts]);

  /** `turn` crește la fiecare întrebare nouă, oprire sau conversație nouă; un răspuns întârziat se leapădă singur. */
  const run = useRef({ turn: 0, busy: false, partial: "", typeTimer: 0, spokeTimer: 0 });
  /** Dacă cititorul a derulat în sus, nu-l mai tragem în jos la fiecare cuvânt. */
  const stickToBottom = useRef(true);

  const send = useCallback((raw: string) => {
    const q = raw.trim().slice(0, MAX_QUESTION);
    const r = run.current;
    if (!q || r.busy) return;

    const turn = ++r.turn;
    r.busy = true;
    r.partial = "";
    stickToBottom.current = true;
    setMessages((list) => keepRecent([...list, { role: "user", text: q }]));
    setDraft("");
    setBusy(true);
    setStream("");
    setError(null);
    setThinking(THINKING[Math.floor(Math.random() * THINKING.length)]);
    setSpoke(false);

    const alive = () => turn === run.current.turn;
    const finish = (reply: string) => {
      if (!alive()) return;
      r.busy = false;
      r.partial = "";
      stickToBottom.current = true;
      setMessages((list) => keepRecent([...list, { role: "bot", text: reply, meta: SOURCE }]));
      setBusy(false);
      setStream("");
      setSpoke(true);
      window.clearTimeout(r.spokeTimer);
      r.spokeTimer = window.setTimeout(() => setSpoke(false), 1400);
    };

    let reply: string;
    try {
      reply = answer(q, factsRef.current);
    } catch {
      r.busy = false;
      setBusy(false);
      setError({ message: "Oracolul nu poate răspunde acum.", retry: q });
      return;
    }

    if (reducedMotion()) {
      finish(reply);
      return;
    }

    const words = reply.split(/(\s+)/);
    let at = 0;
    let written = "";
    const step = () => {
      if (!alive()) return;
      const end = Math.min(words.length, at + 4);
      while (at < end) written += words[at++];
      if (at < words.length) {
        r.partial = written;
        setStream(written);
        r.typeTimer = window.setTimeout(step, 30);
      } else {
        finish(reply);
      }
    };
    r.typeTimer = window.setTimeout(step, 420);
  }, []);

  /** Oprește scrierea; ce apucase să scrie rămâne pe ecran. */
  const stop = useCallback(() => {
    const r = run.current;
    if (!r.busy) return;
    r.turn += 1;
    window.clearTimeout(r.typeTimer);
    r.busy = false;
    const partial = trimDangling(r.partial).trim();
    r.partial = "";
    if (partial) setMessages((list) => keepRecent([...list, { role: "bot", text: partial, meta: "oprit" }]));
    setBusy(false);
    setStream("");
  }, []);

  const newConversation = useCallback(() => {
    const r = run.current;
    r.turn += 1;
    window.clearTimeout(r.typeTimer);
    r.busy = false;
    r.partial = "";
    setMessages([]);
    setBusy(false);
    setStream("");
    setError(null);
    setDraft("");
    setSpoke(false);
  }, []);

  const retry = useCallback(() => {
    if (!error?.retry) return;
    const q = error.retry;
    setMessages((list) => {
      const last = list[list.length - 1];
      return last && last.role === "user" && last.text === q ? list.slice(0, -1) : list;
    });
    setError(null);
    send(q);
  }, [error, send]);

  useEffect(() => {
    const r = run.current;
    return () => {
      r.turn += 1;
      window.clearTimeout(r.typeTimer);
      window.clearTimeout(r.spokeTimer);
    };
  }, []);

  return { messages, draft, setDraft, busy, stream, error, thinking, spoke, send, stop, newConversation, retry, stickToBottom };
}

export type OracleChatState = ReturnType<typeof useOracleChat>;
