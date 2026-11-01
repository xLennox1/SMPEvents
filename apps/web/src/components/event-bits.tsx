import Link from 'next/link';
import { Box, Gift, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '@/components/verified-badge';
import { CATEGORY_LABEL, type EventCategory, type EventItem } from '@/lib/types';
import { effectiveStatus, formatDay, formatMonthShort, formatTime, type EventStatus } from '@/lib/time';

export function StatusPill({ status }: { status: EventStatus }) {
  if (status === 'live') {
    return <Badge tone="live"><span className="live-dot size-1.5 rounded-full bg-live" />Live</Badge>;
  }
  return status === 'ended' ? <Badge>Beendet</Badge> : <Badge tone="blue">Geplant</Badge>;
}

export function CategoryBadge({ category }: { category: EventCategory }) {
  const Icon = { giveaway: Gift, lootdrop: Package, lootbox: Box }[category];
  return <Badge><Icon aria-hidden className="size-3" />{CATEGORY_LABEL[category]}</Badge>;
}

/** Zeile der Event-Liste: links der Termin, rechts Titel, Streamer und Belohnung. */
export function EventRow({ e, now }: { e: EventItem; now?: Date }) {
  const status = effectiveStatus(e, now);
  return (
    <Link href={`/events/${e.id}`} className="flex gap-4 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-primary/60">
      <div className="w-14 shrink-0 text-center">
        <div className="font-display text-2xl font-bold leading-none">{formatDay(e.starts_at, e.timezone)}</div>
        <div className="mt-1 text-xs text-muted">{formatMonthShort(e.starts_at, e.timezone)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={e.category} />
          <StatusPill status={status} />
        </div>
        <h3 className="mt-1.5 truncate text-base font-semibold">{e.title}</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            {e.streamer?.display_name ?? 'Unbekannt'}
            {e.streamer?.is_verified && <VerifiedBadge />}
          </span>
          <span>{formatTime(e.starts_at, e.timezone)}</span>
          <span className="truncate">Belohnung: {e.rewards}</span>
        </div>
      </div>
    </Link>
  );
}
