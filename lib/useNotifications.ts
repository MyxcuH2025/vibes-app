import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore } from './authStore';

export type AppNotification = {
  id: string;
  type: 'like' | 'comment' | 'follow';
  read: boolean;
  created_at: string;
  comment_text: string | null;
  post_id: string | null;
  sender: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  post_thumb: string | null;
};

export function useNotifications() {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery<AppNotification[]>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id, type, read, created_at, comment_text, post_id,
          sender:sender_id ( id, username, avatar_url ),
          post:post_id ( media_url, thumbnail_url )
        `)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      return (data ?? []).map((n: any) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        created_at: n.created_at,
        comment_text: n.comment_text ?? null,
        post_id: n.post_id ?? null,
        sender: n.sender ?? null,
        post_thumb: n.post?.thumbnail_url ?? n.post?.media_url ?? null,
      }));
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
}

export function useUnreadCount() {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery<number>({
    queryKey: ['notifications-unread', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('read', false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('recipient_id', userId)
        .eq('read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}

export function useMarkOneRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notifId: string) => {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notifId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}
