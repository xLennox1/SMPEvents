# SMPEvents

Event-Plattform für den Minecraft-Server **WindSMP**: Giveaways, Lootdrops und Lootbox-Events entdecken, Streamer mit 1–5 Sternen bewerten (Ranking 2,0–10,0), verifizierte Streamer mit blauem Haken, Echtzeit-Chat **SMPEvents Chatall**, Premium und ein Admin-Dashboard. Dazu eine optionale **Fabric-Client-Mod für Minecraft 1.21.11**, die Zahlungs-Chatnachrichten als *unbestätigte Hinweise* meldet.

## Status

Dieser Stand wurde in einer Umgebung **ohne Netzwerk und ohne PostgreSQL** geschrieben. Es wurde nichts installiert, gebaut, deployt oder zu GitHub gepusht. Die ehrliche Bilanz, Details in `docs/TESTS.md`:

| Bereich | Stand | Wie geprüft |
|---|---|---|
| Datenbank: 4 Migrationen (19 Tabellen, RLS, spaltengenaue Rechte, Admin-/Moderations-RPCs, Ranking-View) | geschrieben | Statisch gegen den App-Code abgeglichen. **Nicht gegen echtes PostgreSQL ausgeführt.** |
| Datenbank-Tests (pgTAP, rund 80 Prüfungen) | geschrieben | **Nicht ausgeführt** (kein PostgreSQL). Lauf: `supabase test db`, in der CI vorbereitet. |
| Website (Next.js, 17 Seiten, Server Actions, Mod-Endpunkt) | geschrieben | Syntax aller 60 TS/TSX-Dateien geprüft, eigene Typen gegen Platzhalter geprüft (1 echter Fehler gefunden und behoben). **`npm install`, `next build` und die volle Typprüfung wurden nicht ausgeführt.** |
| Website-Tests | 25 ausgeführt, 16 offen | Ranking, Zeitzonen und Hilfsfunktionen bestanden (mit vitest-Ersatz). Validierung und Mod-Endpunkt brauchen Zod/Next. |
| Mod: Parser, Uploader, Konfiguration | fertig | 32 Tests bestanden (lokaler Test-Server, JUnit-Ersatz, Stubs für Gson/SLF4J) |
| Mod: Fabric-Einstieg und Gradle-Build (Minecraft 1.21.11) | geschrieben | Koordinaten mit Fabrics Doku und Maven abgeglichen. **Nicht gebaut, keine `.jar` vorhanden.** |
| GitHub-Push, Vercel-Deployment | vorbereitet | **Nicht ausgeführt**, keine Verbindung vorhanden. Schritte in `docs/DEPLOYMENT.md`. |

**Erster Schritt bei dir:** `cd apps/web && npm install && npm test && npm run build` und `cd minecraft-mod && gradle wrapper --gradle-version 9.3.0 && ./gradlew build`. Die npm-Versionen stammen aus meinem Wissensstand und konnten nicht gegen npm geprüft werden; Fehlermeldungen dazu sind erwartbar und schnell behoben.

### Funktionsumfang

Startseite mit Twitch-Banner, Events (Suche, Filter, Details, Favoriten, Erinnerungen), Event-Kalender, Streamer-Profile mit Rezensionen und Verifizierungsantrag, Ranking, Chatall in Echtzeit, Premium mit manueller Zahlungsprüfung, Profil mit Avatar und Mod-Token, Login/Registrierung, Community-Regeln, Datenschutz und Impressum. Admin-Bereich mit Nutzer-, Streamer-, Premium-, Verifizierungs-, Zahlungs-, Event-, Rezensions-, Chat- und Meldungsverwaltung, Mod-Hinweisen und Audit-Log (Rollen `user`, `moderator`, `admin`).

### Bewusst noch offen

- Einstellungen (Zahlungsempfänger, Spieler-Premium-Preis) werden per SQL gesetzt, nicht im Admin-UI.
- Zahlungsnachweis als Screenshot: Bucket und Policies existieren, das Upload-Formular noch nicht.
- Konto selbst löschen: derzeit nur auf Anfrage beim Betreiber.
- Erinnerungen: `dispatch_due_reminders()` existiert; der pg_cron-Zeitplan muss einmal eingerichtet werden.
- Content-Security-Policy, ESLint, End-to-End-Tests, generierte Supabase-Typen.
- Rechtstexte: Impressum und Datenschutz sind vorhanden, die Betreiberangaben kommen aus deiner Umgebung und müssen rechtlich geprüft werden.

## Struktur

```
apps/web/                  Next.js 15 (App Router, TypeScript, Tailwind v4, Zod)
  supabase/migrations/     0001 Schema · 0002 Funktionen/Trigger/Views · 0003 Rechte, RLS, Storage · 0004 Admin-Verwaltung
  supabase/tests/database/ pgTAP-Tests (Rechte, RLS, Geschäftsregeln)
  src/                     Seiten, Server Actions, Komponenten, lib/
  tests/                   vitest (Ranking, Zeitzonen, Validierung, Mod-Endpunkt, Hilfsfunktionen)
minecraft-mod/             Fabric-Client-Mod (Java 21, Gradle, Minecraft 1.21.11) – siehe minecraft-mod/README.md
docs/                      RANKING.md · PAYMENTS.md · DEPLOYMENT.md · TESTS.md
scripts/                   check-no-secrets.sh
.github/workflows/         ci.yml (Secrets, Website, Datenbank, Mod) · release-mod.yml (nur manuell)
.env.example               alle Variablen, ohne Werte
```

## Schnellstart

1. **Supabase-Projekt** anlegen. Die vier Dateien aus `apps/web/supabase/migrations/` der Reihe nach im SQL-Editor ausführen (oder `cd apps/web && npx supabase init && npx supabase link --project-ref <ref> && npx supabase db push`).
2. **Konfiguration:** `.env.example` nach `apps/web/.env.local` kopieren und ausfüllen (URL, Publishable Key, Secret Key, Discord-Ticket-Link, Betreiberangaben, optional Twitch-API).
3. **Starten:** `cd apps/web && npm install && npm run dev`, dann `http://localhost:3000`.
4. **Ersten Admin festlegen** (nach der Registrierung, im SQL-Editor):
   ```sql
   update public.profiles set role = 'admin' where lower(username) = lower('DEIN_BENUTZERNAME');
   ```
   Weitere Moderatoren und Admins vergibst du danach im Admin-Bereich unter *Nutzer*.
5. **Zahlungsempfänger festlegen** (bewusst leer ausgeliefert; ohne ihn ist das Zahlungsformular gesperrt):
   ```sql
   update public.app_settings set value = to_jsonb('INGAME_NAME'::text) where key = 'payment_recipient';
   ```
6. **Spieler-Premium aktivieren** (Preis und Laufzeit waren nicht festgelegt, deshalb nicht voreingestellt):
   ```sql
   insert into public.app_settings (key, value) values ('player_premium_price_coins', '123456'), ('player_premium_days', '14')
   on conflict (key) do update set value = excluded.value;
   ```
   (Zahlen durch deine Werte ersetzen.)

GitHub, Vercel, Twitch-API, Discord, Erinnerungen und Auth-Einstellungen: `docs/DEPLOYMENT.md`. Zahlung prüfen (Anleitung für Admins): `docs/PAYMENTS.md`. Mod bauen und einrichten: `minecraft-mod/README.md`.

## Sicherheitsprinzipien

- **Rechte liegen in der Datenbank**, nicht nur in der Oberfläche: RLS auf jeder Tabelle, Clients bekommen nur spaltengenaue Rechte. Rolle, Verifizierung, Kontingent, Moderation und Zahlungsstatus sind für Clients nie schreibbar; Rollen ändert nur ein Admin und nie die eigene.
- **Kostenloses Kontingent (3 Events):** Ein Trigger prüft bei jedem Insert Kontingent und Premium. Der Zähler sinkt nie, auch nicht beim Löschen von Events.
- **Premium wird nur von einem Administrator aktiviert** (`approve_payment_submission`, idempotent, mit Zeilensperre und UNIQUE-Schutz gegen Doppelbuchung). Weder Formular noch Mod-Meldungen können das auslösen.
- **Mod-Endpunkt:** persönliches Token (nur SHA-256-Hash gespeichert), Rate-Limits pro IP und Token, Größenlimit, Zod-Validierung, Deduplizierung. Alles landet als `unconfirmed`.
- **Secret Key** nur serverseitig (`import 'server-only'`), nie im Browser, nie im Repo. Die CI prüft das Browser-Bundle und das Repository auf Geheimnisse.
- Verifizierung: Ein Discord-Ticket allein verifiziert nie. Ein Administrator entscheidet; ein Kanalwechsel entzieht den Haken automatisch.

Vertrauensmodell der Mod: `docs/PAYMENTS.md`. Berechnung des Rankings: `docs/RANKING.md`. Testmatrix: `docs/TESTS.md`.
