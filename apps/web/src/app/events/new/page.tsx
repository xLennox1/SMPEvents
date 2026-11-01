import Link from 'next/link';
import { createEvent } from '@/actions/events';
import { Flash } from '@/components/flash';
import { EmptyState, PageHeader } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { requireViewer } from '@/lib/auth';
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/types';
import { cn, first } from '@/lib/utils';

export const metadata = { title: 'Event veröffentlichen' };
const ZONES = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export default async function NewEventPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await requireViewer('/events/new');

  const [streamerRes, limitRes, premiumRes] = await Promise.all([
    supabase.from('streamer_profiles').select('id,display_name,free_events_used').eq('id', viewer.id).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'free_events_per_streamer').maybeSingle(),
    supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'streamer' }),
  ]);
  const streamer = streamerRes.data as { free_events_used: number } | null;

  if (!streamer) {
    return (
      <>
        <PageHeader title="Event veröffentlichen" />
        <EmptyState title="Dafür brauchst du ein Streamer-Profil" hint="Lege es in deinem Profil an. Danach kannst du Events veröffentlichen und dich verifizieren lassen.">
          <Link href="/profile#streamer" className={cn(buttonVariants())}>Streamer-Profil anlegen</Link>
        </EmptyState>
      </>
    );
  }

  const limit = typeof limitRes.data?.value === 'number' ? limitRes.data.value : 3;
  const premium = Boolean(premiumRes.data);
  const remaining = Math.max(0, limit - streamer.free_events_used);
  const canPublish = premium || remaining > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Event veröffentlichen">
        {premium ? <Badge tone="gold">Streamer-Premium aktiv</Badge> : <Badge tone={remaining > 0 ? 'blue' : 'danger'}>{remaining} von {limit} kostenlosen Events übrig</Badge>}
      </PageHeader>
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      {!canPublish ? (
        <EmptyState title="Dein kostenloses Kontingent ist aufgebraucht" hint="Mit Streamer-Premium veröffentlichst du weitere Events. Bereits veröffentlichte Events bleiben sichtbar.">
          <Link href="/premium" className={cn(buttonVariants())}>Premium ansehen</Link>
        </EmptyState>
      ) : (
        <form action={createEvent} className="panel space-y-4 p-5">
          <div><label htmlFor="title" className="label">Titel</label><input id="title" name="title" required minLength={3} maxLength={100} className="field" /></div>
          <div><label htmlFor="category" className="label">Event-Typ</label>
            <select id="category" name="category" required className="field">{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></div>
          <div><label htmlFor="description" className="label">Beschreibung</label><textarea id="description" name="description" required minLength={10} maxLength={2000} rows={4} className="field" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1"><label htmlFor="starts_local" className="label">Start (lokale Zeit)</label><input id="starts_local" name="starts_local" type="datetime-local" required className="field" /></div>
            <div><label htmlFor="timezone" className="label">Zeitzone</label>
              <select id="timezone" name="timezone" defaultValue="Europe/Berlin" className="field">{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
            <div><label htmlFor="duration_minutes" className="label">Dauer</label>
              <select id="duration_minutes" name="duration_minutes" defaultValue="" className="field">
                <option value="">Offen (gilt nach 2 Stunden als beendet)</option><option value="30">30 Minuten</option><option value="60">1 Stunde</option><option value="120">2 Stunden</option><option value="180">3 Stunden</option><option value="240">4 Stunden</option>
              </select></div>
          </div>
          <div><label htmlFor="rewards" className="label">Belohnungen</label><input id="rewards" name="rewards" required maxLength={500} placeholder="z. B. 3x Netherite-Set" className="field" /></div>
          <div><label htmlFor="conditions" className="label">Teilnahmebedingungen (optional)</label><textarea id="conditions" name="conditions" maxLength={1000} rows={3} className="field" /></div>
          <div><label htmlFor="link_url" className="label">Link, zum Beispiel Twitch (optional, https)</label><input id="link_url" name="link_url" type="url" pattern="https://.*" maxLength={500} className="field" /></div>
          <p className="text-sm text-muted">Das Kontingent und dein Premium-Status werden beim Speichern serverseitig geprüft. Gelöschte Events geben kein Kontingent zurück.</p>
          <Button type="submit">Event veröffentlichen</Button>
        </form>
      )}
    </div>
  );
}
