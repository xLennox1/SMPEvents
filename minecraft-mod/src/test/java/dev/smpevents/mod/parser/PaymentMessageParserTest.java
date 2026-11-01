package dev.smpevents.mod.parser;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Die Muster hier sind frei erfundene BEISPIELE, keine echten WindSMP-Formate. */
class PaymentMessageParserTest {
    private static final Instant NOW = Instant.parse("2026-11-05T17:00:00Z");
    private static final String TRANSFER = "^(?<sender>\\S+) hat (?<recipient>\\S+) (?<amount>[\\d.,]+) (?<currency>\\w+) gesendet\\.?$";
    private static final String RECEIVED = "^Du hast (?<amount>[\\d.,]+) Coins erhalten$";

    private static PaymentMessageParser parser(PatternConfig... configs) {
        return new PaymentMessageParser(List.of(configs));
    }

    private static Long L(long v) {
        return Long.valueOf(v);
    }

    @Test
    void parsesFullyRecognizedTransfer() {
        ParsedPayment p = parser(new PatternConfig("transfer", true, TRANSFER, null))
                .parse("Steve_01 hat Alex 500.000 Coins gesendet.", NOW).orElseThrow();
        assertEquals("transfer", p.patternId());
        assertEquals("Steve_01", p.senderName());
        assertEquals("Alex", p.recipientName());
        assertEquals(L(500000), p.amount());
        assertEquals("Coins", p.currency());
        assertEquals("Steve_01 hat Alex 500.000 Coins gesendet.", p.rawMessage());
        assertEquals(NOW, p.observedAt());
    }

    @Test
    void stripsFormattingCodesAndControlCharacters() {
        ParsedPayment p = parser(new PatternConfig("transfer", true, TRANSFER, null))
                .parse("§aSteve_01 §7hat §lAlex§r 1.000\u0007 Coins gesendet", NOW).orElseThrow();
        assertEquals("Steve_01", p.senderName());
        assertEquals("Alex", p.recipientName());
        assertEquals(L(1000), p.amount());
        assertEquals("Steve_01 hat Alex 1.000 Coins gesendet", p.rawMessage());
    }

    @Test
    void unknownFieldsStayNull() {
        ParsedPayment p = parser(new PatternConfig("received", true, RECEIVED, "Coins"))
                .parse("Du hast 2.500 Coins erhalten", NOW).orElseThrow();
        assertNull(p.senderName());
        assertNull(p.recipientName());
        assertEquals(L(2500), p.amount());
        assertEquals("Coins", p.currency()); // feste Währung aus der Konfiguration
    }

    @Test
    void invalidNamesAndUnparsableAmountsBecomeNullInsteadOfGuesses() {
        ParsedPayment p = parser(new PatternConfig("transfer", true, TRANSFER, null))
                .parse("x! hat Alex 1,5 Coins gesendet", NOW).orElseThrow();
        assertNull(p.senderName());        // kein gültiger Minecraft-Name
        assertEquals("Alex", p.recipientName());
        assertNull(p.amount());            // "1,5" ist nicht eindeutig
    }

    @Test
    void matchWithoutAnyUsableFieldIsDropped() {
        Optional<ParsedPayment> r = parser(new PatternConfig("transfer", true, TRANSFER, null))
                .parse("x! hat y! abc Coins gesendet", NOW);
        assertFalse(r.isPresent());
    }

    @Test
    void unrelatedMessagesAndDisabledPatternsDoNotMatch() {
        assertFalse(parser(new PatternConfig("transfer", true, TRANSFER, null)).parse("Hallo zusammen!", NOW).isPresent());
        assertFalse(parser(new PatternConfig("transfer", false, TRANSFER, null)).parse("Steve_01 hat Alex 5 Coins gesendet", NOW).isPresent());
        assertFalse(parser().parse("Steve_01 hat Alex 5 Coins gesendet", NOW).isPresent());
        assertFalse(parser(new PatternConfig("transfer", true, TRANSFER, null)).parse(null, NOW).isPresent());
    }

    @Test
    void invalidRegexIsReportedAndSkipped() {
        PaymentMessageParser p = parser(
                new PatternConfig("kaputt", true, "([unclosed", null),
                new PatternConfig("received", true, RECEIVED, null));
        assertEquals(List.of("kaputt"), p.invalidPatternIds());
        assertEquals(1, p.activeRuleCount());
        assertTrue(p.parse("Du hast 10 Coins erhalten", NOW).isPresent());
    }

    @Test
    void firstMatchingPatternWins() {
        PaymentMessageParser p = parser(
                new PatternConfig("first", true, "^(?<sender>\\w+) zahlt (?<amount>\\d+)$", null),
                new PatternConfig("second", true, "^(?<sender>\\w+) zahlt (?<amount>\\d+)$", null));
        assertEquals("first", p.parse("Steve_01 zahlt 5", NOW).orElseThrow().patternId());
    }

    @Test
    void truncatesVeryLongMessages() {
        String longText = "Du hast 5 Coins erhalten " + "x".repeat(2000);
        ParsedPayment p = parser(new PatternConfig("received", true, "^Du hast (?<amount>\\d+) Coins erhalten", null))
                .parse(longText, NOW).orElseThrow();
        assertEquals(PaymentMessageParser.MAX_RAW_LENGTH, p.rawMessage().length());
    }

    @Test
    void catastrophicRegexIsAbortedInsteadOfFreezingTheClient() {
        PaymentMessageParser p = parser(new PatternConfig("evil", true, "^(?:(?:a*)*)*b", null)); // hängt auf JDK 21 nachweislich ohne Schutz
        long start = System.nanoTime();
        Optional<ParsedPayment> r = p.parse("a".repeat(40), NOW);
        long millis = (System.nanoTime() - start) / 1_000_000;
        assertFalse(r.isPresent());
        assertEquals(1, p.timeoutCount());
        assertTrue(millis < 3000, "Auswertung dauerte " + millis + " ms");
    }
}
