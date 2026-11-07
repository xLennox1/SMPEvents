import { beforeEach, describe, expect, it, vi } from 'vitest';

// Ein Fake-Admin-Client: jeder Zugriff auf eine andere Tabelle als die zwei erlaubten lässt den Test scheitern.
// So ist belegt, dass der Mod-Endpunkt niemals Abos, Zahlungen oder Profile anfasst (kein Weg zu Premium).
const h = vi.hoisted(() => {
  const state = {
    tokenRow: { id: 'token-1', user_id: 'user-1', trusted: false } as { id: string; user_id: string; trusted: boolean } | null,
    linkError: null as { message: string; code: string } | null,
    rateOk: true,
    insertError: null as { code: string } | null,
    inserts: [] as Record<string, unknown>[],
    touched: [] as string[],
    rpcCalls: [] as string[],
  };
  const fakeAdmin = () => ({
    rpc: (name: string) => {
      state.rpcCalls.push(name);
      if (name === 'link_minecraft_name') return Promise.resolve({ data: 'user-1', error: state.linkError });
      return Promise.resolve({ data: name === 'check_rate_limit' ? state.rateOk : null, error: null });
    },
    from: (table: string) => {
      state.touched.push(table);
      if (table === 'mod_ingest_tokens') {
        return {
          select: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: state.tokenRow, error: null }) }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'minecraft_payment_events') {
        return { insert: (row: Record<string, unknown>) => { state.inserts.push(row); return Promise.resolve({ error: state.insertError }); } };
      }
      throw new Error(`Unerwarteter Tabellenzugriff: ${table}`);
    },
  });
  return { state, fakeAdmin };
});

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.fakeAdmin() }));

import { POST } from '@/app/api/integrations/minecraft/payment-events/route';

const TOKEN = `smpe_${'a'.repeat(64)}`;
const URL = 'http://localhost/api/integrations/minecraft/payment-events';
const VALID = { senderName: 'Steve_01', recipientName: 'Alex', amount: 500000, currency: 'Coins', rawMessage: 'Steve_01 hat Alex 500.000 Coins gesendet' };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.state.tokenRow = { id: 'token-1', user_id: 'user-1', trusted: false };
  h.state.linkError = null;
  h.state.rateOk = true;
  h.state.insertError = null;
  h.state.inserts.length = 0;
  h.state.touched.length = 0;
  h.state.rpcCalls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/integrations/minecraft/payment-events', () => {
  it('lehnt Anfragen ohne oder mit falsch geformtem Token ab (401)', async () => {
    expect((await POST(request(VALID, { authorization: '' }))).status).toBe(401);
    expect((await POST(request(VALID, { authorization: 'Bearer zu-kurz' }))).status).toBe(401);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('lehnt unbekannte oder widerrufene Tokens ab (401)', async () => {
    h.state.tokenRow = null;
    expect((await POST(request(VALID))).status).toBe(401);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('verlangt JSON (415) und begrenzt die Größe (413)', async () => {
    expect((await POST(request(VALID, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await POST(request({ ...VALID, rawMessage: 'x'.repeat(5000) }))).status).toBe(413);
  });

  it('wendet das Rate-Limit an (429 mit Retry-After)', async () => {
    h.state.rateOk = false;
    const res = await POST(request(VALID));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(h.state.inserts).toHaveLength(0);
  });

  it('weist ungültige Payloads ab (422)', async () => {
    expect((await POST(request({ ...VALID, senderName: 'x y!' }))).status).toBe(422);
    expect((await POST(request({ ...VALID, amount: -5 }))).status).toBe(422);
    expect((await POST(request({ senderName: 'Steve_01' }))).status).toBe(422);
    expect((await POST(request('kein json'))).status).toBe(400);
  });

  it('nimmt Hinweise nur als UNBESTÄTIGT an und fasst nichts außer der Hinweis-Tabelle an', async () => {
    const res = await POST(request(VALID));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({ status: 'accepted', confirmed: false });
    expect(JSON.stringify(json)).not.toContain(TOKEN);

    expect(h.state.inserts).toHaveLength(1);
    const row = h.state.inserts[0];
    expect(row.reported_by).toBe('user-1');
    expect(row.amount_coins).toBe(500000);
    expect('status' in row).toBe(false); // der Status bleibt der Spalten-Default "unconfirmed"

    // Kein Weg zu Premium: weder Abos noch Zahlungsanträge noch Freischalt-Funktionen werden berührt
    expect(h.state.touched.every((t) => t === 'mod_ingest_tokens' || t === 'minecraft_payment_events')).toBe(true);
    expect(h.state.rpcCalls.every((n) => n === 'check_rate_limit')).toBe(true);
  });

  it('speichert nicht erkannte Felder als null (nie geraten)', async () => {
    await POST(request({ rawMessage: 'irgendeine Zeile' }));
    const row = h.state.inserts[0];
    expect(row.sender_name).toBeNull();
    expect(row.recipient_name).toBeNull();
    expect(row.amount_coins).toBeNull();
  });

  it('verwirft unplausible Zeitstempel', async () => {
    await POST(request({ ...VALID, observedAt: '2099-01-01T00:00:00Z' }));
    expect(h.state.inserts[0].observed_at).toBeNull();
  });

  it('meldet Duplikate als 200 und Datenbankfehler als 503 ohne Details', async () => {
    h.state.insertError = { code: '23505' };
    const dup = await POST(request(VALID));
    expect(dup.status).toBe(200);
    expect((await dup.json()).status).toBe('duplicate');

    h.state.insertError = { code: 'XX000' };
    const fail = await POST(request(VALID));
    expect(fail.status).toBe(503);
    expect(await fail.json()).toEqual({ error: 'unavailable' });
  });

  it('Verknüpfungs-Meldungen akzeptiert nur der vertrauenswürdige Empfänger-Token', async () => {
    const link = { kind: 'link', senderName: 'Steve_01', code: 'SMPE-1A2B3C4D', rawMessage: '[Verknüpfung]' };
    expect((await POST(request(link))).status).toBe(403); // normaler Token
    expect(h.state.rpcCalls.includes('link_minecraft_name')).toBe(false);

    h.state.tokenRow = { id: 'token-1', user_id: 'user-1', trusted: true };
    const ok = await POST(request(link));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'linked' });
    expect(h.state.inserts).toHaveLength(0); // der Code wird nicht als Hinweis gespeichert
  });

  it('übersetzt Verknüpfungsfehler (ungültiger Code 422, Name vergeben 409) ohne Details', async () => {
    h.state.tokenRow = { id: 'token-1', user_id: 'user-1', trusted: true };
    const link = { kind: 'link', senderName: 'Steve_01', code: 'SMPE-1A2B3C4D', rawMessage: '[Verknüpfung]' };
    h.state.linkError = { message: 'invalid_code', code: 'P0001' };
    expect((await POST(request(link))).status).toBe(422);
    h.state.linkError = { message: 'name_taken', code: 'P0001' };
    expect((await POST(request(link))).status).toBe(409);
    expect((await POST(request({ ...link, code: undefined }))).status).toBe(422);
  });
});
