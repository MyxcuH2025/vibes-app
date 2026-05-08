import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  FadeInDown,
} from 'react-native-reanimated';
import { Users, MessageCircle, Heart, Bookmark, Share2, Clock } from 'lucide-react-native';
import CommentsSheet from '@/components/ui/CommentsSheet';
import { VideoGridThumb } from '@/components/ui/VideoGridThumb';
import { useLike } from '@/lib/useLike';
import { useCommentCount } from '@/lib/useComments';
import { useBookmark } from '@/lib/useBookmark';
import { sharePost } from '@/lib/useShare';
import type { GuildPost } from '@/lib/usePosts';
import { guildStyles as styles } from './guildStyles';

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins} Min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std`;
  return `vor ${Math.floor(hrs / 24)} Tagen`;
}

export function GuildCard({
  post,
  guildColors,
}: {
  post: GuildPost;
  guildColors: [string, string];
}) {
  const router = useRouter();
  const { liked, count, toggle } = useLike(post.id);
  const { data: commentCount = 0 } = useCommentCount(post.id);
  const { bookmarked, toggle: toggleBookmark } = useBookmark(post.id);
  const [showComments, setShowComments] = useState(false);
  const isVideo = post.media_type === 'video';
  const scale = useSharedValue(1);
  const [c0] = guildColors;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleLike = useCallback(() => {
    scale.value = withSequence(
      withTiming(1.18, { duration: 80 }),
      withTiming(1, { duration: 80 })
    );
    toggle();
  }, [toggle, scale]);

  const initials = post.username ? post.username.slice(0, 2).toUpperCase() : '??';

  return (
    <Animated.View entering={FadeInDown.duration(120)} style={styles.card}>
      <BlurView intensity={18} tint="dark" style={styles.cardBlur}>
        <View style={styles.cardHeader}>
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author_id } })}
            style={styles.avatarWrap}
          >
            {post.avatar_url ? (
              <Image source={{ uri: post.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={guildColors} style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author_id } })}
            >
              <Text style={styles.username}>{post.username ?? 'Unbekannt'}</Text>
            </Pressable>
            <View style={styles.metaRow}>
              <Clock size={11} color="#6B7280" />
              <Text style={styles.metaText}>{formatRelativeTime(post.created_at)}</Text>
            </View>
          </View>
          <View style={[styles.guildBadge, { backgroundColor: `${c0}33` }]}>
            <Users size={10} color={c0} />
            <Text style={[styles.guildBadgeText, { color: c0 }]}>Pod</Text>
          </View>
        </View>

        {post.media_url ? (
          <Pressable
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
            style={styles.mediaWrap}
          >
            {isVideo ? (
              <VideoGridThumb uri={post.media_url} thumbnailUri={post.thumbnail_url} style={styles.mediaThumb} />
            ) : (
              <Image source={{ uri: post.media_url }} style={styles.mediaThumb} resizeMode="cover" />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.35)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <Animated.View style={animatedStyle}>
            <Pressable onPress={handleLike} style={styles.actionBtn}>
              <Heart
                size={18}
                color={liked ? '#F43F5E' : '#6B7280'}
                fill={liked ? '#F43F5E' : 'transparent'}
              />
              <Text style={[styles.actionCount, liked && { color: '#F43F5E' }]}>{count}</Text>
            </Pressable>
          </Animated.View>
          <Pressable onPress={() => setShowComments(true)} style={styles.actionBtn}>
            <MessageCircle size={18} color="#6B7280" />
            <Text style={styles.actionCount}>
              {commentCount >= 1000 ? `${(commentCount / 1000).toFixed(1)}K` : commentCount}
            </Text>
          </Pressable>
          <Pressable onPress={toggleBookmark} style={styles.actionBtn}>
            <Bookmark
              size={18}
              color={bookmarked ? '#FBBF24' : '#6B7280'}
              fill={bookmarked ? '#FBBF24' : 'transparent'}
            />
          </Pressable>
          <Pressable onPress={() => sharePost(post.id, post.caption)} style={styles.actionBtn}>
            <Share2 size={18} color="#6B7280" />
          </Pressable>
        </View>

        {post.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.captionUser}>{post.username ?? 'Unbekannt'} </Text>
            <Text style={styles.caption}>{post.caption}</Text>
          </View>
        ) : null}
        {post.tags && post.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {post.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </BlurView>

      <CommentsSheet
        postId={post.id}
        visible={showComments}
        onClose={() => setShowComments(false)}
        mediaUrl={post.media_url}
        thumbnailUrl={post.thumbnail_url}
        mediaType={post.media_type}
      />
    </Animated.View>
  );
}
