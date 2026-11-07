# SMPEvents

Event-Plattform für den Minecraft-Server **WindSMP**: Giveaways, Lootdrops und Lootbox-Events entdecken, Streamer mit 1–5 Sternen bewerten (Ranking 2,0–10,0), verifizierte Streamer mit blauem Haken und **Creator-Codes**, Punkte für Rezensionen und ein **Shop**, Echtzeit-Chat **SMPEvents Chatall**, Premium mit **automatischer Freigabe** und ein Admin-Dashboard. Dazu eine **Fabric-Mod für Minecraft 1.21.11**.

## Status

Aufgebaut auf deiner funktionierenden Version (Schriften entfernt, typisiertes `setAll`, `package-lock.json`). Eine Zeile in deiner `middleware.ts` fehlte (`response = NextResponse.next({ request })`) und ist wieder drin, sonst sieht die Seite nach einem Token-Refresh noch die alten Cookies. Tests, `vitest.config.ts` und `vercel.json` sind wieder dabei; der Next-Build prüft die Tests nicht mehr mit (`tsconfig.json` schließt sie aus).

Die Umgebung hier hatte **kein Netzwerk und kein PostgreSQL**. Gebaut, deployt oder gepusht wurde nichts. Die ehrliche Bilanz, Details in `docs/TESTS.md`:

| Bereich | Stand | Wie geprüft |
|---|---|---|
| Datenbank: 6 Migrationen (26 Tabellen, RLS, spaltengenaue Rechte, Admin-/Moderations-/Shop-RPCs, automatische Zahlungsfreigabe) | geschrieben | Statisch gegen den App-Code abgeglichen. **Nicht gegen echtes PostgreSQL ausgeführt.** |
| Datenbank-Tests (pgTAP, rund 150 Prüfungen) | geschrieben | **Nicht ausgeführt.** Lauf: `supabase test db`, in der CI vorbereitet. |
| Website (Next.js, 19 Seiten, Server Actions, Mod-Endpunkt) | geschrieben | Syntax aller 71 TS/TSX-Dateien und eigene Typen gegen Platzhalter geprüft. Die neuen Teile hast du noch nicht gebaut: `npm run build` ist der echte Test. |
| Website-Tests | 25 ausgeführt, 19 offen | Ranking, Zeitzonen, Hilfsfunktionen bestanden (vitest-Ersatz). Validierung und Mod-Endpunkt brauchen Zod/Next. |
| Mod: Parser, Uploader, Konfiguration, Empfänger-Modus | fertig | 37 Tests bestanden (lokaler Test-Server, JUnit-Ersatz, Stubs für Gson/SLF4J) |
| Mod: Fabric-Einstieg und Gradle-Build (1.21.11) | geschrieben | Koordinaten mit Fabrics Doku und Maven abgeglichen. **Nicht gebaut, keine `.jar` vorhanden.** |
| GitHub-Push, Vercel-Deployment | vorbereitet | **Nicht ausgeführt.** Schritte in `docs/DEPLOYMENT.md`. |

### Funktionsumfang

- **Plattform:** Startseite mit Twitch-Banner, Events (Suche, Filter, Favoriten, Erinnerungen), Kalender, Streamer-Profile mit Rezensionen und Verifizierung, Ranking, Chatall, Profil mit Avatar, Community-Regeln, Datenschutz, Impressum.
- **Premium automatisch:** Spieler verknüpfen ihr Minecraft-Konto per Flüster-Code und kündigen die Zahlung an. Die Mod auf deinem **Empfänger-Konto** meldet die eingehende Zahlung, und die Datenbank schaltet Premium frei. Nur dieses Admin-Token löst aus. Rückfall: manuelle Freigabe. Details und Begründung: `docs/PAYMENTS.md`.
- **Punkte, Creator-Codes, Shop:** Punkte für Rezensionen, verifizierte Streamer erstellen Creator-Codes und bekommen Bonuspunkte auf Käufe ihrer Unterstützer, Items werden von Hand geliefert. Discord-Server und Webhook trägst du selbst ein. Details: `docs/REWARDS.md`.
- **Admin:** Nutzer, Streamer, Verifizierung, Zahlungen, Premium, Shop, Events, Rezensionen, Chat, Meldungen, Mod-Hinweise, Audit-Log (Rollen `user`, `moderator`, `admin`).
- **Registrierung:** leitet nach dem Erstellen auf die Anmeldung weiter und zeigt keinen Fehler mehr, wenn das Konto angelegt wurde.

### Bewusst noch offen

- Einstellungen (Zahlungsempfänger, Spieler-Premium-Preis, Punktewerte) werden per SQL gesetzt, nicht im Admin-UI. Es sind keine Shop-Artikel vorinstalliert.
- Das Chat-Format deines Servers ist unbekannt: Die Mod-Muster sind Beispiele und müssen aus echten Zeilen gebaut werden.
- Zahlungsnachweis als Screenshot und Konto selbst löschen (derzeit auf Anfrage) fehlen.
- Content-Security-Policy, ESLint, End-to-End-Tests, generierte Supabase-Typen.
- Rechtstexte: Impressum und Datenschutz sind vorhanden, die Betreiberangaben kommen aus deiner Umgebung und müssen rechtlich geprüft werden.

## Struktur

```
apps/web/                  Next.js 15 (App Router, TypeScript, Tailwind v4, Zod)
  supabase/migrations/     0001 Schema · 0002 Funktionen · 0003 Rechte/RLS · 0004 Admin · 0005 Auto-Zahlung · 0006 Punkte/Shop
  supabase/tests/database/ pgTAP-Tests
  src/                     Seiten, Server Actions, Komponenten, lib/
  tests/                   vitest
minecraft-mod/             Fabric-Mod (Java 21, Gradle, Minecraft 1.21.11)
docs/                      RANKING · PAYMENTS · REWARDS · DEPLOYMENT · TESTS
scripts/                   check-no-secrets.sh
.github/workflows/         ci.yml · release-mod.yml (nur manuell)
```

## Schnellstart

1. **Supabase-Projekt** anlegen und `0001` bis `0006` aus `apps/web/supabase/migrations/` der Reihe nach im SQL-Editor ausführen (oder `supabase db push`).
2. **Konfiguration:** `.env.example` nach `apps/web/.env.local` kopieren und ausfüllen.
3. **Starten:** `cd apps/web && npm ci && npm run dev`.
4. **Ersten Admin festlegen** (nach der Registrierung):
   ```sql
   update public.profiles set role = 'admin' where lower(username) = lower('DEIN_BENUTZERNAME');
   ```
5. **Zahlungsempfänger festlegen** (der Minecraft-Name deines Empfänger-Kontos; ohne ihn ist das Zahlungsformular gesperrt):
   ```sql
   update public.app_settings set value = to_jsonb('INGAME_NAME'::text) where key = 'payment_recipient';
   ```
6. **Spieler-Premium** (Preis und Laufzeit waren nicht festgelegt):
   ```sql
   insert into public.app_settings (key, value) values ('player_premium_price_coins', '123456'), ('player_premium_days', '14')
   on conflict (key) do update set value = excluded.value;
   ```
7. **Automatische Freigabe einrichten:** Mod auf dem Empfänger-Konto mit Empfänger-Token, `selfName` und Mustern (`minecraft-mod/README.md`), danach `docs/DEPLOYMENT.md`, Abschnitt 5b.
8. **Shop füllen:** *Admin → Shop → Neuer Artikel*. Optional Discord eintragen (`docs/REWARDS.md`).

GitHub, Vercel, Twitch, Discord, Erinnerungen: `docs/DEPLOYMENT.md`.

## Sicherheitsprinzipien

- **Rechte liegen in der Datenbank:** RLS auf jeder Tabelle, spaltengenaue Rechte. Rolle, Verifizierung, Kontingent, Moderation, Zahlungsstatus und Punkte sind für Clients nie schreibbar; Rollen ändert nur ein Admin und nie die eigene.
- **Premium nur über zwei Wege:** Admin bestätigt von Hand, oder das **Admin-Token auf dem Empfänger-Konto** meldet die Zahlung zu einem Antrag mit per Flüster-Code **verifiziertem** Minecraft-Namen. Meldungen normaler Spieler schalten nie etwas frei.
- **Kostenloses Kontingent (3 Events):** Trigger bei jedem Insert; der Zähler sinkt nie.
- **Punkte und Shop:** Ledger nur durch den Server, Belohnung einmal je Streamer mit Tageslimit, Käufe pro Nutzer serialisiert, Storno erstattet und entzieht den Creator-Bonus.
- **Secrets** nur serverseitig (`server-only`); die CI prüft Browser-Bundle und Repository (inkl. Discord-Webhook).
