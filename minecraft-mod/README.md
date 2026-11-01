# SMPEvents-Mod (Fabric, nur Client)

Erkennt konfigurierte Zahlungs-Chatnachrichten und meldet sie als **unbestätigte Hinweise** an deine SMPEvents-Website. Sie aktiviert nie Premium: Jede Zahlung prüft ein Administrator (siehe `docs/PAYMENTS.md`).

## Was die Mod tut und nie tut

Sie liest nur Chat- und Systemnachrichten, die dein Client ohnehin anzeigt, wendet deine Regex-Muster darauf an und sendet Treffer per HTTPS.

Sie liest **nie** Passwörter oder Session-Tokens, extrahiert keine Zugangsdaten, sendet und manipuliert keine Spielpakete, umgeht keine Server-Prüfungen und enthält **kein Geheimnis** in der `.jar`. Das persönliche Token steht nur in deiner lokalen Konfigurationsdatei.

## Versionen

Ziel ist **Minecraft 1.21.11** (deine WindSMP-Version). Die Koordinaten in `gradle.properties` stammen aus der Fabric-Dokumentation, Fabrics Maven und einem lauffähigen 1.21.11-Projekt:

| Komponente | Wert |
|---|---|
| Minecraft | 1.21.11 |
| Fabric Loader | 0.18.4 |
| Fabric API | 0.141.3+1.21.11 |
| Yarn-Mappings | 1.21.11+build.4 |
| Loom | 1.15-SNAPSHOT, Plugin-ID `net.fabricmc.fabric-loom-remap` |
| Java / Gradle | 21 / 9.3.0 |

**Nicht geprüft:** ein echter Build (die Entstehungsumgebung hatte kein Netzwerk). Aktuelle Empfehlungen stehen auf <https://fabricmc.net/develop>. Der Chat-Einstieg nutzt `ClientReceiveMessageEvents.GAME` und `.CHAT`; die Signatur (5 Parameter bei `CHAT`) ist für Fabric API bis 0.110.5 dokumentiert, die Javadoc für 0.141.x konnte ich nicht abrufen. Ein Compilerfehler an genau dieser Stelle wäre der erste Hinweis auf eine geänderte Signatur. `fabric.mod.json` verlangt genau Minecraft 1.21.11; für andere Versionen die Werte anpassen. Ab Minecraft 26.1 ist der Aufbau anders (Plugin `net.fabricmc.fabric-loom`, keine Mappings).

## Bauen

```bash
cd minecraft-mod
gradle wrapper --gradle-version 9.3.0   # einmalig, erzeugt ./gradlew (danach committen)
./gradlew build
```

Ergebnis: `minecraft-mod/build/libs/smpevents-mod-0.1.0.jar` (die Datei mit `-sources` nicht verwenden). Tests: `./gradlew test`. Der Build wurde in der Entstehungsumgebung nicht ausgeführt (kein Netzwerk); die Tests dort liefen über einen kleinen JUnit-Ersatz.

## Installieren

Fabric Loader und Fabric API für deine Minecraft-Version installieren, die `.jar` in den `mods`-Ordner legen, Spiel starten. Es entsteht `config/smpevents.json` mit **ausgeschalteter** Übermittlung.

## Einrichten

1. Auf der Website: *Profil → Minecraft-Mod → Neues Token erstellen*. Das Token wird nur einmal angezeigt.
2. In `config/smpevents.json` eintragen:
   ```json
   "backendUrl": "https://DEINE-DOMAIN/api/integrations/minecraft/payment-events",
   "apiToken": "smpe_...",
   "enabled": true
   ```
   `http://` ist nur für `localhost` erlaubt und nur mit `"allowInsecureLocalhost": true`.
3. **Muster aus echten Beispielen bauen.** Es gibt bewusst keine eingebauten WindSMP-Muster, weil die echten Formate unbekannt sind:
   - `"localSampleLogging": true` setzen. Chatzeilen mit einem der `sampleKeywords` landen lokal in `config/smpevents-samples.log` (max. 1 MB).
   - Eine echte Zahlung durchführen und die passende Zeile suchen.
   - Ein Muster dafür schreiben, `"enabled": true` setzen, mit `"debugLogging": true` im Spiel-Log prüfen, ob es greift.

## Muster-Format

```json
{
  "id": "mein-muster",
  "enabled": true,
  "regex": "^(?<sender>\\S+) hat (?<recipient>\\S+) (?<amount>[\\d.,]+) (?<currency>\\w+) gesendet\\.?$",
  "currency": null
}
```

- Java-Regex mit den benannten Gruppen `sender`, `recipient`, `amount`, `currency` (alle optional). Das erste passende Muster gewinnt.
- Minecraft-Formatierungscodes (`§a` usw.) werden vorher entfernt.
- Namen müssen 3–16 Zeichen aus `A-Za-z0-9_` sein, sonst gelten sie als **unbekannt**.
- Beträge: `500000`, `500.000`, `1,234,567`, `1,5k`, `2M`. Mehrdeutiges wie `1,5` oder `1.234,567` gilt als **unbekannt**. „Punkt oder Komma plus genau drei Ziffern“ zählt als Tausendertrenner.
- Unbekannte Felder werden nie geraten und fehlen im Upload. Ein Treffer ohne Absender, Empfänger und Betrag wird verworfen.

## Verhalten und Fehlertoleranz

- Der Client-Thread reiht Nachrichten nur ein. Parsen und HTTP laufen auf einem eigenen Daemon-Thread mit begrenzter Warteschlange (256, die älteste wird verworfen).
- Jedes Muster hat ein Zeitbudget von 50 ms; ein Muster mit katastrophalem Backtracking wird abgebrochen statt das Spiel einzufrieren.
- HTTP: Verbindungs- und Anfrage-Timeout, begrenzte Wiederholungen mit Wartezeit bei 429/5xx und Netzwerkfehlern, keine Wiederholung bei 4xx, Weiterleitungen werden nicht verfolgt (das Token geht nur an die konfigurierte Adresse).
- Ist das Backend nicht erreichbar, bleibt das Spiel unbeeinflusst.
- Dieselbe Zeile wird innerhalb von 5 Sekunden nur einmal gemeldet.

## Datenschutz und Serverregeln

Prüfe die Regeln von WindSMP, ob Client-Mods erlaubt sind. Mit `localSampleLogging` können Chatzeilen anderer Spieler in einer lokalen Datei landen: Nutze das nur regelkonform, mit Einverständnis der Beteiligten, und gib die Datei nicht weiter. Schalte es nach dem Mustern-Bauen wieder aus. Ein gestohlenes Token kannst du jederzeit im Profil widerrufen.

## Tests (32)

Parser (Muster, Beträge, Formatierungscodes, Regex-Zeitbudget), JSON-Aufbau, Uploader gegen einen lokalen Test-Server (Bearer-Token, Wiederholungen, keine Weiterleitungen), Chat-Handler (Dedupe, nie blockierend) und Konfiguration (nur https, Token-Format, Beispiele deaktiviert).
