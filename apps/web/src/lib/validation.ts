import { z } from 'zod';
import { isValidTimeZone } from './time';

const twitchUrl = z.string().trim()
  .regex(/^https:\/\/(www\.)?twitch\.tv\/[A-Za-z0-9_]{3,25}\/?$/i, 'Twitch-URL im Format https://www.twitch.tv/kanalname');
const mcName = z.string().trim().regex(/^[A-Za-z0-9_]{3,16}$/, 'Minecraft-Name (3–16 Zeichen: Buchstaben, Zahlen, _)');
const username = z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/, 'Benutzername: 3–20 Zeichen (Buchstaben, Zahlen, _)');

export const idSchema = z.string().uuid();

export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });
export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  username,
});

export const profileSchema = z.object({
  username,
  bio: z.string().trim().max(300).optional(),
  twitch_url: twitchUrl.optional(),
});
export const streamerSchema = z.object({
  display_name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(1000).optional(),
  twitch_url: twitchUrl,
});

export const reviewSchema = z.object({
  streamer_id: idSchema,
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(3).max(1000),
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(['giveaway', 'lootdrop', 'lootbox']),
  starts_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone: z.string().refine(isValidTimeZone, 'Ungültige Zeitzone'),
  duration_minutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
  rewards: z.string().trim().min(1).max(500),
  conditions: z.string().trim().max(1000).optional(),
  link_url: z.string().trim().url().startsWith('https://').max(500).optional(),
});

export const paymentSubmissionSchema = z.object({
  plan: z.enum(['streamer', 'player']),
  payer_ingame_name: mcName,
  claimed_amount_coins: z.coerce.number().int().positive().max(1_000_000_000_000),
  note: z.string().trim().max(500).optional(),
});

export const chatMessageSchema = z.string().trim().min(1).max(500);

/** Payload der Minecraft-Mod. Nicht erkannte Felder sind null/fehlen – nie geraten. */
export const paymentEventSchema = z.object({
  senderName: mcName.nullable().optional(),
  recipientName: mcName.nullable().optional(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  currency: z.string().trim().min(1).max(16).nullable().optional(),
  rawMessage: z.string().min(1).max(512),
  observedAt: z.string().datetime({ offset: true }).optional(),
  patternId: z.string().trim().max(64).optional(),
  modVersion: z.string().trim().max(32).optional(),
});
export type PaymentEventPayload = z.infer<typeof paymentEventSchema>;
