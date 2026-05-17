import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

type PostMediaForDelete = {
  author_id: string;
  media_url: string | null;
  thumbnail_url: string | null;
};

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  return Array.from(new Set(urls.filter((url): url is string => !!url)));
}

async function cleanupR2Media(urls: string[]) {
  if (urls.length === 0) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Nicht eingeloggt.');

  const { error } = await supabase.functions.invoke('r2-delete', {
    body: { urls },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error && __DEV__) {
    console.warn('[r2-delete] cleanup failed:', error.message);
  }
}

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { data: post, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .select('author_id, media_url, thumbnail_url')
        .single();

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

      const mediaPost = post as PostMediaForDelete | null;
      await cleanupR2Media(uniqueUrls([mediaPost?.media_url, mediaPost?.thumbnail_url]));
    },
    onSuccess: (_data, postId) => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
      queryClient.invalidateQueries({ queryKey: ['guild-feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed-engagement'] });
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
