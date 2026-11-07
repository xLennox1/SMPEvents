import Link from 'next/link';
import { createCreatorCode, stopSupporting, supportCreator } from '@/actions/rewards';
import { Flash } from '@/components/flash';
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-bits';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/verified-badge';
import { getViewer } from '@/lib/auth';
import { discordServerUrl } from '@/lib/env';
import { cn, first } from '@/lib/utils';

export const metadata = { title: 'Creator-Codes' };

export default async function CreatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, viewer } = await getViewer();
  const [codesRes, pctRes] = await Promise.all([
    supabase.from('creator_codes').select('code,streamer:streamer_profiles(id,display_name,is_verified)').eq('active', true).order('created_at', { ascending: false }).limit(100),
    supabase.from('app_settings').select('value').eq('key', 'creator_commission_percent').maybeSingle(),
  ]);
  const pct = typeof pctRes.data?.value === 'number' ? pctRes.data.value : 10;
  const creators = ((codesRes.data ?? []) as unknown as { code: string; streamer: { id: string; display_name: string; is_verified: boolean } | null }[]).filter((c) => c.streamer?.is_verified);

  let mine: string | null = null, isStreamer = false, isVerified = false, stats: { supporters: number; points_earned: number } | null = null;
  let supporting: { code: string } | null = null;
  if (viewer) {
    const [own, sRes, sup, st] = await Promise.all([
      supabase.from('creator_codes').select('code').eq('streamer_id', viewer.id).maybeSingle(),
      supabase.from('streamer_profiles').select('is_verified').eq('id', viewer.id).maybeSingle(),
      supabase.from('creator_supporters').select('creator:creator_codes(code)').eq('user_id', viewer.id).maybeSingle(),
      supabase.rpc('my_creator_stats'),
    ]);
    mine = (own.data as { code: string } | null)?.code ?? null;
    isStreamer = Boolean(sRes.data);
    isVerified = Boolean((sRes.data as { is_verified: boolean } | null)?.is_verified);
    const supRow = sup.data as unknown as { creator: { code: string } | null } | null;
    supporting = supRow?.creator ? { code: supRow.creator.code } : null;
    const row = Array.isArray(st.data) ? st.data[0] : st.data;
    stats = row ? { supporters: Number(row.supporters), points_earned: Number(row.points_earned) } : null;
  }
  const discord = discordServerUrl();

  return (
    <div className="space-y-8">
      <PageHeader title="Creator-Codes" description="Streamer mit blauem Haken können einen eigenen Code erstellen. Wer ihn im Shop nutzt, unterstützt den Streamer, der dafür Bonuspunkte bekommt.">
        {discord && <a href={discord} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary' }))}>Zum Discord</a>}
      </PageHeader>
      <Flash error={first(sp.error)} ok={first(sp.ok)} />

      <section className="panel space-y-3 p-5" aria-labelledby="mine-h">
        <h2 id="mine-h" className="text-xl font-semibold">Dein Creator-Code</h2>
        {!viewer ? <p className="text-sm text-muted"><Link href="/login?next=%2Fcreator" className="link">Melde dich an</Link>, um einen Code zu erstellen oder einen Creator zu unterstützen.</p>
        : mine ? (
          <>
            <p>Dein Code: <code className="rounded bg-background px-2 py-1 text-lg font-semibold text-foreground">{mine}</code></p>
            {stats && <p className="text-sm text-muted">{stats.supporters} Unterstützer, {stats.points_earned.toLocaleString('de-DE')} Bonuspunkte bisher. Du bekommst {pct} % der Punkte, die deine Unterstützer im Shop ausgeben. Die Punkte kannst du selbst im <Link href="/shop" className="link">Shop</Link> einlösen.</p>}
            <p className="text-sm text-muted">Der Code gilt nur, solange dein blauer Haken besteht.</p>
          </>
        ) : isVerified ? (
          <form action={createCreatorCode} className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="code" className="label">Wunsch-Code (3–20 Zeichen: A–Z, 0–9, _ und -)</label><input id="code" name="code" required minLength={3} maxLength={20} className="field uppercase" /></div>
            <Button type="submit">Code erstellen</Button>
          </form>
        ) : isStreamer ? (
          <p className="text-sm text-muted">Creator-Codes gibt es nur mit dem blauen Haken. <Link href={`/streamers/${viewer.id}`} className="link">Verifizierung beantragen</Link></p>
        ) : <p className="text-sm text-muted">Lege zuerst ein <Link href="/profile#streamer" className="link">Streamer-Profil</Link> an und lass dich verifizieren.</p>}
      </section>

      <section className="panel space-y-3 p-5" aria-labelledby="sup-h">
        <h2 id="sup-h" className="text-xl font-semibold">Creator unterstützen</h2>
        {!viewer ? null : supporting ? (
          <form action={stopSupporting} className="flex flex-wrap items-center gap-3 text-sm"><input type="hidden" name="back" value="/creator" />
            <span>Du unterstützt gerade <code className="text-foreground">{supporting.code}</code>.</span><Button type="submit" variant="ghost" size="sm">Nicht mehr unterstützen</Button></form>
        ) : (
          <form action={supportCreator} className="flex flex-wrap items-end gap-3"><input type="hidden" name="back" value="/creator" />
            <div><label htmlFor="support-code" className="label">Creator-Code</label><input id="support-code" name="code" required maxLength={20} className="field uppercase" /></div>
            <Button type="submit" variant="secondary">Einlösen</Button></form>
        )}
        <p className="text-sm text-muted">Das kostet dich nichts: Bei deinen Käufen im Shop bekommt der Creator zusätzlich {pct} % der ausgegebenen Punkte. Wechseln kannst du höchstens alle 30 Tage.</p>
      </section>

      <section aria-labelledby="all-h">
        <SectionTitle id="all-h">Alle Creator</SectionTitle>
        {creators.length === 0 ? <EmptyState title="Noch keine Creator-Codes" hint="Sobald verifizierte Streamer Codes erstellen, erscheinen sie hier." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <li key={c.code} className="panel flex items-center justify-between gap-3 p-4">
                <Link href={`/streamers/${c.streamer?.id}`} className="flex min-w-0 items-center gap-1 font-medium hover:underline"><span className="truncate">{c.streamer?.display_name}</span><VerifiedBadge /></Link>
                <Badge tone="blue">{c.code}</Badge>
              </li>))}
          </ul>
        )}
      </section>
    </div>
  );
}
