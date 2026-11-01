import Link from 'next/link';
import { Check } from 'lucide-react';
import { submitPayment } from '@/actions/premium';
import { Flash } from '@/components/flash';
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getViewer } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import { first } from '@/lib/utils';

export const metadata = { title: 'Premium' };

type Sub = { plan: 'streamer' | 'player'; starts_at: string; expires_at: string };
type Submission = { id: string; plan: string; claimed_amount_coins: number; status: 'pending' | 'approved' | 'rejected'; decision_note: string | null; created_at: string };
const STATUS = { pending: { label: 'In Prüfung', tone: 'blue' }, approved: { label: 'Bestätigt', tone: 'ok' }, rejected: { label: 'Abgelehnt', tone: 'danger' } } as const;
const PLAN_LABEL: Record<string, string> = { streamer: 'Streamer-Premium', player: 'Spieler-Premium' };
const coins = (n: number) => `${n.toLocaleString('de-DE')} WindSMP-Coins`;

export default async function PremiumPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await getViewer();

  const { data: rows } = await supabase.from('app_settings').select('key,value');
  const settings = new Map<string, unknown>((rows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const num = (k: string) => (typeof settings.get(k) === 'number' ? (settings.get(k) as number) : null);
  const str = (k: string) => { const v = settings.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null; };
  const price = { streamer: num('streamer_premium_price_coins'), player: num('player_premium_price_coins') };
  const days = { streamer: num('streamer_premium_days'), player: num('player_premium_days') };
  const freeLimit = num('free_events_per_streamer') ?? 3;
  const recipient = str('payment_recipient');
  const instructions = str('payment_instructions');

  let subs: Sub[] = [], submissions: Submission[] = [], isStreamer = false;
  if (viewer) {
    const [s, p, st] = await Promise.all([
      supabase.from('subscriptions').select('plan,starts_at,expires_at').eq('user_id', viewer.id).order('expires_at', { ascending: false }).limit(20),
      supabase.from('payment_submissions').select('id,plan,claimed_amount_coins,status,decision_note,created_at').eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('streamer_profiles').select('id').eq('id', viewer.id).maybeSingle(),
    ]);
    subs = (s.data ?? []) as Sub[];
    submissions = (p.data ?? []) as Submission[];
    isStreamer = Boolean(st.data);
  }
  const now = Date.now();
  const activeUntil = (plan: 'streamer' | 'player') =>
    subs.filter((x) => x.plan === plan && Date.parse(x.starts_at) <= now && Date.parse(x.expires_at) > now).map((x) => x.expires_at).sort().at(-1) ?? null;

  const plans = [
    { id: 'streamer' as const, title: 'Streamer-Premium', features: ['Unbegrenzt Events veröffentlichen', `Ohne Premium: ${freeLimit} kostenlose Events pro Streamer`, 'Veröffentlichte Events bleiben nach Ablauf bis zu ihrem Ende sichtbar'] },
    { id: 'player' as const, title: 'Spieler-Premium', features: ['Erweiterte Event-Filter (Belohnung, nur verifizierte Streamer)', 'Erweiterte Streamer-Statistiken', 'Unbegrenzt Favoriten (kostenlos: 10)', 'Erinnerungen an ausgewählte Events', 'Streamern folgen und bei neuen Events benachrichtigt werden'] },
  ];
  const payable = plans.filter((p) => price[p.id] !== null && (p.id === 'player' || isStreamer));

  return (
    <>
      <PageHeader title="Premium" description="Die Grundfunktionen bleiben kostenlos: Events ansehen, Kalender, Chatall, Rezensionen, Ranking und bis zu 10 Favoriten." />
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const until = activeUntil(p.id);
          return (
            <section key={p.id} aria-labelledby={`plan-${p.id}`} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 id={`plan-${p.id}`} className="text-2xl font-bold">{p.title}</h2>
                {until && <Badge tone="gold">Aktiv bis {formatDateTime(until, 'Europe/Berlin')}</Badge>}
              </div>
              <p className="mt-1 font-display text-lg text-badge">
                {price[p.id] !== null ? `${coins(price[p.id]!)}${days[p.id] ? ` für ${days[p.id]} Tage` : ''}` : 'Preis und Laufzeit werden noch festgelegt'}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />{f}</li>)}
              </ul>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="pay-heading" className="mt-10">
        <SectionTitle id="pay-heading">So bezahlst du</SectionTitle>
        <ol className="panel list-decimal space-y-2 p-5 pl-9 text-sm">
          <li>Zahle den Preis im Spiel in WindSMP-Coins{recipient ? <> an <strong className="text-foreground">{recipient}</strong></> : ' an den Zahlungsempfänger (wird noch festgelegt)'}.</li>
          <li>Reiche hier deinen Zahlungsnachweis ein: dein Minecraft-Name, den Betrag und optional eine Notiz.</li>
          <li>Ein Administrator prüft die Zahlung. Erst nach der Bestätigung startet oder verlängert sich dein Premium.</li>
        </ol>
        {instructions && <p className="mt-3 whitespace-pre-line text-sm text-muted">{instructions}</p>}
        <p className="mt-3 text-sm text-muted">Eine Chatnachricht oder ein Screenshot ist kein fälschungssicherer Beweis. Deshalb aktiviert nichts automatisch Premium, auch keine Meldungen der Minecraft-Mod: Jede Zahlung prüft ein Administrator von Hand.</p>

        {!viewer ? (
          <p className="mt-4 text-sm"><Link href="/login?next=%2Fpremium" className="link">Melde dich an</Link>, um einen Zahlungsnachweis einzureichen.</p>
        ) : !recipient ? (
          <div className="mt-4"><EmptyState title="Zahlungen sind noch nicht möglich" hint="Der Zahlungsempfänger wurde noch nicht festgelegt. Sobald er hinterlegt ist, erscheint hier das Formular." /></div>
        ) : payable.length === 0 ? (
          <div className="mt-4"><EmptyState title="Für dich ist gerade kein Plan buchbar" hint="Streamer-Premium setzt ein Streamer-Profil voraus, Spieler-Premium einen festgelegten Preis." /></div>
        ) : (
          <form action={submitPayment} className="panel mt-4 grid max-w-2xl gap-4 p-5 sm:grid-cols-2">
            <div><label htmlFor="plan" className="label">Plan</label>
              <select id="plan" name="plan" className="field">{payable.map((p) => <option key={p.id} value={p.id}>{p.title} ({coins(price[p.id]!)})</option>)}</select></div>
            <div><label htmlFor="claimed_amount_coins" className="label">Gezahlter Betrag in Coins</label><input id="claimed_amount_coins" name="claimed_amount_coins" type="number" min={1} step={1} required className="field" /></div>
            <div><label htmlFor="payer_ingame_name" className="label">Dein Minecraft-Name (Absender)</label><input id="payer_ingame_name" name="payer_ingame_name" required pattern="[A-Za-z0-9_]{3,16}" title="3 bis 16 Zeichen: Buchstaben, Zahlen, Unterstrich" className="field" /></div>
            <div><label htmlFor="note" className="label">Notiz (optional)</label><input id="note" name="note" maxLength={500} className="field" /></div>
            <div className="sm:col-span-2"><Button type="submit">Zahlungsnachweis einreichen</Button></div>
          </form>
        )}
      </section>

      {viewer && (
        <section aria-labelledby="hist-heading" className="mt-10">
          <SectionTitle id="hist-heading">Verlauf</SectionTitle>
          {submissions.length === 0 && subs.length === 0 ? <EmptyState title="Noch keine Zahlungen" /> : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="panel p-4"><h3 className="mb-2 font-semibold">Zahlungsnachweise</h3>
                <ul className="space-y-2 text-sm">{submissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2"><span>{PLAN_LABEL[s.plan]}, {coins(s.claimed_amount_coins)}<span className="block text-xs text-muted">{formatDateTime(s.created_at, 'Europe/Berlin')}{s.decision_note ? `, ${s.decision_note}` : ''}</span></span><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge></li>
                ))}</ul></div>
              <div className="panel p-4"><h3 className="mb-2 font-semibold">Laufzeiten</h3>
                <ul className="space-y-2 text-sm">{subs.map((s) => <li key={`${s.plan}${s.starts_at}`}>{PLAN_LABEL[s.plan]}<span className="block text-xs text-muted">{formatDateTime(s.starts_at, 'Europe/Berlin')} bis {formatDateTime(s.expires_at, 'Europe/Berlin')}</span></li>)}</ul></div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
