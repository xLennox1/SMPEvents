package dev.smpevents.mod.parser;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Erkennt Zahlungs-Chatnachrichten anhand konfigurierter Regex-Muster.
 * Es gibt bewusst KEINE eingebauten Muster für einen echten Server: Die Formate müssen aus echten,
 * zulässig erhobenen Beispielen konfiguriert werden. Felder, die nicht zuverlässig erkannt werden, bleiben {@code null}.
 */
public final class PaymentMessageParser {
    public static final int MAX_RAW_LENGTH = 512;
    private static final long REGEX_BUDGET_NANOS = 50_000_000L; // 50 ms pro Muster und Nachricht

    private static final Pattern FORMAT_CODES = Pattern.compile("§[0-9a-fk-orA-FK-OR]");
    private static final Pattern CONTROL = Pattern.compile("\\p{Cc}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_]{3,16}");
    private static final Pattern CURRENCY = Pattern.compile("[\\p{L}\\p{N}$€£_.-]{1,16}");

    private record Rule(String id, Pattern pattern, String fixedCurrency) {
    }

    private final List<Rule> rules = new ArrayList<>();
    private final List<String> invalidPatternIds = new ArrayList<>();
    private final AtomicInteger timeouts = new AtomicInteger();

    public PaymentMessageParser(List<PatternConfig> configs) {
        for (PatternConfig c : configs) {
            if (c == null || !c.enabled || c.regex == null || c.regex.isBlank()) {
                continue;
            }
            try {
                rules.add(new Rule(c.id == null ? "unnamed" : c.id, Pattern.compile(c.regex), c.currency));
            } catch (PatternSyntaxException e) {
                invalidPatternIds.add(c.id);
            }
        }
    }

    /** IDs aktivierter Muster, deren Regex nicht kompiliert werden konnte. */
    public List<String> invalidPatternIds() {
        return List.copyOf(invalidPatternIds);
    }

    public int activeRuleCount() {
        return rules.size();
    }

    /** Anzahl der wegen Zeitüberschreitung abgebrochenen Regex-Auswertungen (Hinweis auf ein schlechtes Muster). */
    public int timeoutCount() {
        return timeouts.get();
    }

    /** Entfernt Minecraft-Formatierungscodes und Steuerzeichen und kürzt auf {@link #MAX_RAW_LENGTH}. */
    public static String normalize(String raw) {
        String t = FORMAT_CODES.matcher(raw).replaceAll("");
        t = CONTROL.matcher(t).replaceAll(" ");
        t = WHITESPACE.matcher(t).replaceAll(" ").strip();
        return t.length() > MAX_RAW_LENGTH ? t.substring(0, MAX_RAW_LENGTH) : t;
    }

    public Optional<ParsedPayment> parse(String rawMessage, Instant observedAt) {
        if (rawMessage == null) {
            return Optional.empty();
        }
        String text = normalize(rawMessage);
        if (text.isEmpty()) {
            return Optional.empty();
        }
        for (Rule rule : rules) {
            Matcher m = rule.pattern().matcher(new DeadlineCharSequence(text, REGEX_BUDGET_NANOS));
            boolean found;
            try {
                found = m.find();
            } catch (DeadlineCharSequence.RegexTimeoutException e) {
                timeouts.incrementAndGet();
                continue;
            }
            if (!found) {
                continue;
            }
            String sender = validName(group(m, "sender"));
            String recipient = validName(group(m, "recipient"));
            Long amount = AmountParser.parse(group(m, "amount"));
            String currency = validCurrency(group(m, "currency"));
            if (currency == null) {
                currency = validCurrency(rule.fixedCurrency());
            }
            if (sender == null && recipient == null && amount == null) {
                continue; // Muster passt, liefert aber nichts Verwertbares
            }
            return Optional.of(new ParsedPayment(rule.id(), sender, recipient, amount, currency, text, observedAt));
        }
        return Optional.empty();
    }

    private static String group(Matcher m, String name) {
        try {
            return m.group(name);
        } catch (IllegalArgumentException e) {
            return null; // Gruppe kommt im Muster nicht vor
        }
    }

    private static String validName(String s) {
        return s != null && NAME.matcher(s).matches() ? s : null;
    }

    private static String validCurrency(String s) {
        return s != null && CURRENCY.matcher(s).matches() ? s : null;
    }
}
