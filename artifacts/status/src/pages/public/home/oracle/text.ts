/**
 * Textul unui răspuns, împărțit în paragrafe și puncte de listă, cu **bold** și
 * `cod`. Nu se generează niciodată HTML: React primește bucăți de text.
 */

export type Run = { text: string; kind: "plain" | "bold" | "code" };
export type Block = { list: boolean; runs: Run[] };

const EMPTY: Block = { list: false, runs: [{ text: "", kind: "plain" }] };

export function toBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  String(input || "")
    .replace(/\r/g, "")
    .split("\n")
    .forEach((line) => {
      const raw = line.trim();
      if (!raw) return;
      const list = /^[-*•]\s+/.test(raw);
      const body = list ? raw.replace(/^[-*•]\s+/, "") : raw.replace(/^#{1,6}\s+/, "");
      const runs: Run[] = [];
      const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body))) {
        if (m.index > last) runs.push({ text: body.slice(last, m.index), kind: "plain" });
        const token = m[0];
        if (token[0] === "*") runs.push({ text: token.slice(2, -2), kind: "bold" });
        else runs.push({ text: token.slice(1, -1), kind: "code" });
        last = m.index + token.length;
      }
      if (last < body.length) runs.push({ text: body.slice(last), kind: "plain" });
      // *accent* simplu devine text obișnuit
      runs.forEach((run) => {
        if (run.kind === "plain") run.text = run.text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2");
      });
      blocks.push({ list, runs: runs.length ? runs : EMPTY.runs });
    });
  return blocks.length ? blocks : [EMPTY];
}

/**
 * Cât timp răspunsul se scrie cuvânt cu cuvânt, `**bold**` sau `cod` poate fi
 * deschis și încă neînchis. Tăiem capătul neterminat, ca pe ecran să nu apară
 * asteriscuri sau ghilimele inverse rătăcite.
 */
export function trimDangling(text: string): string {
  let out = text;
  const bold = out.lastIndexOf("**");
  if ((out.match(/\*\*/g) || []).length % 2 === 1) out = out.slice(0, bold);
  const tick = out.lastIndexOf("`");
  if ((out.match(/`/g) || []).length % 2 === 1) out = out.slice(0, tick);
  return out;
}
