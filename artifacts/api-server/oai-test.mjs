import OpenAI from "openai";

const key = process.env.OPENAI_API_KEY;
console.log("key present:", !!key, "len:", key ? key.length : 0, "prefix:", key ? key.slice(0, 3) : "n/a");
if (!key) process.exit(0);

try {
  const client = new OpenAI({ apiKey: key, timeout: 25000, maxRetries: 1 });
  const res = await client.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 64,
    messages: [
      { role: "system", content: "Răspunde scurt, în română." },
      { role: "user", content: "Spune un singur cuvânt: merge?" },
    ],
  });
  console.log("OK:", JSON.stringify(res.choices?.[0]?.message?.content));
} catch (e) {
  console.log("FAIL type:", e?.constructor?.name, "status:", e?.status, "code:", e?.code, "msg:", e?.message);
}
