'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { formToObject, redirectWith, safeNext } from '@/lib/flash';
import { zonedToUtc } from '@/lib/time';
import { eventInputSchema, idSchema } from '@/lib/validation';

export async function createEvent(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/events/new');
  const parsed = eventInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/events/new', 'error', 'invalid_input');
  const d = parsed.data;

  const startsAt = zonedToUtc(d.starts_local, d.timezone);
  const endsAt = d.duration_minutes ? new Date(startsAt.getTime() + d.duration_minutes * 60_000) : null;

  // Kontingent und Premium prüft ein Datenbank-Trigger bei JEDEM Insert – nicht nur diese Seite.
  const { data, error } = await supabase
    .from('events')
    .insert({
      streamer_id: viewer.id,
      title: d.title,
      description: d.description,
      category: d.category,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      timezone: d.timezone,
      rewards: d.rewards,
      conditions: d.conditions ?? null,
      link_url: d.link_url ?? null,
    })
    .select('id')
    .single();
  if (error) redirectWith('/events/new', 'error', errorCode(error));
  revalidatePath('/events');
  redirect(`/events/${data.id}?ok=created`);
}

export async function toggleFavorite(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const id = idSchema.safeParse(formData.get('event_id'));
  const back = safeNext(formData.get('back'), '/events');
  if (!id.success) redirectWith(back, 'error', 'invalid_input');
  const { data: existing } = await supabase.from('favorites').select('event_id').eq('user_id', viewer.id).eq('event_id', id.data).maybeSingle();
  const res = existing
    ? await supabase.from('favorites').delete().eq('user_id', viewer.id).eq('event_id', id.data)
    : await supabase.from('favorites').insert({ user_id: viewer.id, event_id: id.data });
  if (res.error) redirectWith(back, 'error', errorCode(res.error));
  revalidatePath(back);
  redirect(back);
}

export async function setReminder(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const id = idSchema.safeParse(formData.get('event_id'));
  const minutes = Number(formData.get('minutes'));
  if (!id.success || ![15, 60, 1440].includes(minutes)) redirectWith('/events', 'error', 'invalid_input');
  const back = `/events/${id.data}`;

  const { data: premium } = await supabase.rpc('has_active_premium', { p_user: viewer.id, p_plan: 'player' });
  if (!premium) redirectWith(back, 'error', 'premium_required');

  const { data: ev } = await supabase.from('events').select('starts_at').eq('id', id.data).maybeSingle();
  if (!ev) redirectWith('/events', 'error', 'not_found');
  const remindAt = new Date(new Date(ev.starts_at).getTime() - minutes * 60_000);
  if (remindAt.getTime() <= Date.now()) redirectWith(back, 'error', 'reminder_in_past');

  await supabase.from('event_reminders').delete().eq('user_id', viewer.id).eq('event_id', id.data);
  const { error } = await supabase.from('event_reminders').insert({ user_id: viewer.id, event_id: id.data, remind_at: remindAt.toISOString() });
  if (error) redirectWith(back, 'error', errorCode(error));
  redirectWith(back, 'ok', 'saved');
}

export async function clearReminder(formData: FormData) {
  const { supabase, viewer } = await requireViewer();
  const id = idSchema.safeParse(formData.get('event_id'));
  if (!id.success) redirectWith('/events', 'error', 'invalid_input');
  await supabase.from('event_reminders').delete().eq('user_id', viewer.id).eq('event_id', id.data);
  redirectWith(`/events/${id.data}`, 'ok', 'done');
}

export async function setEventStatus(formData: FormData) {
  const { supabase } = await requireViewer();
  const id = idSchema.safeParse(formData.get('event_id'));
  const status = String(formData.get('status'));
  if (!id.success || !['scheduled', 'live', 'ended'].includes(status)) redirectWith('/events', 'error', 'invalid_input');
  const { error } = await supabase.from('events').update({ status }).eq('id', id.data);
  revalidatePath(`/events/${id.data}`);
  if (error) redirectWith(`/events/${id.data}`, 'error', errorCode(error));
  redirectWith(`/events/${id.data}`, 'ok', 'saved');
}

export async function deleteEvent(formData: FormData) {
  const { supabase } = await requireViewer();
  const id = idSchema.safeParse(formData.get('event_id'));
  if (!id.success) redirectWith('/events', 'error', 'invalid_input');
  // Hinweis: Das Löschen setzt das kostenlose Kontingent NICHT zurück (Zähler sinkt nie).
  const { error } = await supabase.from('events').delete().eq('id', id.data);
  if (error) redirectWith(`/events/${id.data}`, 'error', errorCode(error));
  revalidatePath('/events');
  redirectWith('/events', 'ok', 'done');
}
