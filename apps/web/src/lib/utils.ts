import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Next.js liefert searchParams-Werte als string | string[] | undefined. */
export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
