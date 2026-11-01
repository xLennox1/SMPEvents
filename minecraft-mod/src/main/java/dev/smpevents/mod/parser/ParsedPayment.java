package dev.smpevents.mod.parser;

import java.time.Instant;

/**
 * Ergebnis des Chatparsers. {@code null} bedeutet "nicht zuverlässig erkannt" – niemals geraten.
 * Ein ParsedPayment ist immer nur ein HINWEIS und nie eine bestätigte Zahlung.
 */
public record ParsedPayment(
        String patternId,
        String senderName,
        String recipientName,
        Long amount,
        String currency,
        String rawMessage,
        Instant observedAt) {
}
