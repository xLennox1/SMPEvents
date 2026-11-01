package dev.smpevents.mod.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.smpevents.mod.parser.PatternConfig;
import org.junit.jupiter.api.Test;

class ModConfigTest {
    private static ModConfig with(String url, boolean insecureLocalhost) {
        ModConfig c = new ModConfig();
        c.backendUrl = url;
        c.allowInsecureLocalhost = insecureLocalhost;
        return c;
    }

    @Test
    void httpsIsAcceptedPlainHttpToRemoteHostsNever() {
        assertTrue(with("https://smpevents.example/api/x", false).endpoint() != null);
        assertNull(with("http://smpevents.example/api/x", false).endpoint());
        assertNull(with("http://smpevents.example/api/x", true).endpoint());
    }

    @Test
    void httpIsOnlyAllowedForLocalhostWhenExplicitlyEnabled() {
        assertNull(with("http://127.0.0.1:3000/x", false).endpoint());
        assertTrue(with("http://127.0.0.1:3000/x", true).endpoint() != null);
        assertTrue(with("http://localhost:3000/x", true).endpoint() != null);
    }

    @Test
    void rejectsGarbageOtherSchemesAndCredentialsInTheUrl() {
        assertNull(with("", false).endpoint());
        assertNull(with("not a url", false).endpoint());
        assertNull(with("ftp://smpevents.example/x", false).endpoint());
        assertNull(with("https://user:pw@smpevents.example/x", false).endpoint());
    }

    @Test
    void tokenMustHaveTheExpectedFormat() {
        ModConfig c = new ModConfig();
        c.apiToken = "smpe_" + "0123456789abcdef".repeat(4);
        assertTrue(c.hasValidToken());
        c.apiToken = "smpe_zzz";
        assertFalse(c.hasValidToken());
        c.apiToken = "";
        assertFalse(c.hasValidToken());
    }

    @Test
    void submissionIsOffByDefaultAndNeedsEverything() {
        assertFalse(new ModConfig().uploadReady());
        ModConfig c = with("https://smpevents.example/api/x", false);
        c.apiToken = "smpe_" + "a".repeat(64);
        assertFalse(c.uploadReady()); // enabled fehlt
        c.enabled = true;
        assertTrue(c.uploadReady());
    }

    @Test
    void bundledExamplePatternsAreDisabled() {
        for (PatternConfig p : new ModConfig().patterns) {
            assertFalse(p.enabled);
        }
    }
}
