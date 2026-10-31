/** Ce arată pagina cu cele două uși în locul acțiunilor de conectare. */
export type GateAuth =
  /** Operatorul are deja o sesiune: panoul se deschide direct, fără altă autentificare. */
  | { kind: "signed-in" }
  | { kind: "ready"; loginUrl: string }
  | { kind: "checking" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "unavailable" };

interface GateAuthInput {
  /** Există o sesiune de operator. Are prioritate: nu mai contează configurația autentificării. */
  signedIn?: boolean;
  /** Configurația autentificării (sau sesiunea) se încarcă încă. */
  loading: boolean;
  /** Configurația nu a putut fi încărcată. */
  error: { message: string } | null | undefined;
  retry: () => void;
  /** Serverul are Discord OAuth configurat. */
  configured: boolean;
  /** Adresa de pornire a autentificării, deja verificată că e pe același site. */
  loginUrl: string | null;
}

/** Sesiunea existentă, apoi aceeași ordine ca la vechiul ecran: verificare, eroare, indisponibil, gata. */
export function gateAuthState(input: GateAuthInput): GateAuth {
  if (input.signedIn) return { kind: "signed-in" };
  if (input.loading) return { kind: "checking" };
  if (input.error) return { kind: "error", message: input.error.message, retry: input.retry };
  if (!input.configured || !input.loginUrl) return { kind: "unavailable" };
  return { kind: "ready", loginUrl: input.loginUrl };
}
