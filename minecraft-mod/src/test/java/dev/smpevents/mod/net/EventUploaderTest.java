package dev.smpevents.mod.net;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.smpevents.mod.FakeBackend;
import dev.smpevents.mod.config.ModConfig;
import dev.smpevents.mod.parser.ParsedPayment;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class EventUploaderTest {
    private static final Logger LOG = LoggerFactory.getLogger("test");
    private static final String TOKEN = "smpe_" + "a".repeat(64);
    private static final ParsedPayment PAYMENT = new ParsedPayment("transfer", "Steve_01", "Alex", Long.valueOf(500000),
            "Coins", "Steve_01 hat Alex 500.000 Coins gesendet", Instant.parse("2026-11-05T17:00:00Z"));

    private static ModConfig config(String url) {
        ModConfig c = new ModConfig();
        c.enabled = true;
        c.backendUrl = url;
        c.apiToken = TOKEN;
        c.allowInsecureLocalhost = true;
        c.maxRetries = 2;
        c.retryBackoffMs = 10;
        c.requestTimeoutMs = 2000;
        return c;
    }

    @Test
    void sendsJsonWithBearerTokenAndSucceedsOn202() throws Exception {
        try (FakeBackend backend = new FakeBackend(202)) {
            EventUploader.Result r = new EventUploader(config(backend.url()), "0.1.0", LOG).send(PAYMENT);
            assertEquals(EventUploader.Result.OK, r);
            assertEquals(1, backend.calls.get());
            assertEquals("Bearer " + TOKEN, backend.authHeaders.get(0));
            assertTrue(backend.bodies.get(0).contains("\"amount\":500000"));
            assertTrue(backend.bodies.get(0).contains("\"recipientName\":\"Alex\""));
        }
    }

    @Test
    void retriesTemporaryErrorsThenSucceeds() throws Exception {
        try (FakeBackend backend = new FakeBackend(503, 429, 202)) {
            assertEquals(EventUploader.Result.OK, new EventUploader(config(backend.url()), "0.1.0", LOG).send(PAYMENT));
            assertEquals(3, backend.calls.get());
        }
    }

    @Test
    void givesUpAfterMaxRetries() throws Exception {
        try (FakeBackend backend = new FakeBackend(500)) {
            assertEquals(EventUploader.Result.FAILED, new EventUploader(config(backend.url()), "0.1.0", LOG).send(PAYMENT));
            assertEquals(3, backend.calls.get()); // 1 Versuch + 2 Wiederholungen
        }
    }

    @Test
    void doesNotRetryClientErrors() throws Exception {
        try (FakeBackend backend = new FakeBackend(401)) {
            assertEquals(EventUploader.Result.REJECTED, new EventUploader(config(backend.url()), "0.1.0", LOG).send(PAYMENT));
            assertEquals(1, backend.calls.get());
        }
    }

    @Test
    void doesNotFollowRedirectsSoTheTokenStaysWithTheConfiguredServer() throws Exception {
        try (FakeBackend backend = new FakeBackend(302)) {
            assertEquals(EventUploader.Result.REJECTED, new EventUploader(config(backend.url()), "0.1.0", LOG).send(PAYMENT));
            assertEquals(1, backend.calls.get());
        }
    }

    @Test
    void refusesToSendWithoutValidEndpointOrToken() {
        ModConfig insecure = config("http://example.com/hook");
        assertEquals(EventUploader.Result.FAILED, new EventUploader(insecure, "0.1.0", LOG).send(PAYMENT));
        ModConfig noToken = config("https://example.com/hook");
        noToken.apiToken = "";
        assertEquals(EventUploader.Result.FAILED, new EventUploader(noToken, "0.1.0", LOG).send(PAYMENT));
    }
}
