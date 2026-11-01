import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentEventSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4096;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const reply = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/**
 * Nimmt Zahlungs-HINWEISE der Minecraft-Mod entgegen. Sie werden immer als "unconfirmed" gespeichert und
 * aktivieren unter keinen Umständen Premium – das tut ausschließlich ein Administrator (RPC approve_payment_submission).
 */
export async function POST(request: Request) {
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return reply(503, { error: 'unavailable' }); }

  // 1) Grobes Limit pro IP (nur gehasht im Zähler), bevor irgendetwas geprüft wird
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipLimit = await admin.rpc('check_rate_limit', { p_key: `mc-ip:${sha256(ip).slice(0, 16)}`, p_limit: 120, p_window_seconds: 60 });
  if (ipLimit.error) return reply(503, { error: 'unavailable' });
  if (!ipLimit.data) return reply(429, { error: 'rate_limited' }, { 'Retry-After': '60' });

  // 2) Authentifizierung per persönlichem Token (in der Datenbank nur als SHA-256-Hash)
  const bearer = /^Bearer (smpe_[a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!bearer) return reply(401, { error: 'unauthorized' });
  const { data: token, error: tokenError } = await admin.from('mod_ingest_tokens').select('id,user_id').eq('token_hash', sha256(bearer[1])).is('revoked_at', null).maybeSingle();
  if (tokenError) return reply(503, { error: 'unavailable' });
  if (!token) return reply(401, { error: 'unauthorized' });

  // 3) Limit pro Token
  const tokenLimit = await admin.rpc('check_rate_limit', { p_key: `mc-token:${token.id}`, p_limit: 30, p_window_seconds: 60 });
  if (tokenLimit.error) return reply(503, { error: 'unavailable' });
  if (!tokenLimit.data) return reply(429, { error: 'rate_limited' }, { 'Retry-After': '60' });

  // 4) Eingabe: Typ, Größe, JSON, Schema
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: 'unsupported_media_type' });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return reply(400, { error: 'invalid_json' }); }
  const parsed = paymentEventSchema.safeParse(json);
  if (!parsed.success) return reply(422, { error: 'invalid_payload', fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))] });
  const p = parsed.data;

  // 5) Zeitstempel plausibilisieren: nie in der Zukunft, höchstens 7 Tage alt
  const nowMs = Date.now();
  let observedMs = p.observedAt ? Date.parse(p.observedAt) : NaN;
  if (!Number.isFinite(observedMs) || observedMs > nowMs + 5 * 60_000 || observedMs < nowMs - 7 * 86_400_000) observedMs = NaN;
  const observedAt = Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null;

  // 6) Duplikate: dieselbe Meldung desselben Tokens innerhalb derselben Minute
  const bucket = Math.floor((Number.isFinite(observedMs) ? observedMs : nowMs) / 60_000);
  const dedupeKey = sha256([token.id, p.senderName ?? '', p.recipientName ?? '', p.amount ?? '', p.rawMessage, bucket].join('|'));

  const { error } = await admin.from('minecraft_payment_events').insert({
    reported_by: token.user_id,
    token_id: token.id,
    sender_name: p.senderName ?? null,
    recipient_name: p.recipientName ?? null,
    amount_coins: p.amount ?? null,
    currency: p.currency ?? null,
    raw_message: p.rawMessage,
    pattern_id: p.patternId ?? null,
    mod_version: p.modVersion ?? null,
    observed_at: observedAt,
    dedupe_key: dedupeKey,
    // status bleibt der Spalten-Default 'unconfirmed'
  });
  if (error) {
    if (error.code === '23505') return reply(200, { status: 'duplicate', confirmed: false });
    console.error('payment-events: insert failed', error.code); // bewusst ohne Nachrichteninhalt und ohne Token
    return reply(503, { error: 'unavailable' });
  }
  await admin.from('mod_ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', token.id);
  return reply(202, { status: 'accepted', confirmed: false });
}
