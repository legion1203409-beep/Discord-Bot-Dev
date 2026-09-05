import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { loadAllianceRecruitmentText } from "./db";
import { IMG } from "./assets";
import type { OracleTicketKind } from "./oracle-chat";

const TICKET_COLORS: Record<OracleTicketKind, number> = {
  staff: 0x9b4655,
  partnership: 0x7c8fbd,
  help_report: 0x9d6578,
};

const TICKET_LABELS: Record<OracleTicketKind, string> = {
  staff: "Aplicare Staff",
  partnership: "Propunere de Parteneriat",
  help_report: "Ajutor / Raportare",
};

const TICKET_ICONS: Record<OracleTicketKind, string> = {
  staff: "🛡️",
  partnership: "🤝",
  help_report: "🕯️",
};

const TICKET_SEAL = IMG.ticketSeal;
export const STAFF_REVIEW_ROLE_ID = "1472526137308745909";
export const ALLIANCE_PUBLIC_CHANNEL_ID = "1472997077373157602";
export const INCOMPLETE_TICKET_TIMEOUT_MS = 30 * 60 * 1000;
const REGAT_RECRUITMENT_GIF_URL =
  "https://media.discordapp.net/attachments/1477699914732404977/1477704399936688212/standard.gif?ex=6a45e937&is=6a4497b7&hm=f9c71749fd5197b10bcdb4d367da427d7e2e58283087d29907d73fc8d12015b0";
const REGAT_INVITE_URL = "https://discord.gg/regatulcenusii";
const REGATUL_CENUSII_DESCRIPTION =
  "Regatul Cenușii este un server Discord RPG cooperativ dark-fantasy, cu clase, lupte, boss-i, XP, Oboli, companioni, relicve și evenimente pentru întreaga comunitate.";

type RoleMembership = {
  roles:
    | readonly string[]
    | {
        cache: {
          has(roleId: string): boolean;
        };
      };
};

export function memberHasStaffReviewRole(
  member: RoleMembership | null | undefined,
): boolean {
  if (!member) return false;
  return "cache" in member.roles
    ? member.roles.cache.has(STAFF_REVIEW_ROLE_ID)
    : member.roles.includes(STAFF_REVIEW_ROLE_ID);
}

const postedTicketPanels = new Set<string>();
const ticketPanelLocks = new Map<string, Promise<boolean>>();
const ticketDeletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
type TicketProgressState = {
  currentStep: number;
  panelMessageId: string;
  applicantUsername?: string;
  responseMessageId?: string;
  answers?: Record<string, string>;
  alliancePosted?: boolean;
  status?: "completed" | "rejected";
};
const ticketProgress = new Map<string, TicketProgressState>();

type TicketQuestion = {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  multiline?: boolean;
};

const TICKET_QUESTIONS: Record<OracleTicketKind, TicketQuestion[]> = {
  staff: [
    {
      key: "name",
      label: "1. Nume",
      description: "Care este numele tău?",
      placeholder: "Ex.: Andrei",
    },
    {
      key: "age",
      label: "2. Vârstă",
      description: "Ce vârstă ai?",
      placeholder: "Ex.: 21",
    },
    {
      key: "moderation",
      label: "3. Experiență în moderare",
      description: "Ai experiență în moderare?",
      placeholder: "Unde ai mai moderat și ce ai învățat?",
      multiline: true,
    },
    {
      key: "availability",
      label: "4. Timp disponibil",
      description: "Cât timp poți dedica serverului?",
      placeholder: "Ex.: 1–2 ore pe zi",
    },
    {
      key: "motivation",
      label: "5. De ce dorești rolul?",
      description: "De ce dorești rolul de staff?",
      placeholder: "Ce te motivează să ajuți Regatul?",
      multiline: true,
    },
    {
      key: "conflict",
      label: "6. Conflict între membri",
      description: "Cum ai rezolva un conflict între membri?",
      placeholder: "Descrie pașii pe care i-ai urma.",
      multiline: true,
    },
    {
      key: "improvements",
      label: "7. Îmbunătățiri pentru server",
      description: "Ce ai îmbunătăți pe server?",
      placeholder: "Propune una sau mai multe îmbunătățiri.",
      multiline: true,
    },
    {
      key: "server_tag",
      label: "8. Tag-ul serverului",
      description: "Accepți să porți tag-ul serverului?",
      placeholder: "Răspunde clar cu Da sau Nu.",
    },
  ],
  partnership: [
    {
      key: "server_name",
      label: "1. Numele serverului",
      description: "Cum se numește serverul vostru?",
      placeholder: "Ex.: Regatul Umbrelor",
    },
    {
      key: "representative",
      label: "2. Reprezentantul serverului",
      description: "Cine reprezintă serverul în această alianță?",
      placeholder: "Numele și username-ul reprezentantului",
    },
    {
      key: "invite",
      label: "3. Linkul serverului",
      description: "Care este invitația Discord a serverului?",
      placeholder: "https://discord.gg/...",
    },
    {
      key: "members",
      label: "4. Membri și activitate",
      description: "Câți membri aveți și câți sunt activi aproximativ?",
      placeholder: "Ex.: 2.000 total · 300 activi",
    },
    {
      key: "description",
      label: "5. Descrierea serverului",
      description: "Descrieți serverul, tematica și comunitatea. Nu includeți linkul aici.",
      placeholder: "Prezentați serverul și atmosfera comunității.",
      multiline: true,
    },
    {
      key: "motivation",
      label: "6. Motivul alianței",
      description: "De ce doriți o alianță cu Regatul Cenușii?",
      placeholder: "Ce vă face să căutați acest pact?",
      multiline: true,
    },
    {
      key: "offer",
      label: "7. Ce oferă serverul vostru",
      description: "Ce puteți oferi în cadrul alianței?",
      placeholder: "Promovare, evenimente, comunitate sau alte beneficii.",
      multiline: true,
    },
    {
      key: "terms",
      label: "8. Așteptări și reguli",
      description: "Ce așteptați de la Regatul Cenușii și acceptați regulile pactului?",
      placeholder: "Scrieți condițiile și confirmați că veți respecta alianța.",
      multiline: true,
    },
  ],
  help_report: [
    {
      key: "type",
      label: "Tipul solicitării",
      description: "Este ajutor tehnic sau raportare?",
      placeholder: "Ex.: ajutor tehnic / raportare",
    },
    {
      key: "target",
      label: "Membrul raportat",
      description: "Completează dacă este o raportare.",
      placeholder: "Numele sau mențiunea membrului",
    },
    {
      key: "description",
      label: "Ce s-a întâmplat?",
      description: "Descrie cazul cât mai clar.",
      placeholder: "Povestește ce s-a întâmplat.",
      multiline: true,
    },
    {
      key: "when",
      label: "Când s-a întâmplat?",
      description: "Data sau momentul aproximativ.",
      placeholder: "Ex.: astăzi, în jurul orei 18:00",
    },
    {
      key: "evidence",
      label: "Dovezi",
      description: "Linkuri, capturi sau mesaje relevante.",
      placeholder: "Adaugă linkuri sau explică ce dovezi ai.",
      multiline: true,
    },
  ],
};

function ticketQuestion(kind: OracleTicketKind, key: string): TicketQuestion | null {
  return TICKET_QUESTIONS[kind].find((question) => question.key === key) ?? null;
}

function ticketPanelFallback(kind: OracleTicketKind): string {
  if (kind === "staff") {
    return (
      "🛡️ **Aplicare Staff**\n\n" +
      "Tag-ul serverului este obligatoriu pentru validarea aplicației.\n" +
      "Fără tag → aplicația este respinsă automat.\n\n" +
      "Apasă butonul pentru a răspunde la întrebări în ordinea afișată."
    );
  }
  if (kind === "partnership") {
    return (
      "🤝 **Propunere de Parteneriat**\n\n" +
      "Alege din meniul interactiv informațiile despre server, comunitate și colaborare."
    );
  }
  return "🕯️ **Ajutor / Raportare**\n\nAlege din meniul interactiv ce vrei să descrii pentru staff.";
}

function isLegacyOracleTicketPrompt(message: Message, botId: string): boolean {
  if (message.author.id !== botId || message.components.length > 0) return false;
  const content = message.content ?? "";
  const hasTicketTitle =
    /(?:Aplicare Staff|Propunere de Parteneriat|Ajutor\s*\/\s*Raportare)/i.test(content);
  const numberedQuestions = content.match(/(?:^|\n)\s*\d+[.)]\s/g)?.length ?? 0;
  return hasTicketTitle && numberedQuestions >= 5;
}

function ticketStartButton(kind: OracleTicketKind): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`ticket_start_${kind}`)
    .setLabel("Deschide contractul")
    .setStyle(ButtonStyle.Primary);
}

export function ticketStatusRow(
  kind: OracleTicketKind,
  status: "completed" | "rejected",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_status_${kind}_${status}`)
      .setLabel(status === "completed" ? "Contract completat" : "Contract respins")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

export function ticketPanelPayload(kind: OracleTicketKind): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const color = TICKET_COLORS[kind];
  const icon = TICKET_ICONS[kind];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${TICKET_LABELS[kind]}`)
    .setDescription(
      kind === "staff"
        ? "Un contract de candidatură pentru Regatul Cenușii.\nApasă butonul pentru a începe cu întrebarea 1 și continuă pas cu pas."
        : kind === "partnership"
          ? "Un contract de colaborare între două comunități.\nApasă butonul pentru a începe cu întrebarea 1."
          : "O declarație pentru staff, cu toate detaliile necesare.\nApasă butonul pentru a începe cu întrebarea 1.",
    )
    .addFields(
      kind === "staff"
        ? [
            {
              name: "⚠️ Clauză obligatorie",
              value:
                "Tag-ul serverului este **OBLIGATORIU** pentru validarea aplicației.\n" +
                "Fără tag, aplicația este respinsă automat.",
            },
            {
              name: "📜 Contractul",
               value:
                 `${TICKET_QUESTIONS.staff.length} întrebări · două pagini de formular.\n` +
                 "Completează formularul în două etape și trimite fiecare pagină.",
            },
          ]
        : kind === "partnership"
          ? [
              {
                name: "📜 Contractul",
                value: `${TICKET_QUESTIONS[kind].length} întrebări · două pagini de formular`,
              },
            ]
          : [
              {
                name: "📜 Declarația",
                value: "5 informații · înaintezi cu butonul „Următoarea”",
              },
            ],
    )
    .setFooter({ text: "Regatul Cenușii · Citește înainte de a începe" });
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(ticketStartButton(kind));

  return { embeds: [embed], components: [row] };
}

export async function postTicketPanelIfMissing(
  channel: Message["channel"],
  kind: OracleTicketKind,
  botId: string,
): Promise<boolean> {
  if (postedTicketPanels.has(channel.id)) return false;
  const pending = ticketPanelLocks.get(channel.id);
  if (pending) {
    await pending;
    return false;
  }

  const operation = (async () => {
    if (!channel.isTextBased() || !("messages" in channel) || !("send" in channel)) {
      return false;
    }

    const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
    const legacyPrompts = recent?.filter((entry) => isLegacyOracleTicketPrompt(entry, botId));
    if (legacyPrompts?.size) {
      await Promise.all(
        legacyPrompts.map((entry) =>
          entry.delete().catch((err) => {
            logger.debug(
              { err, channelId: channel.id, messageId: entry.id },
              "Could not remove legacy Oracle ticket prompt",
            );
          }),
        ),
      );
    }
    const existingPanel = recent?.find((entry) => isTicketPanelMessage(entry, botId));
    if (existingPanel) {
      const isActivePanel = existingPanel.components.some((row) => {
        if (!("components" in row)) return false;
        return row.components.some(
          (component) =>
            "customId" in component &&
            component.customId === `ticket_start_${kind}`,
        );
      });
      if (isActivePanel) {
        await existingPanel.edit(ticketPanelPayload(kind)).catch((err) => {
          logger.warn(
            { err, channelId: channel.id, ticketKind: kind },
            "Could not refresh existing interactive ticket panel",
          );
        });
      }
      postedTicketPanels.add(channel.id);
      return false;
    }

    try {
      await channel.send(ticketPanelPayload(kind));
    } catch (err) {
      logger.error(
        { err, channelId: channel.id, ticketKind: kind },
        "Interactive ticket panel failed — sending plain-text fallback",
      );
      try {
        await channel.send({
          content: ticketPanelFallback(kind),
          allowedMentions: { parse: [] },
        });
      } catch (fallbackErr) {
        logger.error(
          { err: fallbackErr, channelId: channel.id, ticketKind: kind },
          "Ticket panel fallback could not be posted",
        );
        return false;
      }
    }
    postedTicketPanels.add(channel.id);
    return true;
  })();

  ticketPanelLocks.set(channel.id, operation);
  try {
    return await operation;
  } finally {
    ticketPanelLocks.delete(channel.id);
  }
}

function hasFinishedTicketStatus(message: {
  components?: readonly { components?: readonly { customId?: string | null }[] }[];
}): boolean {
  return (message.components ?? []).some((row) =>
    (row.components ?? []).some((component) =>
      typeof component.customId === "string" &&
      /^ticket_status_(staff|partnership|help_report)_(completed|rejected)$/.test(component.customId),
    ),
  );
}

async function ticketHasFinishedStatus(channel: {
  messages?: {
    fetch?: (options: { limit: number }) => Promise<Iterable<{ components?: readonly { components?: readonly { customId?: string | null }[] }[] }>>;
  };
}): Promise<boolean> {
  const messages = await channel.messages?.fetch?.({ limit: 100 }).catch(() => null);
  if (!messages) return false;
  for (const message of messages) {
    if (hasFinishedTicketStatus(message)) return true;
  }
  return false;
}

export function scheduleIncompleteTicketDeletion(channel: unknown): void {
  if (!channel || typeof channel !== "object") return;
  const candidate = channel as {
    id?: string;
    createdTimestamp?: number;
    delete?: (reason?: string) => Promise<unknown>;
    messages?: {
      fetch?: (options: { limit: number }) => Promise<Iterable<{ components?: readonly { components?: readonly { customId?: string | null }[] }[] }>>;
    };
  };
  if (
    !candidate.id ||
    typeof candidate.createdTimestamp !== "number" ||
    typeof candidate.delete !== "function"
  ) {
    return;
  }

  const existingTimer = ticketDeletionTimers.get(candidate.id);
  if (existingTimer) clearTimeout(existingTimer);
  const deleteChannel = candidate.delete;
  if (!deleteChannel) return;

  const delay = Math.max(
    0,
    INCOMPLETE_TICKET_TIMEOUT_MS - (Date.now() - candidate.createdTimestamp),
  );
  const timer = setTimeout(async () => {
    ticketDeletionTimers.delete(candidate.id!);
    const channelId = candidate.id!;
    const progressFinished = [...ticketProgress.entries()].some(
      ([key, state]) => key.startsWith(`${channelId}:`) && Boolean(state.status),
    );
    if (progressFinished || await ticketHasFinishedStatus(candidate)) return;

    try {
      await deleteChannel.call(candidate, "Ticket incomplet după 30 de minute");
      postedTicketPanels.delete(channelId);
      for (const key of ticketProgress.keys()) {
        if (key.startsWith(`${channelId}:`)) ticketProgress.delete(key);
      }
      logger.info({ channelId }, "Incomplete ticket deleted after 30 minutes");
    } catch (err) {
      logger.debug({ err, channelId }, "Incomplete ticket could not be deleted");
    }
  }, delay);
  timer.unref?.();
  ticketDeletionTimers.set(candidate.id, timer);
}

function input(
  customId: string,
  label: string,
  placeholder: string,
  style = TextInputStyle.Short,
  required = true,
): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(style === TextInputStyle.Paragraph ? 900 : 200);
}

export function ticketModal(kind: OracleTicketKind): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_${kind}`)
    .setTitle(
      kind === "staff"
        ? "Aplicare Staff · 1/2"
        : kind === "partnership"
          ? "Propunere de Parteneriat · 1/2"
          : TICKET_LABELS[kind],
    );

  const fields =
    kind === "staff"
      ? [
          input("staff_name", "Nume", "Ex.: Andrei"),
          input("staff_age", "Vârsta", "Ex.: 21"),
          input("staff_experience", "Experiență în moderare", "Unde ai mai moderat și ce ai învățat?", TextInputStyle.Paragraph),
          input("staff_availability", "Timp disponibil", "Ex.: 1–2 ore pe zi"),
          input("staff_motivation", "De ce staff?", "De ce vrei să ajuți Regatul?", TextInputStyle.Paragraph),
        ]
      : kind === "partnership"
        ? [
            input("partnership_name", "Numele serverului", "Ex.: Regatul Umbrelor"),
            input("partnership_representative", "Reprezentantul serverului", "Nume și username Discord"),
            input("partnership_invite", "Invitație / link", "https://discord.gg/..."),
            input("partnership_members", "Membri și activitate", "Ex.: 2.000 total · 300 activi"),
            input(
              "partnership_description",
              "Descrierea serverului",
              "Tematică, comunitate și ce oferiți, fără link aici",
              TextInputStyle.Paragraph,
            ),
          ]
        : [
            input("help_type", "Tipul solicitării", "Ajutor tehnic sau raportare membru"),
            input("help_target", "Membrul raportat", "Completează doar dacă este o raportare", TextInputStyle.Short, false),
            input("help_description", "Ce s-a întâmplat?", "Descrie cazul cât mai clar", TextInputStyle.Paragraph),
            input("help_when", "Când s-a întâmplat?", "Data sau momentul aproximativ"),
            input("help_evidence", "Dovezi", "Linkuri, capturi sau mesaje relevante", TextInputStyle.Paragraph, false),
          ];

  for (const field of fields) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
  }
  return modal;
}

export function staffDetailsModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ticket_form_staff_details")
    .setTitle("Aplicare Staff · 2/2");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_conflict",
        "Cum ai rezolva un conflict?",
        "Descrie cum ai gestiona un conflict între membri",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_improvements",
        "Ce ai îmbunătăți pe server?",
        "Propune una sau mai multe îmbunătățiri",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_tag",
        "Accepți să porți tag-ul?",
        "Răspunde clar cu Da sau Nu.",
      ),
    ),
  );
  return modal;
}

export function partnershipDetailsModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ticket_form_partnership_details")
    .setTitle("Propunere de Parteneriat · 2/2");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_motivation",
        "Motivul alianței",
        "De ce doriți o alianță cu Regatul Cenușii?",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_offer",
        "Ce oferă serverul vostru",
        "Promovare, evenimente, comunitate sau alte beneficii.",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_terms",
        "Așteptări și reguli",
        "Ce așteptați și acceptați regulile pactului?",
        TextInputStyle.Paragraph,
      ),
    ),
  );
  return modal;
}

export function ticketRequirementsEmbed(kind: OracleTicketKind): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TICKET_COLORS[kind])
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Întrebări`)
    .setFooter({ text: "Răspunde sincer și clar · Regatul Cenușii" });
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  if (kind === "staff") {
    embed.setDescription(
      "Tag-ul serverului este obligatoriu pentru validarea aplicației.\n\n" +
        "1. Care este numele tău?\n" +
        "2. Ce vârstă ai?\n" +
        "3. Ai experiență în moderare?\n" +
        "4. Cât timp poți dedica serverului?\n" +
        "5. De ce dorești rolul de staff?\n" +
        "6. Cum ai rezolva un conflict între membri?\n" +
        "7. Ce ai îmbunătăți pe server?\n" +
        "8. Accepți să porți tag-ul serverului?",
    );
  } else if (kind === "partnership") {
    embed.setDescription(
      "Pentru parteneriat, pregătește:\n\n" +
        "• numele serverului;\n" +
        "• reprezentantul serverului;\n" +
        "• invitația sau linkul serverului;\n" +
        "• numărul total și activ de membri;\n" +
        "• descrierea serverului — fără linkul de invitație în acest răspuns;\n" +
        "• motivul alianței;\n" +
        "• ce poate oferi serverul și ce așteaptă de la Regatul Cenușii;\n" +
        "• acceptarea regulilor pactului.",
    );
  } else {
    embed.setDescription(
      "Pentru ajutor, explică problema și pașii care au dus la ea.\n\n" +
        "Pentru raportare, include membrul raportat, ce s-a întâmplat, când s-a întâmplat și dovezile disponibile.\n\n" +
        "Raportările rămân confidențiale și sunt analizate de staff.",
    );
  }
  return embed;
}

function safeAnswer(value: string | undefined, fallback = "—"): string {
  return (value?.trim() || fallback).replace(/@/g, "@\u200b").slice(0, 900);
}

export function staffOracleReviewPayload(username: string): {
  content: string;
  embeds: EmbedBuilder[];
  allowedMentions: { parse: never[]; roles: string[] };
} {
  const safeUsername = safeAnswer(username, "călătorul");
  const embed = new EmbedBuilder()
    .setColor(0xc29a52)
    .setTitle("🕯️ Cuvântul Oracolului")
    .setDescription(
      `„Am citit cele opt răspunsuri ale lui **${safeUsername}** și le-am așezat sub lumina Cenușii. ` +
        "Candidatura este vrednică de judecata Străjerilor; nu dau încă un verdict, căci pecetea finală aparține staffului.”",
    )
    .addFields({
      name: "📜 Următorul pas",
      value:
        "Cei chemați sub acest steag vor cerceta răspunsurile și vor reveni cu hotărârea lor. " +
        "Rămâi în ticket până când judecata este rostită.",
      inline: false,
    })
    .setFooter({ text: "Oracolul Cenușii · Candidatura a fost pecetluită" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  return {
    content: `<@&${STAFF_REVIEW_ROLE_ID}>`,
    embeds: [embed],
    allowedMentions: { parse: [], roles: [STAFF_REVIEW_ROLE_ID] },
  };
}

export function partnershipSummaryEmbed(
  username: string,
  answers: Record<string, string>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x7c8fbd)
    .setTitle("🤝 Pactul celor Două Regate · Rezumat")
    .setAuthor({
      name: `${safeAnswer(username, "Reprezentant")} · Solicitant`,
    })
    .setDescription(
      "Datele de mai jos pot fi preluate rapid de către staff pentru verificarea alianței.",
    )
    .addFields(
      {
        name: "🏰 Numele serverului",
        value: safeAnswer(answers.server_name),
        inline: false,
      },
      {
        name: "📝 Descrierea serverului",
        value: safeAnswer(answers.description),
        inline: false,
      },
      {
        name: "🔗 Linkul serverului",
        value: safeAnswer(answers.invite),
        inline: false,
      },
      {
        name: "👤 Reprezentantul serverului",
        value: safeAnswer(answers.representative),
        inline: false,
      },
      {
        name: "👥 Membri și activitate",
        value: safeAnswer(answers.members),
        inline: false,
      },
      {
        name: "🕯️ Motivul alianței",
        value: safeAnswer(answers.motivation),
        inline: false,
      },
      {
        name: "🎁 Ce oferă serverul",
        value: safeAnswer(answers.offer),
        inline: false,
      },
      {
        name: "📜 Așteptări și reguli",
        value: safeAnswer(answers.terms),
        inline: false,
      },
    )
    .setFooter({ text: "Regatul Cenușii · Verifică pactul înainte de publicare" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  return embed;
}

export function partnershipConfirmRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_confirm_${userId}`)
      .setLabel("🤝 Confirmă alianța")
      .setStyle(ButtonStyle.Success),
  );
}

export function partnershipHasUnder200Members(value: string | undefined): boolean {
  const normalized = value?.trim().replace(/\s/g, "") ?? "";
  const match = normalized.match(/\d{1,3}(?:[.,]\d{3})*|\d+/);
  if (!match) return false;
  const total = Number(match[0].replace(/[.,](?=\d{3}(?:\D|$))/g, ""));
  return Number.isFinite(total) && total < 200;
}

function addSmallServerPromotionRule(
  embed: EmbedBuilder,
  members: string | undefined,
): void {
  if (partnershipHasUnder200Members(members)) {
    embed.addFields({
      name: "📌 Regula promovării",
      value: "Serverele cu sub 200 de membri se promovează fără niciun ping.",
      inline: false,
    });
  }
}

export function partnershipDraftEmbed(
  username: string,
  answers: Record<string, string>,
): EmbedBuilder {
  const embed = partnershipSummaryEmbed(username, answers)
    .setColor(0xc29a52)
    .setTitle("🤝 Pactul celor Două Regate · Draft")
    .setDescription(
      "Verifică toate informațiile oferite de solicitant. Folosește butoanele de mai jos pentru a edita sau publica reclama.",
    )
    .addFields({
      name: "👤 Persoana care a deschis ticketul",
      value: safeAnswer(username, "Reprezentant"),
      inline: false,
    })
    .setFooter({ text: "Draft diplomatic · Nu este publicat încă" })
    .setTimestamp();
  addSmallServerPromotionRule(embed, answers.members);
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  return embed;
}

function partnershipPublishedEmbed(
  username: string,
  answers: Record<string, string>,
): EmbedBuilder {
  return partnershipDraftEmbed(username, answers)
    .setTitle("🤝 Pactul celor Două Regate · Publicat")
    .setDescription("Alianța a fost confirmată de staff, iar reclama serverului partener a fost publicată.")
    .setFooter({ text: "Pact confirmat · Regatul Cenușii" });
}

export function partnershipPublishRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_post_${userId}`)
      .setLabel("📣 Postează în canalul alianțelor")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_edit_${userId}`)
      .setLabel("✏️ Editează")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function allianceAnnouncementText(
  answers: Record<string, string>,
  applicantUsername: string,
): string {
  const applicant = safeAnswer(applicantUsername, "Reprezentant");
  const serverName = safeAnswer(answers.server_name).slice(0, 200);
  const description = safeAnswer(answers.description).slice(0, 650);
  const invite = safeAnswer(answers.invite).slice(0, 300);
  const members = safeAnswer(answers.members).slice(0, 150);
  const lines = [
    "🤝 PACTUL CELOR DOUĂ REGATE",
    "══════════════════════════",
    "",
    `🏰 Comunitatea parteneră: ${serverName}`,
    "",
    "📝 Descrierea serverului:",
    description,
    "",
    `🔗 Link: ${invite}`,
    "",
    `👤 Contract completat de: ${applicant}`,
    `👥 Membri: ${members}`,
  ];
  if (partnershipHasUnder200Members(answers.members)) {
    lines.push("", "📌 Promovare: serverele sub 200 de membri se promovează fără niciun ping.");
  }
  lines.push("", "Pact pecetluit · Regatul Cenușii");
  return lines.join("\n").slice(0, 1950);
}

export function allianceRecruitmentEmbed(
  answers: Record<string, string>,
  applicantUsername: string,
): EmbedBuilder {
  const serverName = safeAnswer(answers.server_name, "Comunitatea parteneră");
  const embed = new EmbedBuilder()
    .setColor(0x7c8fbd)
    .setTitle(`🤝 ${serverName} · Partener al Regatului Cenușii`.slice(0, 256))
    .setDescription(
      `✨ Descoperă comunitatea **${serverName}** și legătura ei cu Regatul Cenușii.\n\n` +
        safeAnswer(answers.description, "Comunitatea nu a oferit o descriere."),
    )
    .addFields(
      {
        name: "👤 Reprezentantul serverului",
        value: safeAnswer(answers.representative || applicantUsername),
        inline: true,
      },
      {
        name: "🧑‍💻 Propus de",
        value: safeAnswer(applicantUsername),
        inline: true,
      },
      {
        name: "👥 Membri și activitate",
        value: safeAnswer(answers.members),
        inline: true,
      },
      {
        name: "🔗 Link de invitație",
        value: safeAnswer(answers.invite),
        inline: false,
      },
      {
        name: "🕯️ De ce caută alianța",
        value: safeAnswer(answers.motivation),
        inline: false,
      },
      {
        name: "🎁 Ce oferă comunitatea",
        value: safeAnswer(answers.offer),
        inline: false,
      },
      {
        name: "📜 Așteptări și reguli",
        value: safeAnswer(answers.terms),
        inline: false,
      },
    )
    .setFooter({ text: "Alianță confirmată de staff · Regatul Cenușii" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  return embed;
}

export function allianceStaffNotificationText(applicantUsername: string): string {
  const applicant = safeAnswer(applicantUsername, "un membru");
  return (
    `<@&${STAFF_REVIEW_ROLE_ID}>\n` +
    `📨 O nouă cerere de alianță a fost completată de ${applicant} și așteaptă confirmarea staffului.`
  );
}

export const DEFAULT_ALLIANCE_RECRUITMENT_TEXT = [
    "🌫️ Regatul Cenușii își deschide porțile",
    "Pentru cei destul de curajoși să pășească în umbră, Regatul Cenușii rămâne un tărâm unde magia veche, cavalerii de oțel și forțele întunecate coexistă într-o armonie plină de mister și eleganță. 👑⚔️",
    "",
    "🕯️ Ce te așteaptă în Regat:",
    "✨ Comunitate activă, primitoare și matură",
    "⚔️ Evenimente tematice, activități și provocări pentru toți",
    "🎭 Roluri unice, progresie pe nivel și sisteme bine puse la punct",
    "📜 Zone de socializare, jocuri, confesiuni și relaxare",
    "🛡️ Staff prezent, organizat și gata să ajute",
    "🌌 Atmosferă cinematică, cu identitate și lore propriu",
    "🎮 Mini-joc interactiv personalizat, creat special pentru membrii regatului — un sistem unic care aduce viață și dinamism poveștii",
    "",
    "Fiecare membru devine parte din legenda noastră, iar fiecare pas în regat te apropie de umbra care te alege.",
    "",
    "Tag: || @here || || @everyone ||",
    REGAT_RECRUITMENT_GIF_URL,
    `🔗${REGAT_INVITE_URL}`,
  ].join("\n");

export function allianceRecruitmentAnnouncementText(customText?: string): string {
  return (customText?.trim() || DEFAULT_ALLIANCE_RECRUITMENT_TEXT).slice(0, 4000);
}

export function allianceRecruitmentTextModal(currentText: string): ModalBuilder {
  const text = new TextInputBuilder()
    .setCustomId("alliance_recruitment_text")
    .setLabel("Textul mesajului de alianță")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(currentText.slice(0, 4000));

  return new ModalBuilder()
    .setCustomId("alliance_recruitment_text_modal")
    .setTitle("Editează textul alianței")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(text));
}

export async function allianceRecruitmentTextForGuild(
  guildId: string,
): Promise<string> {
  const customText = await loadAllianceRecruitmentText(guildId);
  return allianceRecruitmentAnnouncementText(customText ?? undefined);
}

export function partnershipEditModal(
  userId: string,
  answers: Record<string, string>,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_alliance_edit_submit_${userId}`)
    .setTitle("Editează draftul alianței");
  const serverName = input("alliance_server_name", "Numele serverului", "Ex.: Regatul Umbrelor");
  const description = input(
    "alliance_description",
    "Descrierea serverului",
    "Descrieți serverul fără linkul de invitație.",
    TextInputStyle.Paragraph,
  );
  const invite = input("alliance_invite", "Linkul serverului", "https://discord.gg/...");
  const regatDescription = input(
    "alliance_regat_description",
    "Descrierea Regatului Cenușii",
    "Descrierea care va apărea în anunț.",
    TextInputStyle.Paragraph,
  );
  serverName.setValue(safeAnswer(answers.server_name, ""));
  description.setValue(safeAnswer(answers.description, ""));
  invite.setValue(safeAnswer(answers.invite, ""));
  regatDescription.setValue(REGATUL_CENUSII_DESCRIPTION);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(serverName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    new ActionRowBuilder<TextInputBuilder>().addComponents(invite),
    new ActionRowBuilder<TextInputBuilder>().addComponents(regatDescription),
  );
  return modal;
}

function fieldValue(interaction: ModalSubmitInteraction, id: string): string {
  return interaction.fields.getTextInputValue(id);
}

export function isStaffTagRefusal(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /^(nu|n|no)\b/.test(normalized) ||
    /\b(refuz|nu vreau|nu accept|nu pot|niciodata)\b/.test(normalized);
}

export function ticketQuestionModal(kind: OracleTicketKind, key: string): ModalBuilder | null {
  const question = ticketQuestion(kind, key);
  if (!question) return null;

  return new ModalBuilder()
    .setCustomId(`ticket_answer_${kind}_${question.key}`)
    .setTitle(`${TICKET_LABELS[kind]} · Răspuns`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        input(
          "answer",
          question.label.slice(0, 45),
          question.placeholder,
          question.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short,
        ),
      ),
    );
}

export function isTicketPanelMessage(message: Message, botId: string): boolean {
  if (message.author.id !== botId) return false;
  return message.components.some((row) => {
    if (!("components" in row)) return false;
    return row.components.some(
      (component) =>
        "customId" in component &&
        typeof component.customId === "string" &&
        component.customId.startsWith("ticket_"),
    );
  });
}

async function lockTicketPanel(
  interaction: ModalSubmitInteraction,
  kind: OracleTicketKind,
  status: "completed" | "rejected",
): Promise<void> {
  const state = ticketProgress.get(`${interaction.channelId}:${interaction.user.id}`);
  if (!state?.panelMessageId || !interaction.channel?.isTextBased() || !("messages" in interaction.channel)) {
    return;
  }

  try {
    const panelMessage = await interaction.channel.messages.fetch(state.panelMessageId);
    await panelMessage.edit({ components: [ticketStatusRow(kind, status)] });
  } catch (err) {
    logger.warn(
      { err, channelId: interaction.channelId, panelMessageId: state.panelMessageId, status },
      "Could not lock completed ticket contract button",
    );
  }
}

export async function handleTicketQuestionSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  const match = interaction.customId.match(/^ticket_questions_(staff|partnership|help_report)$/);
  if (!match) return false;

  const kind = match[1] as OracleTicketKind;
  const modal = ticketQuestionModal(kind, interaction.values[0] ?? "");
  if (!modal) {
    await interaction.reply({
      content: "❌ Întrebarea nu mai este disponibilă. Folosește meniul din nou.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.showModal(modal);
  return true;
}

export async function handleTicketButton(interaction: ButtonInteraction): Promise<boolean> {
  const confirmAllianceMatch = interaction.customId.match(/^ticket_alliance_confirm_(\d+)$/);
  if (confirmAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot confirma acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = confirmAllianceMatch[1]!;
    const state = ticketProgress.get(`${interaction.channelId}:${applicantId}`);
    if (!state?.answers || state.status !== "completed") {
      await interaction.reply({
        content: "❌ Contractul alianței nu este încă finalizat.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (state.alliancePosted) {
      await interaction.reply({
        content: "✅ Alianța a fost deja publicată.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      await interaction.update({
        embeds: [
          partnershipDraftEmbed(state.applicantUsername ?? "Reprezentant", state.answers),
        ],
        components: [partnershipPublishRow(applicantId)],
      });
      await interaction.followUp({
        content:
          "✅ Alianța a fost confirmată. Acum poți edita draftul sau îl poți publica în canalul alianțelor.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error(
        { err, channelId: interaction.channelId },
        "Alliance draft could not be prepared after confirmation",
      );
      await interaction.reply({
        content: "❌ Draftul alianței nu a putut fi pregătit. Încearcă din nou.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  const postAllianceMatch = interaction.customId.match(/^ticket_alliance_post_(\d+)$/);
  if (postAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot publica acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = postAllianceMatch[1]!;
    const state = ticketProgress.get(`${interaction.channelId}:${applicantId}`);
    if (!state?.answers || state.status !== "completed") {
      await interaction.reply({
        content: "❌ Contractul alianței nu este încă finalizat.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (state.alliancePosted) {
      await interaction.reply({
        content: "✅ Alianța a fost deja publicată.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const publicChannel = await interaction.client.channels
      .fetch(ALLIANCE_PUBLIC_CHANNEL_ID)
      .catch(() => null);
    if (!publicChannel?.isTextBased() || !("send" in publicChannel)) {
      await interaction.reply({
        content: `❌ Nu pot accesa canalul alianțelor (${ALLIANCE_PUBLIC_CHANNEL_ID}). Verifică accesul botului.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      await publicChannel.send({
        embeds: [
          allianceRecruitmentEmbed(
            state.answers,
            state.applicantUsername ?? "Reprezentant",
          ),
        ],
        allowedMentions: { parse: [] },
      });
      state.alliancePosted = true;
      await interaction.update({
        embeds: [
          partnershipPublishedEmbed(state.applicantUsername ?? "Reprezentant", state.answers),
        ],
        components: [],
      });
      await interaction.followUp({
        content: "✅ Pactul a fost publicat în canalul alianțelor.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error(
        { err, channelId: interaction.channelId, publicChannelId: ALLIANCE_PUBLIC_CHANNEL_ID },
        "Alliance announcement could not be published",
      );
      await interaction.reply({
        content: "❌ Pactul nu a putut fi publicat. Verifică permisiunile botului în canalul alianțelor.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  const editAllianceMatch = interaction.customId.match(/^ticket_alliance_edit_(\d+)$/);
  if (editAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot edita acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = editAllianceMatch[1]!;
    const state = ticketProgress.get(`${interaction.channelId}:${applicantId}`);
    if (!state?.answers || state.alliancePosted) {
      await interaction.reply({
        content: "❌ Acest draft nu mai poate fi editat.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(partnershipEditModal(applicantId, state.answers));
    return true;
  }

  if (interaction.customId === "ticket_copy_partnership") {
    await interaction.reply({
      content: "📋 Copierea simplă nu mai este disponibilă. Folosește **Confirmă alianța** pentru a crea draftul de publicare.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  const startMatch = interaction.customId.match(/^ticket_start_(staff|partnership|help_report)$/);
  if (startMatch) {
    const kind = startMatch[1] as OracleTicketKind;
    const progressKey = `${interaction.channelId}:${interaction.user.id}`;
    const existingProgress = ticketProgress.get(progressKey);
    if (existingProgress?.status) {
      await interaction.reply({
        content:
          existingProgress.status === "completed"
            ? "✅ Contractul este deja completat."
            : "❌ Contractul a fost deja respins.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    ticketProgress.set(progressKey, {
      currentStep: 0,
      panelMessageId: interaction.message.id,
      applicantUsername: interaction.user.globalName ?? interaction.user.username,
    });
    if (kind === "staff" || kind === "partnership") {
      void interaction.message.edit(ticketPanelPayload(kind)).catch(() => null);
      await interaction.showModal(ticketModal(kind));
      return true;
    }

    const firstQuestion = TICKET_QUESTIONS[kind][0];
    if (!firstQuestion) return false;
    await interaction.showModal(ticketQuestionModal(kind, firstQuestion.key)!);
    return true;
  }

  const nextMatch = interaction.customId.match(/^ticket_next_(staff|partnership|help_report)_(\d+)$/);
  if (nextMatch) {
    const kind = nextMatch[1] as OracleTicketKind;
    const questionIndex = Number(nextMatch[2]);
    const question = TICKET_QUESTIONS[kind][questionIndex - 1];
    const progressKey = `${interaction.channelId}:${interaction.user.id}`;
    const progressState = ticketProgress.get(progressKey);
    if (progressState?.status) {
      await interaction.reply({
        content:
          progressState.status === "completed"
            ? "✅ Contractul este deja completat."
            : "❌ Contractul a fost deja respins.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const expectedIndex = (progressState?.currentStep ?? 0) + 1;
    if (!question || questionIndex !== expectedIndex) {
      await interaction.reply({
        content: `⏳ Continuă cu pasul ${expectedIndex}/${TICKET_QUESTIONS[kind].length}.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(ticketQuestionModal(kind, question.key)!);
    return true;
  }

  if (interaction.customId === "ticket_staff_continue") {
    await interaction.showModal(staffDetailsModal());
    return true;
  }
  if (interaction.customId === "ticket_partnership_continue") {
    await interaction.showModal(partnershipDetailsModal());
    return true;
  }

  const match = interaction.customId.match(/^ticket_(start|requirements)_(staff|partnership|help_report)$/);
  if (!match) return false;
  const kind = match[2] as OracleTicketKind;

  if (match[1] === "requirements") {
    await interaction.reply({
      embeds: [ticketRequirementsEmbed(kind)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.showModal(ticketModal(kind));
  return true;
}

export async function handleTicketQuestionModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^ticket_answer_(staff|partnership|help_report)_(.+)$/);
  if (!match) return false;

  const kind = match[1] as OracleTicketKind;
  const question = ticketQuestion(kind, match[2]!);
  if (!question) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const answer = safeAnswer(fieldValue(interaction, "answer"));
  const questionIndex = TICKET_QUESTIONS[kind].findIndex((entry) => entry.key === question.key) + 1;
  const totalQuestions = TICKET_QUESTIONS[kind].length;
  const isLastQuestion = questionIndex === totalQuestions;
  const progressKey = `${interaction.channelId}:${interaction.user.id}`;
  const progressState = ticketProgress.get(progressKey);
  if (progressState) {
    progressState.answers = {
      ...(progressState.answers ?? {}),
      [question.key]: answer,
    };
  }
  const partnershipAnswers = {
    ...(progressState?.answers ?? {}),
    [question.key]: answer,
  };
  const rejectedForTag =
    kind === "staff" &&
    question.key === "server_tag" &&
    isStaffTagRefusal(answer);
  const answerEmbed = new EmbedBuilder()
    .setColor(rejectedForTag ? 0xc0392b : TICKET_COLORS[kind])
    .setTitle(
      rejectedForTag
        ? "❌ Aplicare respinsă"
        : isLastQuestion
        ? `${TICKET_ICONS[kind]} Formular complet`
        : `${TICKET_ICONS[kind]} Răspuns înregistrat`,
    )
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      rejectedForTag
        ? "Oracolul Cenușii a respins aplicația. Purtarea tag-ului serverului este o condiție obligatorie pentru staff."
        : isLastQuestion
        ? "Toate răspunsurile din formular au fost adăugate. Echipa poate începe evaluarea aplicației."
        : "Răspunsul tău a fost adăugat în acest ticket. Poți continua din meniul de întrebări.",
    )
    .addFields(
      { name: "Întrebarea selectată", value: question.description, inline: false },
      { name: "Răspunsul tău", value: answer, inline: false },
      {
        name: rejectedForTag ? "Verdictul Oracolului" : "Progres",
        value: rejectedForTag
          ? "RESPINS · Condiția obligatorie privind tag-ul nu a fost acceptată."
          : isLastQuestion
          ? `✅ ${totalQuestions}/${totalQuestions} · Formular complet`
          : `◆ Pasul ${questionIndex}/${totalQuestions} · Alege următoarea întrebare din meniu`,
        inline: false,
      },
    )
    .setFooter({
      text: rejectedForTag
        ? "Decizie automată · Contractul de staff nu poate continua"
        : isLastQuestion
        ? "Aplicația este pregătită pentru evaluarea staffului"
        : "Regatul Cenușii · Răspunsurile rămân în acest ticket",
    })
    .setTimestamp();
  if (TICKET_SEAL) answerEmbed.setThumbnail(TICKET_SEAL);

  if (
    !interaction.channel ||
    !interaction.channel.isTextBased() ||
    !("send" in interaction.channel)
  ) {
    await interaction.editReply({
      content: "❌ Răspunsul nu a putut fi publicat în acest ticket. Încearcă din nou.",
    });
    return true;
  }

  try {
    const finalPartnership = kind === "partnership" && isLastQuestion;
    const responseMessage = await interaction.channel.send({
      content: finalPartnership
        ? allianceStaffNotificationText(
            interaction.user.globalName ?? interaction.user.username,
          )
        : undefined,
      embeds: [
        finalPartnership
          ? partnershipSummaryEmbed(
              interaction.user.globalName ?? interaction.user.username,
              partnershipAnswers,
            )
          : answerEmbed,
      ],
      components: finalPartnership
        ? [partnershipConfirmRow(interaction.user.id)]
        : [],
      allowedMentions: finalPartnership
        ? { parse: [], roles: [STAFF_REVIEW_ROLE_ID] }
        : { parse: [] },
    });
    if (finalPartnership && progressState) {
      progressState.responseMessageId = responseMessage.id;
    }
    if (rejectedForTag || isLastQuestion) {
      if (progressState) {
        progressState.currentStep = questionIndex;
        progressState.status = rejectedForTag ? "rejected" : "completed";
      }
      await lockTicketPanel(
        interaction,
        kind,
        rejectedForTag ? "rejected" : "completed",
      );
    } else if (progressState) {
      progressState.currentStep = questionIndex;
    }
    const nextComponents =
      !rejectedForTag && !isLastQuestion
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_next_${kind}_${questionIndex + 1}`)
                .setLabel(`Întrebarea următoare · ${questionIndex + 1}/${totalQuestions}`)
                .setStyle(ButtonStyle.Primary),
            ),
          ]
        : [];
    await interaction.editReply({
      content: rejectedForTag
        ? "❌ Aplicația a fost respinsă deoarece nu ai acceptat purtarea tag-ului serverului."
        : isLastQuestion
          ? `✅ Răspunsul pentru **${question.label}** a fost adăugat. Formularul este complet.`
          : `✅ Răspunsul pentru **${question.label}** a fost adăugat.`,
      components: nextComponents,
    });
  } catch (err) {
    logger.error(
      { err, guildId: interaction.guildId, channelId: interaction.channelId, ticketKind: kind },
      "Ticket question answer could not be posted",
    );
    await interaction.editReply({
      content: "❌ Răspunsul nu a putut fi adăugat în ticket. Încearcă din nou.",
    });
  }
  return true;
}

export async function handleTicketModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const editAllianceMatch = interaction.customId.match(/^ticket_form_alliance_edit_submit_(\d+)$/);
  if (editAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot edita acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const applicantId = editAllianceMatch[1]!;
    const progressKey = `${interaction.channelId}:${applicantId}`;
    const state = ticketProgress.get(progressKey);
    if (!state?.answers || state.alliancePosted) {
      await interaction.editReply({ content: "❌ Acest draft nu mai poate fi editat." });
      return true;
    }

    state.answers = {
      ...state.answers,
      server_name: safeAnswer(fieldValue(interaction, "alliance_server_name")),
      description: safeAnswer(fieldValue(interaction, "alliance_description")),
      invite: safeAnswer(fieldValue(interaction, "alliance_invite")),
      regat_description: safeAnswer(fieldValue(interaction, "alliance_regat_description")),
    };

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("messages" in interaction.channel) ||
      !state.responseMessageId
    ) {
      await interaction.editReply({
        content: "❌ Draftul nu mai este disponibil pentru editare în acest ticket.",
      });
      return true;
    }

    const responseMessage = await interaction.channel.messages
      .fetch(state.responseMessageId)
      .catch(() => null);
    if (!responseMessage) {
      await interaction.editReply({
        content: "❌ Mesajul draftului nu mai este disponibil.",
      });
      return true;
    }
    await responseMessage.edit({
      embeds: [
        partnershipDraftEmbed(state.applicantUsername ?? "Reprezentant", state.answers),
      ],
      components: [partnershipPublishRow(applicantId)],
    });
    await interaction.editReply({ content: "✅ Draftul alianței a fost actualizat." });
    return true;
  }

  if (interaction.customId === "ticket_form_partnership_details") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const progressKey = `${interaction.channelId}:${interaction.user.id}`;
    const progressState = ticketProgress.get(progressKey);
    if (!progressState) {
      await interaction.editReply({
        content: "❌ Prima pagină a contractului nu mai este disponibilă. Reia contractul.",
      });
      return true;
    }

    const firstAnswers = progressState.answers ?? {};
    const finalAnswers = {
      ...firstAnswers,
      motivation: safeAnswer(fieldValue(interaction, "partnership_motivation")),
      offer: safeAnswer(fieldValue(interaction, "partnership_offer")),
      terms: safeAnswer(fieldValue(interaction, "partnership_terms")),
    };
    const finalEmbed = partnershipSummaryEmbed(
      interaction.user.globalName ?? interaction.user.username,
      finalAnswers,
    );

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("send" in interaction.channel)
    ) {
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi publicate în ticket.",
      });
      return true;
    }

    try {
      let mergedIntoFirstResponse = false;
      if (progressState.responseMessageId && "messages" in interaction.channel) {
        const firstResponse = await interaction.channel.messages
          .fetch(progressState.responseMessageId)
          .catch(() => null);
        if (firstResponse) {
          await firstResponse.edit({
            content: allianceStaffNotificationText(
              interaction.user.globalName ?? interaction.user.username,
            ),
            embeds: [finalEmbed],
            components: [partnershipConfirmRow(interaction.user.id)],
            allowedMentions: { parse: [], roles: [STAFF_REVIEW_ROLE_ID] },
          });
          mergedIntoFirstResponse = true;
        }
      }
      if (!mergedIntoFirstResponse) {
        const responseMessage = await interaction.channel.send({
          content: allianceStaffNotificationText(
            interaction.user.globalName ?? interaction.user.username,
          ),
          embeds: [finalEmbed],
          components: [partnershipConfirmRow(interaction.user.id)],
          allowedMentions: { parse: [], roles: [STAFF_REVIEW_ROLE_ID] },
        });
        progressState.responseMessageId = responseMessage.id;
      }
      progressState.answers = finalAnswers;
      progressState.currentStep = TICKET_QUESTIONS.partnership.length;
      progressState.status = "completed";
      await lockTicketPanel(interaction, "partnership", "completed");
      await interaction.editReply({
        content:
          "✅ Contractul alianței este complet. Toate cele 8 răspunsuri au fost unite într-un singur rezumat.",
      });
    } catch (err) {
      logger.error(
        { err, guildId: interaction.guildId, channelId: interaction.channelId },
        "Final partnership application step could not be posted",
      );
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi adăugate în ticket.",
      });
    }
    return true;
  }

  if (interaction.customId === "ticket_form_staff_details") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const tagAnswer = safeAnswer(fieldValue(interaction, "staff_tag"));
    const rejectedForTag = isStaffTagRefusal(tagAnswer);
    const progressKey = `${interaction.channelId}:${interaction.user.id}`;
    const progressState = ticketProgress.get(progressKey);
    const firstAnswers = progressState?.answers ?? {};
    const finalEmbed = new EmbedBuilder()
      .setColor(rejectedForTag ? 0x8f2d3d : 0xc29a52)
      .setTitle(rejectedForTag ? "🩸 Candidatură respinsă" : "📜 Candidatură Staff · Pecetluită")
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription(
        rejectedForTag
          ? "Pecetea nu s-a putut închide, deoarece purtarea tag-ului serverului nu a fost acceptată."
          : "Cele opt răspunsuri au fost adunate într-un singur zapis și așezate înaintea staffului.",
      )
      .addFields(
        {
          name: "✦ Nume",
          value: safeAnswer(firstAnswers.name),
          inline: true,
        },
        {
          name: "✦ Vârstă",
          value: safeAnswer(firstAnswers.age),
          inline: true,
        },
        {
          name: "⚔️ Experiență în moderare",
          value: safeAnswer(firstAnswers.moderation),
          inline: false,
        },
        {
          name: "🕰️ Timp disponibil",
          value: safeAnswer(firstAnswers.availability),
          inline: true,
        },
        {
          name: "🔥 Motivație",
          value: safeAnswer(firstAnswers.motivation),
          inline: false,
        },
        {
          name: "🛡️ Gestionarea unui conflict",
          value: safeAnswer(fieldValue(interaction, "staff_conflict")),
          inline: false,
        },
        {
          name: "🏰 Îmbunătățiri propuse",
          value: safeAnswer(fieldValue(interaction, "staff_improvements")),
          inline: false,
        },
        {
          name: "🏷️ Tag-ul serverului",
          value: tagAnswer,
          inline: true,
        },
      )
      .setFooter({
        text: rejectedForTag
          ? "Decizie automată · Contractul de staff nu poate continua"
          : "Aplicație completă · Așteaptă evaluarea staffului",
      })
      .setTimestamp();

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("send" in interaction.channel)
    ) {
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi publicate. Încearcă din nou în ticket.",
      });
      return true;
    }

    try {
      let mergedIntoFirstResponse = false;
      if (progressState?.responseMessageId && "messages" in interaction.channel) {
        const firstResponse = await interaction.channel.messages
          .fetch(progressState.responseMessageId)
          .catch(() => null);
        if (firstResponse) {
          await firstResponse.edit({
            embeds: [finalEmbed],
            components: [],
            allowedMentions: { parse: [] },
          });
          mergedIntoFirstResponse = true;
        }
      }
      if (!mergedIntoFirstResponse) {
        await interaction.channel.send({
          embeds: [finalEmbed],
          allowedMentions: { parse: [] },
        });
      }
      if (progressState) {
        progressState.currentStep = TICKET_QUESTIONS.staff.length;
        progressState.status = rejectedForTag ? "rejected" : "completed";
      }
      await lockTicketPanel(
        interaction,
        "staff",
        rejectedForTag ? "rejected" : "completed",
      );
      if (!rejectedForTag) {
        await interaction.channel.send(staffOracleReviewPayload(interaction.user.username));
      }
      await interaction.editReply({
        content: rejectedForTag
          ? "❌ Aplicația a fost respinsă deoarece nu ai acceptat purtarea tag-ului serverului."
          : "✅ Aplicația este completă. Un membru al echipei te va prelua cât mai curând.",
      });
    } catch (err) {
      logger.error(
        { err, guildId: interaction.guildId, channelId: interaction.channelId },
        "Final staff application step could not be posted",
      );
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi adăugate în ticket. Încearcă din nou.",
      });
    }
    return true;
  }

  const match = interaction.customId.match(/^ticket_form_(staff|partnership|help_report)$/);
  if (!match) return false;
  const kind = match[1] as OracleTicketKind;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const color = TICKET_COLORS[kind];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Răspunsuri primite`)
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      "Formularul a fost trimis în acest ticket. Un membru al echipei poate continua verificarea de aici.",
    )
    .setFooter({ text: "Nu închide ticketul până când stafful nu revine" })
    .setTimestamp();

  if (kind === "staff") {
    embed.addFields(
      { name: "Nume", value: safeAnswer(fieldValue(interaction, "staff_name")), inline: true },
      { name: "Vârstă", value: safeAnswer(fieldValue(interaction, "staff_age")), inline: true },
      { name: "Experiență", value: safeAnswer(fieldValue(interaction, "staff_experience")), inline: false },
      { name: "Disponibilitate", value: safeAnswer(fieldValue(interaction, "staff_availability")), inline: true },
      { name: "Motivație", value: safeAnswer(fieldValue(interaction, "staff_motivation")), inline: false },
      {
        name: "Următorii pași",
        value: "Apasă butonul de mai jos pentru întrebările despre conflicte și îmbunătățiri.",
        inline: false,
      },
    );
  } else if (kind === "partnership") {
    embed.addFields(
      { name: "Server", value: safeAnswer(fieldValue(interaction, "partnership_name")), inline: true },
      {
        name: "Reprezentant",
        value: safeAnswer(fieldValue(interaction, "partnership_representative")),
        inline: true,
      },
      { name: "Membri și activitate", value: safeAnswer(fieldValue(interaction, "partnership_members")), inline: true },
      { name: "Descrierea serverului", value: safeAnswer(fieldValue(interaction, "partnership_description")), inline: false },
      { name: "Invitație / link", value: safeAnswer(fieldValue(interaction, "partnership_invite")), inline: false },
      {
        name: "Următorii pași",
        value: "Apasă butonul de mai jos pentru întrebările despre motivul alianței, ofertă și regulile pactului.",
        inline: false,
      },
    );
  } else {
    embed.addFields(
      { name: "Tip", value: safeAnswer(fieldValue(interaction, "help_type")), inline: true },
      { name: "Membru raportat", value: safeAnswer(fieldValue(interaction, "help_target")), inline: true },
      { name: "Descriere", value: safeAnswer(fieldValue(interaction, "help_description")), inline: false },
      { name: "Moment", value: safeAnswer(fieldValue(interaction, "help_when")), inline: true },
      { name: "Dovezi", value: safeAnswer(fieldValue(interaction, "help_evidence")), inline: false },
    );
  }

  if (
    !interaction.channel ||
    !interaction.channel.isTextBased() ||
    !("send" in interaction.channel)
  ) {
    await interaction.editReply({
      content: "❌ Formularul nu a putut fi publicat în acest canal. Încearcă din nou în ticket.",
    });
    return true;
  }

  try {
    const components =
      kind === "staff"
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("ticket_staff_continue")
                .setLabel("⚔️ Continuă aplicația")
                .setStyle(ButtonStyle.Primary),
            ),
          ]
        : kind === "partnership"
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("ticket_partnership_continue")
                  .setLabel("🤝 Continuă propunerea")
                  .setStyle(ButtonStyle.Primary),
              ),
            ]
        : [];
    const responseMessage = await interaction.channel.send({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });
    if (kind === "staff" || kind === "partnership") {
      const progressState = ticketProgress.get(
        `${interaction.channelId}:${interaction.user.id}`,
      );
      if (progressState) {
        progressState.currentStep = 5;
        progressState.responseMessageId = responseMessage.id;
        progressState.answers =
          kind === "staff"
            ? {
                name: safeAnswer(fieldValue(interaction, "staff_name")),
                age: safeAnswer(fieldValue(interaction, "staff_age")),
                moderation: safeAnswer(fieldValue(interaction, "staff_experience")),
                availability: safeAnswer(fieldValue(interaction, "staff_availability")),
                motivation: safeAnswer(fieldValue(interaction, "staff_motivation")),
              }
            : {
                server_name: safeAnswer(fieldValue(interaction, "partnership_name")),
                representative: safeAnswer(
                  fieldValue(interaction, "partnership_representative"),
                ),
                invite: safeAnswer(fieldValue(interaction, "partnership_invite")),
                members: safeAnswer(fieldValue(interaction, "partnership_members")),
                description: safeAnswer(
                  fieldValue(interaction, "partnership_description"),
                ),
              };
      }
    }
  } catch (err) {
    logger.error(
      { err, guildId: interaction.guildId, channelId: interaction.channelId, ticketKind: kind },
      "Interactive ticket form could not be posted",
    );
    await interaction.editReply({
      content: "❌ Răspunsurile nu au putut fi adăugate în ticket. Încearcă din nou.",
    });
    return true;
  }

  await interaction.editReply({
    content:
      kind === "staff"
        ? "✅ Prima pagină a fost adăugată. Apasă **Continuă aplicația** în ticket pentru ultimele trei întrebări."
        : kind === "partnership"
          ? "✅ Prima pagină a fost adăugată. Apasă **Continuă propunerea** în ticket pentru ultimele trei întrebări."
        : "✅ Răspunsurile au fost adăugate în ticket. Un membru al echipei te va prelua cât mai curând.",
  });
  return true;
}