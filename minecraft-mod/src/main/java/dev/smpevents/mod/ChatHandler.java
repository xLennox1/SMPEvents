package dev.smpevents.mod;

import dev.smpevents.mod.config.ModConfig;
import dev.smpevents.mod.net.EventUploader;
import dev.smpevents.mod.parser.ParsedPayment;
import dev.smpevents.mod.parser.PaymentMessageParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;

/**
 * Verbindet Chat-Ereignisse mit Parser und Uploader. {@link #onMessage} läuft auf dem Client-Thread und reiht nur ein;
 * Parsen (Regex mit Zeitbudget) und HTTP laufen auf einem eigenen Daemon-Thread mit begrenzter Warteschlange
 * (bei Überlauf wird die älteste Nachricht verworfen). So kann weder ein schlechtes Muster noch ein langsames
 * Backend das Spiel blockieren.
 */
final class ChatHandler implements AutoCloseable {
    private static final long DEDUPE_WINDOW_MS = 5_000;
    private static final long SAMPLE_LOG_MAX_BYTES = 1_000_000;

    private final ModConfig cfg;
    private final Logger log;
    private final PaymentMessageParser parser;
    private final EventUploader uploader;
    private final Path sampleFile;
    private final ThreadPoolExecutor worker;
    private final Map<String, Long> recent = new LinkedHashMap<>(); // nur vom Worker-Thread benutzt

    ChatHandler(ModConfig cfg, Path configDir, String modVersion, Logger log) {
        this.cfg = cfg;
        this.log = log;
        this.parser = new PaymentMessageParser(cfg.patterns);
        this.uploader = new EventUploader(cfg, modVersion, log);
        this.sampleFile = configDir.resolve("smpevents-samples.log");
        this.worker = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(256),
                r -> {
                    Thread t = new Thread(r, "smpevents-worker");
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.DiscardOldestPolicy());

        for (String id : parser.invalidPatternIds()) {
            log.warn("[SMPEvents] Muster '{}' hat ein ungültiges Regex und wird ignoriert.", id);
        }
        if (cfg.enabled && !cfg.uploadReady()) {
            log.warn("[SMPEvents] 'enabled' ist true, aber backendUrl (https) oder apiToken fehlen bzw. sind ungültig. Übermittlung bleibt AUS.");
        }
        log.info("[SMPEvents] bereit. Übermittlung: {}, aktive Muster: {} (mitgelieferte Beispiele sind deaktiviert).",
                cfg.uploadReady() ? "AN" : "AUS", parser.activeRuleCount());
    }

    /** Client-Thread: nur einreihen, nie blockieren. */
    void onMessage(String text) {
        if (text == null || text.isEmpty()) {
            return;
        }
        if (!cfg.uploadReady() && !cfg.localSampleLogging && !cfg.debugLogging) {
            return; // nichts zu tun: kein Aufwand pro Chatzeile
        }
        String clipped = text.length() > 2000 ? text.substring(0, 2000) : text;
        Instant now = Instant.now();
        worker.execute(() -> process(clipped, now));
    }

    private void process(String text, Instant observedAt) {
        try {
            String normalized = PaymentMessageParser.normalize(text);
            if (normalized.isEmpty() || isRecent(normalized)) {
                return;
            }
            if (cfg.localSampleLogging) {
                logSample(normalized);
            }
            Optional<ParsedPayment> parsed = parser.parse(text, observedAt);
            if (parsed.isEmpty()) {
                return;
            }
            ParsedPayment p = parsed.get();
            if (cfg.debugLogging) {
                log.info("[SMPEvents] Muster '{}' erkannt: Absender={}, Empfänger={}, Betrag={}",
                        p.patternId(), p.senderName(), p.recipientName(), p.amount());
            }
            if (cfg.uploadReady()) {
                uploader.send(p); // nur ein unbestätigter Hinweis – nie eine Zahlungsbestätigung
            }
        } catch (RuntimeException e) {
            log.warn("[SMPEvents] Nachricht konnte nicht verarbeitet werden: {}", e.getClass().getSimpleName());
        }
    }

    private boolean isRecent(String key) {
        long now = System.currentTimeMillis();
        recent.values().removeIf(t -> now - t > DEDUPE_WINDOW_MS);
        if (recent.containsKey(key)) {
            return true;
        }
        recent.put(key, now);
        if (recent.size() > 64) {
            Iterator<String> it = recent.keySet().iterator();
            it.next();
            it.remove();
        }
        return false;
    }

    private void logSample(String normalized) {
        String lower = normalized.toLowerCase(Locale.ROOT);
        boolean interesting = cfg.sampleKeywords.stream()
                .anyMatch(k -> k != null && !k.isBlank() && lower.contains(k.toLowerCase(Locale.ROOT)));
        if (!interesting) {
            return;
        }
        try {
            if (Files.exists(sampleFile) && Files.size(sampleFile) > SAMPLE_LOG_MAX_BYTES) {
                return;
            }
            Files.writeString(sampleFile, Instant.now() + " | " + normalized + System.lineSeparator(),
                    StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ignored) {
            // lokale Hilfsfunktion, kein Grund zu stören
        }
    }

    @Override
    public void close() {
        worker.shutdownNow();
    }
}
