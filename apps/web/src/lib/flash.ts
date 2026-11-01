import { redirect } from 'next/navigation';

/** Leitet mit einem Status-Code (nie mit freiem Text) zurück auf eine Seite. */
export function redirectWith(path: string, kind: 'error' | 'ok', code: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}${kind}=${encodeURIComponent(code)}`);
}

/** Verhindert Open-Redirects: nur interne Pfade. */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;
}

export function formToObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v === '' ? undefined : v;
  return out;
}
