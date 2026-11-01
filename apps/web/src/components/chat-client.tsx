'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { errorCode, humanizeError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

type Author = { username: string; avatar_url: string | null; role: string };
export type ChatMessage = { id: string; user_id: string; body: string; created_at: string; edited_at: string | null; author: Author | null };
type Row = Omit<ChatMessage, 'author'>;

const SELECT = 'id,user_id,body,created_at,edited_at,author:profiles(username,avatar_url,role)';
const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const EDIT_WINDOW_MS = 5 * 60_000;

export function ChatClient({ initial, viewerId, viewerRole }: { initial: ChatMessage[]; viewerId: string; viewerRole: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length >= 50);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null);
  const authors = useRef(new Map<string, Author>());
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const isMod = viewerRole === 'moderator' || viewerRole === 'admin';

  useEffect(() => { for (const m of initial) if (m.author) authors.current.set(m.user_id, m.author); }, [initial]);

  // Echtzeit: neue, bearbeitete und gelöschte Nachrichten (RLS gilt auch für Realtime)
  useEffect(() => {
    const channel = supabase
      .channel('chatall')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const row = payload.new as Row;
        let author = authors.current.get(row.user_id) ?? null;
        if (!author) {
          const { data } = await supabase.from('profiles').select('username,avatar_url,role').eq('id', row.user_id).maybeSingle();
          if (data) { author = data as Author; authors.current.set(row.user_id, author); }
        }
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, author }]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = payload.new as Row;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, body: row.body, edited_at: row.edited_at } : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const gone = (payload.old as { id?: string }).id;
        if (gone) setMessages((prev) => prev.filter((m) => m.id !== gone));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const fail = (err: { message?: string; code?: string }) => { setInfo(null); setError(humanizeError(errorCode(err))); };

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(null); setInfo(null);
    const { data, error: err } = await supabase.from('chat_messages').insert({ user_id: viewerId, body }).select('id,user_id,body,created_at,edited_at').single();
    setSending(false);
    if (err) {
      if (errorCode(err) === 'forbidden') setError('Du kannst gerade nicht schreiben, möglicherweise wurdest du vorübergehend stummgeschaltet.');
      else fail(err);
      return;
    }
    setText('');
    stick.current = true;
    const row = data as Row;
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, author: authors.current.get(viewerId) ?? null }]));
  }

  async function loadOlder() {
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    const { data, error: err } = await supabase.from('chat_messages').select(SELECT).lt('created_at', oldest).order('created_at', { ascending: false }).limit(50);
    if (err) return fail(err);
    const older = ((data ?? []) as unknown as ChatMessage[]).reverse();
    for (const m of older) if (m.author) authors.current.set(m.user_id, m.author);
    setMessages((prev) => [...older, ...prev]);
    setHasMore(older.length >= 50);
  }

  async function saveEdit() {
    if (!editing) return;
    const { error: err } = await supabase.rpc('edit_chat_message', { p_id: editing.id, p_body: editing.text });
    if (err) return fail(err);
    setMessages((prev) => prev.map((m) => (m.id === editing.id ? { ...m, body: editing.text.trim(), edited_at: new Date().toISOString() } : m)));
    setEditing(null);
  }

  async function remove(id: string) {
    const { error: err } = await supabase.rpc('delete_chat_message', { p_id: id });
    if (err) return fail(err);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function sendReport() {
    if (!reporting) return;
    const { error: err } = await supabase.rpc('report_chat_message', { p_message_id: reporting.id, p_reason: reporting.reason });
    if (err) return fail(err);
    setReporting(null); setError(null); setInfo('Danke, die Moderation prüft deine Meldung.');
  }

  async function mute(userId: string) {
    const { error: err } = await supabase.rpc('mute_chat_user', { p_user: userId, p_minutes: 60, p_reason: 'Chat-Moderation' });
    if (err) return fail(err);
    setError(null); setInfo('Nutzer für 60 Minuten stummgeschaltet.');
  }

  return (
    <div className="panel flex flex-col overflow-hidden">
      <div ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chatverlauf" className="h-[58dvh] min-h-72 space-y-3 overflow-y-auto p-4">
        {hasMore && <div className="text-center"><Button variant="ghost" size="sm" onClick={loadOlder}>Ältere Nachrichten laden</Button></div>}
        {messages.length === 0 && <p className="py-10 text-center text-muted">Noch keine Nachrichten. Schreib die erste.</p>}
        {messages.map((m) => {
          const own = m.user_id === viewerId;
          const name = m.author?.username ?? (own ? 'Du' : 'Unbekannt');
          const canEdit = own && Date.now() - Date.parse(m.created_at) < EDIT_WINDOW_MS;
          return (
            <div key={m.id} className="flex gap-3">
              <Avatar name={name} url={m.author?.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{name}</span>
                  {m.author?.role && m.author.role !== 'user' && <Badge tone="blue">{m.author.role === 'admin' ? 'Admin' : 'Mod'}</Badge>}
                  <time dateTime={m.created_at} className="text-xs text-muted">{fmt.format(new Date(m.created_at))}</time>
                  {m.edited_at && <span className="text-xs text-muted">(bearbeitet)</span>}
                </div>
                {editing?.id === m.id ? (
                  <div className="mt-1 flex gap-2">
                    <input value={editing.text} maxLength={500} onChange={(e) => setEditing({ id: m.id, text: e.target.value })} aria-label="Nachricht bearbeiten" className="field" />
                    <Button size="sm" onClick={saveEdit}>Speichern</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
                <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted">
                  {canEdit && <button className="hover:text-foreground" onClick={() => setEditing({ id: m.id, text: m.body })}>Bearbeiten</button>}
                  {(own || isMod) && <button className="hover:text-foreground" onClick={() => remove(m.id)}>Löschen</button>}
                  {!own && <button className="hover:text-foreground" onClick={() => setReporting({ id: m.id, reason: '' })}>Melden</button>}
                  {isMod && !own && <button className="hover:text-foreground" onClick={() => mute(m.user_id)}>60 Min. stummschalten</button>}
                </div>
                {reporting?.id === m.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input value={reporting.reason} maxLength={300} onChange={(e) => setReporting({ id: m.id, reason: e.target.value })} placeholder="Grund der Meldung" aria-label="Grund der Meldung" className="field max-w-md flex-1" />
                    <Button size="sm" variant="secondary" onClick={sendReport}>Melden</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReporting(null)}>Abbrechen</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="border-t border-line p-3">
        {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
        {info && <p role="status" className="mb-2 text-sm text-ok">{info}</p>}
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Nachricht schreiben" aria-label="Nachricht" className="field" autoComplete="off" />
          <Button type="submit" disabled={sending || !text.trim()}>Senden</Button>
        </div>
        <p className="mt-1.5 text-xs text-muted">{text.length}/500 Zeichen. Höchstens 5 Nachrichten in 10 Sekunden.</p>
      </form>
    </div>
  );
}
