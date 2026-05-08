import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      // Zuerst Media-Pfad holen um Storage-Datei zu löschen
      const { data: post } = await supabase
        .from('posts')
        .select('media_url')
        .eq('id', postId)
        .single();

      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      // Legacy Supabase-Storage-Datei löschen. Neue Uploads liegen in R2 und
      // werden hier bewusst nicht clientseitig entfernt.
      if (post?.media_url) {
        const url = post.media_url as string;
        const marker = '/storage/v1/object/public/posts/';
        const bucketPath = url.includes(marker) ? url.split(marker)[1] : null;
        if (bucketPath) {
          await supabase.storage.from('posts').remove([bucketPath]);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
      queryClient.invalidateQueries({ queryKey: ['guild-feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      caption,
      tags,
    }: {
      postId: string;
      caption: string;
      tags: string[];
    }) => {
      const { error } = await supabase
        .from('posts')
        .update({ caption, tags })
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
      queryClient.invalidateQueries({ queryKey: ['guild-feed'] });
    },
  });
}
