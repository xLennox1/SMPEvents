'use server';
import { revalidatePath } from 'next/cache';
import { requireViewer } from '@/lib/auth';
import { errorCode } from '@/lib/errors';
import { formToObject, redirectWith } from '@/lib/flash';
import { paymentSubmissionSchema } from '@/lib/validation';

/**
 * Legt nur einen Zahlungsnachweis zur Prüfung an. Premium wird ausschließlich von einem Administrator
 * über die RPC approve_payment_submission aktiviert – nie automatisch, nie aus Mod-Meldungen.
 */
export async function submitPayment(formData: FormData) {
  const { supabase, viewer } = await requireViewer('/premium');
  const parsed = paymentSubmissionSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/premium', 'error', 'invalid_input');

  const { data: rec } = await supabase.from('app_settings').select('value').eq('key', 'payment_recipient').maybeSingle();
  if (!rec || typeof rec.value !== 'string' || rec.value.trim() === '') redirectWith('/premium', 'error', 'not_configured');

  const { error } = await supabase.from('payment_submissions').insert({ user_id: viewer.id, ...parsed.data });
  if (error) redirectWith('/premium', 'error', errorCode(error));
  revalidatePath('/premium');
  redirectWith('/premium', 'ok', 'payment_submitted');
}
