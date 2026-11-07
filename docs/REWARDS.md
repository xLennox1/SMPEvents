# Punkte, Creator-Codes und Shop

Der Shop steht allen offen. Punkte bekommst du für Rezensionen; verifizierte Streamer bekommen zusätzlich Bonuspunkte, wenn ihre Unterstützer mit ihrem **Creator-Code** einkaufen. Alle Zahlen stehen in `app_settings` und lassen sich im SQL-Editor ändern.

## Wie Punkte entstehen

| Quelle | Standard | Regeln |
|---|---|---|
| Rezension | 10 Punkte | nur für die **erste** Rezension je Streamer (auch nach Löschen und Neuschreiben nicht erneut), Text ab 20 Zeichen, höchstens 3 belohnte Rezensionen je 24 Stunden |
| Creator-Bonus | 10 % | Wenn ein Unterstützer im Shop einkauft, bekommt der Creator 10 % des Kaufpreises (abgerundet) zusätzlich. Dem Käufer kostet das nichts. |
| Admin-Anpassung | frei | *Admin → Nutzer → Punkte anpassen*, mit Grund, im Audit-Log |

Wird eine Rezension von der Moderation entfernt, verfallen ihre Punkte. Alles läuft über ein Ledger, das nur der Server beschreibt; Nutzer sehen nur ihr eigenes.

## Creator-Codes

- Nur **verifizierte Streamer** (blauer Haken) können einen Code erstellen, einen je Streamer (3–20 Zeichen A–Z, 0–9, `_`, `-`). Verliert der Streamer den Haken, ruht der Code.
- Spieler tragen den Code im Shop oder unter *Creator-Codes* ein. Man unterstützt einen Creator gleichzeitig und kann höchstens alle 30 Tage wechseln. Den eigenen Code kann man nicht nutzen.
- Streamer sehen Anzahl der Unterstützer und verdiente Bonuspunkte, nicht die Namen.

## Shop

- Artikel pflegst du unter *Admin → Shop*: Name, Beschreibung, Preis in Punkten, Bestand (leer = unbegrenzt), Maximum je Spieler, Reihenfolge, aktiv. Es sind **keine Artikel vorinstalliert**; die Items und Preise legst du fest.
- Kaufen können nur Spieler mit **verknüpftem Minecraft-Konto** und genug Punkten. Die Bestellung geht an den verifizierten Namen.
- Geliefert wird **von Hand** im Spiel (du bist kein Serveradmin, daher gibt es keine automatische Übergabe). Danach markierst du die Bestellung als „geliefert“. „Stornieren“ erstattet die Punkte, stellt den Bestand wieder her und nimmt dem Creator den Bonus weg.

## Discord

Du trägst deinen Server selbst ein, beides ist optional:

1. `NEXT_PUBLIC_DISCORD_SERVER_URL`: dauerhafter Einladungslink. Erscheint als Button „Zum Discord“ im Shop und bei den Creator-Codes.
2. `DISCORD_SHOP_WEBHOOK_URL`: Webhook eines Kanals (*Kanal-Einstellungen → Integrationen → Webhooks → Neuer Webhook → URL kopieren*). Neue Bestellungen erscheinen dort mit Artikel, Punkten, Minecraft-Name und Benutzername; `@everyone` aus Nutzereingaben wird unterdrückt. Die URL ist ein **Geheimnis**: nur als Vercel-Umgebungsvariable, nie im Code.

Ohne beide Werte funktioniert alles, die Bestellungen stehen dann nur im Admin-Bereich.

## Einstellungen

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `points_per_review` | 10 | Punkte je belohnter Rezension (0 schaltet ab) |
| `points_review_min_length` | 20 | Mindestlänge des Textes |
| `points_review_daily_cap` | 3 | belohnte Rezensionen je Nutzer und 24 Stunden |
| `creator_commission_percent` | 10 | Creator-Bonus in Prozent (0 schaltet ab) |

Beispiel: `update public.app_settings set value = '15' where key = 'points_per_review';`

## Missbrauchsschutz

Einmalige Belohnung je (Nutzer, Streamer), Tageslimit, Mindestlänge, Verfall bei entfernten Rezensionen, Creator-Bonus nur auf echte Käufe (kein Farmen mit Fake-Konten, die nur Codes eintragen), Käufe pro Nutzer serialisiert, Bestandsprüfung, Audit-Log für Admin-Aktionen. Fake-Konten können trotzdem Rezensionen schreiben: Die Moderation (Rezensionen, Meldungen) bleibt die wichtigste Bremse.
