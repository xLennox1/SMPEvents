import { describe, expect, it } from 'vitest';
import { eventInputSchema, paymentEventSchema, paymentSubmissionSchema } from '@/lib/validation';

describe('paymentEventSchema (Mod-Payload)', () => {
  it('akzeptiert vollständig erkannte Meldungen', () => {
    const r = paymentEventSchema.safeParse({
      senderName: 'Steve_01', recipientName: 'Alex', amount: 500000, currency: 'Coins',
      rawMessage: 'Steve_01 hat Alex 500.000 Coins gesendet', observedAt: '2026-11-05T17:00:00Z', patternId: 'example',
    });
    expect(r.success).toBe(true);
  });
  it('akzeptiert unbekannte Felder als null (nie geraten)', () => {
    const r = paymentEventSchema.safeParse({ senderName: null, recipientName: null, amount: null, rawMessage: 'irgendwas' });
    expect(r.success).toBe(true);
  });
  it('lehnt ungültige Namen, negative Beträge und fehlende Originalnachricht ab', () => {
    expect(paymentEventSchema.safeParse({ senderName: 'x y!', rawMessage: 'a' }).success).toBe(false);
    expect(paymentEventSchema.safeParse({ amount: -5, rawMessage: 'a' }).success).toBe(false);
    expect(paymentEventSchema.safeParse({ amount: 1.5, rawMessage: 'a' }).success).toBe(false);
    expect(paymentEventSchema.safeParse({ amount: 10 }).success).toBe(false);
  });
  it('kennt Verknüpfungs-Meldungen mit Code und lehnt ungültige Codes ab', () => {
    expect(paymentEventSchema.safeParse({ kind: 'link', senderName: 'Steve_01', code: 'SMPE-1A2B3C4D', rawMessage: '[Verknüpfung]' }).success).toBe(true);
    expect(paymentEventSchema.safeParse({ kind: 'link', code: 'x y', rawMessage: 'a' }).success).toBe(false);
    expect(paymentEventSchema.safeParse({ kind: 'hacked', rawMessage: 'a' }).success).toBe(false);
  });
  it('begrenzt die Länge der Originalnachricht', () => {
    expect(paymentEventSchema.safeParse({ rawMessage: 'x'.repeat(513) }).success).toBe(false);
  });
});

describe('eventInputSchema', () => {
  const valid = {
    title: 'Mega Giveaway', description: 'Wir verlosen Netherite-Sets.', category: 'giveaway',
    starts_local: '2026-11-05T18:00', timezone: 'Europe/Berlin', rewards: '3x Netherite-Set',
  };
  it('akzeptiert gültige Events', () => expect(eventInputSchema.safeParse(valid).success).toBe(true));
  it('lehnt unbekannte Kategorien, Zeitzonen und http-Links ab', () => {
    expect(eventInputSchema.safeParse({ ...valid, category: 'quiz' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, link_url: 'http://example.com' }).success).toBe(false);
  });
});

describe('paymentSubmissionSchema', () => {
  it('verlangt gültigen Minecraft-Namen und positiven Betrag', () => {
    const ok = { plan: 'streamer', payer_ingame_name: 'Steve_01', claimed_amount_coins: '500000' };
    expect(paymentSubmissionSchema.safeParse(ok).success).toBe(true);
    expect(paymentSubmissionSchema.safeParse({ ...ok, claimed_amount_coins: '0' }).success).toBe(false);
    expect(paymentSubmissionSchema.safeParse({ ...ok, payer_ingame_name: 'a' }).success).toBe(false);
  });
});
