package dev.smpevents.mod;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.smpevents.mod.config.ModConfig;
import dev.smpevents.mod.parser.PatternConfig;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class ChatHandlerTest {
    private static final Logger LOG = LoggerFactory.getLogger("test");
    private static final String TOKEN = "smpe_" + "b".repeat(64);
    private static final String TRANSFER = "^(?<sender>\\S+) hat (?<recipient>\\S+) (?<amount>[\\d.,]+) (?<currency>\\w+) gesendet\\.?$";

    private static ModConfig config(String url, boolean enabled) {
        ModConfig c = new ModConfig();
        c.enabled = enabled;
        c.backendUrl = url;
        c.apiToken = TOKEN;
        c.allowInsecureLocalhost = true;
        c.maxRetries = 1;
        c.retryBackoffMs = 10;
        c.requestTimeoutMs = 2000;
        c.patterns = new ArrayList<>(List.of(new PatternConfig("transfer", true, TRANSFER, null)));
        return c;
    }

    private static boolean waitFor(BooleanSupplier condition, long millis) throws InterruptedException {
        long end = System.currentTimeMillis() + millis;
        while (System.currentTimeMillis() < end) {
            if (condition.getAsBoolean()) {
                return true;
            }
            Thread.sleep(20);
        }
        return condition.getAsBoolean();
    }

    @Test
    void forwardsRecognizedPaymentAsHintAndDeduplicates() throws Exception {
        Path dir = Files.createTempDirectory("smpevents-test");
        try (FakeBackend backend = new FakeBackend(202); ChatHandler h = new ChatHandler(config(backend.url(), true), dir, "test", LOG)) {
            h.onMessage("§aSteve_01 hat Alex 500.000 Coins gesendet.");
            h.onMessage("Steve_01 hat Alex 500.000 Coins gesendet."); // gleiche Zeile innerhalb von 5 s
            assertTrue(waitFor(() -> backend.calls.get() >= 1, 3000));
            Thread.sleep(300);
            assertEquals(1, backend.calls.get());
            String body = backend.bodies.get(0);
            assertTrue(body.contains("\"amount\":500000"));
            assertTrue(body.contains("\"senderName\":\"Steve_01\""));
            assertTrue(body.contains("\"patternId\":\"transfer\""));
        }
    }

    @Test
    void sendsNothingWhenSubmissionIsDisabled() throws Exception {
        Path dir = Files.createTempDirectory("smpevents-test");
        try (FakeBackend backend = new FakeBackend(202); ChatHandler h = new ChatHandler(config(backend.url(), false), dir, "test", LOG)) {
            h.onMessage("Steve_01 hat Alex 500.000 Coins gesendet.");
            Thread.sleep(400);
            assertEquals(0, backend.calls.get());
        }
    }

    @Test
    void ignoresUnrelatedAndMalformedChat() throws Exception {
        Path dir = Files.createTempDirectory("smpevents-test");
        try (FakeBackend backend = new FakeBackend(202); ChatHandler h = new ChatHandler(config(backend.url(), true), dir, "test", LOG)) {
            h.onMessage("Hallo zusammen!");
            h.onMessage("");
            h.onMessage(null);
            h.onMessage("§");
            h.onMessage("x".repeat(10_000));
            Thread.sleep(400);
            assertEquals(0, backend.calls.get());
        }
    }

    @Test
    void neverBlocksTheCallerEvenIfTheBackendIsDown() throws Exception {
        Path dir = Files.createTempDirectory("smpevents-test");
        ModConfig c = config("http://127.0.0.1:1/hook", true); // nichts hört auf Port 1
        c.maxRetries = 3;
        c.retryBackoffMs = 200;
        try (ChatHandler h = new ChatHandler(c, dir, "test", LOG)) {
            long start = System.nanoTime();
            for (int i = 0; i < 50; i++) {
                h.onMessage("Steve_01 hat Alex " + (1000 + i) + " Coins gesendet.");
            }
            long millis = (System.nanoTime() - start) / 1_000_000;
            assertTrue(millis < 500, "onMessage blockierte " + millis + " ms");
        }
    }
}
