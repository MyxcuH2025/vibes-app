import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

type PostMediaForDelete = {
  author_id: string;
  media_url: string | null;
  thumbnail_url: string | null;
};

type CreatePostInput = {
  caption: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video';
  thumbnailUrl: string | null;
  tags: string[];
  guildId: string | null;
  isGuildPost?: boolean;
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
      const { data, error } = await supabase.rpc('delete_post', {
        p_post_id: postId,
      });

      if (error) throw error;
      const post = Array.isArray(data) ? data[0] as PostMediaForDelete | undefined : undefined;

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

      await cleanupR2Media(uniqueUrls([post?.media_url, post?.thumbnail_url]));
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

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      caption,
      mediaUrl,
      mediaType,
      thumbnailUrl,
      tags,
      guildId,
      isGuildPost = false,
    }: CreatePostInput) => {
      const { data, error } = await supabase.rpc('create_post', {
        p_caption: caption,
        p_media_url: mediaUrl,
        p_media_type: mediaType,
        p_thumbnail_url: thumbnailUrl,
        p_tags: tags,
        p_guild_id: guildId,
        p_is_guild_post: isGuildPost,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: (_postId, { guildId }) => {
      queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
      queryClient.invalidateQueries({ queryKey: ['guild-feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });
      if (guildId) queryClient.invalidateQueries({ queryKey: ['guild-feed', guildId] });
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
      const { error } = await supabase.rpc('update_post', {
        p_post_id: postId,
        p_caption: caption,
        p_tags: tags,
      });

      if (error) throw error;
    },
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
      queryClient.invalidateQueries({ queryKey: ['guild-feed'] });
    },
  });
}
