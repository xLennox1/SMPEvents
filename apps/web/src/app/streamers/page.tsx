import Link from 'next/link';
import { Avatar } from '@/components/avatar';
import { DataError, EmptyState, PageHeader } from '@/components/page-bits';
import { StarRating } from '@/components/star-rating';
import { Button, buttonVariants } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { formatScore } from '@/lib/ranking';
import { createClient } from '@/lib/supabase/server';
import type { RankingRow } from '@/lib/types';
import { cn, first } from '@/lib/utils';

export const metadata = { title: 'Streamer' };

export default async function StreamersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? '').replace(/[%_*\\,()]/g, ' ').trim().slice(0, 40);
  const verifiedOnly = first(sp.verified) === '1';
  const sort = ['rank', 'name', 'new', 'reviews'].includes(first(sp.sort) ?? '') ? first(sp.sort)! : 'rank';

  const supabase = await createClient();
  let query = supabase.from('streamer_rankings').select('streamer_id,display_name,avatar_url,is_verified,review_count,avg_rating,score,rank');
  if (q) query = query.ilike('display_name', `%${q}%`);
  if (verifiedOnly) query = query.eq('is_verified', true);
  query = sort === 'name' ? query.order('display_name')
    : sort === 'new' ? query.order('created_at', { ascending: false })
    : sort === 'reviews' ? query.order('review_count', { ascending: false })
    : query.order('rank', { ascending: true, nullsFirst: false });
  const { data, error } = await query.limit(60);
  const rows = (data ?? []) as unknown as RankingRow[];

  return (
    <>
      <PageHeader title="Streamer" description="Alle Streamer auf SMPEvents. Der blaue Haken zeigt, dass unser Prüfverfahren abgeschlossen ist." />
      <form method="get" className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label htmlFor="q" className="label">Name</label><input id="q" name="q" defaultValue={q} className="field" /></div>
        <div><label htmlFor="sort" className="label">Sortierung</label>
          <select id="sort" name="sort" defaultValue={sort} className="field">
            <option value="rank">Nach Rang</option><option value="name">Nach Name</option><option value="reviews">Meiste Rezensionen</option><option value="new">Neueste zuerst</option>
          </select></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="size-4 accent-[var(--primary)]" />Nur verifizierte</label>
        <Button type="submit">Anwenden</Button>
        <Link href="/streamers" className={cn(buttonVariants({ variant: 'ghost' }))}>Zurücksetzen</Link>
      </form>

      {error ? <DataError /> : rows.length === 0 ? (
        <EmptyState title="Keine Streamer gefunden" hint="Lege in deinem Profil ein Streamer-Profil an, um dich hier einzutragen." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.streamer_id}>
              <Link href={`/streamers/${r.streamer_id}`} className="panel flex h-full items-center gap-3 p-4 transition-colors hover:border-primary/60">
                <Avatar name={r.display_name} url={r.avatar_url} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-semibold">{r.display_name}{r.is_verified && <VerifiedBadge />}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted"><StarRating value={r.avg_rating} size={14} /><span>{r.review_count} Rezensionen</span></div>
                </div>
                <div className="text-right"><p className="font-display text-xl font-bold">{r.score === null ? '–' : formatScore(r.score)}</p><p className="text-xs text-muted">{r.score === null ? 'Noch nicht bewertet' : 'von 10'}</p></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
