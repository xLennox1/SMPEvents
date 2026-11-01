export type TwitchStatus =
  | { state: 'live'; title: string; game: string; viewers: number }
  | { state: 'offline' }
  | { state: 'unknown' };

let cachedToken: { value: string; expiresAt: number } | null = null;

async function appToken(id: string, secret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

/** Offizielle Twitch-Helix-API. Ohne Zugangsdaten oder bei Fehlern: "unknown" – nie ein erfundener Status. */
export async function getTwitchStatus(channel: string): Promise<TwitchStatus> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return { state: 'unknown' };
  try {
    const token = await appToken(id, secret);
    if (!token) return { state: 'unknown' };
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel.toLowerCase())}`, {
      headers: { 'Client-Id': id, Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 401) cachedToken = null;
    if (!res.ok) return { state: 'unknown' };
    const json = (await res.json()) as { data?: Array<{ type: string; title: string; game_name: string; viewer_count: number }> };
    const s = json.data?.[0];
    return s && s.type === 'live'
      ? { state: 'live', title: s.title, game: s.game_name, viewers: s.viewer_count }
      : { state: 'offline' };
  } catch {
    return { state: 'unknown' };
  }
}
