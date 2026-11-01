import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Blauer Haken: bestätigt den Abschluss des SMPEvents-Prüfverfahrens – keine Garantie für einzelne Events. */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span title="Verifiziert: Das SMPEvents-Prüfverfahren wurde abgeschlossen" className={cn('inline-flex shrink-0', className)}>
      <BadgeCheck aria-hidden className="size-4 text-badge" />
      <span className="sr-only">Verifizierter Streamer</span>
    </span>
  );
}
