'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { errorCode, humanizeError } from '@/lib/errors';
import { formToObject, redirectWith } from '@/lib/flash';
import { idSchema, profileSchema } from '@/lib/validation';

export async function updateProfile(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/profile');
  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/profile', 'error', 'invalid_input');
  const { error } = await supabase
    .from('profiles')
    .update({
      username: parsed.data.username,
      bio: parsed.data.bio ?? null,
      twitch_url: parsed.data.twitch_url ?? null,
      notify_new_events: formData.get('notify_new_events') === 'on',
      notify_reminders: formData.get('notify_reminders') === 'on',
    })
    .eq('id', viewer.id);
  if (error) redirectWith('/profile', 'error', errorCode(error));
  revalidatePath('/profile');
  redirectWith('/profile', 'ok', 'saved');
}

export async function markNotificationsRead() {
  const { supabase, viewer } = await requireViewer('/profile');
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', viewer.id).is('read_at', null);
  revalidatePath('/', 'layout');
  redirectWith('/profile', 'ok', 'done');
}

export type TokenState = { token?: string; error?: string };

/** Das Token wird genau einmal als Klartext zurückgegeben (nur im Browser-State, nie in der URL oder einem Cookie). */
export async function createModToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const { supabase } = await requireViewer('/profile');
  const label = String(formData.get('label') ?? '').trim().slice(0, 40);
  const { data, error } = await supabase.rpc('create_mod_token', { p_label: label || 'Minecraft-Mod' });
  if (error) return { error: humanizeError(errorCode(error)) ?? 'Das hat nicht geklappt.' };
  revalidatePath('/profile');
  return { token: data as string };
}

export async function revokeModToken(formData: FormData) {
  const { supabase } = await requireViewer('/profile');
  const id = idSchema.safeParse(formData.get('token_id'));
  if (!id.success) redirectWith('/profile', 'error', 'invalid_input');
  const { error } = await supabase.rpc('revoke_mod_token', { p_id: id.data });
  if (error) redirectWith('/profile', 'error', errorCode(error));
  revalidatePath('/profile');
  redirectWith('/profile', 'ok', 'done');
}
