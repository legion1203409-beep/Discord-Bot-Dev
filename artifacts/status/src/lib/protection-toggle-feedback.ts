export type ProtectionToggleNoticeStatus =
  | "not_applicable"
  | "sent"
  | "no_channel"
  | "bot_offline"
  | "guild_unavailable"
  | "channel_unavailable"
  | "send_failed";

export type NativeAutoModSyncStatus = "synced" | "bot_offline" | "missing_permission" | "conflict" | "failed";

function nativeAutoModWarning(status?: NativeAutoModSyncStatus): string | null {
  switch (status) {
    case "bot_offline":
      return "Setarea este salvată, dar botul este deconectat. Regulile Discord AutoMod se vor sincroniza după reconectare.";
    case "missing_permission":
      return "Botul nu are permisiunea Manage Server pentru regulile Discord AutoMod. Moderarea internă rămâne disponibilă.";
    case "conflict":
      return "Discord are deja o regulă AutoMod administrată manual de același tip. Regula botului nu a fost creată; moderarea internă rămâne disponibilă.";
    case "failed":
      return "Regulile Discord AutoMod nu au putut fi sincronizate. Verifică permisiunile botului și încearcă din nou.";
    default:
      return null;
  }
}

export function protectionToggleToastOptions(
  enabled: boolean,
  status?: ProtectionToggleNoticeStatus,
  existingDescription?: string,
  nativeStatus?: NativeAutoModSyncStatus,
): { title: string; description?: string } {
  const description = (notice: string) =>
    [existingDescription?.trim(), notice].filter(Boolean).join(" ");
  const nativeWarning = nativeAutoModWarning(nativeStatus);
  if (nativeWarning) {
    return {
      title: "Setare salvată, sincronizare Discord incompletă",
      description: description(nativeWarning),
    };
  }

  if (!enabled) {
    return { title: "Modul dezactivat", description: existingDescription };
  }

  switch (status) {
    case "sent":
      return { title: "Modul activat", description: description("Anunțul a fost trimis în canalul de audit.") };
    case "no_channel":
      return {
        title: "Modul activat, fără anunț",
        description: "Configurează canalul de audit din setările moderării pentru a primi anunțuri pe Discord.",
      };
    case "bot_offline":
      return {
        title: "Modul activat, fără anunț",
        description: "Botul Discord nu este conectat. Anunțul nu a putut fi trimis.",
      };
    case "guild_unavailable":
      return {
        title: "Modul activat, fără anunț",
        description: "Botul nu poate accesa serverul Discord selectat.",
      };
    case "channel_unavailable":
      return {
        title: "Modul activat, fără anunț",
        description: "Canalul de audit nu este disponibil sau botul nu poate scrie în el.",
      };
    case "send_failed":
      return {
        title: "Modul activat, fără anunț",
        description: "Discord nu a acceptat mesajul. Verifică accesul botului la canalul de audit.",
      };
    default:
      return { title: "Modul activat", description: existingDescription };
  }
}

export function configSaveToastOptions(
  status: ProtectionToggleNoticeStatus | undefined,
  title: string,
  existingDescription: string,
  nativeStatus?: NativeAutoModSyncStatus,
): { title: string; description: string } {
  const nativeWarning = nativeAutoModWarning(nativeStatus);
  if (nativeWarning) {
    return {
      title: "Setările sunt salvate, dar sincronizarea Discord este incompletă",
      description: [existingDescription, nativeWarning].filter(Boolean).join(" "),
    };
  }
  if (!status || status === "not_applicable") return { title, description: existingDescription };
  if (status === "sent") {
    return {
      title,
      description: [existingDescription, "Anunțul a fost trimis în canalul de audit."].filter(Boolean).join(" "),
    };
  }
  const notice = protectionToggleToastOptions(true, status);
  return {
    title: "Setările au fost salvate, dar anunțul nu a fost trimis",
    description: [existingDescription, notice.description].filter(Boolean).join(" "),
  };
}