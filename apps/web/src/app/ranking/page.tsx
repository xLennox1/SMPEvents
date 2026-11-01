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

export const metadata = { title: 'Streamer-Ranking' };

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? '').replace(/[%_*\\,()]/g, ' ').trim().slice(0, 40);
  const verifiedOnly = first(sp.verified) === '1';
  const sort = first(sp.sort) === 'reviews' ? 'reviews' : first(sp.sort) === 'stars' ? 'stars' : 'score';

  const supabase = await createClient();
  let query = supabase.from('streamer_rankings').select('*');
  if (q) query = query.ilike('display_name', `%${q}%`);
  if (verifiedOnly) query = query.eq('is_verified', true);
  query = sort === 'reviews' ? query.order('review_count', { ascending: false })
    : sort === 'stars' ? query.order('avg_rating', { ascending: false, nullsFirst: false })
    : query.order('rank', { ascending: true, nullsFirst: false }).order('display_name');
  const { data, error } = await query.limit(100);
  const rows = (data ?? []) as unknown as RankingRow[];
  const sample = rows[0];

  return (
    <>
      <PageHeader title="Streamer-Ranking" description="Die Punktzahl entsteht aus den Community-Rezensionen und berücksichtigt, wie viele Bewertungen ein Streamer hat." />
      <form method="get" className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label htmlFor="q" className="label">Streamer suchen</label><input id="q" name="q" defaultValue={q} className="field" /></div>
        <div><label htmlFor="sort" className="label">Sortierung</label>
          <select id="sort" name="sort" defaultValue={sort} className="field"><option value="score">Nach Punktzahl</option><option value="stars">Nach Sternen</option><option value="reviews">Nach Anzahl Rezensionen</option></select></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="size-4 accent-[var(--primary)]" />Nur verifizierte</label>
        <Button type="submit">Anwenden</Button>
        <Link href="/ranking" className={cn(buttonVariants({ variant: 'ghost' }))}>Zurücksetzen</Link>
      </form>

      {error ? <DataError /> : rows.length === 0 ? (
        <EmptyState title="Keine Streamer gefunden" hint="Das Ranking erscheint, sobald Streamer Rezensionen erhalten." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Streamer-Ranking nach Punktzahl</caption>
            <thead className="border-b border-line text-muted">
              <tr><th scope="col" className="px-3 py-2.5 font-medium">Rang</th><th scope="col" className="px-3 py-2.5 font-medium">Streamer</th><th scope="col" className="px-3 py-2.5 font-medium">Punktzahl</th><th scope="col" className="px-3 py-2.5 font-medium">Sterne</th><th scope="col" className="px-3 py-2.5 font-medium">Rezensionen</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.streamer_id} className="hover:bg-raised">
                  <td className="px-3 py-2.5 font-display text-lg font-bold text-muted">{r.rank ?? '–'}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/streamers/${r.streamer_id}`} className="flex items-center gap-3 font-medium hover:underline">
                      <Avatar name={r.display_name} url={r.avatar_url} size={32} />
                      <span className="flex items-center gap-1">{r.display_name}{r.is_verified && <VerifiedBadge />}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-display text-lg font-bold">{r.score === null ? <span className="text-sm font-normal text-muted">Noch nicht bewertet</span> : <>{formatScore(r.score)}<span className="text-xs font-normal text-muted"> / 10</span></>}</td>
                  <td className="px-3 py-2.5">{r.avg_rating === null ? <span className="text-muted">–</span> : <span className="inline-flex items-center gap-2"><StarRating value={r.avg_rating} size={14} />{Number(r.avg_rating).toFixed(1).replace('.', ',')}</span>}</td>
                  <td className="px-3 py-2.5">{r.review_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="panel mt-6 p-4 text-sm">
        <summary className="cursor-pointer font-medium">So wird gerechnet</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>Punktzahl = gewichteter Sterne-Wert W mal 2, auf eine Nachkommastelle gerundet.</p>
          <p className="font-mono text-foreground">W = v / (v + m) · R + m / (v + m) · C</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>R: durchschnittliche Sternebewertung des Streamers</li>
            <li>v: Anzahl seiner aktiven Rezensionen</li>
            <li>C: Durchschnitt aller aktiven Rezensionen{sample ? ` (aktuell ${Number(sample.global_avg).toFixed(2).replace('.', ',')})` : ''}</li>
            <li>m: Mindestgewichtung{sample ? ` (aktuell ${sample.m})` : ''}. Je kleiner v gegenüber m ist, desto näher liegt die Punktzahl am Gesamtdurchschnitt.</li>
          </ul>
          <p>Fünf Sterne ergeben also höchstens 10,0 Punkte, ein Stern mindestens 2,0. Streamer ohne Rezensionen werden nicht eingestuft. Die Punktzahl lässt sich nicht direkt bearbeiten.</p>
        </div>
      </details>
    </>
  );
}
