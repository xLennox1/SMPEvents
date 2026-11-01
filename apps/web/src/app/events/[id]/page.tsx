import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Heart } from 'lucide-react';
import { clearReminder, deleteEvent, setEventStatus, setReminder, toggleFavorite } from '@/actions/events';
import { CategoryBadge, StatusPill } from '@/components/event-bits';
import { Flash } from '@/components/flash';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { getViewer } from '@/lib/auth';
import { DEFAULT_EVENT_DURATION_MS, effectiveStatus, formatDateTime } from '@/lib/time';
import { EVENT_SELECT, type EventItem } from '@/lib/types';
import { first } from '@/lib/utils';
import { idSchema } from '@/lib/validation';

type EventDetail = EventItem & { conditions: string | null; link_url: string | null; hidden_at: string | null; hidden_reason: string | null; streamer_id: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: idSchema.safeParse(id).success ? 'Event' : 'Event nicht gefunden' };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();

  const { supabase, viewer } = await getViewer();
  const { data } = await supabase.from('events').select(`${EVENT_SELECT},conditions,link_url,hidden_at,hidden_reason,streamer_id`).eq('id', id).maybeSingle();
  if (!data) notFound();
  const e = data as unknown as EventDetail;
  const status = effectiveStatus(e);
  const isOwner = viewer?.id === e.streamer_id;
  const isMod = viewer?.role === 'moderator' || viewer?.role === 'admin';
  const endsAt = e.ends_at ?? new Date(Date.parse(e.starts_at) + DEFAULT_EVENT_DURATION_MS).toISOString();

  let isFavorite = false, reminder: string | null = null, premium = false;
  if (viewer) {
    const [fav, rem, prem] = await Promise.all([
      supabase.from('favorites').select('event_id').eq('user_id', viewer.id).eq('event_id', id).maybeSingle(),
      supabase.from('event_reminders').select('remind_at').eq('user_id', viewer.id).eq('event_id', id).maybeSingle(),
      supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'player' }),
    ]);
    isFavorite = Boolean(fav.data);
    reminder = rem.data?.remind_at ?? null;
    premium = Boolean(prem.data);
  }
  const back = `/events/${id}`;

  return (
    <article className="mx-auto max-w-3xl">
      <Flash error={first(sp.error)} ok={first(sp.ok)} />
      {e.hidden_at && (
        <div role="status" className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          Dieses Event wurde von der Moderation ausgeblendet{e.hidden_reason ? `: ${e.hidden_reason}` : '.'} Nur du und die Moderation sehen es.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2"><CategoryBadge category={e.category} /><StatusPill status={status} /></div>
      <h1 className="mt-3 text-3xl font-bold md:text-4xl">{e.title}</h1>
      <p className="mt-2 flex items-center gap-1.5 text-muted">
        von <Link href={`/streamers/${e.streamer_id}`} className="font-medium text-foreground hover:underline">{e.streamer?.display_name ?? 'Unbekannt'}</Link>
        {e.streamer?.is_verified && <VerifiedBadge />}
      </p>

      <dl className="panel mt-6 grid gap-4 p-4 sm:grid-cols-3">
        <div><dt className="text-sm text-muted">Start</dt><dd className="font-medium">{formatDateTime(e.starts_at, e.timezone)}</dd></div>
        <div><dt className="text-sm text-muted">{e.ends_at ? 'Ende' : 'Voraussichtliches Ende'}</dt><dd className="font-medium">{formatDateTime(endsAt, e.timezone)}</dd></div>
        <div><dt className="text-sm text-muted">Zeitzone</dt><dd className="font-medium">{e.timezone}</dd></div>
      </dl>

      <section className="mt-6"><h2 className="text-xl font-semibold">Belohnungen</h2><p className="mt-1 whitespace-pre-line">{e.rewards}</p></section>
      {e.conditions && <section className="mt-6"><h2 className="text-xl font-semibold">Teilnahmebedingungen</h2><p className="mt-1 whitespace-pre-line">{e.conditions}</p></section>}
      <section className="mt-6"><h2 className="text-xl font-semibold">Beschreibung</h2><p className="mt-1 whitespace-pre-line text-muted">{e.description}</p></section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {e.link_url && <Button asChild><a href={e.link_url} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink aria-hidden />Zum Event-Link</a></Button>}
        {viewer ? (
          <form action={toggleFavorite}>
            <input type="hidden" name="event_id" value={id} /><input type="hidden" name="back" value={back} />
            <Button type="submit" variant="secondary" aria-pressed={isFavorite}><Heart aria-hidden className={isFavorite ? 'fill-primary text-primary' : ''} />{isFavorite ? 'Favorit entfernen' : 'Als Favorit merken'}</Button>
          </form>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(back)}`} className="link text-sm">Anmelden, um Favoriten zu speichern</Link>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Nimm nur an Events teil, deren Bedingungen du verstehst. Der blaue Haken garantiert nicht, dass ein Event seriös ist.</p>

      {viewer && status !== 'ended' && (
        <section className="panel mt-8 p-4">
          <h2 className="text-lg font-semibold">Erinnerung</h2>
          {premium ? (
            <>
              {reminder && <p className="mt-1 text-sm text-muted">Aktiv: Du wirst am {formatDateTime(reminder, 'Europe/Berlin')} erinnert.</p>}
              <form action={setReminder} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="event_id" value={id} />
                <div><label htmlFor="minutes" className="label">Erinnern vor Start</label>
                  <select id="minutes" name="minutes" className="field" defaultValue="60"><option value="15">15 Minuten</option><option value="60">1 Stunde</option><option value="1440">1 Tag</option></select></div>
                <Button type="submit" variant="secondary">{reminder ? 'Erinnerung ändern' : 'Erinnerung setzen'}</Button>
              </form>
              {reminder && <form action={clearReminder} className="mt-2"><input type="hidden" name="event_id" value={id} /><Button type="submit" variant="ghost" size="sm">Erinnerung entfernen</Button></form>}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Erinnerungen gehören zu Premium. <Link href="/premium" className="link">Mehr erfahren</Link></p>
          )}
        </section>
      )}

      {(isOwner || isMod) && (
        <section className="panel mt-8 p-4">
          <h2 className="text-lg font-semibold">Verwaltung</h2>
          {isOwner && (
            <form action={setEventStatus} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="event_id" value={id} />
              <div><label htmlFor="status" className="label">Status</label>
                <select id="status" name="status" defaultValue={e.status} className="field"><option value="scheduled">Geplant</option><option value="live">Live</option><option value="ended">Beendet</option></select></div>
              <Button type="submit" variant="secondary">Status speichern</Button>
            </form>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-danger">Event löschen</summary>
            <form action={deleteEvent} className="mt-2">
              <input type="hidden" name="event_id" value={id} />
              <p className="mb-2 text-sm text-muted">Das Löschen gibt kein kostenloses Event-Kontingent zurück.</p>
              <Button type="submit" variant="danger" size="sm">Endgültig löschen</Button>
            </form>
          </details>
          {isMod && !isOwner && <p className="mt-3 text-sm text-muted">Moderation: Ausblenden mit Begründung im <Link href="/admin?tab=events" className="link">Admin-Bereich</Link>.</p>}
        </section>
      )}
    </article>
  );
}
