'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { MotoListing, ListingStatus } from '@/types';
import { MOCK_LISTINGS, MOCK_FAVORITES, CURRENT_USER } from '@/data/mockData';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { USE_SUPABASE, getSupabase, dbToListing, listingToDb, isUUID } from '@/lib/supabase';

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
  provider?: 'email' | 'google';
}

interface AppContextValue {
  listings: MotoListing[];
  favorites: string[];
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  addListing: (listing: MotoListing) => Promise<void>;
  toggleFavorite: (listingId: string) => void;
  isFavorite: (listingId: string) => boolean;
  updateListingStatus: (listingId: string, status: ListingStatus) => void;
  incrementViews: (listingId: string) => void;
  getListingById: (id: string) => MotoListing | undefined;
  getUserListings: () => MotoListing[];
  uploadPhoto: (file: File) => Promise<string>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [listings, setListings] = useState<MotoListing[]>(MOCK_LISTINGS);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  // ─── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!USE_SUPABASE) {
      // ── localStorage fallback ──
      try {
        const stored = localStorage.getItem('mercadao-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.loggedIn) {
            setAuthUser({
              name: parsed.name || 'Usuário',
              email: parsed.email || '',
              avatar: parsed.avatar,
              provider: parsed.provider || 'email',
            });
          }
        }
      } catch { /* ignore */ }
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    const loadProfile = async (userId: string, email: string, provider: 'email' | 'google' = 'email') => {
      const result = await sb.from('profiles').select('*').eq('id', userId).single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profileData = result.data as any;
      setAuthUser({
        id: userId,
        name: (profileData?.name as string | undefined) || email.split('@')[0],
        email,
        avatar: (profileData?.avatar_url as string | undefined) ?? undefined,
        provider,
      });
    };

    // Get initial session using async IIFE
    (async () => {
      const result = await sb.auth.getSession();
      const session: Session | null = result.data?.session ?? null;
      if (session?.user) {
        const prov: 'email' | 'google' =
          session.user.app_metadata?.provider === 'google' ? 'google' : 'email';
        await loadProfile(session.user.id, session.user.email ?? '', prov);
      }
    })();

    // Subscribe to future auth state changes
    const { data: authData } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          const prov: 'email' | 'google' =
            session.user.app_metadata?.provider === 'google' ? 'google' : 'email';
          loadProfile(session.user.id, session.user.email ?? '', prov);
        } else {
          setAuthUser(null);
          setFavorites([]);
        }
      },
    );

    return () => authData.subscription.unsubscribe();
  }, []);

  // ─── Listings ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!USE_SUPABASE) {
      // ── localStorage merge ──
      try {
        const stored = localStorage.getItem('mercadao-user-listings');
        if (stored) {
          const userListings: MotoListing[] = JSON.parse(stored);
          const userIds = new Set(userListings.map((l) => l.id));
          setListings([...userListings, ...MOCK_LISTINGS.filter((l) => !userIds.has(l.id))]);
        }
      } catch { /* ignore */ }
      return;
    }

    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const result = await sb
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = result.data as any[] | null;
      if (!result.error && rows && rows.length > 0) {
        setListings(rows.map((row) => dbToListing(row as Record<string, unknown>)));
      }
      // If DB empty, keep mock data for demo purposes
    })();
  }, []);

  // ─── Favorites ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) return;

    if (!USE_SUPABASE || !authUser.id) {
      // ── localStorage ──
      try {
        const stored = localStorage.getItem('mercadao-favorites');
        if (stored) {
          setFavorites(JSON.parse(stored));
        } else {
          const initial = MOCK_FAVORITES
            .filter((f) => f.userId === CURRENT_USER.id)
            .map((f) => f.listingId);
          setFavorites(initial);
        }
      } catch { /* ignore */ }
      return;
    }

    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const result = await sb
        .from('favorites')
        .select('listing_id')
        .eq('user_id', authUser.id!);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const favData = result.data as any[] | null;
      if (favData) setFavorites(favData.map((f) => String(f.listing_id)));
    })();
  }, [authUser]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const persistLocalListings = useCallback((all: MotoListing[]) => {
    if (USE_SUPABASE) return;
    const owned = all.filter((l) => l.userId === CURRENT_USER.id);
    try { localStorage.setItem('mercadao-user-listings', JSON.stringify(owned)); } catch { /* ignore */ }
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Update local state + Supabase profile (or localStorage in mock mode) */
  const login = useCallback((user: AuthUser) => {
    setAuthUser(user);
    if (USE_SUPABASE && user.id) {
      (async () => {
        const sb = getSupabase();
        await sb?.from('profiles').upsert({
          id: user.id,
          name: user.name,
          avatar_url: user.avatar ?? null,
          updated_at: new Date().toISOString(),
        });
      })();
    } else {
      try { localStorage.setItem('mercadao-auth', JSON.stringify({ ...user, loggedIn: true })); } catch { /* ignore */ }
    }
  }, []);

  const logout = useCallback(() => {
    setAuthUser(null);
    setFavorites([]);
    if (USE_SUPABASE) {
      getSupabase()?.auth.signOut();
    } else {
      try { localStorage.removeItem('mercadao-auth'); } catch { /* ignore */ }
    }
  }, []);

  const addListing = useCallback(async (listing: MotoListing): Promise<void> => {
    if (USE_SUPABASE && authUser?.id) {
      const sb = getSupabase();
      if (sb) {
        const dbRow = listingToDb(listing, authUser.id);
        const result = await sb.from('listings').insert(dbRow).select().single();
        if (!result.error && result.data) {
          const saved = dbToListing(result.data as Record<string, unknown>);
          setListings((prev) => [saved, ...prev]);
          return;
        }
        console.error('[Supabase] addListing error:', result.error);
      }
    }
    // Fallback
    setListings((prev) => {
      const updated = [listing, ...prev];
      persistLocalListings(updated);
      return updated;
    });
  }, [authUser, persistLocalListings]);

  const toggleFavorite = useCallback((listingId: string) => {
    setFavorites((prev) => {
      const isFav = prev.includes(listingId);
      const next = isFav ? prev.filter((id) => id !== listingId) : [...prev, listingId];

      // Only use Supabase DB for real UUID listings (mock listings have non-UUID IDs)
      if (USE_SUPABASE && authUser?.id && isUUID(listingId)) {
        (async () => {
          const sb = getSupabase();
          if (!sb) return;
          if (isFav) {
            await sb.from('favorites').delete().match({ user_id: authUser.id, listing_id: listingId });
          } else {
            await sb.from('favorites').insert({ user_id: authUser.id, listing_id: listingId });
          }
        })();
      } else {
        try { localStorage.setItem('mercadao-favorites', JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [authUser]);

  const isFavorite = useCallback(
    (listingId: string) => favorites.includes(listingId),
    [favorites],
  );

  const updateListingStatus = useCallback((listingId: string, status: ListingStatus) => {
    setListings((prev) => {
      const now = new Date().toISOString();
      const updated = prev.map((l) =>
        l.id === listingId
          ? { ...l, status, updatedAt: now, soldAt: status === 'sold' ? now : l.soldAt }
          : l,
      );
      if (USE_SUPABASE) {
        (async () => {
          await getSupabase()
            ?.from('listings')
            .update({ status, updated_at: now, sold_at: status === 'sold' ? now : null })
            .eq('id', listingId);
        })();
      } else {
        persistLocalListings(updated);
      }
      return updated;
    });
  }, [persistLocalListings]);

  const incrementViews = useCallback((listingId: string) => {
    setListings((prev) => {
      const updated = prev.map((l) => l.id === listingId ? { ...l, views: l.views + 1 } : l);
      if (USE_SUPABASE) {
        getSupabase()?.rpc('increment_listing_views', { listing_id: listingId });
      } else {
        persistLocalListings(updated);
      }
      return updated;
    });
  }, [persistLocalListings]);

  const getListingById = useCallback(
    (id: string) => listings.find((l) => l.id === id),
    [listings],
  );

  const getUserListings = useCallback(() => {
    const userId = authUser?.id ?? CURRENT_USER.id;
    return listings.filter((l) => l.userId === userId);
  }, [listings, authUser]);

  const uploadPhoto = useCallback(async (file: File): Promise<string> => {
    if (USE_SUPABASE && authUser?.id) {
      const sb = getSupabase();
      if (sb) {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${authUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await sb.storage
          .from('listing-photos')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (!error) {
          const { data: urlData } = sb.storage.from('listing-photos').getPublicUrl(path);
          return urlData.publicUrl;
        }
        console.error('[Supabase] uploadPhoto error:', error);
      }
    }
    // Fallback: blob URL (valid for current browser session only)
    return URL.createObjectURL(file);
  }, [authUser]);

  return (
    <AppContext.Provider
      value={{
        listings,
        favorites,
        isLoggedIn: !!authUser,
        authUser,
        login,
        logout,
        addListing,
        toggleFavorite,
        isFavorite,
        updateListingStatus,
        incrementViews,
        getListingById,
        getUserListings,
        uploadPhoto,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
