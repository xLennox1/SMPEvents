# Tests und Testergebnisse

Stand dieser Lieferung. Die Entstehungsumgebung hatte **kein Netzwerk und kein PostgreSQL**; deshalb konnten Tests, die Abhängigkeiten oder eine Datenbank brauchen, geschrieben, aber nicht ausgeführt werden. Die Tabelle trennt das klar.

## Überblick

| Suite | Umfang | Ausführen | Hier ausgeführt? | Ergebnis |
|---|---|---|---|---|
| Mod: Parser, Beträge, JSON, Uploader (gegen lokalen Test-Server), Chat-Handler, Konfiguration | 32 JUnit-Tests | `cd minecraft-mod && ./gradlew test` | Ja, mit einem kleinen JUnit-Ersatz und Stubs für Gson/SLF4J | 32 von 32 bestanden |
| Website: Ranking-Formel, Zeitzonen, Event-Status | 18 vitest-Tests | `cd apps/web && npm test` | Ja, mit einem kleinen vitest-Ersatz unter Node | 18 von 18 bestanden |
| Website: Weiterleitungs-Schutz, Fehlercodes | 7 vitest-Tests | `npm test` | Ja, wie oben | 7 von 7 bestanden |
| Website: Validierung (Zod) | 7 vitest-Tests | `npm test` | Nein (Zod nicht installierbar) | offen |
| Website: Mod-Endpunkt (Token, Limits, unbestätigt, kein Zugriff auf Abos) | 9 vitest-Tests | `npm test` | Nein (Next/Zod nicht installierbar) | offen |
| Datenbank: Rechte, RLS, Geschäftsregeln (pgTAP) | rund 80 Prüfungen in 2 Dateien | `cd apps/web && supabase test db` | **Nein** (kein PostgreSQL) | offen |
| Statisch: Syntax aller 60 TS/TSX-Dateien | – | – | Ja | 0 Fehler |
| Statisch: eigene Typen gegen Platzhalter für externe Pakete | – | – | Ja | 1 echter Typfehler gefunden und behoben |
| Statisch: SQL gegen App-Code (Tabellen, Spalten, Funktionen, Parameter, Grants) | – | – | Ja | keine Inkonsistenzen |
| Secret-Skript `scripts/check-no-secrets.sh` (sauberer Stand und absichtlicher Leak) | – | `sh scripts/check-no-secrets.sh` | Ja | erkennt Leaks, bleibt bei lokaler `.env.local` still |
| Git-Hygiene (`.env*`, `node_modules`, Build-Ordner nicht im Index) | – | – | Ja, in einer Kopie | nur `.env.example` wird versioniert |
| `npm install`, `next build`, `gradle build` | – | siehe CI | **Nein** | offen |

Die CI (`.github/workflows/ci.yml`) führt alles Offene aus: Website-Tests und Produktionsbuild, den Browser-Bundle-Check, die pgTAP-Tests gegen eine lokale Supabase-Instanz und den Mod-Build.

## Deine geforderten Tests

| # | Anforderung | Wo getestet | Hier ausgeführt? |
|---|---|---|---|
| 1 | Nutzer können keine fremden Profile bearbeiten | pgTAP `01_security`: „fremdes Profil: 0 Zeilen“ | nein |
| 2 | Pro Streamer nur eine aktive Rezension je Nutzer | pgTAP `02_business_rules`: zweite Rezension scheitert (23505), Bearbeiten vervielfältigt nicht | nein |
| 3 | Streamer ohne Rezensionen erhalten keine künstliche 10/10 | pgTAP: Punktzahl und Rang sind `null`; vitest `ranking.test.ts`: kein Score ohne Rezensionen | vitest ja, pgTAP nein |
| 4 | Nach 3 kostenlosen Events keine Veröffentlichung ohne Premium | pgTAP: 4. Event wirft `quota_exhausted`; Löschen setzt den Zähler nicht zurück | nein |
| 5 | Abgelaufene Abonnements werden serverseitig berücksichtigt | pgTAP: abgelaufenes Abo, Veröffentlichung wieder gesperrt | nein |
| 6 | Doppelte Zahlungen führen nicht zu doppelten Verlängerungen | pgTAP: zweite Bestätigung wirft `already_decided`, genau ein Abo; offener Antrag je Nutzer/Plan UNIQUE; Verlängerung schließt an (14 + 14 Tage) | nein |
| 7 | Unbestätigte Minecraft-Meldungen schalten Premium nicht frei | pgTAP: Hinweis bleibt `unconfirmed`, kein Abo; vitest `payment-events-route`: nur zwei Tabellen und nur `check_rate_limit` werden berührt | nein |
| 8 | Normale Nutzer können sich nicht selbst verifizieren | pgTAP: `is_verified` nicht schreibbar, `decide_verification` gesperrt, Antrag verifiziert nie | nein |
| 9 | Normale Nutzer können keine Adminrechte erhalten | pgTAP: `role` nicht schreibbar, `set_user_role` gesperrt (auch für Moderatoren und für die eigene Rolle) | nein |
| 10 | Chat: Berechtigungs- und Rate-Limit-Prüfungen | pgTAP: fremde Absender gesperrt, Stummschaltung wirkt, 6. Nachricht in 10 s, Duplikate, Länge | nein |
| 11 | Secret Keys gelangen nicht ins Frontend | CI: Canary-Secret + Variablenname dürfen nicht in `.next/static` stehen; `import 'server-only'`; `check-no-secrets.sh` | Skript ja, Build-Check nein |
| 12 | Die Mod kann ihre Chatparser-Tests ausführen | JUnit (`./gradlew test`) | ja (mit Shim) |
| 13 | Die Mod lässt sich mit der dokumentierten Version kompilieren | CI-Job `mod` (`gradle build`, Minecraft 1.21.11) | **nein** |

## Alles selbst ausführen

```bash
# Website
cd apps/web && npm install && npm test && npm run build

# Datenbank (Docker nötig; startet eine lokale Supabase-Instanz)
cd apps/web && npx supabase init && npx supabase start && npx supabase test db

# Mod
cd minecraft-mod && gradle wrapper --gradle-version 9.3.0 && ./gradlew build

# Geheimnisse
sh scripts/check-no-secrets.sh
```

## Hinweis zu den Ersatzprogrammen

Der JUnit- und der vitest-Ersatz in der Entstehungsumgebung sind winzige Läufer, die dieselben Testdateien aufrufen. Sie ersetzen nicht die echten Werkzeuge: Echtes JUnit/vitest kann sich in Randfällen anders verhalten (zum Beispiel bei Matcher-Details). Die Ergebnisse oben sind deshalb ein belastbarer Hinweis, aber kein Ersatz für den CI-Lauf.
