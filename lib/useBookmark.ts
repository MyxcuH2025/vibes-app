import { Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore } from './authStore';

export function useBookmark(postId: string, batchBookmarked?: boolean) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);
  const skipQuery = batchBookmarked !== undefined;

  const { data: bookmarkedFromQ = false } = useQuery({
    queryKey: ['bookmark', userId, postId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('post_id', postId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId && !skipQuery,
    staleTime: 1000 * 60,
  });

  const bookmarked = skipQuery ? batchBookmarked! : bookmarkedFromQ;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bookmark', userId, postId] });
    queryClient.invalidateQueries({ queryKey: ['bookmarked-posts', userId] });
    queryClient.invalidateQueries({ queryKey: ['feed-engagement', userId] });
  };

  const save = useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['bookmark', userId, postId] });
      queryClient.setQueryData(['bookmark', userId, postId], true);
    },
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('bookmarks')
        .insert({ user_id: userId, post_id: postId });
      if (error) throw error;
    },
    onError: (err: any) => {
      queryClient.setQueryData(['bookmark', userId, postId], false);
      if (err?.message?.includes('does not exist') || err?.code === '42P01') {
        Alert.alert('Setup fehlt', 'Bitte führe bookmarks.sql im Supabase SQL Editor aus.');
      } else {
        Alert.alert('Fehler', err?.message ?? 'Bookmark konnte nicht gespeichert werden.');
      }
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['bookmark', userId, postId] });
      queryClient.setQueryData(['bookmark', userId, postId], false);
    },
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId);
      if (error) throw error;
    },
    onError: (err: any) => {
      queryClient.setQueryData(['bookmark', userId, postId], true);
      if (err?.message?.includes('does not exist') || err?.code === '42P01') {
        Alert.alert('Setup fehlt', 'Bitte führe bookmarks.sql im Supabase SQL Editor aus.');
      } else {
        Alert.alert('Fehler', err?.message ?? 'Bookmark konnte nicht entfernt werden.');
      }
    },
    onSettled: invalidate,
  });

  const toggle = () => {
    if (!userId) {
      Alert.alert('Nicht eingeloggt', 'Du musst eingeloggt sein, um Beiträge zu speichern.');
      return;
    }
    if (bookmarked) remove.mutate();
    else save.mutate();
  };

  return { bookmarked, toggle, isLoading: save.isPending || remove.isPending };
}

export type BookmarkedPost = {
  id: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  created_at: string;
};

export function useBookmarkedPosts() {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['bookmarked-posts', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('bookmarks')
        .select('post_id, posts(id, caption, media_url, thumbnail_url, media_type, created_at)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b: any) => b.posts as BookmarkedPost).filter(Boolean);
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
}
