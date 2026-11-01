package dev.smpevents.mod.net;

import dev.smpevents.mod.config.ModConfig;
import dev.smpevents.mod.parser.ParsedPayment;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.slf4j.Logger;

/**
 * Übermittelt Hinweise per HTTPS. {@link #send} blockiert (Timeouts + begrenzte Wiederholungen) und darf
 * deshalb nur vom Worker-Thread aufgerufen werden, niemals vom Minecraft-Client-Thread.
 * Das Token wird nie geloggt; Weiterleitungen werden nicht verfolgt (das Token geht nur an die konfigurierte Adresse).
 */
public final class EventUploader {
    public enum Result { OK, REJECTED, FAILED }

    private final ModConfig cfg;
    private final String modVersion;
    private final Logger log;
    private final HttpClient http;

    public EventUploader(ModConfig cfg, String modVersion, Logger log) {
        this.cfg = cfg;
        this.modVersion = modVersion;
        this.log = log;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(cfg.connectTimeoutMs))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public Result send(ParsedPayment payment) {
        URI uri = cfg.endpoint();
        if (uri == null || !cfg.hasValidToken()) {
            return Result.FAILED;
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(cfg.requestTimeoutMs))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + cfg.apiToken.strip())
                .header("User-Agent", "SMPEvents-Mod/" + modVersion)
                .POST(HttpRequest.BodyPublishers.ofString(JsonBody.of(payment, modVersion), StandardCharsets.UTF_8))
                .build();

        long backoff = cfg.retryBackoffMs;
        for (int attempt = 0; attempt <= cfg.maxRetries; attempt++) {
            try {
                int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
                if (status >= 200 && status < 300) {
                    debug("Hinweis übermittelt (HTTP {}, Muster {})", status, payment.patternId());
                    return Result.OK;
                }
                if (status != 429 && status < 500) {
                    log.warn("[SMPEvents] Der Server hat den Hinweis abgelehnt (HTTP {}). Prüfe backendUrl und apiToken.", status);
                    return Result.REJECTED;
                }
                debug("Vorübergehender Serverfehler (HTTP {}), Versuch {}", status, attempt + 1);
            } catch (IOException e) {
                debug("Netzwerkfehler ({}), Versuch {}", e.getClass().getSimpleName(), attempt + 1);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Result.FAILED;
            }
            if (attempt < cfg.maxRetries) {
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return Result.FAILED;
                }
                backoff = Math.min(backoff * 4, 30_000);
            }
        }
        log.warn("[SMPEvents] Hinweis konnte nach {} Versuchen nicht übermittelt werden.", cfg.maxRetries + 1);
        return Result.FAILED;
    }

    private void debug(String message, Object... args) {
        if (cfg.debugLogging) {
            log.info("[SMPEvents] " + message, args);
        }
    }
}
