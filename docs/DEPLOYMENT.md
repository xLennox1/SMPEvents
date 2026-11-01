# Deployment: GitHub, Supabase, Vercel, Twitch, Discord

Nichts davon wurde in der Entstehungsumgebung ausgeführt (kein Netzwerk, keine verbundenen GitHub-, Vercel- oder Supabase-Konten). Es wurde nichts gepusht und nichts deployt. Das sind die Schritte für dich, in sinnvoller Reihenfolge.

## 1. GitHub

Das Repository ist lokal vorbereitet (`.gitignore`, `.env.example`, CI). Es wurde bewusst **nicht committet**, damit der Verlauf deinen Namen trägt.

```bash
cd smpevents
git init -b main
git add . && git status          # prüfen: keine .env.local, keine node_modules
sh scripts/check-no-secrets.sh   # muss "OK" melden
git commit -m "SMPEvents Phase 1"
# Repository "smpevents" auf GitHub anlegen (leer, ohne README), dann deine echte URL einsetzen:
git remote add origin <DEINE-REPOSITORY-URL>
git push -u origin main
```

Nach dem Push prüfst du auf GitHub unter *Actions*, ob die CI grün ist. Nach dem ersten `npm install` die `package-lock.json` committen und in `.github/workflows/ci.yml` auf `npm ci` und `cache: npm` umstellen. Empfehlung: Branch-Schutz für `main` (Pull Request und grüne CI vor dem Merge).

## 2. Supabase

1. Projekt anlegen, Region nahe an deinen Nutzern.
2. SQL-Editor: `0001_schema.sql`, `0002_functions.sql`, `0003_security.sql`, `0004_admin_management.sql` **in dieser Reihenfolge** ausführen (oder `supabase db push`).
3. *Authentication → URL Configuration:* Site URL = Produktions-URL. Redirect URLs: `https://<domain>/auth/callback`, `http://localhost:3000/auth/callback` und für Previews `https://*.vercel.app/auth/callback`.
4. *Authentication → Providers → Email:* E-Mail-Bestätigung nach Wunsch.
5. *Project Settings → API:* Project URL, **Publishable Key**, **Secret Key** kopieren.
6. Erinnerungen (Erweiterung `pg_cron` aktivieren, dann einmal im SQL-Editor):
   ```sql
   select cron.schedule('smpevents-reminders', '* * * * *', $$ select public.dispatch_due_reminders() $$);
   ```
7. Admin, Zahlungsempfänger, Spieler-Premium: README, Schnellstart Schritt 4–6.

## 3. Vercel und GitHub verbinden

1. In Vercel *Add New → Project*, das GitHub-Repository `smpevents` importieren. **Root Directory: `apps/web`**, Framework Next.js.
2. **Production Branch: `main`.** Jeder Push auf `main` löst nach erfolgreicher Konfiguration ein Production-Deployment aus.
3. **Preview-Deployments:** Jeder Pull Request und jeder andere Branch bekommt automatisch eine Preview-URL. `apps/web/vercel.json` enthält einen `ignoreCommand`: Änderungen, die nur die Mod oder Dokumentation betreffen, lösen keinen Website-Build aus.
4. **Umgebungsvariablen** unter *Settings → Environment Variables*, getrennt für *Production* und *Preview*:

   | Variable | Hinweis |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | öffentlich |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | öffentlich |
   | `SUPABASE_SECRET_KEY` | **geheim**, niemals mit `NEXT_PUBLIC_` anlegen |
   | `NEXT_PUBLIC_SITE_URL` | Produktions-URL (für Preview optional) |
   | `NEXT_PUBLIC_TWITCH_CHANNEL` | `xLennox_Tv` |
   | `NEXT_PUBLIC_DISCORD_TICKET_URL` | Link zur Ticket-Seite, siehe Abschnitt 5 |
   | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | optional, für den Live-Status |
   | `NEXT_PUBLIC_OPERATOR_NAME`, `_ADDRESS`, `_EMAIL` | Betreiberangaben für Impressum und Datenschutz |

   Für Previews empfiehlt sich ein **eigenes Supabase-Projekt**, damit Tests keine Produktionsdaten berühren. Die Mod und Supabase werden nicht über Vercel gebaut: Supabase läuft als eigener Dienst, die Mod baut die GitHub-Action (`gradle build`) oder du lokal.
5. Der Twitch-Player ermittelt die `parent`-Domain im Browser und funktioniert deshalb auch auf Preview-URLs und eigener Domain.

## 4. Twitch Live-Status (optional)

Anwendung auf `dev.twitch.tv/console` registrieren, Client-ID und Secret in Vercel eintragen. Ohne beides zeigt der Banner „Live-Status nicht verfügbar“, und „Auf Twitch ansehen“ funktioniert trotzdem. Der Status wird 60 Sekunden gecacht.

## 5. Discord (Verifizierung)

Die Verifizierung läuft über ein Ticket auf eurem Discord; die Website verlinkt nur dorthin und legt zusätzlich einen Antrag an.

1. Richte einen Ticket-Kanal ein (ein Ticket-Bot deiner Wahl oder ein Forum-Kanal, in dem nur das Team alle Tickets sieht).
2. Setze `NEXT_PUBLIC_DISCORD_TICKET_URL` auf einen **dauerhaften Einladungslink** zum Server oder Kanal (Kanal-Links funktionieren nur für Mitglieder).
3. Ablauf für das Team: Antrag im Admin-Bereich öffnen, Ticket im Discord suchen (der Streamer trägt dort seinen Discord-Namen ein), Kanalinhaberschaft prüfen (zum Beispiel lässt du kurz einen von dir genannten Code im Twitch-Titel oder Profil anzeigen), dann im Admin-Bereich entscheiden.
4. Ein geöffnetes Ticket verifiziert **nie automatisch**. Nach einem Kanalwechsel entfällt der Haken automatisch.

## 6. CI und Releases (GitHub Actions)

| Workflow | Auslöser | Zweck |
|---|---|---|
| `ci.yml` | Push auf `main`, Pull Requests | Secret-Check, Website-Tests und Build mit Bundle-Check, pgTAP-Tests, Mod-Build, `.jar` als Artefakt |
| `release-mod.yml` | **nur manuell** mit Tag und Bestätigungswort `release` | erstellt ein GitHub Release mit der Mod-`.jar` |

Es wird **nie automatisch** ein Release erstellt. Die `.jar` findest du nach jedem CI-Lauf unter *Actions → Lauf → Artifacts → smpevents-mod*.

## 7. Nach dem Deployment prüfen

- Registrieren, anmelden, Streamer-Profil anlegen, Event veröffentlichen (das 4. Event ohne Premium muss abgelehnt werden).
- Zweiten Account bewerten lassen, Ranking ansehen.
- Chat in zwei Browsern testen (Realtime).
- Admin: Verifizierungsantrag und Zahlungsnachweis durchspielen, danach im Tab Protokoll nachsehen.
- Mod-Token erzeugen und den Endpunkt testen:
  ```bash
  curl -i -X POST https://<domain>/api/integrations/minecraft/payment-events \
    -H "Authorization: Bearer smpe_..." -H "Content-Type: application/json" \
    -d '{"rawMessage":"Test","senderName":"Steve_01","amount":500000}'
  ```
  Erwartet: `202` mit `"confirmed": false`.
- `/impressum` und `/datenschutz` zeigen deine Angaben (die Hinweisbox verschwindet, sobald die drei `NEXT_PUBLIC_OPERATOR_*`-Variablen gesetzt sind).

## Rechtliches

Impressum und Datenschutzinformationen sind als Seiten vorhanden und beschreiben die tatsächliche Verarbeitung der Anwendung. Die Betreiberangaben kommen aus deiner Umgebung, nichts davon ist erfunden oder vorbelegt. Lass die Texte vor dem Livegang rechtlich prüfen; sie sind keine Rechtsberatung.
