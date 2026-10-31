/**
 * Legătura dintre autentificarea Discord reală și pagina cu cele două uși.
 *
 * Pagina apare în două locuri: pe „/” (pagina de start a site-ului) și pe
 * „/moderare” (fără sesiune sau după o autentificare eșuată). Amândouă iau
 * de aici aceleași reguli, ca ușile să se poarte la fel.
 */
import type { ModerationAuthConfig } from "../../../hooks/use-moderation-api";
import { gateAuthState, type GateAuth } from "./authState";

/** Singura adresă către care poate duce butonul de conectare. */
export const DISCORD_OAUTH_START = "/api/moderation/oauth/discord";

const AUTH_ERROR_FALLBACK = "Autentificarea Discord nu a putut fi finalizată. Încearcă din nou.";
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Autentificarea Discord nu este configurată pe server.",
  state_mismatch: "Sesiunea de autentificare a expirat sau nu mai este validă. Încearcă din nou.",
  cancelled: "Autentificarea a fost anulată. Poți încerca din nou când ești pregătit.",
  oauth_failed: "Discord nu a putut finaliza autentificarea. Încearcă din nou.",
  no_eligible_guild: "Nu ai un server eligibil pentru moderare. Verifică dacă botul este membru pe server și dacă ai rol de staff sau administrator, apoi încearcă din nou cu un alt cont Discord.",
};

/**
 * Mesajul pentru o autentificare eșuată, din adresa paginii (`?auth_error=cod`).
 * Un cod necunoscut primește mesajul general: codul brut nu ajunge niciodată pe ecran.
 */
export function authErrorMessage(search: string): string | null {
  const code = new URLSearchParams(search).get("auth_error");
  return code ? AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_FALLBACK : null;
}

/**
 * Adresa de pornire a autentificării, doar dacă e chiar cea de pe acest site
 * (aceeași origine și aceeași cale); orice altceva se respinge.
 */
export function sameOriginDiscordUrl(value: string | null | undefined, origin: string = window.location.origin): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || parsed.pathname !== DISCORD_OAUTH_START) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export interface GateConnectionInput {
  /** Există o sesiune de operator. */
  signedIn: boolean;
  authConfig: ModerationAuthConfig | null;
  /** Configurația autentificării (sau sesiunea) se încarcă încă. */
  loading: boolean;
  error: { message: string } | null;
  retry: () => Promise<unknown>;
  /** Partea de după „?” din adresa paginii. */
  search: string;
  origin?: string;
}

/** Tot ce primește pagina cu cele două uși de la autentificarea reală. */
export interface GateConnection {
  botName: string | null;
  botInviteUrl: string | null;
  authError: string | null;
  auth: GateAuth;
}

export function gateConnection(input: GateConnectionInput): GateConnection {
  const { authConfig } = input;
  return {
    botName: authConfig?.bot?.name ?? null,
    botInviteUrl: authConfig?.botInviteUrl ?? null,
    authError: authErrorMessage(input.search),
    auth: gateAuthState({
      signedIn: input.signedIn,
      loading: input.loading,
      error: input.error,
      retry: () => void input.retry().catch(() => undefined),
      configured: Boolean(authConfig?.discordOAuthConfigured),
      loginUrl: sameOriginDiscordUrl(authConfig?.authorizationUrl, input.origin),
    }),
  };
}
