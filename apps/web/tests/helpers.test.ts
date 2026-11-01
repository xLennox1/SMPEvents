import { describe, expect, it } from 'vitest';
import { errorCode, humanizeError, humanizeOk } from '@/lib/errors';
import { safeNext } from '@/lib/flash';

describe('safeNext (Schutz vor Open Redirects)', () => {
  it('erlaubt nur interne Pfade', () => {
    expect(safeNext('/profile')).toBe('/profile');
    expect(safeNext('/events?when=all&page=2')).toBe('/events?when=all&page=2');
  });
  it('fällt bei fremden Zielen auf die Startseite zurück', () => {
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
  it('nutzt den angegebenen Fallback', () => {
    expect(safeNext('//evil.example', '/profile')).toBe('/profile');
  });
});

describe('errorCode / humanizeError (nie freier Text aus der Datenbank in der URL)', () => {
  it('übernimmt bekannte Codes der Datenbank-Funktionen', () => {
    expect(errorCode({ message: 'quota_exhausted' })).toBe('quota_exhausted');
    expect(errorCode({ message: 'rate_limited' })).toBe('rate_limited');
    expect(errorCode({ message: 'duplicate_message' })).toBe('duplicate_message');
  });
  it('ordnet Postgres-Fehler ein', () => {
    expect(errorCode({ code: '23505', message: 'duplicate key value violates unique constraint "x"' })).toBe('duplicate');
    expect(errorCode({ code: '23514', message: 'new row violates check constraint "y"' })).toBe('invalid_input');
    expect(errorCode({ code: '42501', message: 'permission denied for table profiles' })).toBe('forbidden');
  });
  it('gibt für alles andere nur "unknown" zurück, nie die Originalmeldung', () => {
    expect(errorCode({ message: 'Key (email)=(geheim@example.com) already exists' , code: 'XX999' })).toBe('unknown');
    expect(errorCode(null)).toBe('unknown');
  });
  it('liefert deutsche Texte und ein Fallback für unbekannte Codes', () => {
    expect(humanizeError('quota_exhausted')).toContain('Premium');
    expect(humanizeError('gibt-es-nicht')).toBe(humanizeError('unknown'));
    expect(humanizeError(undefined)).toBeNull();
    expect(humanizeOk('saved')).toBe('Gespeichert.');
  });
});
