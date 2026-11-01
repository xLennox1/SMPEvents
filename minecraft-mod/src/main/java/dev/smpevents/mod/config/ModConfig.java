package dev.smpevents.mod.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.smpevents.mod.parser.PatternConfig;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.slf4j.Logger;

/**
 * Konfiguration in {@code <Minecraft>/config/smpevents.json}. Geheimnisse (das persönliche Token) liegen
 * NUR in dieser lokalen Datei, niemals im Quellcode oder in der .jar.
 */
public final class ModConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private static final Pattern TOKEN = Pattern.compile("smpe_[a-f0-9]{64}");

    /** Übermittlung an SMPEvents. Standard: AUS – erst nach bewusster Aktivierung. */
    public boolean enabled = false;
    /** z. B. https://deine-domain.example/api/integrations/minecraft/payment-events */
    public String backendUrl = "";
    /** Persönliches Mod-Token aus deinem SMPEvents-Profil (beginnt mit smpe_). */
    public String apiToken = "";
    /** Erlaubt http:// ausschließlich für localhost/127.0.0.1 (Entwicklung). */
    public boolean allowInsecureLocalhost = false;
    public boolean debugLogging = false;
    /** Schreibt Chatzeilen mit einem der sampleKeywords lokal nach config/smpevents-samples.log, um Muster zu bauen. */
    public boolean localSampleLogging = false;
    public List<String> sampleKeywords = new ArrayList<>(List.of("coins", "gesendet", "erhalten", "bezahlt", "überwiesen", "paid", "sent", "received"));
    public int connectTimeoutMs = 5000;
    public int requestTimeoutMs = 8000;
    public int maxRetries = 2;
    public int retryBackoffMs = 1000;
    public List<PatternConfig> patterns = defaultPatterns();

    /** Frei erfundene BEISPIELE, standardmäßig deaktiviert. Echte Formate müssen aus echten Chatzeilen gebaut werden. */
    static List<PatternConfig> defaultPatterns() {
        List<PatternConfig> list = new ArrayList<>();
        list.add(new PatternConfig("beispiel-gesendet", false,
                "^(?<sender>\\S+) hat (?<recipient>\\S+) (?<amount>[\\d.,]+) (?<currency>\\w+) gesendet\\.?$", null));
        list.add(new PatternConfig("beispiel-erhalten", false,
                "^Du hast (?<amount>[\\d.,]+) Coins von (?<sender>\\S+) erhalten\\.?$", "Coins"));
        return list;
    }

    public static ModConfig loadOrCreate(Path file, Logger log) {
        if (Files.notExists(file)) {
            ModConfig fresh = new ModConfig();
            fresh.save(file, log);
            log.info("[SMPEvents] Standard-Konfiguration geschrieben: {} (Übermittlung ist aus)", file);
            return fresh;
        }
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            ModConfig loaded = GSON.fromJson(reader, ModConfig.class);
            if (loaded == null) {
                throw new IOException("leere Datei");
            }
            return loaded.sanitized();
        } catch (IOException | RuntimeException e) {
            log.warn("[SMPEvents] Konfiguration {} nicht lesbar ({}). Übermittlung bleibt AUS, die Datei wird nicht überschrieben.",
                    file, e.getClass().getSimpleName());
            return new ModConfig();
        }
    }

    public void save(Path file, Logger log) {
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            try (Writer writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                GSON.toJson(this, writer);
            }
        } catch (IOException e) {
            log.warn("[SMPEvents] Konfiguration konnte nicht geschrieben werden: {}", e.getClass().getSimpleName());
        }
    }

    private ModConfig sanitized() {
        connectTimeoutMs = clamp(connectTimeoutMs, 500, 30_000);
        requestTimeoutMs = clamp(requestTimeoutMs, 1_000, 60_000);
        maxRetries = clamp(maxRetries, 0, 5);
        retryBackoffMs = clamp(retryBackoffMs, 10, 10_000);
        if (patterns == null) patterns = new ArrayList<>();
        if (sampleKeywords == null) sampleKeywords = new ArrayList<>();
        if (backendUrl == null) backendUrl = "";
        if (apiToken == null) apiToken = "";
        return this;
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    /** Gültiger Endpunkt oder {@code null}: nur https; http ausschließlich für localhost bei allowInsecureLocalhost. */
    public URI endpoint() {
        try {
            URI uri = URI.create(backendUrl.strip());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost();
            if (host == null || uri.getUserInfo() != null) {
                return null;
            }
            if (scheme.equals("https")) {
                return uri;
            }
            boolean local = host.equals("localhost") || host.equals("127.0.0.1");
            return scheme.equals("http") && allowInsecureLocalhost && local ? uri : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public boolean hasValidToken() {
        return TOKEN.matcher(apiToken.strip()).matches();
    }

    public boolean uploadReady() {
        return enabled && endpoint() != null && hasValidToken();
    }
}
