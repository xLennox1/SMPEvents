# Zahlungsprozess und Vertrauensmodell

Du bist kein WindSMP-Serveradministrator. Es gibt deshalb keine offizielle Zahlungs-API, und SMPEvents kann Transaktionen nicht selbst bestätigen. Der Ablauf ist daher manuell und fälschungssicher gestaltet.

## Ablauf

1. Nutzer öffnet **Premium**, sieht Preis (Streamer: 500.000 WindSMP-Coins für 14 Tage) und Zahlungsanleitung.
2. Der Nutzer zahlt **im Spiel** an den konfigurierten Empfänger (`app_settings.payment_recipient`, ohne Wert ist das Formular gesperrt).
3. Er reicht einen Zahlungsnachweis ein (Minecraft-Name, Betrag, Notiz). Pro Nutzer und Plan ist nur ein offener Antrag möglich.
4. Ein Administrator prüft die Zahlung **im Spiel** und bestätigt mit dem tatsächlich gesehenen Betrag. Liegt der unter dem Preis, lehnt die Datenbank ab.
5. `approve_payment_submission` legt die Laufzeit an (Verlängerung beginnt nach dem aktuellen Ablauf), setzt den Antrag auf „bestätigt“ und schreibt einen Audit-Eintrag. Eine bestätigte Zahlung kann nur einmal Premium auslösen (UNIQUE auf `payment_submission_id`, Zeilensperre).
6. Läuft Premium ab, kann der Streamer keine neuen Events veröffentlichen. Bestehende Events bleiben bis zu ihrem Ende sichtbar.

## Wem wird wie weit vertraut?

| Quelle | Vertrauen | Aktiviert Premium? |
|---|---|---|
| Administrator bestätigt nach Prüfung im Spiel | ja | **ja**, als einziger Weg |
| Angaben im Formular | gering | nein, nur ein Antrag |
| Meldung der Minecraft-Mod | gering (Client kann manipuliert sein) | **nie**, nur Anhaltspunkt für den Admin |
| Screenshot oder Chatnachricht | gering (fälschbar) | nein |

## Mod-Meldungen

Die Mod sendet an `POST /api/integrations/minecraft/payment-events` mit einem **persönlichen Token** (Profil, Abschnitt „Minecraft-Mod“). Der Server speichert nur dessen SHA-256-Hash. Jede Meldung bleibt `unconfirmed`. Im Admin-Bereich erscheinen passende Hinweise (gleicher Absendername) neben dem Antrag. Das ist eine Lesehilfe, keine Bestätigung.

Ein Token in einer Client-Mod kann gestohlen oder missbraucht werden, und der Besitzer kann beliebige Texte senden. Deshalb steht kein Geheimnis in der `.jar`, und deshalb löst eine Meldung nie etwas aus.

| Angriff | Gegenmaßnahme |
|---|---|
| Gefälschte Hinweise | bleiben `unconfirmed`; Admin prüft im Spiel |
| Flut von Requests | Limit pro IP (120/min) und Token (30/min), Body max. 4 KB |
| Doppelte Meldungen | Dedupe-Schlüssel je Token und Minute (UNIQUE) |
| Token-Diebstahl | Widerruf im Profil; maximal 3 aktive Tokens; 256-Bit-Zufall |
| Doppelbuchung | ein offener Antrag je Nutzer/Plan, UNIQUE, Zeilensperre |
| Manipulierte Zeitstempel | nur plausible Zeiten (nicht in der Zukunft, höchstens 7 Tage alt) |

## Automatische Bestätigung später?

Nur mit einer vertrauenswürdigen, autorisierten Quelle, zum Beispiel einem Server-Plugin oder Webhook, den ein WindSMP-Administrator selbst betreibt und signiert. Als normaler Spieler hast du diese Quelle nicht. Der Endpunkt und die Tabelle sind so gebaut, dass eine solche Quelle später als eigener, getrennter Weg ergänzt werden kann, ohne die Mod zu vertrauen.

## Anleitung für Admins: Zahlung manuell prüfen

1. Öffne **Admin → Zahlungen**. Jeder offene Antrag zeigt Nutzer, Plan, Minecraft-Namen des Absenders und den angegebenen Betrag.
2. **Prüfe im Spiel**, dass die Zahlung wirklich eingegangen ist: richtiger Absender, richtiger Betrag, passender Zeitpunkt (Transaktionsverlauf des Servers oder deine Chat-Historie auf dem Empfängerkonto).
3. Gelb markierte Zeilen sind **unbestätigte Hinweise der Mod** mit gleichem Absendernamen. Sie sparen Suchzeit, beweisen aber nichts: Ein Token-Besitzer kann beliebige Texte senden.
4. Trage im Feld „Im Spiel bestätigter Betrag“ den Betrag ein, den **du selbst gesehen hast**, und klicke „Bestätigen und Premium aktivieren“. Liegt er unter dem Preis, lehnt die Datenbank ab. Premium startet sofort oder schließt an die laufende Laufzeit an.
5. Passt etwas nicht, klicke „Ablehnen“ und schreibe einen kurzen Grund. Der Nutzer sieht ihn im Verlauf.
6. Kontrolle: Im Tab **Premium** erscheint die Laufzeit, im Tab **Protokoll** der Eintrag mit deinem Namen.
7. Rückbuchung oder Betrug später: Tab **Premium → Premium beenden** mit Grund. Laufende und vorgemerkte Laufzeiten enden sofort.

Bestätige nie allein auf Basis eines Screenshots oder einer Chatnachricht. Der Zahlungsempfänger (`app_settings.payment_recipient`) ist bewusst nicht vorbelegt: Setze ihn selbst, siehe README.
