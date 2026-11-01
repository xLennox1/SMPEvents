package dev.smpevents.mod.net;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import dev.smpevents.mod.parser.ParsedPayment;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class JsonBodyTest {
    @Test
    void includesOnlyKnownFields() {
        ParsedPayment p = new ParsedPayment("transfer", "Steve_01", null, Long.valueOf(500000), null,
                "Steve_01 hat 500.000 Coins gesendet", Instant.parse("2026-11-05T17:00:00Z"));
        String json = JsonBody.of(p, "0.1.0");
        assertEquals("{\"rawMessage\":\"Steve_01 hat 500.000 Coins gesendet\",\"senderName\":\"Steve_01\",\"amount\":500000,"
                + "\"observedAt\":\"2026-11-05T17:00:00Z\",\"patternId\":\"transfer\",\"modVersion\":\"0.1.0\"}", json);
        assertFalse(json.contains("recipientName"));
        assertFalse(json.contains("currency"));
    }

    @Test
    void escapesQuotesBackslashesAndControlCharacters() {
        assertEquals("\"a\\\"b\\\\c\\nd\\te\\u0001\"", JsonBody.quote("a\"b\\c\nd\te\u0001"));
        assertEquals("\"Größe €\"", JsonBody.quote("Größe €"));
    }
}
