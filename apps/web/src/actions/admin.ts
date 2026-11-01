'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { redirectWith } from '@/lib/flash';
import { createClient } from '@/lib/supabase/server';
import { idSchema } from '@/lib/validation';

type Db = Awaited<ReturnType<typeof createClient>>;
type RpcResult = { error: { message?: string; code?: string } | null };

/** Rollenprüfung hier ist nur Komfort – die Datenbank-Funktionen prüfen Rolle und Eingaben selbst. */
async function run(tab: string, role: 'moderator' | 'admin', call: (db: Db) => PromiseLike<RpcResult>): Promise<never> {
  const { supabase } = await requireRole(role);
  const { error } = await call(supabase);
  revalidatePath('/admin');
  if (error) redirectWith(`/admin?tab=${tab}`, 'error', errorCode(error));
  return redirectWith(`/admin?tab=${tab}`, 'ok', 'done');
}

const TABS = ['verifications', 'payments', 'hints', 'premium', 'users', 'streamers', 'reports', 'reviews', 'chat', 'events', 'audit'];
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
/** Zurück in den Tab, aus dem das Formular kam (nur bekannte Tabs). */
const tabOf = (fd: FormData, fallback: string) => (TABS.includes(text(fd, 'tab')) ? text(fd, 'tab') : fallback);
const uuid = (fd: FormData, key: string) => {
  const r = idSchema.safeParse(fd.get(key));
  if (!r.success) redirectWith('/admin', 'error', 'invalid_input');
  return r.data;
};

export async function approveVerification(fd: FormData) {
  const id = uuid(fd, 'id');
  await run('verifications', 'admin', (db) => db.rpc('decide_verification', { p_request_id: id, p_approve: true, p_note: text(fd, 'note') || null }));
}
export async function rejectVerification(fd: FormData) {
  const id = uuid(fd, 'id');
  await run('verifications', 'admin', (db) => db.rpc('decide_verification', { p_request_id: id, p_approve: false, p_note: text(fd, 'note') || null }));
}
export async function revokeVerification(fd: FormData) {
  const id = uuid(fd, 'id');
  await run(tabOf(fd, 'verifications'), 'admin', (db) => db.rpc('revoke_verification', { p_streamer_id: id, p_reason: text(fd, 'note') }));
}

export async function approvePayment(fd: FormData) {
  const id = uuid(fd, 'id');
  const amount = Number(text(fd, 'verified_amount'));
  if (!Number.isInteger(amount) || amount <= 0) redirectWith('/admin?tab=payments', 'error', 'invalid_input');
  await run('payments', 'admin', (db) => db.rpc('approve_payment_submission', { p_submission_id: id, p_verified_amount: amount, p_note: text(fd, 'note') || null }));
}
export async function rejectPayment(fd: FormData) {
  const id = uuid(fd, 'id');
  await run('payments', 'admin', (db) => db.rpc('reject_payment_submission', { p_submission_id: id, p_note: text(fd, 'note') }));
}

export async function hideEvent(fd: FormData) {
  const id = uuid(fd, 'id');
  await run('events', 'moderator', (db) => db.rpc('moderate_event', { p_event_id: id, p_hide: true, p_reason: text(fd, 'note') }));
}
export async function unhideEvent(fd: FormData) {
  const id = uuid(fd, 'id');
  await run('events', 'moderator', (db) => db.rpc('moderate_event', { p_event_id: id, p_hide: false, p_reason: null }));
}

export async function removeReview(fd: FormData) {
  const id = uuid(fd, 'id');
  await run(tabOf(fd, 'reports'), 'moderator', (db) => db.rpc('moderate_review', { p_review_id: id, p_remove: true, p_reason: text(fd, 'note') }));
}
export async function restoreReview(fd: FormData) {
  const id = uuid(fd, 'id');
  await run(tabOf(fd, 'reviews'), 'moderator', (db) => db.rpc('moderate_review', { p_review_id: id, p_remove: false, p_reason: null }));
}
export async function deleteChatMessage(fd: FormData) {
  const id = uuid(fd, 'id');
  await run(tabOf(fd, 'reports'), 'moderator', (db) => db.rpc('delete_chat_message', { p_id: id }));
}
export async function dismissReport(fd: FormData) {
  const id = uuid(fd, 'id');
  const kind = text(fd, 'kind') === 'review' ? 'review' : 'chat';
  await run('reports', 'moderator', (db) => db.rpc('dismiss_report', { p_kind: kind, p_id: id }));
}
export async function muteUser(fd: FormData) {
  const id = uuid(fd, 'user_id');
  const minutes = Number(text(fd, 'minutes') || '60');
  await run(tabOf(fd, 'reports'), 'moderator', (db) => db.rpc('mute_chat_user', { p_user: id, p_minutes: minutes, p_reason: text(fd, 'note') || 'Chat-Moderation' }));
}

export async function setUserRole(fd: FormData) {
  const id = uuid(fd, 'user_id');
  const role = text(fd, 'role');
  if (!['user', 'moderator', 'admin'].includes(role)) redirectWith('/admin?tab=users', 'error', 'invalid_input');
  await run('users', 'admin', (db) => db.rpc('set_user_role', { p_user: id, p_role: role, p_reason: text(fd, 'note') }));
}

export async function revokePremium(fd: FormData) {
  const id = uuid(fd, 'user_id');
  const plan = text(fd, 'plan') === 'player' ? 'player' : 'streamer';
  await run('premium', 'admin', (db) => db.rpc('revoke_premium', { p_user: id, p_plan: plan, p_reason: text(fd, 'note') }));
}
