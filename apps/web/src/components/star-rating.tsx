import { Star } from 'lucide-react';

export function StarRating({ value, size = 16 }: { value: number | null; size?: number }) {
  const v = value ?? 0;
  return (
    <span role="img" aria-label={value === null ? 'Noch nicht bewertet' : `${v.toFixed(1).replace('.', ',')} von 5 Sternen`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden width={size} height={size} className={i <= Math.round(v) ? 'fill-gold text-gold' : 'text-line'} />
      ))}
    </span>
  );
}
