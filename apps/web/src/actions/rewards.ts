'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { notifyShopOrder } from '@/lib/discord';
import { errorCode } from '@/lib/errors';
import { redirectWith, safeNext } from '@/lib/flash';
import { creatorCodeSchema, idSchema } from '@/lib/validation';

export async function createCreatorCode(fd: FormData) {
  const { supabase } = await requireViewer('/creator');
  const code = creatorCodeSchema.safeParse(fd.get('code'));
  if (!code.success) redirectWith('/creator', 'error', 'invalid_code');
  // Nur verifizierte Streamer: Die Datenbank-Funktion prüft den blauen Haken selbst.
  const { error } = await supabase.rpc('create_creator_code', { p_code: code.data });
  if (error) redirectWith('/creator', 'error', errorCode(error));
  revalidatePath('/creator');
  redirectWith('/creator', 'ok', 'code_created');
}

export async function supportCreator(fd: FormData) {
  const { supabase } = await requireViewer('/creator');
  const back = safeNext(fd.get('back'), '/creator');
  const code = creatorCodeSchema.safeParse(fd.get('code'));
  if (!code.success) redirectWith(back, 'error', 'invalid_code');
  const { error } = await supabase.rpc('support_creator', { p_code: code.data });
  if (error) redirectWith(back, 'error', errorCode(error));
  revalidatePath(back);
  redirectWith(back, 'ok', 'supported');
}

export async function stopSupporting(fd: FormData) {
  const { supabase } = await requireViewer('/creator');
  const back = safeNext(fd.get('back'), '/creator');
  await supabase.rpc('stop_supporting');
  revalidatePath(back);
  redirectWith(back, 'ok', 'done');
}

export async function buyItem(fd: FormData) {
  const { supabase, viewer } = await requireViewer('/shop');
  const id = idSchema.safeParse(fd.get('item_id'));
  if (!id.success) redirectWith('/shop', 'error', 'invalid_input');
  const { data: orderId, error } = await supabase.rpc('purchase_item', { p_item_id: id.data });
  if (error) redirectWith('/shop', 'error', errorCode(error));
  await notifyShopOrder(supabase, orderId as string, viewer.username); // optional (Discord), blockiert den Kauf nie
  revalidatePath('/shop');
  redirectWith('/shop', 'ok', 'purchased');
}
