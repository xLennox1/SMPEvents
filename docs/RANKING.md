# Streamer-Ranking

Die Punktzahl entsteht ausschließlich aus aktiven Community-Rezensionen und wird von der SQL-View `public.streamer_rankings` berechnet (Quelle der Wahrheit). `apps/web/src/lib/ranking.ts` spiegelt die Formel für Tests und Dokumentation. Niemand kann die Punktzahl direkt bearbeiten.

## Formel

```
W     = v / (v + m) · R  +  m / (v + m) · C
Punkt = round(W · 2, 1)
```

| Symbol | Bedeutung |
|---|---|
| R | durchschnittliche Sternebewertung (1–5) des Streamers |
| v | Anzahl seiner aktiven Rezensionen |
| C | Durchschnitt **aller** aktiven Rezensionen (nicht der Mittelwert der Streamer-Schnitte) |
| m | Mindestgewichtung, `app_settings.ranking_m`, Standard 5 |

Wenige Rezensionen ziehen die Punktzahl zum Gesamtschnitt C; je größer v gegenüber m, desto näher liegt sie am eigenen Schnitt R. Streamer ohne Rezensionen erhalten keine Punktzahl („Noch nicht bewertet“). Entfernte Rezensionen zählen nicht.

## Skala: 2,0 bis 10,0

Mit `W · 2` ergeben 5 Sterne höchstens **10,0** und 1 Stern mindestens **2,0** (nicht 1,0). Das entspricht deiner Vorgabe „W · 2 auf eine Skala von 2 bis 10“. Wer die volle Skala 1,0–10,0 möchte, ersetzt `W * 2` durch `1 + (W - 1) * 2.25` in der View und in `toScore()` (`lib/ranking.ts`) und passt die Tests an.

## Rechenbeispiele (m = 5, C = 4,0)

| v | R | W | Punkte |
|---|---|---|---|
| 1 | 5,0 | 4,1667 | 8,3 |
| 10 | 5,0 | 4,6667 | 9,3 |
| 95 | 5,0 | 4,9500 | 9,9 |
| 0 | n. v. | n. v. | Noch nicht bewertet |

Direkt in SQL nachrechnen: `select round(((1::numeric/(1+5))*5 + (5::numeric/(1+5))*4) * 2, 1);` ergibt `8.3`.

## Rang

`rank()` nach W absteigend, bei Gleichstand nach Anzahl der Rezensionen. Nicht bewertete Streamer haben keinen Rang. Rundung: SQL `round(numeric, 1)`, in TypeScript `Math.round(x · 20) / 10`; an Rundungsgrenzen kann die Fließkomma-Darstellung um eine Stelle abweichen, die View gilt.
