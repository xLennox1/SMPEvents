package dev.smpevents.mod.parser;

/**
 * Schützt vor katastrophalem Backtracking in nutzerdefinierten Regex-Mustern: Läuft die Auswertung
 * länger als das Zeitbudget, bricht {@link RegexTimeoutException} sie ab.
 */
final class DeadlineCharSequence implements CharSequence {
    static final class RegexTimeoutException extends RuntimeException {
        RegexTimeoutException() {
            super("Regex-Zeitbudget überschritten", null, false, false);
        }
    }

    private final CharSequence inner;
    private final long deadlineNanos;
    private int calls;

    DeadlineCharSequence(CharSequence inner, long budgetNanos) {
        this.inner = inner;
        this.deadlineNanos = System.nanoTime() + budgetNanos;
    }

    @Override
    public char charAt(int index) {
        if ((++calls & 0x3FF) == 0 && System.nanoTime() > deadlineNanos) {
            throw new RegexTimeoutException();
        }
        return inner.charAt(index);
    }

    @Override
    public int length() {
        return inner.length();
    }

    @Override
    public CharSequence subSequence(int start, int end) {
        return inner.subSequence(start, end);
    }

    @Override
    public String toString() {
        return inner.toString();
    }
}
