export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase ist nicht konfiguriert: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen (siehe README).',
    );
  }
  return { url, key };
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const twitchChannel = () => process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? 'xLennox_Tv';
export const discordTicketUrl = () => process.env.NEXT_PUBLIC_DISCORD_TICKET_URL || null;

/** Betreiberangaben für Impressum und Datenschutz. Bewusst nicht vorbelegt: Sie kommen aus der Umgebung, nie aus dem Code. */
export const operator = () => ({
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME || null,
  address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS || null,
  email: process.env.NEXT_PUBLIC_OPERATOR_EMAIL || null,
});
