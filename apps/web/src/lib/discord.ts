import 'server-only';
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Meldet eine neue Shop-Bestellung in deinem Discord (optional). Ohne DISCORD_SHOP_WEBHOOK_URL passiert nichts;
 * Fehler blockieren den Kauf nie. Die Webhook-URL ist ein Geheimnis und steht nur serverseitig in der Umgebung.
 */
export async function notifyShopOrder(db: Db, orderId: string, username: string): Promise<void> {
  const url = process.env.DISCORD_SHOP_WEBHOOK_URL;
  if (!url || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) return;
  try {
    const { data: o } = await db.from('shop_orders').select('item_name,price_points,minecraft_name').eq('id', orderId).maybeSingle();
    if (!o) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        username: 'SMPEvents Shop',
        allowed_mentions: { parse: [] }, // nie @everyone/@here aus Nutzereingaben auslösen
        embeds: [{
          title: 'Neue Shop-Bestellung',
          color: 0x2f6bff,
          fields: [
            { name: 'Artikel', value: clip(String(o.item_name), 200), inline: true },
            { name: 'Punkte', value: String(o.price_points), inline: true },
            { name: 'Minecraft-Name', value: clip(String(o.minecraft_name), 40), inline: true },
            { name: 'Konto', value: clip(username, 40), inline: true },
          ],
        }],
      }),
    });
  } catch {
    console.error('[smpevents] Discord-Benachrichtigung fehlgeschlagen'); // bewusst ohne URL im Log
  }
}
