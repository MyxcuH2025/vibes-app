import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import {
  Heart,
  Play,
  Pause,
  Share2,
  MoreVertical,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import CommentsSheet from '@/components/ui/CommentsSheet';
import { useLike } from '@/lib/useLike';
import { useFollow } from '@/lib/useFollow';
import { useAuthStore } from '@/lib/authStore';
import type { FeedEngagementMaps } from '@/lib/useFeedEngagement';
import type { UseLikeBatch } from '@/lib/useLike';
import type { StoryGroup } from '@/lib/useStories';
import { impactAsync, notificationAsync, ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
import { PostShareModal } from './PostShareModal';
import { PostOptionsModal } from './PostOptionsModal';
import { FallbackFeedVideo, NativeFeedVideo, USE_EXPO_VIDEO } from './FeedVideo';
import {
  ActionButton,
  BookmarkButton,
  CommentButton,
  LikeButton,
} from './FeedActionButtons';
import { feedItemStyles as styles } from './feedStyles';
import type { FeedItemData } from './types';

export const FeedItem = React.memo(function FeedItem({
  item,
  shouldPlayVideo,
  isMuted,
  onMuteToggle,
  storyGroup,
  onOpenStory,
  onOpenTune,
  engagement,
}: {
  item: FeedItemData;
  shouldPlayVideo: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  storyGroup?: StoryGroup;
  onOpenStory?: (g: StoryGroup) => void;
  onOpenTune?: () => void;
  engagement: FeedEngagementMaps;
}) {
  const router = useRouter();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imageError, setImageError] = useState(false);
  const isVideo = item.mediaType === 'video';

  const currentUserId = useAuthStore((s) => s.profile?.id);
  const likeBatch: UseLikeBatch = {
    liked: engagement.likedByPost[item.id] ?? false,
    count: engagement.likeCountByPost[item.id] ?? 0,
  };
  const followBatch =
    item.authorId && item.authorId !== currentUserId
      ? (engagement.followingByAuthor[item.authorId] ?? false)
      : undefined;
  const { isFollowing, toggle: toggleFollow, isOwnProfile } = useFollow(item.authorId ?? null, followBatch);

  const lastTap = useRef<number>(0);
  const { liked, formattedCount: likeFormatted, toggle: toggleLike } = useLike(item.id, likeBatch);

  const pauseIconOpacity = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const pauseIconStyle = useAnimatedStyle(() => ({ opacity: pauseIconOpacity.value }));
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const handleVideoTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!liked) {
        toggleLike();
        notificationAsync(NotificationFeedbackType.Success);
      }
      heartScale.value = withSequence(withTiming(1.4, { duration: 80 }), withTiming(1, { duration: 80 }));
      heartOpacity.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 80 }));
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    if (!isVideo) return;
    const next = !paused;
    setPaused(next);
    if (next) {
      pauseIconOpacity.value = withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 60 })
      );
    }
  };

  const handleProgress = useCallback((p: number) => setProgress(p), []);

  return (
    <View style={styles.feedItem}>
      {/* ── Hintergrund: Bild DIREKT in feedItem */}
      {item.mediaUrl && !isVideo && !imageError && (
        <>
          <RNImage
            source={{ uri: item.mediaUrl }}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
            resizeMode="cover"
            blurRadius={6}
            onError={() => setImageError(true)}
          />
          <RNImage
            source={{ uri: item.mediaUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={() => console.log('[Image LOADED]', item.mediaUrl)}
            onError={() => setImageError(true)}
          />
        </>
      )}
      {(!item.mediaUrl || imageError) && (
        <LinearGradient
          colors={item.gradient as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
        />
      )}
      {item.mediaUrl && isVideo && item.thumbnailUrl && (
        <RNImage
          source={{ uri: item.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={1}
        />
      )}

      <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoTap}>
        {item.mediaUrl && isVideo && (
          USE_EXPO_VIDEO ? (
            <NativeFeedVideo
              uri={item.mediaUrl}
              shouldPlay={shouldPlayVideo && !paused}
              isMuted={isMuted}
              onProgress={handleProgress}
            />
          ) : (
            <FallbackFeedVideo
              uri={item.mediaUrl}
              shouldPlay={shouldPlayVideo && !paused}
              isMuted={isMuted}
              onProgress={handleProgress}
            />
          )
        )}

        {!item.mediaUrl && (
          <View style={styles.patternOverlay}>
            <Text style={[styles.bigEmoji, { opacity: 0.06 }]}>
              {'◆ ◈ ◇ ◆ ◈\n◈ ◇ ◆ ◈ ◇\n◆ ◈ ◇ ◆ ◈\n◈ ◇ ◆ ◈ ◇'}
            </Text>
          </View>
        )}

        <Animated.View style={[styles.pauseIconWrap, pauseIconStyle]} pointerEvents="none">
          {paused ? <Play size={52} color="#fff" fill="#fff" /> : <Pause size={52} color="#fff" fill="#fff" />}
        </Animated.View>

        <Animated.View style={[styles.doubleTapHeart, heartStyle]} pointerEvents="none">
          <Heart size={90} color="#F472B6" fill="#F472B6" />
        </Animated.View>
      </Pressable>

      <PostShareModal
        visible={shareOpen}
        postId={item.id}
        postCaption={item.caption}
        postAuthor={item.author}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
        onToggleFollow={() => {
          toggleFollow();
          notificationAsync(NotificationFeedbackType.Success);
        }}
        onClose={() => setShareOpen(false)}
      />

      <PostOptionsModal
        visible={optionsOpen}
        postId={item.id}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
        authorName={item.author}
        onToggleFollow={() => {
          toggleFollow();
          notificationAsync(NotificationFeedbackType.Success);
        }}
        onOpenTune={() => onOpenTune?.()}
        onClose={() => setOptionsOpen(false)}
      />

      <CommentsSheet
        postId={item.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        mediaUrl={item.mediaUrl}
        thumbnailUrl={item.thumbnailUrl}
        mediaType={item.mediaType}
      />

      <View style={styles.bottomInfo} pointerEvents="box-none">
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.tagBadge}>
          <View style={[styles.tagDot, { backgroundColor: item.accentColor }]} />
          <Text style={[styles.tagText, { color: item.accentColor }]}>{item.tag}</Text>
        </View>
        <View style={styles.authorRow}>
          <Pressable
            onPress={() => {
              if (storyGroup && onOpenStory) {
                impactAsync(ImpactFeedbackStyle.Light);
                onOpenStory(storyGroup);
              } else if (item.authorId) {
                router.push({ pathname: '/user/[id]', params: { id: item.authorId } });
              }
            }}
            hitSlop={8}
            style={styles.authorAvatarWrap}
          >
            {storyGroup ? (
              storyGroup.hasUnviewed ? (
                <LinearGradient
                  colors={['#A78BFA', '#F472B6', '#FB923C']}
                  style={styles.storyRingGradient}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={styles.storyRingGap}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.authorAvatar} />
                    ) : (
                      <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                        <Text style={styles.authorAvatarInitial}>{(item.author[1] ?? '?').toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              ) : (
                <View style={styles.storyRingViewed}>
                  <View style={styles.storyRingGap}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.authorAvatar} />
                    ) : (
                      <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                        <Text style={styles.authorAvatarInitial}>{(item.author[1] ?? '?').toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            ) : item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.authorAvatar} />
            ) : (
              <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                <Text style={styles.authorAvatarInitial}>{(item.author[1] ?? '?').toUpperCase()}</Text>
              </View>
            )}
            {!isOwnProfile && (
              <Pressable
                onPress={() => {
                  impactAsync(ImpactFeedbackStyle.Light);
                  toggleFollow();
                }}
                style={[styles.followBadge, isFollowing && styles.followBadgeActive]}
                hitSlop={6}
              >
                {isFollowing ? <UserCheck size={10} color="#fff" /> : <Text style={styles.followBadgePlus}>+</Text>}
              </Pressable>
            )}
          </Pressable>
          <Pressable
            onPress={() => item.authorId && router.push({ pathname: '/user/[id]', params: { id: item.authorId } })}
            hitSlop={8}
          >
            <Text style={styles.authorName}>{item.author}</Text>
            {item.tags && item.tags.length > 0 && (
              <Text style={styles.authorTags} numberOfLines={1}>
                {item.tags.map((t) => `#${t}`).join(' ')}
              </Text>
            )}
          </Pressable>
        </View>
        {item.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {item.caption}
          </Text>
        ) : null}

        {isVideo && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>

      <View style={styles.rightActions}>
        {isVideo && (
          <Pressable onPress={onMuteToggle} style={styles.muteBtn} hitSlop={12}>
            <BlurView intensity={60} tint="dark" style={styles.muteBtnBlur}>
              {isMuted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
            </BlurView>
          </Pressable>
        )}
        <LikeButton
          accentColor={item.accentColor}
          liked={liked}
          formattedCount={likeFormatted}
          onToggle={toggleLike}
        />
        <CommentButton
          postId={item.id}
          onPress={() => setCommentsOpen(true)}
          batchCount={engagement.commentCountByPost[item.id]}
        />
        <BookmarkButton postId={item.id} batchBookmarked={engagement.bookmarkedByPost[item.id]} />
        <ActionButton
          icon={Share2}
          onPress={() => {
            impactAsync(ImpactFeedbackStyle.Light);
            setShareOpen(true);
          }}
        />
        <ActionButton
          icon={MoreVertical}
          onPress={() => {
            impactAsync(ImpactFeedbackStyle.Light);
            setOptionsOpen(true);
          }}
        />
      </View>
    </View>
  );
});
