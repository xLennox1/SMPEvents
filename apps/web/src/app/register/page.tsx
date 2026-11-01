import Link from 'next/link';
import { signUp } from '@/actions/auth';
import { Flash } from '@/components/flash';
import { PageHeader } from '@/components/page-bits';
import { Button } from '@/components/ui/button';
import { first } from '@/lib/utils';

export const metadata = { title: 'Registrieren' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Registrieren" description="Mit einem Konto bewertest du Streamer, schreibst im Chatall und speicherst Favoriten." />
      <Flash error={first(sp.error)} />
      <form action={signUp} className="panel space-y-4 p-5">
        <div><label htmlFor="username" className="label">Benutzername</label><input id="username" name="username" required pattern="[A-Za-z0-9_]{3,20}" title="3 bis 20 Zeichen: Buchstaben, Zahlen, Unterstrich" autoComplete="username" className="field" /></div>
        <div><label htmlFor="email" className="label">E-Mail</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
        <div><label htmlFor="password" className="label">Passwort (mindestens 8 Zeichen)</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" /></div>
        <Button type="submit" className="w-full">Konto erstellen</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">Schon registriert? <Link href="/login" className="link">Anmelden</Link></p>
    </div>
  );
}
