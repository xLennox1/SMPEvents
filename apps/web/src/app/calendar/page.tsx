import Link from 'next/link';
import { CategoryBadge } from '@/components/event-bits';
import { DataError, EmptyState, PageHeader } from '@/components/page-bits';
import { dayKey, formatTime } from '@/lib/time';
import { EVENT_SELECT, type EventItem } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { first as one } from '@/lib/utils';

export const metadata = { title: 'Event-Kalender' };
const DAY = 86_400_000;
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const match = /^(\d{4})-(\d{2})$/.exec(one(sp.m) ?? '');
  const today = new Date();
  const year = match ? Number(match[1]) : today.getUTCFullYear();
  const month = match ? Math.min(11, Math.max(0, Number(match[2]) - 1)) : today.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const supabase = await createClient();
  const { data, error } = await supabase.from('events').select(EVENT_SELECT).is('hidden_at', null)
    .gte('starts_at', new Date(monthStart.getTime() - DAY).toISOString())
    .lte('starts_at', new Date(monthStart.getTime() + (daysInMonth + 1) * DAY).toISOString())
    .order('starts_at').limit(500);

  const byDay = new Map<string, EventItem[]>();
  for (const e of (data ?? []) as unknown as EventItem[]) {
    const key = dayKey(e.starts_at, e.timezone);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const keyOf = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const lead = (monthStart.getUTCDay() + 6) % 7; // Montag = 0
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart);
  const busyDays = days.filter((d) => byDay.has(keyOf(d)));
  const todayKey = today.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Event-Kalender" description="Alle Termine nach Datum. Zeiten gelten in der Zeitzone des jeweiligen Events.">
        <nav aria-label="Monat wechseln" className="flex items-center gap-3 text-sm">
          <Link href={`/calendar?m=${ym(prev.getUTCFullYear(), prev.getUTCMonth())}`} className="link">Voriger Monat</Link>
          <span className="min-w-36 text-center font-display text-lg font-semibold">{label}</span>
          <Link href={`/calendar?m=${ym(next.getUTCFullYear(), next.getUTCMonth())}`} className="link">Nächster Monat</Link>
        </nav>
      </PageHeader>

      {error ? <DataError /> : (
        <>
          <div className="hidden md:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line" role="grid" aria-label={`Kalender ${label}`}>
              {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="bg-raised px-2 py-1.5 text-center text-xs font-medium text-muted">{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} className="min-h-24 bg-background" />)}
              {days.map((d) => {
                const list = byDay.get(keyOf(d)) ?? [];
                const isToday = keyOf(d) === todayKey;
                return (
                  <div key={d} role="gridcell" className="min-h-24 bg-surface p-1.5">
                    <span className={isToday ? 'inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground' : 'text-xs text-muted'}>{d}</span>
                    <ul className="mt-1 space-y-1">
                      {list.slice(0, 3).map((e) => (
                        <li key={e.id}><Link href={`/events/${e.id}`} className="block truncate rounded bg-primary/15 px-1.5 py-0.5 text-xs hover:bg-primary/30" title={e.title}>{formatTime(e.starts_at, e.timezone).slice(0, 5)} {e.title}</Link></li>
                      ))}
                      {list.length > 3 && <li><Link href={`/events?when=all&from=${keyOf(d)}&to=${keyOf(d)}`} className="link text-xs">+{list.length - 3} weitere</Link></li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 md:hidden">
            {busyDays.length === 0 ? <EmptyState title="In diesem Monat sind keine Events geplant" /> : busyDays.map((d) => (
              <section key={d}>
                <h2 className="mb-2 text-base font-semibold">{d}. {label}</h2>
                <ul className="space-y-2">
                  {(byDay.get(keyOf(d)) ?? []).map((e) => (
                    <li key={e.id}><Link href={`/events/${e.id}`} className="panel flex items-center gap-3 p-3"><CategoryBadge category={e.category} /><span className="min-w-0 flex-1 truncate font-medium">{e.title}</span><span className="text-sm text-muted">{formatTime(e.starts_at, e.timezone)}</span></Link></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
