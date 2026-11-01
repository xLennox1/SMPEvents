import 'server-only'; // bricht den Build ab, falls diese Datei jemals in Client-Code importiert wird
import { createClient } from '@supabase/supabase-js';

/** Secret-Key-Client: umgeht RLS. Nur in Route Handlers / Server Actions verwenden. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY müssen serverseitig gesetzt sein.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
