import { describe, expect, it } from 'vitest';
import { formatScore, toScore, weightedRating } from '@/lib/ranking';

describe('Streamer-Ranking (Bayes-gewichtet)', () => {
  it('zieht wenige Rezensionen zum globalen Durchschnitt: v=1, R=5, C=4, m=5 -> 8,3', () => {
    const w = weightedRating({ reviewCount: 1, avgRating: 5, globalAvg: 4, m: 5 });
    expect(w).toBeCloseTo(4.1667, 4);
    expect(toScore(w)).toBe(8.3);
  });

  it('viele Rezensionen nähern sich dem eigenen Schnitt: v=95, R=5, C=4, m=5 -> 9,9', () => {
    const w = weightedRating({ reviewCount: 95, avgRating: 5, globalAvg: 4, m: 5 });
    expect(w).toBeCloseTo(4.95, 6);
    expect(toScore(w)).toBe(9.9);
  });

  it('gleicher Schnitt, mehr Rezensionen => höherer Rang bei überdurchschnittlicher Bewertung', () => {
    const few = weightedRating({ reviewCount: 2, avgRating: 5, globalAvg: 4, m: 5 })!;
    const many = weightedRating({ reviewCount: 40, avgRating: 5, globalAvg: 4, m: 5 })!;
    expect(many).toBeGreaterThan(few);
  });

  it('ohne Rezensionen: kein Score, Anzeige "Noch nicht bewertet"', () => {
    const w = weightedRating({ reviewCount: 0, avgRating: null, globalAvg: 4, m: 5 });
    expect(w).toBeNull();
    expect(toScore(w)).toBeNull();
    expect(formatScore(null)).toBe('Noch nicht bewertet');
  });

  it('Grenzen: nur 1-Sterne ergibt 2,0; nur 5-Sterne bei v>>m nähert sich 10,0', () => {
    expect(toScore(weightedRating({ reviewCount: 50, avgRating: 1, globalAvg: 1, m: 5 }))).toBe(2);
    expect(toScore(weightedRating({ reviewCount: 5000, avgRating: 5, globalAvg: 5, m: 5 }))).toBe(10);
  });

  it('formatiert mit Dezimalkomma', () => {
    expect(formatScore(8.3)).toBe('8,3');
    expect(formatScore(10)).toBe('10,0');
  });
});
