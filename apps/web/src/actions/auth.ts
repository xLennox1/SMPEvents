'use server';
import { redirect } from 'next/navigation';
import { siteUrl } from '@/lib/env';
import { formToObject, redirectWith, safeNext } from '@/lib/flash';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from '@/lib/validation';

export async function signIn(formData: FormData) {
  const next = safeNext(formData.get('next'));
  const back = `/login?next=${encodeURIComponent(next)}`;
  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith(back, 'error', 'invalid_input');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirectWith(back, 'error', 'invalid_credentials');
  redirect(next);
}

export async function signUp(formData: FormData) {
  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirectWith('/register', 'error', 'invalid_input');
  const { email, password, username } = parsed.data;
  const supabase = await createClient();

  // Benutzername vorab prüfen (ohne Groß-/Kleinschreibung; "_" ist in ILIKE ein Platzhalter und wird maskiert)
  const { data: taken } = await supabase.from('profiles').select('id').ilike('username', username.replace(/_/g, '\\_')).limit(1);
  if (taken && taken.length > 0) redirectWith('/register', 'error', 'duplicate');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) redirectWith('/register', 'error', 'invalid_input');
  if (data.session) redirect('/profile');
  redirectWith('/login', 'ok', 'confirm_email');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
