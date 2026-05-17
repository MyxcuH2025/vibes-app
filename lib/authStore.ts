import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';

export type Profile = {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  guild_id: string | null;
  explore_vibe: number;
  brain_vibe: number;
  created_at: string;
  onboarding_complete: boolean | null;
};

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

type ProfileFetchResult =
  | { status: 'ready'; profile: Profile }
  | { status: 'missing' };

type AuthStore = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  profileError: string | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
};

// Direkter REST-Fetch für Profil — umgeht den Supabase-Client-Proxy
// der nach Hot-Reload kein Auth-Token hat und deshalb hängt.
async function fetchProfileViaRest(userId: string, accessToken: string): Promise<ProfileFetchResult> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase-Umgebung fehlt.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `${url}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const detail = text ? `: ${text.substring(0, 120)}` : '';
      throw new Error(`Profil konnte nicht geladen werden (${res.status})${detail}`);
    }

    const data = await res.json();
    const profile = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!profile) return { status: 'missing' };
    if (profile.id !== userId) throw new Error('Profilantwort passt nicht zur aktuellen Session.');
    return { status: 'ready', profile: profile as Profile };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Profil-Laden hat zu lange gedauert.');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  profileStatus: 'idle',
  profileError: null,
  loading: false,
  initialized: false,

  setSession: (session) =>
    set((state) => {
      const nextUser = session?.user ?? null;
      const userChanged = state.user?.id !== nextUser?.id;
      return {
        session,
        user: nextUser,
        ...(session
          ? userChanged
            ? { profile: null, profileStatus: 'idle' as ProfileStatus, profileError: null }
            : {}
          : { profile: null, profileStatus: 'idle' as ProfileStatus, profileError: null }),
      };
    }),

  setProfile: (profile) =>
    set({
      profile,
      profileStatus: profile ? 'ready' : 'missing',
      profileError: null,
    }),

  fetchProfile: async (userId: string) => {
    const session = get().session;
    if (session?.user?.id !== userId) return;

    set({ profileStatus: 'loading', profileError: null });
    try {
      const accessToken = session.access_token;
      if (!accessToken) {
        if (__DEV__) console.warn('[auth] fetchProfile: kein Access-Token in Session');
        set({
          profile: null,
          profileStatus: 'error',
          profileError: 'Session enthält keinen Access-Token.',
        });
        return;
      }
      const result = await fetchProfileViaRest(userId, accessToken);
      if (get().session?.user?.id !== userId) return;
      set(
        result.status === 'ready'
          ? {
              profile: result.profile,
              profileStatus: 'ready',
              profileError: null,
            }
          : {
              profile: null,
              profileStatus: 'missing',
              profileError: null,
            }
      );
    } catch (e) {
      if (get().session?.user?.id !== userId) return;
      if (__DEV__) console.warn('[auth] fetchProfile failed', e);
      set({
        profile: null,
        profileStatus: 'error',
        profileError: e instanceof Error ? e.message : 'Profil konnte nicht geladen werden.',
      });
    }
  },

  signOut: async () => {
    const { supabase } = await import('./supabase');
    await supabase.auth.signOut();
    set({
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      profileError: null,
    });
  },
}));
