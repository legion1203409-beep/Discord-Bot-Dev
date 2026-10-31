/**
 * Butoanele de pe mesajul de contestație din canalul de staff: Acceptă, Respinge,
 * Cere clarificări. Fiecare deschide o fereastră cu nota; decizia o ia
 * moderation/appeals.ts. Id-urile încep cu "ticket_" ca să treacă prin aceleași
 * căi ca restul contestațiilor (și când botul e oprit, staff-ul poate decide).
 */
import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ModalSubmitInteraction,
} from "discord.js";
import { getTicketConfig } from "../bot/ticket-config";
import { logger } from "../lib/logger";
import { askWebAppeal, AppealError, decideWebAppeal, type AppealDecision } from "./appeals";

const BUTTON = /^ticket_appeal_web_(accept|reject|ask)_([0-9a-f-]{36})$/i;
const MODAL = /^ticket_form_appealweb_(accept|reject|ask)_([0-9a-f-]{36})$/i;

function isStaff(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
  const roleId = getTicketConfig(interaction.guildId).staffReviewRoleId;
  const roles = interaction.member?.roles;
  if (!roles) return false;
  return Array.isArray(roles) ? roles.includes(roleId) : roles.cache.has(roleId);
}

export async function handleWebAppealButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = interaction.customId.match(BUTTON);
  if (!match) return false;
  if (!isStaff(interaction)) {
    await interaction.reply({ content: "🛡️ Doar rolul configurat pentru analiza contestațiilor poate decide.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const [, action, id] = match as unknown as [string, "accept" | "reject" | "ask", string];
  const ask = action === "ask";
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_appealweb_${action}_${id}`)
    .setTitle(ask ? "Cere clarificări" : action === "accept" ? "Acceptă contestația" : "Respinge contestația")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("note")
        .setLabel(ask ? "Ce vrei să afli de la membru?" : action === "accept" ? "Nota (opțional)" : "Motivul respingerii")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(ask || action === "reject")
        .setMaxLength(900),
    ));
  await interaction.showModal(modal);
  return true;
}

export async function handleWebAppealModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const match = interaction.customId.match(MODAL);
  if (!match) return false;
  const [, action, id] = match as unknown as [string, "accept" | "reject" | "ask", string];
  if (!interaction.guildId) return true;
  if (!isStaff(interaction)) {
    await interaction.reply({ content: "🛡️ Nu ai rolul configurat pentru analiza contestațiilor.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const note = interaction.fields.getTextInputValue("note").trim();
  try {
    if (action === "ask") {
      await askWebAppeal(interaction.client, { guildId: interaction.guildId, appealId: id, actorId: interaction.user.id, question: note, clarificationId: randomUUID() });
      await interaction.editReply("📨 Întrebarea e pe pagina de contestație; o vede când se loghează.");
      return true;
    }
    const decision: AppealDecision = action === "accept" ? "accepted" : "rejected";
    const finalNote = note || (decision === "accepted" ? "Contestație acceptată." : "Contestație respinsă.");
    const { unbanned } = await decideWebAppeal(interaction.client, {
      guildId: interaction.guildId, appealId: id, actorId: interaction.user.id, actorTag: interaction.user.tag ?? interaction.user.username,
      decision, note: finalNote,
    });
    await interaction.editReply(decision === "accepted"
      ? unbanned ? "✅ Contestația e acceptată și banul a fost scos." : "✅ Contestația e acceptată (banul nu a fost scos de bot)."
      : "❌ Contestația e respinsă.");
  } catch (error) {
    if (error instanceof AppealError) {
      await interaction.editReply(`⚠️ ${error.message}`);
    } else {
      logger.error({ error, appealId: id }, "Ban appeal decision failed");
      await interaction.editReply("⚠️ Nu am putut salva decizia. Încearcă din nou.");
    }
  }
  return true;
}
