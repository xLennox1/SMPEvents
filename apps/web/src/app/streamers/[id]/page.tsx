import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { deleteReview, reportReview, requestVerification, saveReview, toggleFollow, updateStreamer } from '@/actions/streamers';
import { Avatar } from '@/components/avatar';
import { EventRow } from '@/components/event-bits';
import { Flash } from '@/components/flash';
import { EmptyState, SectionTitle } from '@/components/page-bits';
import { StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { getViewer } from '@/lib/auth';
import { discordTicketUrl } from '@/lib/env';
import { formatScore } from '@/lib/ranking';
import { effectiveStatus, formatDateTime } from '@/lib/time';
import { CATEGORIES, CATEGORY_LABEL, EVENT_SELECT, type EventItem, type RankingRow } from '@/lib/types';
import { cn, first } from '@/lib/utils';
import { idSchema } from '@/lib/validation';

export const metadata = { title: 'Streamer-Profil' };

type OwnReview = { rating: number; body: string; status: string };
type VerificationInfo = { status: string; created_at: string; decision_note: string | null };

interface ReviewItem {
  id: string; rating: number; body: string; created_at: string; updated_at: string; reviewer_id: string;
  reviewer: { username: string; avatar_url: string | null } | null;
}

export default async function StreamerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();

  const { supabase, viewer } = await getViewer();
  const sortRaw = first(sp.sort);
  const sort = sortRaw === 'best' || sortRaw === 'worst' ? sortRaw : 'new';

  let reviewQuery = supabase.from('reviews')
    .select('id,rating,body,created_at,updated_at,reviewer_id,reviewer:profiles!reviews_reviewer_id_fkey(username,avatar_url)')
    .eq('streamer_id', id).eq('status', 'active');
  reviewQuery = sort === 'best' ? reviewQuery.order('rating', { ascending: false }).order('created_at', { ascending: false })
    : sort === 'worst' ? reviewQuery.order('rating', { ascending: true }).order('created_at', { ascending: false })
    : reviewQuery.order('created_at', { ascending: false });

  const [streamerRes, rankRes, eventsRes, reviewsRes, ratingsRes] = await Promise.all([
    supabase.from('streamer_profiles').select('id,display_name,description,twitch_url,is_verified,verified_at,free_events_used,created_at').eq('id', id).maybeSingle(),
    supabase.from('streamer_rankings').select('*').eq('streamer_id', id).maybeSingle(),
    supabase.from('events').select(EVENT_SELECT).eq('streamer_id', id).order('starts_at', { ascending: false }).limit(40),
    reviewQuery.limit(50),
    supabase.from('reviews').select('rating').eq('streamer_id', id).eq('status', 'active').limit(2000),
  ]);
  const s = streamerRes.data as { id: string; display_name: string; description: string | null; twitch_url: string; is_verified: boolean; verified_at: string | null; free_events_used: number; created_at: string } | null;
  if (!s) notFound();
  const rank = rankRes.data as unknown as RankingRow | null;
  const now = new Date();
  const events = (eventsRes.data ?? []) as unknown as EventItem[];
  const upcoming = events.filter((e) => effectiveStatus(e, now) !== 'ended').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => effectiveStatus(e, now) === 'ended');
  const reviews = (reviewsRes.data ?? []) as unknown as ReviewItem[];
  const ratings = (ratingsRes.data ?? []) as { rating: number }[];

  const isOwner = viewer?.id === id;
  let own: OwnReview | null = null;
  let following = false, playerPremium = false;
  let verification: VerificationInfo | null = null;
  let premiumUntil: string | null = null, freeLimit = 3;
  if (viewer) {
    const [ownRes, followRes, premRes] = await Promise.all([
      supabase.from('reviews').select('rating,body,status').eq('reviewer_id', viewer.id).eq('streamer_id', id).maybeSingle(),
      supabase.from('follows').select('streamer_id').eq('user_id', viewer.id).eq('streamer_id', id).maybeSingle(),
      supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'player' }),
    ]);
    own = ownRes.data as OwnReview | null;
    following = Boolean(followRes.data);
    playerPremium = Boolean(premRes.data);
    if (isOwner) {
      const [v, sub, lim] = await Promise.all([
        supabase.from('verification_requests').select('status,created_at,decision_note').eq('streamer_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('subscriptions').select('expires_at').eq('user_id', id).eq('plan', 'streamer').gt('expires_at', now.toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('app_settings').select('value').eq('key', 'free_events_per_streamer').maybeSingle(),
      ]);
      verification = v.data as VerificationInfo | null;
      premiumUntil = (sub.data as { expires_at: string } | null)?.expires_at ?? null;
      if (typeof lim.data?.value === 'number') freeLimit = lim.data.value;
    }
  }

  const ticket = discordTicketUrl();
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: ratings.filter((r) => r.rating === n).length }));
  const maxDist = Math.max(1, ...dist.map((d) => d.c));
  const byCategory = CATEGORIES.map((c) => ({ c, n: events.filter((e) => e.category === c).length }));
  const sortHref = (v: string) => `/streamers/${id}?sort=${v}#bewertungen`;

  return (
    <div className="space-y-8">
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <header className="panel flex flex-wrap items-center gap-5 p-5">
        <Avatar name={s.display_name} url={rank?.avatar_url} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold">{s.display_name}{s.is_verified && <VerifiedBadge className="[&_svg]:size-6" />}</h1>
          {s.description && <p className="mt-1 max-w-prose text-muted">{s.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary" size="sm"><a href={s.twitch_url} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink aria-hidden />Twitch-Kanal</a></Button>
            {viewer && !isOwner && (
              <form action={toggleFollow}>
                <input type="hidden" name="streamer_id" value={id} />
                <Button type="submit" variant="outline" size="sm">{following ? 'Nicht mehr folgen' : 'Folgen (Premium)'}</Button>
              </form>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-bold">{formatScore(rank?.score)}</p>
          {rank?.score != null && <p className="text-sm text-muted">von 10, Rang {rank.rank}</p>}
          <div className="mt-1 flex items-center justify-end gap-2 text-sm text-muted"><StarRating value={rank?.avg_rating ?? null} size={14} />{rank?.review_count ?? 0} Rezensionen</div>
        </div>
      </header>

      {rank?.score != null && (
        <details className="panel p-4 text-sm">
          <summary className="cursor-pointer font-medium">So entsteht diese Punktzahl</summary>
          <p className="mt-3 text-muted">
            R = {Number(rank.avg_rating).toFixed(2).replace('.', ',')} (Schnitt), v = {rank.review_count} (Rezensionen), C = {Number(rank.global_avg).toFixed(2).replace('.', ',')} (Gesamtschnitt), m = {rank.m}.
            Daraus folgt W = {Number(rank.weighted_rating).toFixed(3).replace('.', ',')} und eine Punktzahl von W · 2 = {formatScore(rank.score)}. Mehr dazu im <Link href="/ranking" className="link">Ranking</Link>.
          </p>
        </details>
      )}

      {isOwner && (
        <section aria-labelledby="owner-heading" className="panel space-y-5 p-5">
          <h2 id="owner-heading" className="text-xl font-semibold">Dein Streamer-Konto</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {premiumUntil ? <Badge tone="gold">Premium bis {formatDateTime(premiumUntil, 'Europe/Berlin')}</Badge> : <Badge tone="blue">{Math.max(0, freeLimit - s.free_events_used)} von {freeLimit} kostenlosen Events übrig</Badge>}
            <Link href="/events/new" className="link">Event veröffentlichen</Link>
            <Link href="/premium" className="link">Premium verwalten</Link>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Verifizierung</h3>
            {s.is_verified ? (
              <p className="mt-1 text-sm text-muted">Du bist verifiziert{s.verified_at ? ` (seit ${formatDateTime(s.verified_at, 'Europe/Berlin')})` : ''}. Wenn du deinen Twitch-Kanal änderst, entfällt der Haken und du musst erneut verifiziert werden.</p>
            ) : verification?.status === 'pending' ? (
              <div className="mt-1 space-y-2 text-sm text-muted">
                <p>Dein Antrag vom {formatDateTime(verification.created_at, 'Europe/Berlin')} wartet auf die Prüfung. Eröffne außerdem das Ticket auf unserem Discord. Das Ticket allein verifiziert dich nicht, ein Administrator entscheidet.</p>
                {ticket ? <Button asChild size="sm"><a href={ticket} target="_blank" rel="noopener noreferrer">Discord-Ticket öffnen</a></Button> : <p>Der Ticket-Link ist noch nicht eingerichtet.</p>}
              </div>
            ) : (
              <form action={requestVerification} className="mt-2 space-y-3 text-sm">
                {verification?.status === 'rejected' && <p className="text-danger">Dein letzter Antrag wurde abgelehnt{verification.decision_note ? `: ${verification.decision_note}` : '.'}</p>}
                <p className="text-muted">So läuft es ab: Du stellst hier den Antrag, eröffnest ein Ticket auf unserem Discord, und ein Administrator prüft beides. Der Haken bestätigt den Abschluss dieses Verfahrens und garantiert nicht, dass jedes deiner Events seriös ist.</p>
                <div><label htmlFor="note" className="label">Dein Discord-Name (für das Ticket)</label><input id="note" name="note" maxLength={100} className="field max-w-sm" /></div>
                <Button type="submit">Verifizierung beantragen</Button>
              </form>
            )}
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-medium">Profil bearbeiten</summary>
            <form action={updateStreamer} className="mt-3 max-w-xl space-y-3">
              <div><label htmlFor="display_name" className="label">Anzeigename</label><input id="display_name" name="display_name" defaultValue={s.display_name} required minLength={2} maxLength={40} className="field" /></div>
              <div><label htmlFor="description" className="label">Beschreibung</label><textarea id="description" name="description" defaultValue={s.description ?? ''} maxLength={1000} rows={3} className="field" /></div>
              <div><label htmlFor="twitch_url" className="label">Twitch-Link</label><input id="twitch_url" name="twitch_url" type="url" defaultValue={s.twitch_url} required className="field" /></div>
              <Button type="submit" variant="secondary">Speichern</Button>
            </form>
          </details>
        </section>
      )}

      {(playerPremium || isOwner) && (
        <section aria-labelledby="stats-heading" className="panel p-5">
          <h2 id="stats-heading" className="text-xl font-semibold">Erweiterte Statistiken <Badge tone="gold" className="ml-1 align-middle">Premium</Badge></h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted">Verteilung der Bewertungen</h3>
              <ul className="space-y-1.5 text-sm">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2"><span className="w-14">{d.n} Sterne</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-primary" style={{ width: `${(d.c / maxDist) * 100}%` }} /></span>
                    <span className="w-8 text-right text-muted">{d.c}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted">Events nach Typ</h3>
              <ul className="space-y-1.5 text-sm">{byCategory.map((c) => <li key={c.c} className="flex justify-between"><span>{CATEGORY_LABEL[c.c]}</span><span className="text-muted">{c.n}</span></li>)}</ul>
              <p className="mt-3 text-sm text-muted">{upcoming.length} kommend, {past.length} vergangen</p>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="up-heading">
        <SectionTitle id="up-heading">Kommende und laufende Events</SectionTitle>
        {upcoming.length === 0 ? <EmptyState title="Keine kommenden Events" /> : <div className="space-y-2.5">{upcoming.map((e) => <EventRow key={e.id} e={e} now={now} />)}</div>}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-heading">
          <SectionTitle id="past-heading">Vergangene Events</SectionTitle>
          <div className="space-y-2.5">{past.slice(0, 10).map((e) => <EventRow key={e.id} e={e} now={now} />)}</div>
        </section>
      )}

      <section aria-labelledby="bewertungen">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle id="bewertungen">Rezensionen</SectionTitle>
          <nav aria-label="Sortierung" className="flex gap-3 text-sm">
            {([['new', 'Neueste'], ['best', 'Beste'], ['worst', 'Schlechteste']] as const).map(([v, l]) => <Link key={v} href={sortHref(v)} aria-current={sort === v ? 'true' : undefined} className={cn('link', sort === v && 'font-semibold')}>{l}</Link>)}
          </nav>
        </div>

        {!viewer ? (
          <p className="panel mb-4 p-4 text-sm text-muted"><Link href={`/login?next=${encodeURIComponent(`/streamers/${id}`)}`} className="link">Melde dich an</Link>, um diesen Streamer zu bewerten.</p>
        ) : isOwner ? (
          <p className="panel mb-4 p-4 text-sm text-muted">Du kannst dich nicht selbst bewerten.</p>
        ) : own?.status === 'removed' ? (
          <p className="panel mb-4 p-4 text-sm text-muted">Deine Rezension wurde von der Moderation entfernt und lässt sich nicht erneut abgeben.</p>
        ) : (
          <form action={saveReview} className="panel mb-5 space-y-3 p-4">
            <input type="hidden" name="streamer_id" value={id} />
            <h3 className="font-semibold">{own ? 'Deine Rezension ändern' : 'Rezension schreiben'}</h3>
            <div className="flex flex-wrap gap-3">
              <div><label htmlFor="rating" className="label">Bewertung</label>
                <select id="rating" name="rating" defaultValue={own?.rating ?? 5} className="field w-auto">
                  <option value="5">5 Sterne, hervorragend</option><option value="4">4 Sterne, gut</option><option value="3">3 Sterne, in Ordnung</option><option value="2">2 Sterne, schwach</option><option value="1">1 Stern, schlecht</option>
                </select></div>
            </div>
            <div><label htmlFor="body" className="label">Deine Erfahrung (3 bis 1000 Zeichen)</label><textarea id="body" name="body" required minLength={3} maxLength={1000} rows={3} defaultValue={own?.body ?? ''} className="field" /></div>
            <Button type="submit">{own ? 'Rezension aktualisieren' : 'Rezension speichern'}</Button>
          </form>
        )}
        {own && own.status === 'active' && !isOwner && (
          <form action={deleteReview} className="-mt-2 mb-5"><input type="hidden" name="streamer_id" value={id} /><Button type="submit" variant="ghost" size="sm">Meine Rezension löschen</Button></form>
        )}

        {reviews.length === 0 ? <EmptyState title="Noch keine Rezensionen" hint="Sei der Erste und teile deine Erfahrung." /> : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={r.reviewer?.username ?? '?'} url={r.reviewer?.avatar_url} size={28} />
                  <span className="font-medium">{r.reviewer?.username ?? 'Unbekannt'}</span>
                  <StarRating value={r.rating} size={14} />
                  <span className="text-xs text-muted">{formatDateTime(r.created_at, 'Europe/Berlin')}{r.updated_at !== r.created_at ? ' (bearbeitet)' : ''}</span>
                </div>
                <p className="mt-2 whitespace-pre-line">{r.body}</p>
                {viewer && viewer.id !== r.reviewer_id && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted">Melden</summary>
                    <form action={reportReview} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="review_id" value={r.id} /><input type="hidden" name="streamer_id" value={id} />
                      <input name="reason" required minLength={3} maxLength={300} placeholder="Warum verstößt die Rezension gegen die Regeln?" aria-label="Grund der Meldung" className="field max-w-md flex-1" />
                      <Button type="submit" variant="secondary" size="sm">Absenden</Button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Rezensionen werden nur bei Regelverstößen entfernt, nicht weil sie negativ sind.</p>
      </section>
    </div>
  );
}
