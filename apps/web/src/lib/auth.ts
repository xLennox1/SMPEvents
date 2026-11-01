import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { Role, Viewer } from '@/lib/types';

export async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, viewer: null as Viewer | null };
  const { data } = await supabase.from('profiles').select('id, username, avatar_url, role').eq('id', user.id).maybeSingle();
  return { supabase, viewer: (data as Viewer | null) };
}

export async function requireViewer(next = '/') {
  const ctx = await getViewer();
  if (!ctx.viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase: ctx.supabase, viewer: ctx.viewer };
}

/** Für die Navigation: nie werfen, wenn Supabase (noch) nicht eingerichtet ist. */
export async function getViewerSafe() {
  if (!isSupabaseConfigured()) return null;
  try {
    return await getViewer();
  } catch {
    return null;
  }
}

export async function requireRole(min: Exclude<Role, 'user'>) {
  const ctx = await requireViewer('/admin');
  const ok = min === 'moderator' ? ctx.viewer.role !== 'user' : ctx.viewer.role === 'admin';
  if (!ok) redirect('/');
  return ctx;
}
