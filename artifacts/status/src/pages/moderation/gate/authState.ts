/** Ce arată pagina „Autentificare operator” în locul acțiunilor de conectare. */
export type GateAuth =
  | { kind: "ready"; loginUrl: string }
  | { kind: "checking" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "unavailable" };

interface GateAuthInput {
  /** Configurația autentificării se încarcă încă. */
  loading: boolean;
  /** Configurația nu a putut fi încărcată. */
  error: { message: string } | null | undefined;
  retry: () => void;
  /** Serverul are Discord OAuth configurat. */
  configured: boolean;
  /** Adresa de pornire a autentificării, deja verificată că e pe același site. */
  loginUrl: string | null;
}

/** Aceeași ordine ca la vechiul ecran: verificare, eroare, indisponibil, gata. */
export function gateAuthState(input: GateAuthInput): GateAuth {
  if (input.loading) return { kind: "checking" };
  if (input.error) return { kind: "error", message: input.error.message, retry: input.retry };
  if (!input.configured || !input.loginUrl) return { kind: "unavailable" };
  return { kind: "ready", loginUrl: input.loginUrl };
}
