export type EventStatus = 'scheduled' | 'live' | 'ended';

export const DEFAULT_TIMEZONE = 'Europe/Berlin';
/** Ohne Endzeit gilt ein Event nach dieser Dauer als beendet. */
export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const safeTimeZone = (tz: string | null | undefined): string =>
  tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;

function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs;
}

/** Wandelt eine lokale Uhrzeit ("YYYY-MM-DDTHH:mm") einer Zeitzone in einen UTC-Zeitpunkt um. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error('Ungültiges Datumsformat');
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMs(guess, tz);
  return new Date(guess - offsetMs(first, tz)); // zweiter Durchlauf fängt Sommerzeit-Grenzen ab
}

export function effectiveStatus(
  e: { status: EventStatus; starts_at: string; ends_at: string | null },
  now: Date = new Date(),
): EventStatus {
  if (e.status === 'ended') return 'ended';
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : start + DEFAULT_EVENT_DURATION_MS;
  const t = now.getTime();
  if (t >= end) return 'ended';
  if (t >= start || e.status === 'live') return 'live';
  return 'scheduled';
}

const fmt = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: safeTimeZone(tz), ...opts }).format(new Date(iso));

export const formatDateTime = (iso: string, tz = DEFAULT_TIMEZONE) => fmt(iso, tz, { dateStyle: 'medium', timeStyle: 'short' });
export const formatTime = (iso: string, tz = DEFAULT_TIMEZONE) => fmt(iso, tz, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
export const formatDay = (iso: string, tz = DEFAULT_TIMEZONE) => fmt(iso, tz, { day: '2-digit' });
export const formatMonthShort = (iso: string, tz = DEFAULT_TIMEZONE) => fmt(iso, tz, { month: 'short' });
/** "YYYY-MM-DD" in der angegebenen Zeitzone (für den Kalender). */
export const dayKey = (iso: string, tz = DEFAULT_TIMEZONE) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: safeTimeZone(tz) }).format(new Date(iso));
