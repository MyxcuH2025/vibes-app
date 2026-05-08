import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useVibeStore } from './store';

export type PostWithAuthor = {
  id: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  dwell_time_score: number;
  score_explore: number;
  score_brain: number;
  tags: string[];
  created_at: string;
  author_id: string;
  guild_id: string | null;
  is_guild_post: boolean;
  // Felder aus dem RPC-Join
  username: string | null;
  avatar_url: string | null;
  final_score: number;
};

const FEED_PAGE_SIZE = 15;

export function useVibeFeed(activeTag: string | null = null) {
  const committedExplore = useVibeStore((s) => s.committedExplore);
  const committedBrain   = useVibeStore((s) => s.committedBrain);

  return useInfiniteQuery<PostWithAuthor[]>({
    queryKey: ['vibe-feed', committedExplore, committedBrain, activeTag],
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Wenn die letzte Seite weniger als PAGE_SIZE Posts hat, gibt es keine weitere Seite
      if (lastPage.length < FEED_PAGE_SIZE) return undefined;
      return allPages.length * FEED_PAGE_SIZE;
    },
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;

      // Primär: personalisierter RPC mit Dwell-Algorithmus
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_vibe_feed', {
        explore_weight: committedExplore,
        brain_weight:   committedBrain,
        result_limit:   FEED_PAGE_SIZE,
        result_offset:  offset,
        filter_tag:     activeTag ?? null,
      });

      if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData as PostWithAuthor[];
      }

      // Fallback: direkter Query wenn RPC fehlt oder leer zurückgibt
      const query = supabase
        .from('posts')
        .select(`
          id, author_id, caption, media_url, thumbnail_url, media_type,
          dwell_time_score, score_explore, score_brain,
          tags, guild_id, is_guild_post, created_at,
          profiles!author_id (username, avatar_url)
        `)
        .is('is_guild_post', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + FEED_PAGE_SIZE - 1);

      if (activeTag) {
        query.contains('tags', [activeTag]);
      }

      const { data: fallbackData, error: fallbackError } = await query;

      if (fallbackError) throw fallbackError;

      return ((fallbackData ?? []) as any[]).map((p) => ({
        ...p,
        username:   (p.profiles as any)?.username   ?? null,
        avatar_url: (p.profiles as any)?.avatar_url ?? null,
        final_score: p.dwell_time_score ?? 0,
      })) as PostWithAuthor[];
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export type GuildPost = {
  id: string;
  author_id: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  tags: string[];
  created_at: string;
  username: string | null;
  avatar_url: string | null;
  author_guild_id: string | null;
};

export function useGuildFeed() {
  return useQuery({
    queryKey: ['guild-feed'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_guild_feed', {
        result_limit: 20,
      });
      if (error) throw error;
      return (data as GuildPost[]) ?? [];
    },
    staleTime: 1000 * 60 * 3,   // 3 Minuten Cache — kein Refetch bei jedem Tab-Wechsel
    gcTime:    1000 * 60 * 10,  // 10 Minuten im Speicher halten
    refetchOnWindowFocus: false, // kein automatisches Refetch im Hintergrund
  });
}

export type UserPost = {
  id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  caption: string | null;
  dwell_time_score: number;
};

export function useUserPosts(userId: string | null) {
  return useQuery({
    queryKey: ['user-posts', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('id, media_url, thumbnail_url, media_type, caption, dwell_time_score')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserPost[];
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  });
}

export type GuildInfo = {
  id: string;
  name: string;
  description: string | null;
  vibe_tags: string[];
};

export function useGuildInfo(guildId: string | null) {
  return useQuery({
    queryKey: ['guild-info', guildId],
    queryFn: async () => {
      if (!guildId) return null;
      const { data, error } = await supabase
        .from('guilds')
        .select('id, name, description, vibe_tags')
        .eq('id', guildId)
        .single();
      if (error) throw error;
      return data as GuildInfo;
    },
    enabled: !!guildId,
    staleTime: 1000 * 60 * 10,
  });
}
