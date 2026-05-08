import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type LeaderboardPost = {
  id: string;
  caption: string | null;
  media_url: string;
  thumbnail_url: string | null;
  media_type: string;
  dwell_time_score: number;
  avg_seconds: number;
  completion_pct: number;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_avatar: string | null;
};

export type LeaderboardMember = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  post_count: number;
  avg_dwell_score: number;
  avg_completion_pct: number;
  best_score: number;
};

export type GuildLeaderboard = {
  top_posts: LeaderboardPost[];
  top_members: LeaderboardMember[];
};

export function useGuildLeaderboard(guildId: string | null | undefined) {
  return useQuery<GuildLeaderboard>({
    queryKey: ['guild-leaderboard', guildId],
    queryFn: async () => {
      if (!guildId) return { top_posts: [], top_members: [] };

      const { data, error } = await supabase.rpc('get_guild_leaderboard', {
        p_guild_id: guildId,
      });

      if (error) throw error;

      return {
        top_posts:   (data?.top_posts   ?? []) as LeaderboardPost[],
        top_members: (data?.top_members ?? []) as LeaderboardMember[],
      };
    },
    enabled: !!guildId,
    staleTime: 1000 * 60 * 5,   // 5 Minuten Cache
    gcTime:   1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });
}
