import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import type { OracleTicketKind } from "./oracle-chat";

const TICKET_COLORS: Record<OracleTicketKind, number> = {
  staff: 0xb8753d,
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

function ticketButtonId(action: "start" | "requirements", kind: OracleTicketKind): string {
  return `ticket_${action}_${kind}`;
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
        ? "O nouă călătorie începe cu răspunsuri sincere. Completează aplicația clar, iar echipa va reveni asupra ei cât mai curând."
        : kind === "partnership"
          ? "Spune-ne cine sunteți, ce construiți și cum putem ridica împreună două comunități."
          : "Descrie problema cu suficiente detalii pentru ca echipa să poată vedea urma lăsată în cenușă.",
    )
    .addFields(
      kind === "staff"
        ? [
            {
              name: "⚠️ Înainte să începi",
              value:
                "Tag-ul serverului este **OBLIGATORIU** pentru validarea aplicației.\n" +
                "Fără tag → aplicația este respinsă automat.",
            },
            {
              name: "📋 Ce vei completa",
              value:
                "Nume și fus orar · Vârstă · Experiență · Disponibilitate · Motivație\n" +
                "Conflict între membri · Îmbunătățiri pentru server",
            },
          ]
        : kind === "partnership"
          ? [
              {
                name: "📋 Ce avem nevoie",
                value:
                  "Numele serverului · Descrierea comunității · Invitație\n" +
                  "Membri și activitate · Public · Propunere · Beneficii",
              },
            ]
          : [
              {
                name: "🔎 Alege calea potrivită",
                value:
                  "Pentru ajutor, descrie problema și pașii care au dus la ea.\n" +
                  "Pentru raportare, adaugă utilizatorul, momentul și dovezile.",
              },
            ],
    )
    .setFooter({ text: "Regatul Cenușii · Răspunsurile rămân în acest ticket" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ticketButtonId("start", kind))
      .setLabel(kind === "staff" ? "Începe aplicația" : kind === "partnership" ? "Trimite propunerea" : "Descrie cazul")
      .setEmoji(kind === "help_report" ? "📝" : "✦")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ticketButtonId("requirements", kind))
      .setLabel("Vezi întrebările")
      .setEmoji("📖")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
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

export function ticketRequirementsEmbed(kind: OracleTicketKind): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TICKET_COLORS[kind])
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Întrebări`)
    .setFooter({ text: "Răspunde sincer și clar · Regatul Cenușii" });

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

function isSendableChannel(channel: ModalSubmitInteraction["channel"]): channel is TextBasedChannel & { send: Function } {
  return !!channel && channel.isTextBased() && "send" in channel;
}

export function isTicketPanelMessage(message: Message, botId: string): boolean {
  if (message.author.id !== botId) return false;
  return message.components.some((row) =>
    row.components.some((component) => component.customId?.startsWith("ticket_")),
  );
}

export async function handleTicketButton(interaction: ButtonInteraction): Promise<boolean> {
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

export async function handleTicketModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^ticket_form_(staff|partnership|help_report)$/);
  if (!match) return false;
  const kind = match[1] as OracleTicketKind;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const color = TICKET_COLORS[kind];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Răspunsuri primite`)
    .setDescription(
      "Formularul a fost trimis în acest ticket. Un membru al echipei poate continua verificarea de aici.",
    )
    .setFooter({ text: "Nu închide ticketul până când stafful nu revine" });

  if (kind === "staff") {
    embed.addFields(
      { name: "Nume și fus orar", value: safeAnswer(fieldValue(interaction, "staff_name_timezone")), inline: true },
      { name: "Vârstă", value: safeAnswer(fieldValue(interaction, "staff_age")), inline: true },
      { name: "Experiență", value: safeAnswer(fieldValue(interaction, "staff_experience")), inline: false },
      { name: "Disponibilitate", value: safeAnswer(fieldValue(interaction, "staff_availability")), inline: true },
      { name: "Motivație", value: safeAnswer(fieldValue(interaction, "staff_motivation")), inline: false },
      {
        name: "Următorii pași",
        value: "Răspunde în ticket la întrebările despre conflicte și îmbunătățiri pentru server.",
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

  if (isSendableChannel(interaction.channel)) {
    await interaction.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  }

  await interaction.editReply({
    content: "✅ Răspunsurile au fost adăugate în ticket. Un membru al echipei te va prelua cât mai curând.",
  });
  return true;
}