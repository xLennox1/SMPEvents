'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { formToObject, redirectWith } from '@/lib/flash';
import { idSchema, reviewSchema, streamerSchema } from '@/lib/validation';

export async function becomeStreamer(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/profile');
  const parsed = streamerSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/profile', 'error', 'invalid_input');
  const { error } = await supabase.from('streamer_profiles').insert({ id: viewer.id, ...parsed.data });
  if (error) redirectWith('/profile', 'error', errorCode(error));
  redirectWith(`/streamers/${viewer.id}`, 'ok', 'created');
}

export async function updateStreamer(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/profile');
  const parsed = streamerSchema.safeParse(formToObject(formData));
  const back = `/streamers/${viewer.id}`;
  if (!parsed.success) redirectWith(back, 'error', 'invalid_input');
  // Ein Kanalwechsel entzieht den blauen Haken automatisch (Datenbank-Trigger).
  const { error } = await supabase.from('streamer_profiles').update(parsed.data).eq('id', viewer.id);
  if (error) redirectWith(back, 'error', errorCode(error));
  revalidatePath(back);
  redirectWith(back, 'ok', 'saved');
}

/** Legt nur einen Antrag an. Verifiziert wird ausschließlich durch einen Administrator (RPC decide_verification). */
export async function requestVerification(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/profile');
  const back = `/streamers/${viewer.id}`;
  const note = String(formData.get('note') ?? '').trim().slice(0, 500) || null;
  const { error } = await supabase.from('verification_requests').insert({ streamer_id: viewer.id, note });
  if (error) redirectWith(back, 'error', errorCode(error));
  revalidatePath(back);
  redirectWith(back, 'ok', 'verification_requested');
}

export async function saveReview(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const parsed = reviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/streamers', 'error', 'invalid_input');
  const { streamer_id, rating, body } = parsed.data;
  const back = `/streamers/${streamer_id}`;
  if (streamer_id === viewer.id) redirectWith(back, 'error', 'forbidden');

  const { data: existing } = await supabase.from('reviews').select('id, status').eq('reviewer_id', viewer.id).eq('streamer_id', streamer_id).maybeSingle();
  if (existing?.status === 'removed') redirectWith(back, 'error', 'forbidden');

  // Eine aktive Rezension pro Nutzer und Streamer: Update statt zweitem Insert (zusätzlich UNIQUE in der Datenbank).
  const { error } = existing
    ? await supabase.from('reviews').update({ rating, body }).eq('id', existing.id)
    : await supabase.from('reviews').insert({ streamer_id, reviewer_id: viewer.id, rating, body });
  if (error) redirectWith(back, 'error', errorCode(error));
  revalidatePath(back);
  revalidatePath('/ranking');
  redirectWith(back, 'ok', 'saved');
}

export async function deleteReview(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const id = idSchema.safeParse(formData.get('streamer_id'));
  if (!id.success) redirectWith('/streamers', 'error', 'invalid_input');
  const back = `/streamers/${id.data}`;
  const { error } = await supabase.from('reviews').delete().eq('reviewer_id', viewer.id).eq('streamer_id', id.data);
  if (error) redirectWith(back, 'error', errorCode(error));
  revalidatePath(back);
  revalidatePath('/ranking');
  redirectWith(back, 'ok', 'done');
}

export async function reportReview(formData: FormData) {
  const { supabase } = await requireViewer();
  const review = idSchema.safeParse(formData.get('review_id'));
  const streamer = idSchema.safeParse(formData.get('streamer_id'));
  if (!review.success || !streamer.success) redirectWith('/streamers', 'error', 'invalid_input');
  const back = `/streamers/${streamer.data}`;
  const { error } = await supabase.rpc('report_review', { p_review_id: review.data, p_reason: String(formData.get('reason') ?? '') });
  if (error) redirectWith(back, 'error', errorCode(error));
  redirectWith(back, 'ok', 'sent');
}

export async function toggleFollow(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const id = idSchema.safeParse(formData.get('streamer_id'));
  if (!id.success) redirectWith('/streamers', 'error', 'invalid_input');
  const back = `/streamers/${id.data}`;
  const { data: existing } = await supabase.from('follows').select('streamer_id').eq('user_id', viewer.id).eq('streamer_id', id.data).maybeSingle();
  if (existing) {
    await supabase.from('follows').delete().eq('user_id', viewer.id).eq('streamer_id', id.data);
    redirectWith(back, 'ok', 'done');
  }
  const { data: premium } = await supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'player' });
  if (!premium) redirectWith(back, 'error', 'premium_required');
  const { error } = await supabase.from('follows').insert({ user_id: viewer.id, streamer_id: id.data });
  if (error) redirectWith(back, 'error', errorCode(error));
  redirectWith(back, 'ok', 'saved');
}
