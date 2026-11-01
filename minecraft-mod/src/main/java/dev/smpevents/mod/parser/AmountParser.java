package dev.smpevents.mod.parser;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Liest Beträge strikt. Nicht eindeutig lesbare Eingaben ergeben {@code null} (= unbekannt) statt einer Schätzung.
 * <ul>
 *   <li>{@code 500000}</li>
 *   <li>mit Tausendertrenner (Punkt, Komma, Apostroph oder Leerzeichen, immer genau drei Ziffern pro Gruppe,
 *       nur ein Trennzeichen-Typ): {@code 500.000}, {@code 1,234,567}</li>
 *   <li>mit Suffix k/m/b und höchstens zwei Nachkommastellen, nur wenn das Ergebnis ganzzahlig ist: {@code 1,5k}, {@code 2M}</li>
 * </ul>
 * Hinweis: "1.000" gilt als Tausend (Trennzeichen + genau drei Ziffern), nicht als 1,000.
 */
public final class AmountParser {
    /** 2^53 - 1: in JSON und JavaScript verlustfrei darstellbar. */
    public static final long MAX_AMOUNT = 9_007_199_254_740_991L;

    private static final Pattern PLAIN = Pattern.compile("\\d{1,16}");
    private static final Pattern GROUPED = Pattern.compile("\\d{1,3}([.,'\\u00A0\\u202F ])\\d{3}(?:\\1\\d{3})*");
    private static final Pattern SUFFIXED = Pattern.compile("(\\d{1,12})(?:[.,](\\d{1,2}))?\\s?([kKmMbB])");
    private static final Pattern SEPARATORS = Pattern.compile("[.,'\\u00A0\\u202F ]");

    private AmountParser() {
    }

    public static Long parse(String text) {
        if (text == null) {
            return null;
        }
        String s = text.strip();
        if (s.isEmpty() || s.length() > 40) {
            return null;
        }
        if (PLAIN.matcher(s).matches()) {
            return positive(new BigDecimal(s));
        }
        if (GROUPED.matcher(s).matches()) {
            return positive(new BigDecimal(SEPARATORS.matcher(s).replaceAll("")));
        }
        Matcher m = SUFFIXED.matcher(s);
        if (m.matches()) {
            BigDecimal base = new BigDecimal(m.group(1) + (m.group(2) != null ? "." + m.group(2) : ""));
            BigDecimal value = base.multiply(multiplier(m.group(3).charAt(0)));
            if (value.stripTrailingZeros().scale() > 0) {
                return null; // nicht ganzzahlig -> unbekannt
            }
            return positive(value);
        }
        return null;
    }

    private static BigDecimal multiplier(char suffix) {
        return switch (Character.toLowerCase(suffix)) {
            case 'k' -> BigDecimal.valueOf(1_000L);
            case 'm' -> BigDecimal.valueOf(1_000_000L);
            default -> BigDecimal.valueOf(1_000_000_000L);
        };
    }

    private static Long positive(BigDecimal v) {
        if (v.signum() <= 0 || v.compareTo(BigDecimal.valueOf(MAX_AMOUNT)) > 0) {
            return null;
        }
        return v.longValueExact();
    }
}
