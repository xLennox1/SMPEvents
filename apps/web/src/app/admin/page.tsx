import Link from 'next/link';
import {
  approvePayment, approveVerification, deleteChatMessage, dismissReport, hideEvent, muteUser,
  rejectPayment, rejectVerification, removeReview, revokeVerification, unhideEvent,
} from '@/actions/admin';
import { Flash } from '@/components/flash';
import { EmptyState, PageHeader } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth';
import { cn, first } from '@/lib/utils';
import { ChatTab, PremiumTab, ReviewsTab, StreamersTab, UsersTab } from './more-tabs';
import { when, type Db } from './shared';

export const metadata = { title: 'Admin' };
const TABS = [
  { id: 'verifications', label: 'Verifizierung', admin: true },
  { id: 'payments', label: 'Zahlungen', admin: true },
  { id: 'hints', label: 'Mod-Hinweise', admin: true },
  { id: 'premium', label: 'Premium', admin: true },
  { id: 'users', label: 'Nutzer', admin: false },
  { id: 'streamers', label: 'Streamer', admin: true },
  { id: 'reports', label: 'Meldungen', admin: false },
  { id: 'reviews', label: 'Rezensionen', admin: false },
  { id: 'chat', label: 'Chat', admin: false },
  { id: 'events', label: 'Events', admin: false },
  { id: 'audit', label: 'Protokoll', admin: true },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await requireRole('moderator');
  const tabs = TABS.filter((t) => viewer.role === 'admin' || !t.admin);
  const tab = tabs.find((t) => t.id === first(sp.tab))?.id ?? tabs[0].id;

  return (
    <>
      <PageHeader title="Admin-Bereich" description={viewer.role === 'admin' ? 'Nutzer, Streamer, Verifizierung, Zahlungen, Premium und Moderation. Jede Aktion wird mit deinem Namen protokolliert.' : 'Moderation: Nutzer (Stummschaltung), Meldungen, Rezensionen, Chat und Events. Jede Aktion wird protokolliert.'} />
      <Flash error={first(sp.error)} ok={first(sp.ok)} />
      <nav aria-label="Admin-Bereiche" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => <Link key={t.id} href={`/admin?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined} className={cn('rounded-md border px-3 py-1.5 text-sm', tab === t.id ? 'border-primary bg-primary/15' : 'border-line hover:bg-raised')}>{t.label}</Link>)}
      </nav>
      {tab === 'verifications' && <VerificationsTab db={supabase} />}
      {tab === 'premium' && <PremiumTab db={supabase} />}
      {tab === 'users' && <UsersTab db={supabase} q={(first(sp.q) ?? '').trim().slice(0, 40)} isAdmin={viewer.role === 'admin'} selfId={viewer.id} />}
      {tab === 'streamers' && <StreamersTab db={supabase} />}
      {tab === 'reviews' && <ReviewsTab db={supabase} />}
      {tab === 'chat' && <ChatTab db={supabase} />}
      {tab === 'payments' && <PaymentsTab db={supabase} />}
      {tab === 'hints' && <HintsTab db={supabase} />}
      {tab === 'reports' && <ReportsTab db={supabase} />}
      {tab === 'events' && <EventsTab db={supabase} />}
      {tab === 'audit' && <AuditTab db={supabase} />}
    </>
  );
}

async function VerificationsTab({ db }: { db: Db }) {
  const [pending, verified] = await Promise.all([
    db.from('verification_requests').select('id,note,created_at,streamer:streamer_profiles(id,display_name,twitch_url)').eq('status', 'pending').order('created_at'),
    db.from('streamer_profiles').select('id,display_name,verified_at').eq('is_verified', true).order('verified_at', { ascending: false }).limit(50),
  ]);
  const reqs = (pending.data ?? []) as unknown as { id: string; note: string | null; created_at: string; streamer: { id: string; display_name: string; twitch_url: string } | null }[];
  const vs = (verified.data ?? []) as { id: string; display_name: string; verified_at: string | null }[];
  return (
    <div className="space-y-8">
      <section aria-labelledby="v-pending"><h2 id="v-pending" className="mb-3 text-xl font-semibold">Offene Anträge ({reqs.length})</h2>
        {reqs.length === 0 ? <EmptyState title="Keine offenen Anträge" /> : (
          <ul className="space-y-3">{reqs.map((r) => (
            <li key={r.id} className="panel p-4">
              <p className="font-medium"><Link href={`/streamers/${r.streamer?.id ?? ''}`} className="hover:underline">{r.streamer?.display_name}</Link></p>
              <p className="text-sm text-muted">Twitch: {r.streamer && <a href={r.streamer.twitch_url} target="_blank" rel="noopener noreferrer nofollow" className="link">{r.streamer.twitch_url}</a>}<br />Discord-Name für das Ticket: {r.note ?? 'nicht angegeben'}<br />Beantragt {when(r.created_at)}. Prüfe, ob im Discord ein passendes Ticket existiert.</p>
              <form className="mt-3 flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={r.id} />
                <input name="note" maxLength={500} placeholder="Notiz zur Entscheidung (bei Ablehnung Pflicht)" aria-label="Notiz" className="field max-w-md flex-1" />
                <Button type="submit" formAction={approveVerification} size="sm">Verifizieren</Button>
                <Button type="submit" formAction={rejectVerification} variant="danger" size="sm">Ablehnen</Button></form>
            </li>))}</ul>)}
      </section>
      <section aria-labelledby="v-done"><h2 id="v-done" className="mb-3 text-xl font-semibold">Verifizierte Streamer</h2>
        {vs.length === 0 ? <EmptyState title="Noch niemand verifiziert" /> : (
          <ul className="panel divide-y divide-line">{vs.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span><Link href={`/streamers/${s.id}`} className="font-medium hover:underline">{s.display_name}</Link>{s.verified_at && <span className="text-muted">, seit {when(s.verified_at)}</span>}</span>
              <form className="flex gap-2"><input type="hidden" name="id" value={s.id} /><input name="note" required minLength={3} maxLength={500} placeholder="Grund für den Entzug" aria-label="Grund" className="field w-56" /><Button type="submit" formAction={revokeVerification} variant="danger" size="sm">Haken entziehen</Button></form>
            </li>))}</ul>)}
      </section>
    </div>
  );
}

async function PaymentsTab({ db }: { db: Db }) {
  const [subs, hints, recent, rec] = await Promise.all([
    db.from('payment_submissions').select('id,plan,claimed_amount_coins,payer_ingame_name,note,created_at,user:profiles!payment_submissions_user_id_fkey(username)').eq('status', 'pending').order('created_at'),
    db.from('minecraft_payment_events').select('id,sender_name,recipient_name,amount_coins,currency,received_at').eq('status', 'unconfirmed').order('received_at', { ascending: false }).limit(200),
    db.from('payment_submissions').select('id,plan,claimed_amount_coins,payer_ingame_name,status,decided_at,decision_note').neq('status', 'pending').order('decided_at', { ascending: false }).limit(10),
    db.from('app_settings').select('value').eq('key', 'payment_recipient').maybeSingle(),
  ]);
  const pending = (subs.data ?? []) as unknown as { id: string; plan: string; claimed_amount_coins: number; payer_ingame_name: string; note: string | null; created_at: string; user: { username: string } | null }[];
  const hs = (hints.data ?? []) as { id: string; sender_name: string | null; recipient_name: string | null; amount_coins: number | null; currency: string | null; received_at: string }[];
  const done = (recent.data ?? []) as { id: string; plan: string; claimed_amount_coins: number; payer_ingame_name: string; status: string; decided_at: string | null; decision_note: string | null }[];
  const recipient = typeof rec.data?.value === 'string' ? rec.data.value : '';
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">Zahlungsempfänger laut Einstellung: <strong className="text-foreground">{recipient || 'nicht festgelegt'}</strong>. Prüfe jede Zahlung im Spiel, bevor du bestätigst. Mod-Hinweise sind nur Anhaltspunkte und unbestätigt: Sie können fehlen, falsch oder gefälscht sein.</p>
      <section aria-labelledby="p-pending"><h2 id="p-pending" className="mb-3 text-xl font-semibold">Offene Zahlungsnachweise ({pending.length})</h2>
        {pending.length === 0 ? <EmptyState title="Keine offenen Nachweise" /> : (
          <ul className="space-y-3">{pending.map((s) => {
            const matches = hs.filter((h) => h.sender_name?.toLowerCase() === s.payer_ingame_name.toLowerCase()).slice(0, 3);
            return (
              <li key={s.id} className="panel p-4">
                <p className="font-medium">{s.user?.username} <Badge tone="blue">{s.plan === 'streamer' ? 'Streamer-Premium' : 'Spieler-Premium'}</Badge></p>
                <p className="text-sm text-muted">Minecraft-Name {s.payer_ingame_name}, angegebener Betrag {s.claimed_amount_coins.toLocaleString('de-DE')} Coins, eingereicht {when(s.created_at)}{s.note ? `. Notiz: ${s.note}` : ''}</p>
                {matches.length > 0 && <ul className="mt-2 space-y-1 text-sm text-gold">{matches.map((h) => <li key={h.id}>Unbestätigter Mod-Hinweis: {h.sender_name} an {h.recipient_name ?? 'unbekannt'}, {h.amount_coins !== null ? `${h.amount_coins.toLocaleString('de-DE')} ${h.currency ?? ''}` : 'Betrag unbekannt'}, {when(h.received_at)}{recipient && h.recipient_name?.toLowerCase() === recipient.toLowerCase() ? ' (Empfänger passt)' : ''}</li>)}</ul>}
                <form className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={s.id} />
                  <div><label htmlFor={`amt-${s.id}`} className="label">Im Spiel bestätigter Betrag</label><input id={`amt-${s.id}`} name="verified_amount" type="number" min={1} defaultValue={s.claimed_amount_coins} className="field w-44" /></div>
                  <input name="note" maxLength={500} placeholder="Notiz (bei Ablehnung Pflicht)" aria-label="Notiz" className="field max-w-xs flex-1" />
                  <Button type="submit" formAction={approvePayment} size="sm">Bestätigen und Premium aktivieren</Button>
                  <Button type="submit" formAction={rejectPayment} variant="danger" size="sm">Ablehnen</Button></form>
              </li>); })}</ul>)}
      </section>
      {done.length > 0 && <section aria-labelledby="p-done"><h2 id="p-done" className="mb-3 text-xl font-semibold">Zuletzt entschieden</h2>
        <ul className="panel divide-y divide-line text-sm">{done.map((s) => <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span>{s.payer_ingame_name}, {s.plan}, {s.claimed_amount_coins.toLocaleString('de-DE')} Coins{s.decision_note ? `, ${s.decision_note}` : ''}</span><Badge tone={s.status === 'approved' ? 'ok' : 'danger'}>{s.status === 'approved' ? 'Bestätigt' : 'Abgelehnt'}{s.decided_at ? ` ${when(s.decided_at)}` : ''}</Badge></li>)}</ul></section>}
    </div>
  );
}

async function HintsTab({ db }: { db: Db }) {
  const { data } = await db.from('minecraft_payment_events')
    .select('id,sender_name,recipient_name,amount_coins,currency,raw_message,pattern_id,status,received_at,reporter:profiles!minecraft_payment_events_reported_by_fkey(username)')
    .order('received_at', { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as { id: string; sender_name: string | null; recipient_name: string | null; amount_coins: number | null; currency: string | null; raw_message: string; pattern_id: string | null; status: string; received_at: string; reporter: { username: string } | null }[];
  return rows.length === 0 ? <EmptyState title="Noch keine Mod-Hinweise" hint="Hinweise erscheinen, sobald Nutzer die Mod mit ihrem Token verbinden." /> : (
    <div className="panel overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><caption className="sr-only">Unbestätigte Zahlungs-Hinweise der Minecraft-Mod</caption>
      <thead className="border-b border-line text-muted"><tr>{['Eingang', 'Gemeldet von', 'Absender', 'Empfänger', 'Betrag', 'Originalnachricht'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((r) => (
        <tr key={r.id}><td className="px-3 py-2">{when(r.received_at)}</td><td className="px-3 py-2">{r.reporter?.username}</td><td className="px-3 py-2">{r.sender_name ?? <span className="text-muted">unbekannt</span>}</td><td className="px-3 py-2">{r.recipient_name ?? <span className="text-muted">unbekannt</span>}</td><td className="px-3 py-2">{r.amount_coins !== null ? `${r.amount_coins.toLocaleString('de-DE')} ${r.currency ?? ''}` : <span className="text-muted">unbekannt</span>}</td><td className="max-w-xs truncate px-3 py-2 text-muted" title={r.raw_message}>{r.raw_message}</td></tr>))}</tbody></table></div>
  );
}

async function ReportsTab({ db }: { db: Db }) {
  const [chat, rev] = await Promise.all([
    db.from('chat_reports').select('id,message_id,message_author_id,message_snapshot,reason,created_at,reporter:profiles!chat_reports_reporter_id_fkey(username),author:profiles!chat_reports_message_author_id_fkey(username)').eq('status', 'open').order('created_at').limit(50),
    db.from('review_reports').select('id,review_id,review_snapshot,reason,created_at,reporter:profiles!review_reports_reporter_id_fkey(username),author:profiles!review_reports_review_author_id_fkey(username)').eq('status', 'open').order('created_at').limit(50),
  ]);
  const chats = (chat.data ?? []) as unknown as { id: string; message_id: string | null; message_author_id: string | null; message_snapshot: string; reason: string; created_at: string; reporter: { username: string } | null; author: { username: string } | null }[];
  const revs = (rev.data ?? []) as unknown as { id: string; review_id: string | null; review_snapshot: string; reason: string; created_at: string; reporter: { username: string } | null; author: { username: string } | null }[];
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">Regel: Rezensionen werden nur bei Regelverstößen (Beleidigung, Spam, Werbung, Doxxing) entfernt, nicht weil sie negativ sind. Gib immer einen konkreten Grund an.</p>
      <section aria-labelledby="r-chat"><h2 id="r-chat" className="mb-3 text-xl font-semibold">Chat-Meldungen ({chats.length})</h2>
        {chats.length === 0 ? <EmptyState title="Keine offenen Chat-Meldungen" /> : <ul className="space-y-3">{chats.map((c) => (
          <li key={c.id} className="panel p-4"><p className="text-sm text-muted">{c.reporter?.username} meldet {c.author?.username ?? 'Unbekannt'} ({when(c.created_at)}): {c.reason}</p><blockquote className="mt-2 border-l-2 border-line pl-3">{c.message_snapshot}</blockquote>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.message_id && <form action={deleteChatMessage}><input type="hidden" name="id" value={c.message_id} /><Button type="submit" variant="danger" size="sm">Nachricht löschen</Button></form>}
              {c.message_author_id && <form action={muteUser} className="flex gap-2"><input type="hidden" name="user_id" value={c.message_author_id} /><input type="hidden" name="note" value={`Meldung: ${c.reason}`.slice(0, 300)} /><select name="minutes" aria-label="Dauer" className="field w-auto" defaultValue="60"><option value="10">10 Min.</option><option value="60">1 Std.</option><option value="1440">1 Tag</option></select><Button type="submit" variant="secondary" size="sm">Stummschalten</Button></form>}
              <form action={dismissReport}><input type="hidden" name="kind" value="chat" /><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="ghost" size="sm">Meldung verwerfen</Button></form></div></li>))}</ul>}
      </section>
      <section aria-labelledby="r-rev"><h2 id="r-rev" className="mb-3 text-xl font-semibold">Rezensions-Meldungen ({revs.length})</h2>
        {revs.length === 0 ? <EmptyState title="Keine offenen Rezensions-Meldungen" /> : <ul className="space-y-3">{revs.map((c) => (
          <li key={c.id} className="panel p-4"><p className="text-sm text-muted">{c.reporter?.username} meldet eine Rezension von {c.author?.username ?? 'Unbekannt'} ({when(c.created_at)}): {c.reason}</p><blockquote className="mt-2 border-l-2 border-line pl-3">{c.review_snapshot}</blockquote>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.review_id && <form action={removeReview} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={c.review_id} /><input name="note" required minLength={3} maxLength={500} placeholder="Grund der Entfernung" aria-label="Grund" className="field w-64" /><Button type="submit" variant="danger" size="sm">Rezension entfernen</Button></form>}
              <form action={dismissReport}><input type="hidden" name="kind" value="review" /><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="ghost" size="sm">Meldung verwerfen</Button></form></div></li>))}</ul>}
      </section>
    </div>
  );
}

async function EventsTab({ db }: { db: Db }) {
  const { data } = await db.from('events').select('id,title,starts_at,hidden_at,hidden_reason,streamer:streamer_profiles(display_name)').order('created_at', { ascending: false }).limit(40);
  const rows = (data ?? []) as unknown as { id: string; title: string; starts_at: string; hidden_at: string | null; hidden_reason: string | null; streamer: { display_name: string } | null }[];
  return rows.length === 0 ? <EmptyState title="Noch keine Events" /> : (
    <ul className="space-y-2.5">{rows.map((e) => (
      <li key={e.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <span className="min-w-0"><Link href={`/events/${e.id}`} className="font-medium hover:underline">{e.title}</Link>{e.hidden_at && <Badge tone="gold" className="ml-2">Ausgeblendet</Badge>}<span className="block text-sm text-muted">{e.streamer?.display_name}, {when(e.starts_at)}{e.hidden_reason ? `, Grund: ${e.hidden_reason}` : ''}</span></span>
        {e.hidden_at ? <form action={unhideEvent}><input type="hidden" name="id" value={e.id} /><Button type="submit" variant="secondary" size="sm">Wieder einblenden</Button></form>
          : <form action={hideEvent} className="flex gap-2"><input type="hidden" name="id" value={e.id} /><input name="note" required minLength={3} maxLength={500} placeholder="Grund (Regelverstoß)" aria-label="Grund" className="field w-56" /><Button type="submit" variant="danger" size="sm">Ausblenden</Button></form>}
      </li>))}</ul>
  );
}

async function AuditTab({ db }: { db: Db }) {
  const { data } = await db.from('admin_audit_logs').select('id,action,target_type,target_id,details,created_at,actor:profiles(username)').order('created_at', { ascending: false }).limit(60);
  const rows = (data ?? []) as unknown as { id: number; action: string; target_type: string; target_id: string | null; details: unknown; created_at: string; actor: { username: string } | null }[];
  return rows.length === 0 ? <EmptyState title="Noch keine Einträge" /> : (
    <div className="panel overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><caption className="sr-only">Protokoll der Admin- und Moderationsaktionen</caption>
      <thead className="border-b border-line text-muted"><tr>{['Zeit', 'Wer', 'Aktion', 'Ziel', 'Details'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.id}><td className="px-3 py-2">{when(r.created_at)}</td><td className="px-3 py-2">{r.actor?.username ?? 'System'}</td><td className="px-3 py-2">{r.action}</td><td className="px-3 py-2 text-muted">{r.target_type} {r.target_id?.slice(0, 8)}</td><td className="max-w-xs truncate px-3 py-2 text-muted" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</td></tr>)}</tbody></table></div>
  );
}
