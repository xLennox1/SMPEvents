import type { EventStatus } from './time';

export type { EventStatus };
export type Role = 'user' | 'moderator' | 'admin';
export type EventCategory = 'giveaway' | 'lootdrop' | 'lootbox';

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  giveaway: 'Giveaway',
  lootdrop: 'Lootdrop',
  lootbox: 'Lootbox',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as EventCategory[];

export interface StreamerRef { id: string; display_name: string; is_verified: boolean }

export interface EventItem {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  rewards: string;
  status: EventStatus;
  streamer: StreamerRef | null;
}

export interface Viewer { id: string; username: string; avatar_url: string | null; role: Role }

export interface RankingRow {
  streamer_id: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  review_count: number;
  avg_rating: number | null;
  global_avg: number;
  m: number;
  weighted_rating: number | null;
  score: number | null;
  rank: number | null;
}

export const EVENT_SELECT =
  'id,title,description,category,starts_at,ends_at,timezone,rewards,status,streamer:streamer_profiles(id,display_name,is_verified)';
