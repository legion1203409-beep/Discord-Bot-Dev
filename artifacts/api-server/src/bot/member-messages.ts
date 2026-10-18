import OpenAI from "openai";
import type { GuildMember, TextChannel } from "discord.js";
import { getGameplayConfig } from "./gameplay-store";
import type { MemberMessageStyle } from "./gameplay-config";

type MemberMessageEvent = "welcome" | "leave";
type MemberMessageMember = Pick<GuildMember, "id" | "guild"> & {
  user: Pick<GuildMember["user"], "bot">;
};

const STYLE_INSTRUCTIONS: Record<Exclude<MemberMessageStyle, "custom">, string> = {
  medieval: "ton medieval, ca un vestitor dintr-un regat vechi, dar clar și prietenos",
  normal: "ton natural, modern și prietenos",
  fantasy: "ton de poveste fantasy, cu magie și aventură, fără limbaj greu de înțeles",
  sci_fi: "ton futurist, de science-fiction, prietenos și ușor de înțeles",
  humorous: "ton amuzant și binevoitor, fără sarcasm răutăcios sau jigniri",
};

type MemberMessageHolidayTheme = "halloween" | "christmas" | null;

export function getMemberMessageHolidayTheme(date = new Date()): MemberMessageHolidayTheme {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month === 10) return "halloween";
  if (month === 12 || (month === 1 && day <= 6)) return "christmas";
  return null;
}

const HOLIDAY_INSTRUCTIONS: Record<Exclude<MemberMessageHolidayTheme, null>, string> = {
  halloween: "Este luna octombrie: adaugă discret o atmosferă veselă de Halloween, cu elemente precum dovleci, frunze de toamnă sau fantome prietenoase. Păstrează mesajul cald și potrivit comunității; fără amenințări sau groază intensă.",
  christmas: "Este perioada Crăciunului: adaugă discret o atmosferă caldă de sărbătoare, cu lumini, zăpadă sau urări de bine. Păstrează mesajul prietenos și potrivit comunității.",
};

let openAiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nu este configurată pentru generarea mesajelor de membri.");
  openAiClient ??= new OpenAI({ apiKey });
  return openAiClient;
}

export function buildMemberMessagePrompt(
  event: MemberMessageEvent,
  style: MemberMessageStyle,
  customStyle: string,
  date = new Date(),
): string {
  const occasion = event === "welcome"
    ? "Scrie un mesaj de bun venit pentru o persoană care tocmai a intrat pe server."
    : "Scrie un mesaj politicos de rămas-bun pentru o persoană care a părăsit serverul.";
  const styleInstruction = style === "custom"
    ? customStyle.trim() || STYLE_INSTRUCTIONS.normal
    : STYLE_INSTRUCTIONS[style];
  const holidayTheme = getMemberMessageHolidayTheme(date);

  return [
    "Ești autorul mesajelor unei comunități Discord.",
    occasion,
    `Scrie în limba română, într-un ton ${styleInstruction}.`,
    ...(holidayTheme ? [HOLIDAY_INSTRUCTIONS[holidayTheme]] : []),
    "Generează un text nou, natural, de una sau două propoziții scurte, maximum 240 de caractere.",
    "Nu scrie nume de utilizatori, mențiuni, ID-uri, @everyone sau @here; botul adaugă separat mențiunea persoanei.",
    "Nu include instrucțiuni, explicații, ghilimele sau text în afara mesajului.",
  ].join(" ");
}

function cleanGeneratedText(value: string): string {
  return value
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, "")
    .replace(/@(?:everyone|here)/gi, "")
    .trim()
    .slice(0, 1_800);
}

async function generateMemberMessage(event: MemberMessageEvent, style: MemberMessageStyle, customStyle: string): Promise<string> {
  const response = await getOpenAiClient().chat.completions.create(
    {
      model: process.env.ORACLE_AI_MODEL?.trim() || "gpt-5-mini",
      max_completion_tokens: 8_192,
      messages: [{ role: "system", content: buildMemberMessagePrompt(event, style, customStyle) }],
    },
    { timeout: 15_000, maxRetries: 1 },
  );
  const message = response.choices[0]?.message?.content;
  const cleaned = typeof message === "string" ? cleanGeneratedText(message) : "";
  if (!cleaned) throw new Error("Modelul AI a returnat un mesaj gol pentru anunțul de membru.");
  return cleaned;
}

export async function sendAiMemberMessage(member: MemberMessageMember, event: MemberMessageEvent): Promise<boolean> {
  if (member.user.bot) return false;

  const config = getGameplayConfig(member.guild.id).memberMessages;
  const enabled = event === "welcome" ? config.welcomeEnabled : config.leaveEnabled;
  if (!enabled) return false;
  if (!config.channelId) throw new Error("Canalul pentru mesajele de membri nu este configurat.");

  const fetchedChannel = await member.guild.channels.fetch(config.channelId);
  if (!fetchedChannel?.isTextBased() || !("send" in fetchedChannel)) {
    throw new Error(`Canalul configurat pentru mesajele de membri nu este accesibil: ${config.channelId}`);
  }

  const generatedMessage = await generateMemberMessage(event, config.style, config.customStyle);
  const content = `<@${member.id}> ${generatedMessage}`.slice(0, 2_000);
  await (fetchedChannel as TextChannel).send({
    content,
    allowedMentions: { parse: [], users: [member.id] },
  });
  return true;
}