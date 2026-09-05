import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
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
const postedTicketPanels = new Set<string>();
const ticketPanelLocks = new Map<string, Promise<boolean>>();

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
      key: "name_timezone",
      label: "1. Nume și fus orar",
      description: "Care este numele tău și fusul orar?",
      placeholder: "Ex.: Andrei · Europa/Paris",
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
  ],
  partnership: [
    {
      key: "server_name",
      label: "1. Numele serverului",
      description: "Cum se numește serverul vostru?",
      placeholder: "Ex.: Regatul Umbrelor",
    },
    {
      key: "description",
      label: "2. Descrierea serverului",
      description: "Tematică, comunitate și ce oferiți.",
      placeholder: "Descrieți serverul, tematica și ce oferiți.",
      multiline: true,
    },
    {
      key: "invite",
      label: "3. Invitație / link",
      description: "Care este invitația sau linkul relevant?",
      placeholder: "https://discord.gg/...",
    },
    {
      key: "members",
      label: "4. Membri și activitate",
      description: "Câți membri aveți și câți sunt activi aproximativ?",
      placeholder: "Ex.: 2.000 total · 300 activi",
    },
    {
      key: "audience",
      label: "5. Publicul țintă",
      description: "Cui se adresează comunitatea?",
      placeholder: "Descrieți publicul țintă.",
      multiline: true,
    },
    {
      key: "collaboration",
      label: "6. Tipul colaborării",
      description: "Ce tip de colaborare propuneți?",
      placeholder: "Descrieți colaborarea propusă.",
      multiline: true,
    },
    {
      key: "benefits",
      label: "7. Beneficii reciproce",
      description: "Ce beneficii ar avea ambele comunități?",
      placeholder: "Descrieți beneficiile pentru ambele servere.",
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
      "Alege întrebările din meniul interactiv care va apărea aici."
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

function ticketQuestionMenu(kind: OracleTicketKind): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(`ticket_questions_${kind}`)
    .setPlaceholder(
      kind === "staff"
        ? "Selectează o întrebare..."
        : kind === "partnership"
          ? "Selectează un câmp pentru parteneriat..."
          : "Selectează ce vrei să descrii...",
    )
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      TICKET_QUESTIONS[kind].map((question) => ({
        label: question.label,
        description: question.description,
        value: question.key,
      })),
    );
}

export function ticketPanelPayload(kind: OracleTicketKind): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} {
  const color = TICKET_COLORS[kind];
  const icon = TICKET_ICONS[kind];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${TICKET_LABELS[kind]}`)
    .setDescription(
      kind === "staff"
        ? "Completează aplicația pas cu pas.\nSelectează o întrebare și răspunde în fereastra care apare."
        : kind === "partnership"
          ? "Completează propunerea pas cu pas.\nAlege un câmp din meniu pentru a continua."
          : "Descrie cazul cât mai clar.\nAlege din meniu informația pe care vrei să o adaugi.",
    )
    .addFields(
      kind === "staff"
        ? [
            {
              name: "⚠️ Condiție obligatorie",
              value:
                "Tag-ul serverului este **OBLIGATORIU** pentru validarea aplicației.\n" +
                "Fără tag, aplicația este respinsă automat.",
            },
            {
              name: "📋 Aplicarea",
              value: "7 întrebări · răspunde sincer și clar",
            },
          ]
        : kind === "partnership"
          ? [
              {
                name: "📋 Propunerea",
                value: "7 informații · completează fiecare câmp din meniu",
              },
            ]
          : [
              {
                name: "🔎 Pentru o analiză rapidă",
                value: "Include persoana implicată, momentul și dovezile disponibile.",
              },
            ],
    )
    .setFooter({ text: "Regatul Cenușii · Selectează o întrebare de mai jos" });
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ticketQuestionMenu(kind));

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
    if (recent?.some((entry) => isTicketPanelMessage(entry, botId))) {
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
    .setTitle(TICKET_LABELS[kind]);

  const fields =
    kind === "staff"
      ? [
          input("staff_name_timezone", "Nume și fus orar", "Ex.: Andrei · Europa/Paris"),
          input("staff_age", "Vârsta", "Ex.: 21"),
          input("staff_experience", "Experiență în moderare", "Unde ai mai moderat și ce ai învățat?", TextInputStyle.Paragraph),
          input("staff_availability", "Timp disponibil", "Ex.: 1–2 ore pe zi"),
          input("staff_motivation", "De ce staff?", "De ce vrei să ajuți Regatul?", TextInputStyle.Paragraph),
        ]
      : kind === "partnership"
        ? [
            input("partnership_name", "Numele serverului", "Ex.: Regatul Umbrelor"),
            input("partnership_description", "Descrierea serverului", "Tematică, comunitate și ce oferiți", TextInputStyle.Paragraph),
            input("partnership_invite", "Invitație / link", "https://discord.gg/..."),
            input("partnership_members", "Membri și activitate", "Ex.: 2.000 total · 300 activi"),
            input("partnership_proposal", "Propunerea ta", "Cum ar arăta colaborarea?", TextInputStyle.Paragraph),
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
    .setTitle("Aplicare Staff · Situații practice");
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
        "1. Care este numele tău și fusul orar?\n" +
        "2. Ce vârstă ai?\n" +
        "3. Ai experiență în moderare?\n" +
        "4. Cât timp poți dedica serverului?\n" +
        "5. De ce dorești rolul de staff?\n" +
        "6. Cum ai rezolva un conflict între membri?\n" +
        "7. Ce ai îmbunătăți pe server?",
    );
  } else if (kind === "partnership") {
    embed.setDescription(
      "Pentru parteneriat, pregătește:\n\n" +
        "• numele serverului;\n" +
        "• descrierea serverului — tematică, comunitate și ce oferă;\n" +
        "• invitația sau linkul relevant;\n" +
        "• numărul total și activ de membri;\n" +
        "• publicul țintă;\n" +
        "• propunerea și beneficiile pentru ambele comunități.",
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

function fieldValue(interaction: ModalSubmitInteraction, id: string): string {
  return interaction.fields.getTextInputValue(id);
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
  if (interaction.customId === "ticket_staff_continue") {
    await interaction.showModal(staffDetailsModal());
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
  const answerEmbed = new EmbedBuilder()
    .setColor(TICKET_COLORS[kind])
    .setTitle(
      isLastQuestion
        ? `${TICKET_ICONS[kind]} Formular complet`
        : `${TICKET_ICONS[kind]} Răspuns înregistrat`,
    )
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      isLastQuestion
        ? "Toate răspunsurile din formular au fost adăugate. Echipa poate începe evaluarea aplicației."
        : "Răspunsul tău a fost adăugat în acest ticket. Poți continua din meniul de întrebări.",
    )
    .addFields(
      { name: "Întrebarea selectată", value: question.description, inline: false },
      { name: "Răspunsul tău", value: answer, inline: false },
      {
        name: "Progres",
        value: isLastQuestion
          ? `✅ ${totalQuestions}/${totalQuestions} · Formular complet`
          : `◆ Pasul ${questionIndex}/${totalQuestions} · Alege următoarea întrebare din meniu`,
        inline: false,
      },
    )
    .setFooter({
      text: isLastQuestion
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
    await interaction.channel.send({
      embeds: [answerEmbed],
      allowedMentions: { parse: [] },
    });
    await interaction.editReply({
      content: `✅ Răspunsul pentru **${question.label}** a fost adăugat. Alege următoarea întrebare din meniu.`,
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
  if (interaction.customId === "ticket_form_staff_details") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const finalEmbed = new EmbedBuilder()
      .setColor(TICKET_COLORS.staff)
      .setTitle("🛡️ Aplicare Staff · Situații practice")
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription("Ultimele răspunsuri ale aplicației au fost adăugate pentru evaluarea echipei.")
      .addFields(
        {
          name: "Gestionarea unui conflict",
          value: safeAnswer(fieldValue(interaction, "staff_conflict")),
          inline: false,
        },
        {
          name: "Îmbunătățiri propuse",
          value: safeAnswer(fieldValue(interaction, "staff_improvements")),
          inline: false,
        },
      )
      .setFooter({ text: "Aplicație completă · Așteaptă evaluarea staffului" })
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
      await interaction.channel.send({
        embeds: [finalEmbed],
        allowedMentions: { parse: [] },
      });
      await interaction.editReply({
        content: "✅ Aplicația este completă. Un membru al echipei te va prelua cât mai curând.",
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
      { name: "Nume și fus orar", value: safeAnswer(fieldValue(interaction, "staff_name_timezone")), inline: true },
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
      { name: "Membri și activitate", value: safeAnswer(fieldValue(interaction, "partnership_members")), inline: true },
      { name: "Descrierea serverului", value: safeAnswer(fieldValue(interaction, "partnership_description")), inline: false },
      { name: "Invitație / link", value: safeAnswer(fieldValue(interaction, "partnership_invite")), inline: false },
      { name: "Propunere", value: safeAnswer(fieldValue(interaction, "partnership_proposal")), inline: false },
      {
        name: "Următorii pași",
        value: "Stafful poate cere publicul țintă și beneficiile concrete pentru ambele comunități.",
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
        : [];
    await interaction.channel.send({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });
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
        ? "✅ Prima parte a fost adăugată. Apasă **Continuă aplicația** în ticket pentru ultimele două întrebări."
        : "✅ Răspunsurile au fost adăugate în ticket. Un membru al echipei te va prelua cât mai curând.",
  });
  return true;
}