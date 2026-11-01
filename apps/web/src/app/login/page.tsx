import Link from 'next/link';
import { signIn } from '@/actions/auth';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-bits';
import { Button } from '@/components/ui/button';
import { isSupabaseConfigured } from '@/lib/env';
import { safeNext } from '@/lib/flash';
import { first } from '@/lib/utils';

export const metadata = { title: 'Anmelden' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Anmelden" />
      {!isSupabaseConfigured() && <p role="alert" className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">Supabase ist noch nicht verbunden. Trage die Schlüssel in .env.local ein (siehe README).</p>}
      <Flash error={first(sp.error)} ok={first(sp.ok)} />
      <form action={signIn} className="panel space-y-4 p-5">
        <input type="hidden" name="next" value={next} />
        <div><label htmlFor="email" className="label">E-Mail</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
        <div><label htmlFor="password" className="label">Passwort</label><input id="password" name="password" type="password" autoComplete="current-password" required className="field" /></div>
        <Button type="submit" className="w-full">Anmelden</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">Noch kein Konto? <Link href="/register" className="link">Jetzt registrieren</Link></p>
    </div>
  );
}
