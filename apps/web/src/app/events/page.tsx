import Link from 'next/link';
import { EventRow } from '@/components/event-bits';
import { DataError, EmptyState, PageHeader } from '@/components/page-bits';
import { Flash } from '@/components/flash';
import { Button, buttonVariants } from '@/components/ui/button';
import { getViewer } from '@/lib/auth';
import { effectiveStatus } from '@/lib/time';
import { CATEGORIES, CATEGORY_LABEL, EVENT_SELECT, type EventItem } from '@/lib/types';
import { cn, first } from '@/lib/utils';
import { idSchema } from '@/lib/validation';

export const metadata = { title: 'Events' };
const PAGE_SIZE = 20;
const clean = (v: string | undefined) => (v ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = clean(first(sp.q));
  const category = CATEGORIES.find((c) => c === first(sp.category));
  const streamerParam = first(sp.streamer);
  const streamer = idSchema.safeParse(streamerParam).success ? streamerParam : undefined;
  const whenRaw = first(sp.when);
  const when = whenRaw === 'past' || whenRaw === 'all' ? whenRaw : 'upcoming';
  const sort = first(sp.sort) === 'new' ? 'new' : 'start';
  const from = isDate(first(sp.from));
  const to = isDate(first(sp.to));
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const { supabase, viewer } = await getViewer();
  const premium = viewer ? Boolean((await supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'player' })).data) : false;
  const verifiedOnly = premium && first(sp.verified) === '1';
  const rewardQ = premium ? clean(first(sp.reward)) : '';

  const select = verifiedOnly ? EVENT_SELECT.replace('streamer_profiles(', 'streamer_profiles!inner(') : EVENT_SELECT;
  let query = supabase.from('events').select(select, { count: 'exact' }).is('hidden_at', null);
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  if (category) query = query.eq('category', category);
  if (streamer) query = query.eq('streamer_id', streamer);
  if (verifiedOnly) query = query.eq('streamer.is_verified', true);
  if (rewardQ) query = query.ilike('rewards', `%${rewardQ}%`);
  if (when === 'upcoming') query = query.gte('starts_at', new Date(Date.now() - 2 * 3_600_000).toISOString());
  if (when === 'past') query = query.lt('starts_at', new Date().toISOString());
  if (from) query = query.gte('starts_at', `${from}T00:00:00Z`);
  if (to) query = query.lte('starts_at', `${to}T23:59:59Z`);
  query = sort === 'new' ? query.order('created_at', { ascending: false }) : query.order('starts_at', { ascending: when === 'past' ? false : true });

  const [{ data, count, error }, { data: streamerOptions }] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from('streamer_profiles').select('id,display_name').order('display_name').limit(200),
  ]);

  const now = new Date();
  let events = (data ?? []) as unknown as EventItem[];
  if (when === 'upcoming') events = events.filter((e) => effectiveStatus(e, now) !== 'ended');

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) { const one = first(v); if (one && k !== 'page' && k !== 'error' && k !== 'ok') params.set(k, one); }
    params.set('page', String(p));
    return `/events?${params}`;
  };
  const lastPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Events" description="Giveaways, Lootdrops und Lootbox-Events auf WindSMP.">
        <Link href="/events/new" className={cn(buttonVariants())}>Event veröffentlichen</Link>
      </PageHeader>
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <form method="get" className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><label htmlFor="q" className="label">Suche</label><input id="q" name="q" defaultValue={q} placeholder="Titel oder Beschreibung" className="field" /></div>
        <div><label htmlFor="category" className="label">Event-Typ</label>
          <select id="category" name="category" defaultValue={category ?? ''} className="field">
            <option value="">Alle Typen</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select></div>
        <div><label htmlFor="streamer" className="label">Streamer</label>
          <select id="streamer" name="streamer" defaultValue={streamer ?? ''} className="field">
            <option value="">Alle Streamer</option>
            {(streamerOptions ?? []).map((s: { id: string; display_name: string }) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select></div>
        <div><label htmlFor="when" className="label">Zeitraum</label>
          <select id="when" name="when" defaultValue={when} className="field">
            <option value="upcoming">Kommende und laufende</option><option value="past">Vergangene</option><option value="all">Alle</option>
          </select></div>
        <div><label htmlFor="from" className="label">Ab Datum</label><input id="from" name="from" type="date" defaultValue={from} className="field" /></div>
        <div><label htmlFor="to" className="label">Bis Datum</label><input id="to" name="to" type="date" defaultValue={to} className="field" /></div>
        <div><label htmlFor="sort" className="label">Sortierung</label>
          <select id="sort" name="sort" defaultValue={sort} className="field"><option value="start">Nach Startzeit</option><option value="new">Zuletzt veröffentlicht</option></select></div>

        <fieldset className="sm:col-span-2 lg:col-span-4 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-medium text-gold">Erweiterte Filter mit Premium</legend>
          {premium ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="reward" className="label">Belohnung enthält</label><input id="reward" name="reward" defaultValue={rewardQ} placeholder="z. B. Netherite" className="field" /></div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="size-4 accent-[var(--primary)]" />Nur verifizierte Streamer</label>
            </div>
          ) : (
            <p className="text-sm text-muted">Filtere nach Belohnung und verifizierten Streamern. <Link href="/premium" className="link">Premium ansehen</Link></p>
          )}
        </fieldset>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Filter anwenden</Button>
          <Link href="/events" className={cn(buttonVariants({ variant: 'ghost' }))}>Zurücksetzen</Link>
        </div>
      </form>

      {error ? <DataError /> : events.length === 0 ? (
        <EmptyState title="Keine Events gefunden" hint="Ändere die Filter oder veröffentliche selbst ein Event." />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{count ?? events.length} Treffer</p>
          <div className="space-y-2.5">{events.map((e) => <EventRow key={e.id} e={e} now={now} />)}</div>
          {lastPage > 1 && (
            <nav aria-label="Seiten" className="mt-6 flex items-center justify-between text-sm">
              {page > 1 ? <Link href={pageHref(page - 1)} className="link">Vorherige Seite</Link> : <span />}
              <span className="text-muted">Seite {page} von {lastPage}</span>
              {page < lastPage ? <Link href={pageHref(page + 1)} className="link">Nächste Seite</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
