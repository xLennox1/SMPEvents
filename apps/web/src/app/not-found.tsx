import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-xl p-8">
      <h1 className="text-2xl font-bold">Diese Seite gibt es nicht</h1>
      <p className="mt-2 text-muted">Der Link ist veraltet oder das Event wurde entfernt.</p>
      <Button asChild className="mt-5"><Link href="/events">Zu den Events</Link></Button>
    </div>
  );
}
