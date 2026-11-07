import { describe, expect, it } from 'vitest';
import { dayKey, effectiveStatus, isValidTimeZone, zonedToUtc } from '@/lib/time';

describe('zonedToUtc', () => {
  it('Winterzeit: 18:00 Europe/Berlin = 17:00 UTC', () => {
    expect(zonedToUtc('2026-11-05T18:00', 'Europe/Berlin').toISOString()).toBe('2026-11-05T17:00:00.000Z');
  });
  it('Sommerzeit: 18:00 Europe/Berlin = 16:00 UTC', () => {
    expect(zonedToUtc('2026-07-01T18:00', 'Europe/Berlin').toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });
  it('andere Zone: 12:00 America/New_York (Sommer) = 16:00 UTC', () => {
    expect(zonedToUtc('2026-07-01T12:00', 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });
  it('Tag der Zeitumstellung (Ende Oktober 2026): 10:00 Berlin = 09:00 UTC', () => {
    expect(zonedToUtc('2026-10-25T10:00', 'Europe/Berlin').toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });
  it('lehnt ungültige Formate ab', () => {
    expect(() => zonedToUtc('05.11.2026 18:00', 'Europe/Berlin')).toThrow();
  });
});

describe('Zeitzonen', () => {
  it('erkennt gültige und ungültige IANA-Namen', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
  it('dayKey liefert das lokale Datum der Zeitzone', () => {
    expect(dayKey('2026-11-05T23:30:00Z', 'Europe/Berlin')).toBe('2026-11-06');
  });
});

describe('effectiveStatus', () => {
  const base = { status: 'scheduled' as const, starts_at: '2026-11-05T17:00:00Z', ends_at: '2026-11-05T19:00:00Z' };
  it('geplant vor dem Start', () => expect(effectiveStatus(base, new Date('2026-11-05T16:59:00Z'))).toBe('scheduled'));
  it('live zwischen Start und Ende', () => expect(effectiveStatus(base, new Date('2026-11-05T18:00:00Z'))).toBe('live'));
  it('beendet nach dem Ende', () => expect(effectiveStatus(base, new Date('2026-11-05T19:00:00Z'))).toBe('ended'));
  it('ohne Endzeit: nach 2 Stunden beendet', () => {
    const e = { ...base, ends_at: null };
    expect(effectiveStatus(e, new Date('2026-11-05T18:59:00Z'))).toBe('live');
    expect(effectiveStatus(e, new Date('2026-11-05T19:01:00Z'))).toBe('ended');
  });
  it('manuell beendet bleibt beendet', () => {
    expect(effectiveStatus({ ...base, status: 'ended' }, new Date('2026-11-05T18:00:00Z'))).toBe('ended');
  });
});
