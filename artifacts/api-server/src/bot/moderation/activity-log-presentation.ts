export type ActivityLogEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type ActivityLogPresentation = {
  description: string | null;
  fields: ActivityLogEmbedField[];
};

const snowflakePattern = /^\d{5,25}$/;

const detailLabels: Record<string, string> = {
  addedRoles: "Roluri adăugate",
  accountAgeDays: "Vechimea contului (zile)",
  accountCreatedAt: "Cont creat la",
  action: "Acțiune",
  bulk: "Ștergere în masă",
  changes: "Modificări",
  entityName: "Element",
  count: "Număr de evenimente",
  error: "Eroare",
  event: "Eveniment",
  joins: "Intrări",
  lockdown: "Blocare canal",
  name: "Nume",
  noSanction: "Sancțiune",
  nicknameChanged: "Poreclă schimbată",
  nsfw: "Conținut sensibil",
  oldNickname: "Poreclă veche",
  newNickname: "Poreclă nouă",
  parentId: "Categorie",
  policyExcluded: "Exceptat de la moderare",
  rateLimitPerUser: "Slowmode (secunde)",
  reason: "Motiv",
  removedRoles: "Roluri eliminate",
  rolesChanged: "Roluri schimbate",
  status: "Stare",
  topic: "Descriere",
  youngAccount: "Cont nou",
};

const hiddenDetailKeys = new Set([
  "actorBot",
  "actorId",
  "actorStaff",
  "actorVerified",
  "channelId",
  "contentChanged",
  "displayAfterContent",
  "displayBeforeContent",
  "displayContentChanged",
  "displayDeletedMessages",
  "displayMessageAuthorId",
  "messageContent",
  "messageCount",
  "messageId",
  "targetAuthorId",
]);

function normalizedEventType(eventType: string): string {
  return eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
}

function humanize(value: string): string {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : "Detaliu";
}

function validSnowflake(value: unknown): value is string {
  return typeof value === "string" && snowflakePattern.test(value);
}

function userMention(value: unknown): string | null {
  return validSnowflake(value) ? `<@${value}>` : null;
}

function truncateUtf16(value: string, maxLength: number): { text: string; truncated: boolean } {
  let text = "";
  for (const character of value) {
    if (text.length + character.length > maxLength) break;
    text += character;
  }
  return { text, truncated: text.length < value.length };
}

function formatMessageExcerpt(value: unknown, maxLength = 780): string {
  if (typeof value !== "string") {
    return "_Textul nu a fost furnizat de Discord pentru acest eveniment._";
  }

  const safe = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
    .replace(/@/g, "@\u200b")
    .replace(/`/g, "ˋ")
    .trim();

  if (!safe) return "_Mesajul nu conținea text; poate avea doar atașamente._";

  const lines = safe.split("\n");
  const visibleLines = lines.slice(0, 12);
  const quoted = visibleLines.map((line) => `> ${line || "\u200b"}`).join("\n");
  const truncated = truncateUtf16(quoted, maxLength - 18);
  const wasTruncated = truncated.truncated || lines.length > visibleLines.length;
  return wasTruncated ? `${truncated.text}\n> … (trunchiat)` : truncated.text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readableValue(value: unknown, changedKey?: string): string {
  if (value === null || value === undefined || value === "") {
    return changedKey === "parentId" ? "fără categorie" : "—";
  }
  if (changedKey && /id$/i.test(changedKey)) {
    return changedKey === "parentId" ? "categorie setată" : "actualizat";
  }
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (Array.isArray(value)) return value.slice(0, 6).map(String).join(", ");
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

function readableDetails(detail: Record<string, unknown>, extraHidden: string[] = []): string {
  const omitted = new Set([...hiddenDetailKeys, ...extraHidden]);
  return Object.entries(detail)
    .filter(([key, value]) =>
      !omitted.has(key) &&
      !/(content|messagebody|message_text)/i.test(key) &&
      !/id$/i.test(key) &&
      value !== null &&
      value !== undefined &&
      value !== "",
    )
    .slice(0, 8)
    .map(([key, value]) => {
      if (key === "changes" && isRecord(value)) {
        const changes = Object.entries(value)
          .slice(0, 6)
          .map(([changedKey, change]) => {
            const label = detailLabels[changedKey] ?? humanize(changedKey);
            if (isRecord(change) && ("from" in change || "to" in change)) {
              return `**${label}:** ${readableValue(change.from, changedKey)} → ${readableValue(change.to, changedKey)}`;
            }
            return `**${label}:** ${readableValue(change, changedKey)}`;
          })
          .join("\n");
        return `**${detailLabels.changes}:**\n${changes}`;
      }
      let rendered: string;
      rendered = readableValue(value, key);
      return `**${detailLabels[key] ?? humanize(key)}:** ${rendered}`;
    })
    .join("\n")
    .slice(0, 900);
}

function targetField(targetType: string, targetId: string): ActivityLogEmbedField | null {
  const normalizedType = targetType.toLocaleLowerCase();
  if (normalizedType === "message" || normalizedType === "guild") return null;
  if (normalizedType === "member" || normalizedType === "user") {
    return { name: "Membru vizat", value: userMention(targetId) ?? "Necunoscut", inline: false };
  }
  if (normalizedType === "channel") {
    return validSnowflake(targetId)
      ? { name: "Canal vizat", value: `<#${targetId}>`, inline: false }
      : null;
  }
  if (normalizedType === "role") {
    return validSnowflake(targetId)
      ? { name: "Rol vizat", value: `<@&${targetId}>`, inline: false }
      : null;
  }
  return {
    name: "Țintă",
    value: `${humanize(targetType)} · ${targetId}`.slice(0, 1_024),
    inline: false,
  };
}

function deletedMessages(detail: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(detail.displayDeletedMessages)
    ? detail.displayDeletedMessages.filter(isRecord).slice(0, 5)
    : [];
}

function messageSamples(detail: Record<string, unknown>): string {
  const messages = deletedMessages(detail);
  if (!messages.length) return formatMessageExcerpt(null, 760);

  const samples = messages.map((message, index) => {
    const author = userMention(message.authorId) ?? `Mesaj ${index + 1}`;
    const attachmentCount = typeof message.attachmentCount === "number" ? message.attachmentCount : 0;
    const text = typeof message.content === "string" && !message.content.trim() && attachmentCount > 0
      ? `_(fără text · ${attachmentCount} atașamente)_`
      : formatMessageExcerpt(message.content, 130);
    return `**${author}**\n${text}`;
  });

  const total = typeof detail.messageCount === "number" ? detail.messageCount : messages.length;
  const omitted = Math.max(0, total - messages.length);
  const suffix = omitted ? `\n\n*… și încă ${omitted} mesaje.*` : "";
  return `${samples.join("\n\n")}${suffix}`.slice(0, 1_024);
}

export function buildActivityLogPresentation(
  eventType: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
  actor: string,
  channel: string,
): ActivityLogPresentation {
  const normalized = normalizedEventType(eventType);
  const fields: ActivityLogEmbedField[] = [];
  const addField = (name: string, value: string | null | undefined) => {
    if (value) fields.push({ name, value: value.slice(0, 1_024), inline: false });
  };

  if (normalized === "discord.message_update") {
    const editor = userMention(detail.displayMessageAuthorId) ??
      userMention(detail.targetAuthorId) ??
      actor;
    addField("Editor", editor);
    if (channel !== "—") addField("Canal", channel);

    const beforeKnown = typeof detail.displayBeforeContent === "string";
    const afterKnown = typeof detail.displayAfterContent === "string";
    if (detail.displayContentChanged === true) {
      addField("Înainte de editare", formatMessageExcerpt(detail.displayBeforeContent));
      addField("După editare", formatMessageExcerpt(detail.displayAfterContent));
    } else if (!beforeKnown && afterKnown) {
      addField("Text anterior", formatMessageExcerpt(null));
      addField("Text disponibil acum", formatMessageExcerpt(detail.displayAfterContent));
    } else if (detail.displayContentChanged === false) {
      addField("Rezultat", "Mesajul a fost actualizat, dar textul a rămas neschimbat.");
    }

    const details = readableDetails(detail);
    if (details) addField("Detalii", details);
    const description = detail.displayContentChanged === true
      ? "Textul mesajului s-a schimbat; comparația este mai jos."
      : detail.displayContentChanged === false
        ? "Mesajul a fost actualizat fără schimbarea textului."
        : "A fost înregistrată o editare de mesaj.";
    return { description, fields };
  }

  if (normalized === "discord.message_delete" || normalized === "discord.message_bulk_delete") {
    addField("Șters de", actor);
    const messages = deletedMessages(detail);
    const singleAuthorId = detail.displayMessageAuthorId ?? messages[0]?.authorId;
    if (normalized === "discord.message_delete" && userMention(singleAuthorId)) {
      addField("Autor mesaj", userMention(singleAuthorId));
    }
    if (channel !== "—") addField("Canal", channel);

    const count = typeof detail.messageCount === "number" ? detail.messageCount : 1;
    if (normalized === "discord.message_bulk_delete") {
      addField("Mesaje afectate", String(count));
      addField("Mostre din mesajele șterse", messageSamples(detail));
    } else {
      const first = messages[0];
      const attachmentCount = typeof first?.attachmentCount === "number" ? first.attachmentCount : 0;
      const content = typeof first?.content === "string" && !first.content.trim() && attachmentCount > 0
        ? `_(fără text · ${attachmentCount} atașamente)_`
        : formatMessageExcerpt(first?.content);
      addField("Conținut șters", content);
    }

    const details = readableDetails(detail, ["messageCount"]);
    if (details) addField("Detalii", details);
    const description = normalized === "discord.message_bulk_delete"
      ? `${count} ${count === 1 ? "mesaj a fost șters" : "mesaje au fost șterse"}.`
      : "Un mesaj a fost șters.";
    return { description, fields };
  }

  addField("Actor", actor);
  const target = targetField(targetType, targetId);
  if (
    target &&
    !(targetType.toLocaleLowerCase() === "channel" && detail.channelId === targetId)
  ) {
    fields.push(target);
  }
  if (channel !== "—") addField("Canal", channel);
  const details = readableDetails(detail);
  if (details) addField("Detalii", details);
  return { description: null, fields };
}