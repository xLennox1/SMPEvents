'use client';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-xl p-8">
      <h1 className="text-2xl font-bold">Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-muted">
        Häufige Ursachen beim ersten Start: Supabase ist noch nicht verbunden oder die Migrationen fehlen (siehe README).
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Fehlercode: {error.digest}</p>}
      <Button className="mt-5" onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
