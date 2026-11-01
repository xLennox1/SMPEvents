'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NavLinks({ links, className, itemClass }: { links: { href: string; label: string }[]; className?: string; itemClass?: string }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {links.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? 'page' : undefined}
              onClick={(ev) => ev.currentTarget.closest('details')?.removeAttribute('open')}
              className={cn('rounded-md px-3 py-2 text-sm transition-colors hover:bg-raised', active ? 'bg-raised font-medium text-foreground' : 'text-muted hover:text-foreground', itemClass)}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
