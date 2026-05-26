import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MotoListing } from '@/types';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when valid Supabase credentials are present in env vars */
export const USE_SUPABASE =
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;

let _client: SupabaseClient | null = null;

/** Returns a singleton browser Supabase client, or null if not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!USE_SUPABASE) return null;
  if (!_client) {
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY) as SupabaseClient;
  }
  return _client;
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

export function dbToListing(row: Record<string, unknown>): MotoListing {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    productType: (row.product_type as MotoListing['productType']) || 'moto',
    title: String(row.title || ''),
    description: String(row.description || ''),
    brand: (row.brand as MotoListing['brand']) || 'Outra',
    model: String(row.model || ''),
    year: Number(row.year || new Date().getFullYear()),
    displacement: (row.displacement as MotoListing['displacement']) || '250cc',
    engineType: (row.engine_type as MotoListing['engineType']) || 'four_stroke',
    category: (row.category as MotoListing['category']) || 'motocross',
    price: Number(row.price || 0),
    acceptsTrade: Boolean(row.accepts_trade),
    acceptsProposals: Boolean(row.accepts_proposals ?? true),
    city: String(row.city || ''),
    state: String(row.state || ''),
    documentation: String(row.documentation || 'Sem documento'),
    condition: String(row.condition || 'Seminovo'),
    status: (row.status as MotoListing['status']) || 'active',
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    mainPhoto: String(row.main_photo || ''),
    views: Number(row.views || 0),
    featured: Boolean(row.featured),
    featuredUntil: row.featured_until ? String(row.featured_until) : undefined,
    source: (row.source as MotoListing['source']) || 'manual',
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    sourcePlatform: row.source_platform
      ? (row.source_platform as MotoListing['sourcePlatform'])
      : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    soldAt: row.sold_at ? String(row.sold_at) : undefined,
  };
}

/** Converts a MotoListing to a DB insert row (no `id` — DB generates UUID). */
export function listingToDb(
  listing: MotoListing,
  userId: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    product_type: listing.productType,
    title: listing.title,
    description: listing.description || '',
    brand: listing.brand || 'Outra',
    model: listing.model || '',
    year: listing.year || new Date().getFullYear(),
    displacement: listing.displacement || '250cc',
    engine_type: listing.engineType || 'four_stroke',
    category: listing.category || 'motocross',
    price: listing.price || 0,
    accepts_trade: listing.acceptsTrade ?? false,
    accepts_proposals: listing.acceptsProposals ?? true,
    city: listing.city || '',
    state: listing.state || '',
    documentation: listing.documentation || 'Sem documento',
    condition: listing.condition || 'Seminovo',
    status: listing.status || 'active',
    photos: listing.photos || [],
    main_photo: listing.mainPhoto || '',
    views: listing.views || 0,
    featured: listing.featured ?? false,
    source: listing.source || 'manual',
    source_url: listing.sourceUrl ?? null,
    source_platform: listing.sourcePlatform ?? null,
  };
}

/** UUID v4 regex — used to distinguish Supabase listings from mock data IDs. */
export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
