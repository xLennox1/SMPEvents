package dev.smpevents.mod.net;

import dev.smpevents.mod.parser.ParsedPayment;

/** Baut den JSON-Body für POST /api/integrations/minecraft/payment-events. Unbekannte Felder werden weggelassen. */
public final class JsonBody {
    private JsonBody() {
    }

    public static String of(ParsedPayment p, String modVersion) {
        StringBuilder sb = new StringBuilder(256).append('{');
        sb.append("\"rawMessage\":").append(quote(p.rawMessage()));
        if (p.senderName() != null) sb.append(",\"senderName\":").append(quote(p.senderName()));
        if (p.recipientName() != null) sb.append(",\"recipientName\":").append(quote(p.recipientName()));
        if (p.amount() != null) sb.append(",\"amount\":").append(p.amount().longValue());
        if (p.currency() != null) sb.append(",\"currency\":").append(quote(p.currency()));
        if (p.observedAt() != null) sb.append(",\"observedAt\":").append(quote(p.observedAt().toString()));
        if (p.patternId() != null) sb.append(",\"patternId\":").append(quote(p.patternId()));
        if (modVersion != null) sb.append(",\"modVersion\":").append(quote(modVersion));
        return sb.append('}').toString();
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
