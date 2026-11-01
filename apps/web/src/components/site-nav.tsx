import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { signOut } from '@/actions/auth';
import { getViewerSafe } from '@/lib/auth';
import { Avatar } from '@/components/avatar';
import { NavLinks } from '@/components/nav-links';
import { Button } from '@/components/ui/button';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/calendar', label: 'Kalender' },
  { href: '/streamers', label: 'Streamer' },
  { href: '/ranking', label: 'Ranking' },
  { href: '/chat', label: 'Chatall' },
  { href: '/premium', label: 'Premium' },
  { href: '/profile', label: 'Profil' },
];

export async function SiteNav() {
  const ctx = await getViewerSafe();
  const viewer = ctx?.viewer ?? null;
  let unread = 0;
  if (ctx && viewer) {
    const { count } = await ctx.supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', viewer.id).is('read_at', null);
    unread = count ?? 0;
  }
  const links = viewer && viewer.role !== 'user' ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
          SMPEvents
        </Link>
        <nav aria-label="Hauptnavigation" className="ml-4 hidden xl:block">
          <NavLinks links={links} className="flex items-center gap-1" />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              <Link
                href="/profile#benachrichtigungen"
                aria-label={unread ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen'}
                className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-raised"
              >
                <Bell aria-hidden className="size-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md p-1 hover:bg-raised">
                  <Avatar name={viewer.username} url={viewer.avatar_url} size={32} />
                  <span className="hidden max-w-28 truncate text-sm sm:inline">{viewer.username}</span>
                </summary>
                <div className="panel absolute right-0 mt-2 w-48 p-1.5 text-sm">
                  <Link href="/profile" className="block rounded-md px-3 py-2 hover:bg-raised">Profil</Link>
                  <form action={signOut}>
                    <button type="submit" className="w-full rounded-md px-3 py-2 text-left hover:bg-raised">Abmelden</button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link href="/login">Anmelden</Link></Button>
              <Button asChild size="sm"><Link href="/register">Registrieren</Link></Button>
            </>
          )}
          <details className="relative xl:hidden">
            <summary aria-label="Menü öffnen" className="inline-flex size-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-raised">
              <Menu aria-hidden className="size-5" />
            </summary>
            <nav aria-label="Mobile Navigation" className="panel absolute right-0 mt-2 w-60 p-2">
              <NavLinks links={links} className="flex flex-col" itemClass="block" />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
