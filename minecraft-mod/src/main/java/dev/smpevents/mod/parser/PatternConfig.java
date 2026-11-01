package dev.smpevents.mod.parser;

/**
 * Ein konfigurierbares Erkennungsmuster. Das Regex nutzt benannte Gruppen (alle optional):
 * {@code sender}, {@code recipient}, {@code amount}, {@code currency}.
 * Öffentliche Felder, damit Gson die Datei ohne Zusatzcode lesen und schreiben kann.
 */
public final class PatternConfig {
    public String id = "";
    public boolean enabled = false;
    public String regex = "";
    /** Optional: feste Währung, falls die Nachricht keine nennt. */
    public String currency = null;

    public PatternConfig() {
    }

    public PatternConfig(String id, boolean enabled, String regex, String currency) {
        this.id = id;
        this.enabled = enabled;
        this.regex = regex;
        this.currency = currency;
    }
}
