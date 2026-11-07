import Link from 'next/link';
import { buyItem, stopSupporting, supportCreator } from '@/actions/rewards';
import { Flash } from '@/components/flash';
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { getViewer } from '@/lib/auth';
import { discordServerUrl } from '@/lib/env';
import { formatDateTime } from '@/lib/time';
import { cn, first } from '@/lib/utils';

export const metadata = { title: 'Shop' };

type Item = { id: string; name: string; description: string | null; price_points: number; stock: number | null; max_per_user: number | null };
type Order = { id: string; item_name: string; price_points: number; status: 'open' | 'delivered' | 'cancelled'; created_at: string };
const ORDER_STATUS = { open: { label: 'Wird bearbeitet', tone: 'blue' }, delivered: { label: 'Geliefert', tone: 'ok' }, cancelled: { label: 'Storniert', tone: 'danger' } } as const;
const points = (n: number) => `${n.toLocaleString('de-DE')} Punkte`;

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await getViewer();
  const [itemsRes, settingsRes] = await Promise.all([
    supabase.from('shop_items').select('id,name,description,price_points,stock,max_per_user').eq('active', true).order('sort_order').order('price_points'),
    supabase.from('app_settings').select('key,value').in('key', ['points_per_review', 'points_review_min_length', 'points_review_daily_cap', 'creator_commission_percent']),
  ]);
  const items = (itemsRes.data ?? []) as Item[];
  const cfg = new Map<string, unknown>((settingsRes.data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const num = (k: string, d: number) => (typeof cfg.get(k) === 'number' ? (cfg.get(k) as number) : d);

  let balance = 0, linkedName: string | null = null, orders: Order[] = [];
  let supporting: { code: string; creator: string } | null = null;
  if (viewer) {
    const [b, l, s, o] = await Promise.all([
      supabase.from('point_balances').select('balance').eq('user_id', viewer.id).maybeSingle(),
      supabase.from('minecraft_links').select('minecraft_name').eq('user_id', viewer.id).maybeSingle(),
      supabase.from('creator_supporters').select('creator:creator_codes(code,streamer:streamer_profiles(display_name))').eq('user_id', viewer.id).maybeSingle(),
      supabase.from('shop_orders').select('id,item_name,price_points,status,created_at').eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(10),
    ]);
    balance = Number((b.data as { balance: number } | null)?.balance ?? 0);
    linkedName = (l.data as { minecraft_name: string } | null)?.minecraft_name ?? null;
    const sup = s.data as unknown as { creator: { code: string; streamer: { display_name: string } | null } | null } | null;
    supporting = sup?.creator ? { code: sup.creator.code, creator: sup.creator.streamer?.display_name ?? '' } : null;
    orders = (o.data ?? []) as Order[];
  }
  const discord = discordServerUrl();

  return (
    <div className="space-y-8">
      <PageHeader title="Shop" description="Tausche Punkte gegen Items im Spiel. Punkte bekommst du zum Beispiel für Rezensionen.">
        {discord && <a href={discord} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary' }))}>Zum Discord</a>}
      </PageHeader>
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-5" aria-labelledby="pts-h">
          <h2 id="pts-h" className="text-lg font-semibold">Deine Punkte</h2>
          {viewer ? (
            <>
              <p className="mt-1 font-display text-4xl font-bold">{balance.toLocaleString('de-DE')}</p>
              <p className="mt-2 text-sm text-muted">
                {linkedName ? <>Lieferung an <strong className="text-foreground">{linkedName}</strong></> : <>Zum Kaufen brauchst du ein verknüpftes Minecraft-Konto. <Link href="/profile#minecraft" className="link">Jetzt verknüpfen</Link></>}
              </p>
            </>
          ) : <p className="mt-2 text-sm text-muted"><Link href="/login?next=%2Fshop" className="link">Melde dich an</Link>, um Punkte zu sammeln und einzukaufen.</p>}
        </section>

        <section className="panel p-5" aria-labelledby="earn-h">
          <h2 id="earn-h" className="text-lg font-semibold">So bekommst du Punkte</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>Rezension schreiben: {points(num('points_per_review', 10))} für die erste Rezension je Streamer (ab {num('points_review_min_length', 20)} Zeichen, höchstens {num('points_review_daily_cap', 3)} pro Tag).</li>
            <li>Wird eine Rezension wegen eines Regelverstoßes entfernt, verfallen ihre Punkte.</li>
            <li>Streamer mit blauem Haken bekommen zusätzlich Bonuspunkte, wenn ihre Unterstützer mit ihrem Creator-Code einkaufen.</li>
          </ul>
        </section>

        <section className="panel p-5" aria-labelledby="cc-h">
          <h2 id="cc-h" className="text-lg font-semibold">Creator unterstützen</h2>
          {supporting ? (
            <div className="mt-2 space-y-2 text-sm">
              <p>Du unterstützt <strong>{supporting.creator}</strong> mit dem Code <code className="text-foreground">{supporting.code}</code>. Bei deinen Käufen bekommt der Creator {num('creator_commission_percent', 10)} % der ausgegebenen Punkte als Bonus, dir kostet das nichts extra.</p>
              <form action={stopSupporting}><input type="hidden" name="back" value="/shop" /><Button type="submit" variant="ghost" size="sm">Nicht mehr unterstützen</Button></form>
            </div>
          ) : viewer ? (
            <form action={supportCreator} className="mt-2 flex gap-2"><input type="hidden" name="back" value="/shop" />
              <input name="code" aria-label="Creator-Code" placeholder="Creator-Code" maxLength={20} className="field uppercase" />
              <Button type="submit" variant="secondary">Einlösen</Button></form>
          ) : <p className="mt-2 text-sm text-muted">Nach der Anmeldung kannst du hier den Code deines Lieblings-Streamers eintragen.</p>}
          <p className="mt-2 text-xs text-muted"><Link href="/creator" className="link">Alle Creator-Codes ansehen</Link></p>
        </section>
      </div>

      <section aria-labelledby="items-h">
        <SectionTitle id="items-h">Artikel</SectionTitle>
        {items.length === 0 ? (
          <EmptyState title="Noch keine Artikel im Shop" hint="Sobald die Betreiber Artikel eintragen, erscheinen sie hier." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => {
              const soldOut = it.stock !== null && it.stock <= 0;
              const tooFew = viewer ? balance < it.price_points : false;
              return (
                <li key={it.id} className="panel flex flex-col p-4">
                  <h3 className="text-lg font-semibold">{it.name}</h3>
                  {it.description && <p className="mt-1 text-sm text-muted">{it.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="blue">{points(it.price_points)}</Badge>
                    {it.stock !== null && <Badge tone={soldOut ? 'danger' : 'neutral'}>{soldOut ? 'Ausverkauft' : `Noch ${it.stock}`}</Badge>}
                    {it.max_per_user !== null && <Badge>Max. {it.max_per_user} je Spieler</Badge>}</div>
                  <div className="mt-auto pt-4">
                    {!viewer ? <Link href="/login?next=%2Fshop" className="link text-sm">Anmelden zum Kaufen</Link> : (
                      <form action={buyItem}><input type="hidden" name="item_id" value={it.id} />
                        <Button type="submit" disabled={soldOut || tooFew || !linkedName} className="w-full">{soldOut ? 'Ausverkauft' : !linkedName ? 'Minecraft-Konto verknüpfen' : tooFew ? 'Zu wenige Punkte' : 'Kaufen'}</Button></form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Items werden von Hand im Spiel an deinen verknüpften Minecraft-Namen übergeben. Den Stand siehst du unten; bei Problemen hilft das Team im Discord.</p>
      </section>

      {viewer && orders.length > 0 && (
        <section aria-labelledby="orders-h">
          <SectionTitle id="orders-h">Deine Bestellungen</SectionTitle>
          <ul className="panel divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>{o.item_name}<span className="block text-xs text-muted">{points(o.price_points)}, {formatDateTime(o.created_at, 'Europe/Berlin')}</span></span>
                <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
              </li>))}
          </ul>
        </section>
      )}
    </div>
  );
}
