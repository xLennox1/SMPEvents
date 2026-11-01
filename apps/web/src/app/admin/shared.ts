import type { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/time';

export type Db = Awaited<ReturnType<typeof createClient>>;
export const when = (iso: string) => formatDateTime(iso, 'Europe/Berlin');
