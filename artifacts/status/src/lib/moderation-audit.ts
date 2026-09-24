export interface ModerationAuditLog {
  id: string;
  guildId: string;
  actorId: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPresentation {
  title: string;
  details: string;
}

const eventTitles: Record<string, string> = {
  "config.updated": "Configurație actualizată",
  "case.created": "Caz de moderare creat",
  "case.updated": "Caz de moderare actualizat",
  "case.note_added": "Notă adăugată la caz",
  "cases.pruned": "Cazuri vechi eliminate",
  "action.applied": "Acțiune aplicată",
  "action.failed": "Acțiune eșuată",
  "action.reconciled": "Acțiune verificată",
  "action.finalized": "Rezultat confirmat",
  "automod.message_delete_failed": "Ștergere AutoMod eșuată",
  "ai.flagged": "Mesaj semnalat de moderarea AI",
  "raid.detected": "Alertă Anti-Raid",
  "raid.lockdown_failed": "Blocare Anti-Raid eșuată",
};

const actionLabels: Record<string, string> = {
  warn: "avertisment",
  mute: "timeout",
  unmute: "ridicare timeout",
  kick: "eliminare",
  ban: "interdicție",
  purge: "ștergere mesaje",
  slowmode: "slowmode",
  lock: "blocare canal",
  unlock: "deblocare canal",
  nick: "schimbare poreclă",
  role: "modificare rol",
  delete: "ștergere mesaj",
};

const settingTitles: Record<string, { on: string; off: string }> = {
  protection: { on: "Protecția generală a fost activată.", off: "Protecția generală a fost dezactivată." },
  autoMod: { on: "AutoMod a fost activat.", off: "AutoMod a fost dezactivat." },
  wordFilter: { on: "Filtrul de cuvinte a fost activat.", off: "Filtrul de cuvinte a fost dezactivat." },
  linkBlock: { on: "Blocarea linkurilor a fost activată.", off: "Blocarea linkurilor a fost dezactivată." },
  antiRaid: { on: "Anti-Raid a fost activat.", off: "Anti-Raid a fost dezactivat." },
  antiSpam: { on: "Anti-Spam a fost activat.", off: "Anti-Spam a fost dezactivat." },
  antiFlood: { on: "Anti-Flood a fost activat.", off: "Anti-Flood a fost dezactivat." },
  suspiciousBehavior: { on: "Detectarea comportamentului suspect a fost activată.", off: "Detectarea comportamentului suspect a fost dezactivată." },
  ai: { on: "Moderarea AI a fost activată.", off: "Moderarea AI a fost dezactivată." },
};

const categoryLabels: Record<string, string> = {
  toxicity: "toxicitate",
  profanity: "limbaj vulgar",
  attacks: "atacuri",
  bullying: "hărțuire",
  intelligentSpam: "spam inteligent",
  trolling: "trolling",
};

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanize(value: string): string {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : "Eveniment de moderare";
}

function actionLabel(value: unknown): string | null {
  const action = getText(value);
  return action ? actionLabels[action] ?? humanize(action).toLocaleLowerCase() : null;
}

function readableDiscordText(value: string): string {
  return value
    .replace(/<@!?(\d+)>/g, "membru $1")
    .replace(/<@&(\d+)>/g, "rol $1")
    .replace(/<#(\d+)>/g, "canal $1")
    .replace(/\*\*(.*?)\*\*/g, "$1");
}

function targetDescription(log: ModerationAuditLog): string | null {
  if (!log.targetId) return null;
  const targetType = log.targetType
    ? `${humanize(log.targetType).toLocaleLowerCase()} `
    : "";
  return `Țintă: ${targetType}${log.targetId}`;
}

export function presentAuditLog(log: ModerationAuditLog): AuditLogPresentation {
  const detail = log.detail ?? {};
  const eventType = log.eventType || "unknown";
  const title = eventTitles[eventType] ?? humanize(eventType);
  let details: string | null = null;

  switch (eventType) {
    case "config.updated": {
      const toggle = getText(detail.protectionToggle);
      if (toggle && typeof detail.enabled === "boolean") {
        details = settingTitles[toggle]?.[detail.enabled ? "on" : "off"]
          ?? `${humanize(toggle)} ${detail.enabled ? "a fost activat." : "a fost dezactivat."}`;
      } else {
        const version = typeof detail.version === "number" ? ` Versiunea ${detail.version}.` : "";
        details = `Setările de moderare au fost actualizate.${version}`;
      }
      break;
    }
    case "case.created": {
      const action = actionLabel(detail.actionType);
      details = action ? `Acțiune în caz: ${action}.` : "A fost deschis un caz de moderare.";
      break;
    }
    case "case.updated": {
      const changes = [
        detail.status === "closed" ? "Cazul a fost închis." : null,
        detail.status === "open" ? "Cazul a fost redeschis." : null,
        detail.reasonChanged === true ? "Motivul a fost actualizat." : null,
        detail.evidenceChanged === true ? "Dovezile au fost actualizate." : null,
      ].filter(Boolean);
      details = changes.join(" ") || "Detaliile cazului au fost actualizate.";
      break;
    }
    case "case.note_added":
      details = "A fost adăugată o notă la caz.";
      break;
    case "cases.pruned": {
      const count = typeof detail.count === "number" ? detail.count : null;
      const retention = typeof detail.retentionDays === "number" ? ` după ${detail.retentionDays} zile de păstrare` : "";
      details = count === null
        ? "Cazurile expirate au fost eliminate."
        : `${count} ${count === 1 ? "caz expirat a fost eliminat" : "cazuri expirate au fost eliminate"}${retention}.`;
      break;
    }
    case "action.applied": {
      const summary = getText(detail.summary);
      const action = actionLabel(detail.type);
      details = summary
        ? readableDiscordText(summary)
        : action ? `Acțiunea de tip ${action} a fost aplicată.` : "Acțiunea de moderare a fost aplicată.";
      break;
    }
    case "action.failed": {
      const error = getText(detail.error);
      const action = actionLabel(detail.type);
      details = error
        ? `Nu s-a putut aplica${action ? ` acțiunea de tip ${action}` : " acțiunea"}: ${readableDiscordText(error)}`
        : "Acțiunea de moderare nu a putut fi aplicată.";
      break;
    }
    case "action.reconciled": {
      const status = detail.status === "applied" ? "aplicată" : detail.status === "failed" ? "eșuată" : null;
      const note = getText(detail.note);
      details = `${status ? `Acțiunea a fost marcată ca ${status}.` : "Acțiunea a fost verificată."}${note ? ` Notă: ${readableDiscordText(note)}` : ""}`;
      break;
    }
    case "action.finalized": {
      const status = detail.status === "applied" ? "aplicată" : detail.status === "failed" ? "eșuată" : detail.status === "uncertain" ? "neconfirmată" : null;
      details = status ? `Acțiunea a fost înregistrată ca ${status}.` : "Rezultatul acțiunii a fost înregistrat.";
      break;
    }
    case "automod.message_delete_failed": {
      const kind = getText(detail.kind);
      const error = getText(detail.error);
      details = `AutoMod nu a putut șterge mesajul${kind ? ` (${humanize(kind).toLocaleLowerCase()})` : ""}.${error ? ` ${readableDiscordText(error)}` : ""}`;
      break;
    }
    case "ai.flagged": {
      const category = getText(detail.category);
      details = category ? `Categorie detectată: ${categoryLabels[category] ?? humanize(category).toLocaleLowerCase()}.` : "Mesajul a fost semnalat pentru verificare.";
      break;
    }
    case "raid.detected": {
      if (detail.youngAccount === true) {
        details = "A fost detectat un cont nou care a intrat pe server.";
      } else if (typeof detail.joins === "number") {
        details = `${detail.joins} ${detail.joins === 1 ? "intrare suspectă detectată" : "intrări suspecte detectate"} într-un interval scurt.`;
      } else {
        details = "A fost detectat un val suspect de intrări.";
      }
      break;
    }
    case "raid.lockdown_failed": {
      const error = getText(detail.error);
      details = error ? readableDiscordText(error) : "Nu s-a putut aplica blocarea anti-raid.";
      break;
    }
    default:
      details = getText(detail.summary) ?? getText(detail.reason) ?? targetDescription(log);
  }

  return {
    title,
    details: details || targetDescription(log) || "Detaliile evenimentului nu sunt disponibile.",
  };
}