export type ActivityLogEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type ActivityLogPresentation = {
  description: string | null;
  fields: ActivityLogEmbedField[];
  thumbnailUrl?: string;
  imageUrl?: string;
};

const snowflakePattern = /^\d{5,25}$/;

const detailLabels: Record<string, string> = {
  addedRoles: "Roluri adăugate",
  accountAgeDays: "Vechimea contului (zile)",
  accountCreatedAt: "Cont creat la",
  action: "Acțiune",
  bulk: "Ștergere în masă",
  channelName: "Canal vocal",
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
  newChannelName: "Canal vocal nou",
  nsfw: "Conținut sensibil",
  oldNickname: "Poreclă veche",
  oldChannelName: "Canal vocal anterior",
  newNickname: "Poreclă nouă",
  parentCategory: "Categorie",
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
  "memberDisplayName",
  "memberAvatarUrl",
  "memberUsername",
  "messageContent",
  "messageCount",
  "messageId",
  "serverJoinedAt",
  "serverLeftAt",
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

function safeObjectValue(value: Record<string, unknown>): string {
  return JSON.stringify(value, (key, item) => {
    if (key && /id$/i.test(key)) return undefined;
    if (typeof item === "string" && validSnowflake(item)) return "ID ascuns";
    return item;
  });
}

function userMention(value: unknown): string | null {
  return validSnowflake(value) ? `<@${value}>` : null;
}

function safeMemberName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const safe = value
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, " ")
    .replace(/@/g, "@\u200b")
    .replace(/`/g, "ˋ")
    .trim()
    .slice(0, 100);
  return safe || null;
}

function timestampMillis(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function discordTimestamp(timestamp: number, style: "F" | "R"): string {
  return `<t:${Math.floor(timestamp / 1_000)}:${style}>`;
}

function safeDiscordAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.discordapp.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeDiscordAttachmentImageUrl(value: unknown, contentType: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "cdn.discordapp.com" ||
      !/^\/attachments\/\d{5,25}\/\d{5,25}\/[^/]+$/i.test(url.pathname)
    ) return null;

    const supportedTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/apng"]);
    const hasSupportedExtension = /\.(?:png|jpe?g|gif|webp|avif|apng)$/i.test(url.pathname);
    if (typeof contentType === "string" && contentType.trim()) {
      if (!supportedTypes.has(contentType.split(";")[0]!.trim().toLowerCase())) return null;
    } else if (!hasSupportedExtension) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function formatMemberDuration(startedAt: number, endedAt: number): string {
  const durationMs = Math.max(0, endedAt - startedAt);
  const totalMinutes = Math.floor(durationMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "zi" : "zile"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "oră" : "ore"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minut" : "minute"}`);
  const readable = parts.length ? parts.join(", ") : "mai puțin de un minut";
  const totalDays = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 3 })
    .format(durationMs / 86_400_000);
  return `${readable} (${totalDays} zile în total)`;
}

function accountAgeParts(startedAt: number, endedAt: number): { years: number; months: number; days: number } {
  const start = new Date(startedAt);
  const end = new Date(Math.max(startedAt, endedAt));
  const anchoredDate = (year: number, month: number) => {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(
      year,
      month,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    );
  };
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let cursor = anchoredDate(start.getUTCFullYear() + years, start.getUTCMonth());
  if (cursor > end.getTime()) years -= 1;
  years = Math.max(0, years);
  cursor = anchoredDate(start.getUTCFullYear() + years, start.getUTCMonth());
  let months = 0;
  while (months < 11) {
    const cursorDate = new Date(cursor);
    const next = anchoredDate(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth() + 1);
    if (next > end.getTime()) break;
    cursor = next;
    months += 1;
  }
  const days = Math.max(0, Math.floor((end.getTime() - cursor) / 86_400_000));
  return { years, months, days };
}

function readableAccountAge(years: number, months: number, days: number): string {
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "an" : "ani"}`);
  if (months) parts.push(`${months} ${months === 1 ? "lună" : "luni"}`);
  if (days) parts.push(`${days} ${days === 1 ? "zi" : "zile"}`);
  return parts.join(", ") || "mai puțin de o lună";
}

/** Replaces the documented, event-specific tokens used by member log templates. */
export function renderMemberActivityTemplate(
  template: string,
  eventType: string,
  targetId: string,
  detail: Record<string, unknown>,
): string {
  const normalized = normalizedEventType(eventType);
  const isJoin = normalized === "discord.member_join";
  const joinedAt = timestampMillis(detail.serverJoinedAt);
  const leftAt = timestampMillis(detail.serverLeftAt);
  const accountCreatedAt = timestampMillis(detail.accountCreatedAt);
  const eventAt = (isJoin ? joinedAt : leftAt) ?? Date.now();
  const accountAge = accountCreatedAt === null
    ? null
    : accountAgeParts(accountCreatedAt, eventAt);
  const displayName = safeMemberName(detail.memberDisplayName) ?? "Necunoscut";
  const username = safeMemberName(detail.memberUsername) ?? "Necunoscut";
  const values: Record<string, string> = {
    member: userMention(targetId) ?? displayName,
    member_name: displayName,
    username,
    account_created_at: accountCreatedAt === null ? "indisponibilă" : discordTimestamp(accountCreatedAt, "F"),
    account_created_at_relative: accountCreatedAt === null ? "indisponibilă" : discordTimestamp(accountCreatedAt, "R"),
    account_age: accountAge ? readableAccountAge(accountAge.years, accountAge.months, accountAge.days) : "indisponibilă",
    account_age_years: accountAge ? String(accountAge.years) : "indisponibil",
    account_age_days: accountCreatedAt === null
      ? "indisponibil"
      : String(Math.max(0, Math.floor((eventAt - accountCreatedAt) / 86_400_000))),
    server_joined_at: joinedAt === null ? "indisponibilă" : discordTimestamp(joinedAt, "F"),
    server_joined_at_relative: joinedAt === null ? "indisponibilă" : discordTimestamp(joinedAt, "R"),
    server_left_at: leftAt === null ? "încă pe server" : discordTimestamp(leftAt, "F"),
    server_left_at_relative: leftAt === null ? "încă pe server" : discordTimestamp(leftAt, "R"),
    server_duration: joinedAt === null
      ? "indisponibilă"
      : leftAt === null ? "în curs" : formatMemberDuration(joinedAt, leftAt),
    timestamp: discordTimestamp(eventAt, "F"),
    timestamp_relative: discordTimestamp(eventAt, "R"),
  };
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key.toLocaleLowerCase()] ?? match);
}

function memberAccountCreationValue(detail: Record<string, unknown>, eventAt: number): string {
  const createdAt = timestampMillis(detail.accountCreatedAt);
  if (createdAt === null) return "Data creării contului nu este disponibilă.";
  const ageDays = Math.max(0, Math.floor((eventAt - createdAt) / 86_400_000));
  return [
    discordTimestamp(createdAt, "F"),
    `Creat ${discordTimestamp(createdAt, "R")} · vechime la eveniment: ${ageDays.toLocaleString("ro-RO")} zile`,
  ].join("\n");
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
  if (typeof value === "string" && validSnowflake(value)) return "ID ascuns";
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => {
      if (typeof item === "string" && validSnowflake(item)) {
        if (changedKey && /roles?/i.test(changedKey)) return `<@&${item}>`;
        if (changedKey && /channels?|category/i.test(changedKey)) return `<#${item}>`;
        if (changedKey && /members?|users?|author/i.test(changedKey)) return `<@${item}>`;
        return "element Discord";
      }
      return isRecord(item) ? safeObjectValue(item) : String(item);
    }).join(", ");
  }
  if (isRecord(value)) return safeObjectValue(value);
  return String(value);
}

function readableDetails(detail: Record<string, unknown>, extraHidden: string[] = []): string {
  const omitted = new Set([...hiddenDetailKeys, ...extraHidden]);
  const priority = new Map([
    "changes",
    "addedRoles",
    "removedRoles",
    "parentCategory",
    "oldChannelName",
    "newChannelName",
    "channelName",
  ].map((key, index) => [key, index]));
  const rankedDetails = Object.entries(detail)
    .filter(([key, value]) =>
      !omitted.has(key) &&
      !/(content|messagebody|message_text)/i.test(key) &&
      !/id$/i.test(key) &&
      value !== null &&
      value !== undefined &&
      value !== "",
    )
    .sort(([left], [right]) => (priority.get(left) ?? priority.size) - (priority.get(right) ?? priority.size))
    .slice(0, 8);
  return rankedDetails
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

function targetField(
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
): ActivityLogEmbedField | null {
  const normalizedType = targetType.toLocaleLowerCase();
  if (normalizedType === "message" || normalizedType === "guild") return null;
  if (normalizedType === "member" || normalizedType === "user") {
    const displayName = safeMemberName(detail.memberDisplayName);
    const username = safeMemberName(detail.memberUsername);
    const lines = [userMention(targetId) ?? displayName ?? "Necunoscut"];
    if (displayName && displayName !== username) lines.push(`Nume pe server: ${displayName}`);
    if (username) lines.push(`Utilizator: @${username}`);
    return { name: "Membru", value: lines.join("\n").slice(0, 1_024), inline: false };
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
  const rawEntityName = typeof detail.entityName === "string" ? detail.entityName.trim() : "";
  const entityName = rawEntityName && !validSnowflake(rawEntityName)
    ? rawEntityName
    : "nume indisponibil";
  return {
    name: "Țintă",
    value: `${humanize(targetType)} · ${entityName}`.slice(0, 1_024),
    inline: false,
  };
}

function deletedMessages(detail: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(detail.displayDeletedMessages)
    ? detail.displayDeletedMessages.filter(isRecord).slice(0, 5)
    : [];
}

function deletedMessageImageUrl(detail: Record<string, unknown>): string | undefined {
  for (const message of deletedMessages(detail)) {
    if (!Array.isArray(message.imageAttachments)) continue;
    for (const attachment of message.imageAttachments) {
      if (!isRecord(attachment)) continue;
      const imageUrl = safeDiscordAttachmentImageUrl(attachment.url, attachment.contentType);
      if (imageUrl) return imageUrl;
    }
  }
  return undefined;
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
    return { description, fields, imageUrl: deletedMessageImageUrl(detail) };
  }

  if (normalized === "discord.member_join" || normalized === "discord.member_leave") {
    const member = targetField("member", targetId, detail);
    if (member) fields.push(member);

    const joinedAt = timestampMillis(detail.serverJoinedAt);
    const leftAt = timestampMillis(detail.serverLeftAt);
    const isJoin = normalized === "discord.member_join";
    const eventAt = isJoin ? joinedAt ?? Date.now() : leftAt ?? Date.now();
    const activityLines = [
      joinedAt
        ? `Intrare: ${discordTimestamp(joinedAt, "F")} · ${discordTimestamp(joinedAt, "R")}`
        : "Intrare: _data nu este disponibilă pentru această perioadă_",
    ];
    if (!isJoin) {
      activityLines.push(
        leftAt
          ? `Ieșire: ${discordTimestamp(leftAt, "F")} · ${discordTimestamp(leftAt, "R")}`
          : "Ieșire: _data nu este disponibilă_",
      );
    }
    addField("Activitate pe server", activityLines.join("\n"));

    if (!isJoin && joinedAt !== null && leftAt !== null) {
      addField("Durata pe server", formatMemberDuration(joinedAt, leftAt));
    } else if (!isJoin) {
      addField("Durata pe server", "Nu poate fi calculată fără data intrării.");
    }
    addField("Cont Discord creat", memberAccountCreationValue(detail, eventAt));
    return {
      description: isJoin
        ? "Un membru nou s-a alăturat serverului."
        : "Membrul a părăsit serverul.",
      fields,
      thumbnailUrl: safeDiscordAvatarUrl(detail.memberAvatarUrl) ?? undefined,
    };
  }

  addField("Actor", actor);
  const target = targetField(targetType, targetId, detail);
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