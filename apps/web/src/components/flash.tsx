import { humanizeError, humanizeOk } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Zeigt Status-Codes aus der URL (?error=…/?ok=…) als feste, geprüfte Texte. */
export function Flash({ error, ok }: { error?: string; ok?: string }) {
  const e = humanizeError(error);
  const o = humanizeOk(ok);
  if (!e && !o) return null;
  return (
    <div role={e ? 'alert' : 'status'} className={cn('mb-4 rounded-lg border px-4 py-3 text-sm', e ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok')}>
      {e ?? o}
    </div>
  );
}
