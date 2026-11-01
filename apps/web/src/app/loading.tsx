export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="h-40 animate-pulse rounded-xl bg-surface" />
      <div className="h-24 animate-pulse rounded-xl bg-surface" />
      <div className="h-24 animate-pulse rounded-xl bg-surface" />
      <span className="sr-only">Lädt …</span>
    </div>
  );
}
