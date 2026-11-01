const MESSAGES: Record<string, string> = {
  invalid_input: 'Bitte prüfe deine Eingaben.',
  invalid_credentials: 'E-Mail oder Passwort stimmt nicht.',
  unauthenticated: 'Bitte melde dich an.',
  forbidden: 'Dafür fehlt dir die Berechtigung.',
  not_found: 'Der Eintrag wurde nicht gefunden.',
  duplicate: 'Das gibt es schon, zum Beispiel einen doppelten Namen, eine doppelte Rezension oder einen offenen Antrag.',
  quota_exhausted: 'Alle kostenlosen Events sind verbraucht. Für weitere Events brauchst du Streamer-Premium.',
  rate_limited: 'Zu viele Aktionen in kurzer Zeit. Warte einen Moment und versuche es erneut.',
  duplicate_message: 'Diese Nachricht hast du gerade schon gesendet.',
  invalid_length: 'Die Nachricht ist leer oder länger als 500 Zeichen.',
  not_editable: 'Nachrichten lassen sich nur 5 Minuten lang bearbeiten.',
  favorite_limit: 'Kostenlose Konten haben bis zu 10 Favoriten. Mit Premium sind es unbegrenzt.',
  premium_required: 'Diese Funktion gehört zu Premium.',
  reminder_in_past: 'Der Erinnerungszeitpunkt liegt in der Vergangenheit.',
  reason_required: 'Bitte gib eine Begründung an (mindestens 3 Zeichen).',
  invalid_reason: 'Bitte gib einen Grund mit 3 bis 300 Zeichen an.',
  already_decided: 'Dieser Antrag wurde bereits entschieden.',
  plan_not_configured: 'Für diesen Plan sind Preis und Laufzeit noch nicht festgelegt.',
  amount_too_low: 'Der bestätigte Betrag liegt unter dem Preis.',
  too_many_tokens: 'Du kannst höchstens 3 aktive Mod-Tokens haben.',
  invalid_duration: 'Ungültige Dauer.',
  not_configured: 'Der Zahlungsempfänger ist noch nicht festgelegt.',
  unknown: 'Das hat nicht geklappt. Versuche es später erneut.',
};

const OK_MESSAGES: Record<string, string> = {
  saved: 'Gespeichert.',
  created: 'Erstellt.',
  sent: 'Gesendet.',
  done: 'Erledigt.',
  confirm_email: 'Fast geschafft: Bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.',
  payment_submitted: 'Zahlungsnachweis eingereicht. Ein Administrator prüft ihn; Premium startet erst nach der Bestätigung.',
  verification_requested: 'Antrag gespeichert. Eröffne jetzt das Ticket auf unserem Discord, damit ein Administrator ihn prüfen kann.',
};

/** Wandelt einen Supabase/Postgres-Fehler in einen festen Code um – nie in freien Text (kein Text-Injection über die URL). */
export function errorCode(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  if (msg in MESSAGES) return msg;
  if (err?.code === '23505' || /duplicate key/i.test(msg)) return 'duplicate';
  if (err?.code === '23514' || /violates check constraint/i.test(msg)) return 'invalid_input';
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'forbidden';
  // Unerwartete Fehler im Server-Log festhalten, aber nur den Fehlercode (die Meldung kann Nutzerdaten enthalten).
  if (typeof window === 'undefined') console.error('[smpevents] unerwarteter Datenbankfehler, Code:', err?.code ?? 'ohne Code');
  return 'unknown';
}

export const humanizeError = (code: string | null | undefined): string | null =>
  code ? (MESSAGES[code] ?? MESSAGES.unknown) : null;

export const humanizeOk = (code: string | null | undefined): string | null =>
  code ? (OK_MESSAGES[code] ?? 'Erledigt.') : null;
