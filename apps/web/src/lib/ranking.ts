/**
 * Bayes-gewichtetes Streamer-Ranking – Spiegel der SQL-View `streamer_rankings`
 * (die View ist die Quelle der Wahrheit; diese Funktionen dienen Tests und Dokumentation).
 *
 *   W     = v/(v+m) * R + m/(v+m) * C
 *   Score = round(W * 2, 1)        (Sterne 1–5  ->  Punktzahl 2,0–10,0)
 */
export interface RankingInput {
  reviewCount: number;        // v
  avgRating: number | null;   // R
  globalAvg: number;          // C
  m: number;
}

export function weightedRating({ reviewCount: v, avgRating: r, globalAvg: c, m }: RankingInput): number | null {
  if (v <= 0 || r === null) return null;
  return (v / (v + m)) * r + (m / (v + m)) * c;
}

export function toScore(weighted: number | null): number | null {
  return weighted === null ? null : Math.round(weighted * 20) / 10;
}

export function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? 'Noch nicht bewertet' : score.toFixed(1).replace('.', ',');
}
