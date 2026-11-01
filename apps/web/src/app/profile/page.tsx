import Link from 'next/link';
import { markNotificationsRead, revokeModToken, updateProfile } from '@/actions/account';
import { becomeStreamer } from '@/actions/streamers';
import { AvatarUpload } from '@/components/avatar-upload';
import { EventRow } from '@/components/event-bits';
import { Flash } from '@/components/flash';
import { ModTokenForm } from '@/components/mod-token-form';
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { requireViewer } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { formatDateTime } from '@/lib/time';
import { EVENT_SELECT, type EventItem } from '@/lib/types';
import { cn, first } from '@/lib/utils';

export const metadata = { title: 'Profil' };
type Notification = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
type Token = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await requireViewer('/profile');

  const [profileRes, streamerRes, favRes, notifRes, tokenRes, subsRes] = await Promise.all([
    supabase.from('profiles').select('username,avatar_url,bio,twitch_url,notify_new_events,notify_reminders,created_at').eq('id', viewer.id).maybeSingle(),
    supabase.from('streamer_profiles').select('id').eq('id', viewer.id).maybeSingle(),
    supabase.from('favorites').select(`created_at,event:events(${EVENT_SELECT})`).eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('notifications').select('id,title,body,link,read_at,created_at').eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(15),
    supabase.from('mod_ingest_tokens').select('id,label,created_at,last_used_at,revoked_at').eq('user_id', viewer.id).order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('plan,expires_at').eq('user_id', viewer.id).gt('expires_at', new Date().toISOString()),
  ]);
  const p = profileRes.data as { username: string; avatar_url: string | null; bio: string | null; twitch_url: string | null; notify_new_events: boolean; notify_reminders: boolean; created_at: string } | null;
  const favorites = ((favRes.data ?? []) as unknown as { event: EventItem | null }[]).map((f) => f.event).filter((e): e is EventItem => Boolean(e));
  const notifications = (notifRes.data ?? []) as Notification[];
  const tokens = (tokenRes.data ?? []) as Token[];
  const premium = (subsRes.data ?? []) as { plan: string; expires_at: string }[];
  const isStreamer = Boolean(streamerRes.data);
  const endpoint = `${siteUrl()}/api/integrations/minecraft/payment-events`;

  return (
    <div className="space-y-10">
      <PageHeader title="Profil" description={p ? `Mitglied seit ${formatDateTime(p.created_at, 'Europe/Berlin').split(',')[0]}` : undefined}>
        <div className="flex gap-2">{premium.map((s) => <Badge key={s.plan} tone="gold">{s.plan === 'streamer' ? 'Streamer-Premium' : 'Spieler-Premium'} bis {formatDateTime(s.expires_at, 'Europe/Berlin').split(',')[0]}</Badge>)}</div>
      </PageHeader>
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <section aria-labelledby="konto" className="panel max-w-2xl space-y-5 p-5">
        <h2 id="konto" className="text-xl font-semibold">Konto</h2>
        <AvatarUpload userId={viewer.id} username={p?.username ?? viewer.username} current={p?.avatar_url ?? null} />
        <form action={updateProfile} className="space-y-4">
          <div><label htmlFor="username" className="label">Benutzername</label><input id="username" name="username" defaultValue={p?.username} required pattern="[A-Za-z0-9_]{3,20}" className="field" /></div>
          <div><label htmlFor="bio" className="label">Über dich (optional)</label><textarea id="bio" name="bio" defaultValue={p?.bio ?? ''} maxLength={300} rows={3} className="field" /></div>
          <div><label htmlFor="twitch_url" className="label">Twitch-Link (optional)</label><input id="twitch_url" name="twitch_url" type="url" defaultValue={p?.twitch_url ?? ''} placeholder="https://www.twitch.tv/dein-kanal" className="field" /></div>
          <fieldset className="space-y-2"><legend className="label">Benachrichtigungen</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_new_events" defaultChecked={p?.notify_new_events ?? true} className="size-4 accent-[var(--primary)]" />Neue Events von Streamern, denen ich folge</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_reminders" defaultChecked={p?.notify_reminders ?? true} className="size-4 accent-[var(--primary)]" />Erinnerungen an ausgewählte Events</label>
          </fieldset>
          <Button type="submit">Speichern</Button>
        </form>
      </section>

      <section aria-labelledby="streamer-h" id="streamer" className="panel max-w-2xl p-5">
        <h2 id="streamer-h" className="text-xl font-semibold">Streamer</h2>
        {isStreamer ? (
          <p className="mt-2 text-sm text-muted">Du hast ein Streamer-Profil. <Link href={`/streamers/${viewer.id}`} className="link">Zum Profil, Verifizierung und Statistiken</Link></p>
        ) : (
          <form action={becomeStreamer} className="mt-3 space-y-4">
            <p className="text-sm text-muted">Mit einem Streamer-Profil veröffentlichst du Events (3 sind kostenlos), sammelst Rezensionen und kannst dich verifizieren lassen.</p>
            <div><label htmlFor="display_name" className="label">Anzeigename</label><input id="display_name" name="display_name" required minLength={2} maxLength={40} className="field" /></div>
            <div><label htmlFor="s_twitch_url" className="label">Twitch-Link</label><input id="s_twitch_url" name="twitch_url" type="url" required placeholder="https://www.twitch.tv/dein-kanal" className="field" /></div>
            <div><label htmlFor="s_description" className="label">Beschreibung (optional)</label><textarea id="s_description" name="description" maxLength={1000} rows={3} className="field" /></div>
            <Button type="submit">Streamer-Profil anlegen</Button>
          </form>
        )}
      </section>

      <section aria-labelledby="fav-h">
        <SectionTitle id="fav-h">Favoriten</SectionTitle>
        {favorites.length === 0 ? <EmptyState title="Noch keine Favoriten" hint="Öffne ein Event und merke es dir mit einem Klick." /> : <div className="space-y-2.5">{favorites.map((e) => <EventRow key={e.id} e={e} />)}</div>}
      </section>

      <section id="benachrichtigungen" aria-labelledby="notif-h">
        <div className="flex items-baseline justify-between"><SectionTitle id="notif-h">Benachrichtigungen</SectionTitle>
          {notifications.some((n) => !n.read_at) && <form action={markNotificationsRead}><Button type="submit" variant="ghost" size="sm">Alle als gelesen markieren</Button></form>}</div>
        {notifications.length === 0 ? <EmptyState title="Keine Benachrichtigungen" hint="Mit Premium folgst du Streamern und bekommst Hinweise zu neuen Events und Erinnerungen." /> : (
          <ul className="panel divide-y divide-line">{notifications.map((n) => (
            <li key={n.id} className="px-4 py-3 text-sm">
              {n.link ? <Link href={n.link} className={cn('hover:underline', !n.read_at && 'font-semibold')}>{n.title}</Link> : <span className={cn(!n.read_at && 'font-semibold')}>{n.title}</span>}
              {n.body && <p className="text-muted">{n.body}</p>}<p className="text-xs text-muted">{formatDateTime(n.created_at, 'Europe/Berlin')}</p>
            </li>))}</ul>
        )}
      </section>

      <section aria-labelledby="mod-h" className="panel max-w-2xl space-y-4 p-5">
        <h2 id="mod-h" className="text-xl font-semibold">Minecraft-Mod</h2>
        <p className="text-sm text-muted">Die optionale Fabric-Mod erkennt Zahlungsnachrichten im Chat und meldet sie als <strong className="text-foreground">unbestätigte Hinweise</strong>. Sie aktivieren niemals Premium: Ein Administrator prüft jede Zahlung. Das Token gehört nur dir; widerrufe es, wenn es in falsche Hände gerät.</p>
        <p className="text-sm text-muted">Adresse für die Mod-Konfiguration (backendUrl): <code className="break-all text-foreground">{endpoint}</code></p>
        <ModTokenForm />
        {tokens.length > 0 && (
          <ul className="divide-y divide-line text-sm">{tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{t.label}<span className="block text-xs text-muted">Erstellt {formatDateTime(t.created_at, 'Europe/Berlin')}{t.last_used_at ? `, zuletzt genutzt ${formatDateTime(t.last_used_at, 'Europe/Berlin')}` : ', noch nicht genutzt'}</span></span>
              {t.revoked_at ? <Badge>Widerrufen</Badge> : <form action={revokeModToken}><input type="hidden" name="token_id" value={t.id} /><Button type="submit" variant="danger" size="sm">Widerrufen</Button></form>}
            </li>))}</ul>
        )}
      </section>
    </div>
  );
}
