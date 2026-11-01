package dev.smpevents.mod.parser;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class AmountParserTest {
    private static Long L(long v) {
        return Long.valueOf(v);
    }

    @Test
    void readsPlainAndGroupedIntegers() {
        assertEquals(L(500000), AmountParser.parse("500000"));
        assertEquals(L(500000), AmountParser.parse("500.000"));
        assertEquals(L(500000), AmountParser.parse("500,000"));
        assertEquals(L(1234567), AmountParser.parse("1.234.567"));
        assertEquals(L(1234567), AmountParser.parse("1,234,567"));
        assertEquals(L(1000), AmountParser.parse("1 000"));
        assertEquals(L(1000), AmountParser.parse("1'000"));
        assertEquals(L(42), AmountParser.parse("  42 "));
    }

    @Test
    void readsSuffixesOnlyWhenResultIsWholeNumber() {
        assertEquals(L(1500), AmountParser.parse("1,5k"));
        assertEquals(L(1500), AmountParser.parse("1.5K"));
        assertEquals(L(1250), AmountParser.parse("1.25k"));
        assertEquals(L(2000000), AmountParser.parse("2M"));
        assertEquals(L(1500000), AmountParser.parse("1.5m"));
        assertEquals(L(3000000000L), AmountParser.parse("3b"));
        assertNull(AmountParser.parse("0.0001k"));
    }

    @Test
    void ambiguousOrInvalidInputIsUnknownNotGuessed() {
        assertNull(AmountParser.parse("1,5"));          // Dezimalzahl ohne Suffix: nicht eindeutig
        assertNull(AmountParser.parse("500.5"));
        assertNull(AmountParser.parse("1.234,567"));    // gemischte Trennzeichen
        assertNull(AmountParser.parse("12.34.567"));    // falsche Gruppengröße
        assertNull(AmountParser.parse("abc"));
        assertNull(AmountParser.parse("5 coins"));
        assertNull(AmountParser.parse(""));
        assertNull(AmountParser.parse(null));
    }

    @Test
    void rejectsZeroNegativeAndOverflow() {
        assertNull(AmountParser.parse("0"));
        assertNull(AmountParser.parse("-5"));
        assertNull(AmountParser.parse("99999999999999999999"));
        assertEquals(L(AmountParser.MAX_AMOUNT), AmountParser.parse("9007199254740991"));
        assertNull(AmountParser.parse("9007199254740992"));
    }
}
