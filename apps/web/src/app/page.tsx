import Link from 'next/link';
import { CalendarDays, Crown, MessageCircle } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { EventRow } from '@/components/event-bits';
import { DataError, EmptyState, SectionTitle } from '@/components/page-bits';
import { StarRating } from '@/components/star-rating';
import { TwitchBanner } from '@/components/twitch-banner';
import { VerifiedBadge } from '@/components/verified-badge';
import { formatScore } from '@/lib/ranking';
import { createClient } from '@/lib/supabase/server';
import { effectiveStatus } from '@/lib/time';
import { EVENT_SELECT, type EventItem, type RankingRow } from '@/lib/types';

interface ReviewItem {
  id: string; rating: number; body: string; created_at: string;
  reviewer: { username: string } | null; streamer: { id: string; display_name: string } | null;
}

export default async function HomePage() {
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - 12 * 3_600_000).toISOString();
  const head = { count: 'exact' as const, head: true };

  const [events, top, reviews, upcoming, streamers, verified, reviewCount] = await Promise.all([
    supabase.from('events').select(EVENT_SELECT).is('hidden_at', null).gte('starts_at', since).order('starts_at').limit(12),
    supabase.from('streamer_rankings').select('streamer_id,display_name,avatar_url,is_verified,review_count,avg_rating,score,rank').not('score', 'is', null).order('rank').limit(5),
    supabase.from('reviews')
      .select('id,rating,body,created_at,reviewer:profiles!reviews_reviewer_id_fkey(username),streamer:streamer_profiles!reviews_streamer_id_fkey(id,display_name)')
      .eq('status', 'active').order('created_at', { ascending: false }).limit(4),
    supabase.from('events').select('id', head).is('hidden_at', null).gte('starts_at', now.toISOString()),
    supabase.from('streamer_profiles').select('id', head),
    supabase.from('streamer_profiles').select('id', head).eq('is_verified', true),
    supabase.from('reviews').select('id', head).eq('status', 'active'),
  ]);

  const failed = Boolean(events.error || top.error || reviews.error);
  const list = ((events.data ?? []) as unknown as EventItem[]).filter((e) => effectiveStatus(e, now) !== 'ended').slice(0, 8);
  const ranking = (top.data ?? []) as unknown as RankingRow[];
  const latest = (reviews.data ?? []) as unknown as ReviewItem[];
  const stats = [
    { label: 'Kommende Events', n: upcoming.count ?? 0 },
    { label: 'Streamer', n: streamers.count ?? 0 },
    { label: 'Davon verifiziert', n: verified.count ?? 0 },
    { label: 'Rezensionen', n: reviewCount.count ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <TwitchBanner />
      {failed && <DataError />}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="panel px-4 py-3">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="font-display text-3xl font-bold">{s.n.toLocaleString('de-DE')}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="events-heading">
          <div className="flex items-baseline justify-between">
            <SectionTitle id="events-heading">Live und als Nächstes</SectionTitle>
            <Link href="/events" className="link text-sm">Alle Events</Link>
          </div>
          {list.length === 0 ? (
            <EmptyState title="Gerade sind keine Events geplant" hint="Sobald ein Streamer ein Giveaway, einen Lootdrop oder ein Lootbox-Event veröffentlicht, erscheint es hier.">
              <Link href="/events/new" className="link text-sm">Selbst ein Event veröffentlichen</Link>
            </EmptyState>
          ) : (
            <div className="space-y-2.5">{list.map((e) => <EventRow key={e.id} e={e} now={now} />)}</div>
          )}
        </section>

        <div className="space-y-8">
          <section aria-labelledby="top-heading">
            <div className="flex items-baseline justify-between">
              <SectionTitle id="top-heading">Top-Streamer</SectionTitle>
              <Link href="/ranking" className="link text-sm">Zum Ranking</Link>
            </div>
            {ranking.length === 0 ? (
              <EmptyState title="Noch keine bewerteten Streamer" hint="Das Ranking entsteht aus den Rezensionen der Community." />
            ) : (
              <ol className="panel divide-y divide-line">
                {ranking.map((r) => (
                  <li key={r.streamer_id}>
                    <Link href={`/streamers/${r.streamer_id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-raised">
                      <span className="w-6 text-center font-display text-lg font-bold text-muted">{r.rank}</span>
                      <Avatar name={r.display_name} url={r.avatar_url} size={32} />
                      <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-medium">{r.display_name}{r.is_verified && <VerifiedBadge />}</span>
                      <span className="font-display text-lg font-bold">{formatScore(r.score)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="reviews-heading">
            <SectionTitle id="reviews-heading">Neueste Rezensionen</SectionTitle>
            {latest.length === 0 ? (
              <EmptyState title="Noch keine Rezensionen" hint="Bewerte einen Streamer auf seinem Profil." />
            ) : (
              <ul className="space-y-2.5">
                {latest.map((r) => (
                  <li key={r.id} className="panel p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/streamers/${r.streamer?.id ?? ''}`} className="truncate font-medium hover:underline">{r.streamer?.display_name ?? 'Streamer'}</Link>
                      <StarRating value={r.rating} size={14} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{r.body}</p>
                    <p className="mt-1 text-xs text-muted">von {r.reviewer?.username ?? 'Unbekannt'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <nav aria-label="Schnellzugriff" className="grid gap-3 md:grid-cols-3">
        {[
          { href: '/calendar', Icon: CalendarDays, title: 'Event-Kalender', text: 'Alle Termine des Monats auf einen Blick.' },
          { href: '/chat', Icon: MessageCircle, title: 'SMPEvents Chatall', text: 'Schreib in Echtzeit mit der Community.' },
          { href: '/premium', Icon: Crown, title: 'Premium', text: 'Erinnerungen, Folgen und erweiterte Filter.' },
        ].map(({ href, Icon, title, text }) => (
          <Link key={href} href={href} className="panel flex items-start gap-3 p-4 transition-colors hover:border-primary/60">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-badge" />
            <span><span className="block font-semibold">{title}</span><span className="text-sm text-muted">{text}</span></span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
