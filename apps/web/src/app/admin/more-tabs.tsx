import Link from 'next/link';
import { deleteChatMessage, muteUser, removeReview, restoreReview, revokePremium, revokeVerification, setUserRole } from '@/actions/admin';
import { EmptyState } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { when, type Db } from './shared';

const ROLE_LABEL = { user: 'Nutzer', moderator: 'Moderator', admin: 'Admin' } as const;
type Role = keyof typeof ROLE_LABEL;

export async function UsersTab({ db, q, isAdmin, selfId }: { db: Db; q: string; isAdmin: boolean; selfId: string }) {
  let query = db.from('profiles').select('id,username,role,created_at,chat_muted_until').order('created_at', { ascending: false }).limit(50);
  if (q) query = query.ilike('username', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data } = await query;
  const rows = (data ?? []) as { id: string; username: string; role: Role; created_at: string; chat_muted_until: string | null }[];
  const now = Date.now();
  return (
    <div className="space-y-4">
      <form method="get" className="panel flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="tab" value="users" />
        <div className="min-w-48 flex-1"><label htmlFor="q" className="label">Benutzername suchen</label><input id="q" name="q" defaultValue={q} maxLength={40} className="field" /></div>
        <Button type="submit">Suchen</Button>
      </form>
      <p className="text-sm text-muted">E-Mail-Adressen sehen Admins hier bewusst nicht (Datensparsamkeit). Rollen ändert nur ein Admin, nie für das eigene Konto; jede Änderung wird protokolliert.</p>
      {rows.length === 0 ? <EmptyState title="Keine Nutzer gefunden" /> : (
        <ul className="space-y-2.5">{rows.map((u) => {
          const muted = Boolean(u.chat_muted_until) && Date.parse(u.chat_muted_until as string) > now;
          const self = u.id === selfId;
          const canMute = !self && (isAdmin || u.role === 'user');
          return (
            <li key={u.id} className="panel space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.username}</span>
                <Badge tone={u.role === 'user' ? 'neutral' : 'blue'}>{ROLE_LABEL[u.role]}</Badge>
                {muted && <Badge tone="gold">Stumm bis {when(u.chat_muted_until as string)}</Badge>}
                <span className="text-xs text-muted">Mitglied seit {when(u.created_at)}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {canMute && (
                  <form action={muteUser} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="tab" value="users" /><input type="hidden" name="note" value="Moderation über das Admin-Dashboard" />
                    <select name="minutes" aria-label="Dauer" defaultValue="60" className="field w-auto"><option value="10">10 Min.</option><option value="60">1 Std.</option><option value="1440">1 Tag</option><option value="0">Aufheben</option></select>
                    <Button type="submit" variant="secondary" size="sm">Chat-Stummschaltung</Button>
                  </form>
                )}
                {isAdmin && !self && (
                  <form action={setUserRole} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="user_id" value={u.id} />
                    <select name="role" aria-label="Rolle" defaultValue={u.role} className="field w-auto"><option value="user">Nutzer</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select>
                    <input name="note" required minLength={3} maxLength={500} placeholder="Grund" aria-label="Grund" className="field w-48" />
                    <Button type="submit" variant="secondary" size="sm">Rolle ändern</Button>
                  </form>
                )}
              </div>
            </li>); })}</ul>)}
    </div>
  );
}

export async function StreamersTab({ db }: { db: Db }) {
  const { data } = await db.from('streamer_profiles').select('id,display_name,is_verified,verified_at,free_events_used,created_at').order('created_at', { ascending: false }).limit(60);
  const rows = (data ?? []) as { id: string; display_name: string; is_verified: boolean; verified_at: string | null; free_events_used: number; created_at: string }[];
  const premium = new Map<string, string>();
  if (rows.length > 0) {
    const { data: subs } = await db.from('subscriptions').select('user_id,expires_at').eq('plan', 'streamer').gt('expires_at', new Date().toISOString()).in('user_id', rows.map((r) => r.id));
    for (const s of (subs ?? []) as { user_id: string; expires_at: string }[]) {
      const current = premium.get(s.user_id);
      if (!current || s.expires_at > current) premium.set(s.user_id, s.expires_at);
    }
  }
  return rows.length === 0 ? <EmptyState title="Noch keine Streamer" /> : (
    <ul className="space-y-2.5">{rows.map((s) => (
      <li key={s.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <span className="min-w-0">
          <Link href={`/streamers/${s.id}`} className="inline-flex items-center gap-1 font-medium hover:underline">{s.display_name}{s.is_verified && <VerifiedBadge />}</Link>
          <span className="block text-sm text-muted">{s.free_events_used} kostenlose Events genutzt, {premium.has(s.id) ? `Premium bis ${when(premium.get(s.id) as string)}` : 'kein aktives Premium'}, angelegt {when(s.created_at)}</span>
        </span>
        {s.is_verified && (
          <form action={revokeVerification} className="flex gap-2"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="tab" value="streamers" />
            <input name="note" required minLength={3} maxLength={500} placeholder="Grund für den Entzug" aria-label="Grund" className="field w-56" /><Button type="submit" variant="danger" size="sm">Haken entziehen</Button></form>
        )}
      </li>))}</ul>
  );
}

export async function PremiumTab({ db }: { db: Db }) {
  const { data } = await db.from('subscriptions')
    .select('user_id,plan,starts_at,expires_at,user:profiles!subscriptions_user_id_fkey(username)')
    .gt('expires_at', new Date().toISOString()).order('expires_at').limit(200);
  const grouped = new Map<string, { user_id: string; plan: string; username: string; until: string }>();
  for (const s of (data ?? []) as unknown as { user_id: string; plan: string; expires_at: string; user: { username: string } | null }[]) {
    const key = `${s.user_id}:${s.plan}`;
    const cur = grouped.get(key);
    if (!cur || s.expires_at > cur.until) grouped.set(key, { user_id: s.user_id, plan: s.plan, username: s.user?.username ?? 'Unbekannt', until: s.expires_at });
  }
  const rows = [...grouped.values()];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Premium entsteht nur durch bestätigte Zahlungen (Tab Zahlungen). Hier beendest du laufende Laufzeiten, zum Beispiel nach einer Rückbuchung. Vorgemerkte, noch nicht begonnene Verlängerungen werden mit entfernt.</p>
      {rows.length === 0 ? <EmptyState title="Kein aktives Premium" /> : (
        <ul className="space-y-2.5">{rows.map((r) => (
          <li key={`${r.user_id}:${r.plan}`} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
            <span><span className="font-medium">{r.username}</span> <Badge tone="gold">{r.plan === 'streamer' ? 'Streamer-Premium' : 'Spieler-Premium'}</Badge><span className="block text-sm text-muted">aktiv bis {when(r.until)}</span></span>
            <form action={revokePremium} className="flex gap-2"><input type="hidden" name="user_id" value={r.user_id} /><input type="hidden" name="plan" value={r.plan} />
              <input name="note" required minLength={3} maxLength={500} placeholder="Grund (z. B. Rückbuchung)" aria-label="Grund" className="field w-56" /><Button type="submit" variant="danger" size="sm">Premium beenden</Button></form>
          </li>))}</ul>)}
    </div>
  );
}

export async function ReviewsTab({ db }: { db: Db }) {
  const { data } = await db.from('reviews')
    .select('id,rating,body,status,created_at,moderation_reason,reviewer:profiles!reviews_reviewer_id_fkey(username),streamer:streamer_profiles!reviews_streamer_id_fkey(id,display_name)')
    .order('created_at', { ascending: false }).limit(40);
  const rows = (data ?? []) as unknown as { id: string; rating: number; body: string; status: 'active' | 'removed'; created_at: string; moderation_reason: string | null; reviewer: { username: string } | null; streamer: { id: string; display_name: string } | null }[];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Entferne Rezensionen nur bei Regelverstößen (Beleidigung, Spam, Werbung, persönliche Daten, Fälschung), nie allein wegen einer schlechten Bewertung. Der Grund ist Pflicht und wird protokolliert.</p>
      {rows.length === 0 ? <EmptyState title="Noch keine Rezensionen" /> : (
        <ul className="space-y-2.5">{rows.map((r) => (
          <li key={r.id} className="panel space-y-2 p-3">
            <p className="text-sm"><Link href={`/streamers/${r.streamer?.id ?? ''}`} className="font-medium hover:underline">{r.streamer?.display_name}</Link> von {r.reviewer?.username ?? 'Unbekannt'}, {r.rating} von 5 Sternen, {when(r.created_at)} {r.status === 'removed' && <Badge tone="danger">Entfernt</Badge>}</p>
            <blockquote className="border-l-2 border-line pl-3">{r.body}</blockquote>
            {r.status === 'active' ? (
              <form action={removeReview} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="tab" value="reviews" />
                <input name="note" required minLength={3} maxLength={500} placeholder="Grund der Entfernung" aria-label="Grund" className="field w-64" /><Button type="submit" variant="danger" size="sm">Entfernen</Button></form>
            ) : (
              <form action={restoreReview} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="tab" value="reviews" />
                <span className="text-sm text-muted">Grund: {r.moderation_reason ?? 'ohne Angabe'}</span><Button type="submit" variant="secondary" size="sm">Wiederherstellen</Button></form>
            )}
          </li>))}</ul>)}
    </div>
  );
}

export async function ChatTab({ db }: { db: Db }) {
  const { data } = await db.from('chat_messages').select('id,user_id,body,created_at,author:profiles(username,role)').order('created_at', { ascending: false }).limit(40);
  const rows = (data ?? []) as unknown as { id: string; user_id: string; body: string; created_at: string; author: { username: string; role: Role } | null }[];
  return rows.length === 0 ? <EmptyState title="Noch keine Chatnachrichten" /> : (
    <ul className="space-y-2.5">{rows.map((m) => (
      <li key={m.id} className="panel space-y-2 p-3">
        <p className="text-sm text-muted"><span className="font-medium text-foreground">{m.author?.username ?? 'Unbekannt'}</span>, {when(m.created_at)}</p>
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <div className="flex flex-wrap gap-2">
          <form action={deleteChatMessage}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="tab" value="chat" /><Button type="submit" variant="danger" size="sm">Löschen</Button></form>
          {m.author?.role === 'user' && (
            <form action={muteUser} className="flex gap-2"><input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="tab" value="chat" /><input type="hidden" name="note" value="Chat-Moderation" />
              <select name="minutes" aria-label="Dauer" defaultValue="60" className="field w-auto"><option value="10">10 Min.</option><option value="60">1 Std.</option><option value="1440">1 Tag</option></select><Button type="submit" variant="secondary" size="sm">Stummschalten</Button></form>
          )}
        </div>
      </li>))}</ul>
  );
}
