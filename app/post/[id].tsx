import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSequence } from 'react-native-reanimated';
import { ArrowLeft, Heart, MessageCircle, Bookmark, Share2, Trash2, Pencil, Volume2, VolumeX } from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { useLike } from '@/lib/useLike';
import { useCommentCount } from '@/lib/useComments';
import { useBookmark } from '@/lib/useBookmark';
import { sharePost } from '@/lib/useShare';
import CommentsSheet from '@/components/ui/CommentsSheet';
import { useDeletePost } from '@/lib/usePostManagement';


const { width: W, height: H } = Dimensions.get('window');

type PostDetail = {
  id: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  tags: string[];
  created_at: string;
  author_id: string;
  profiles: { username: string; avatar_url: string | null } | null;
};

function LikeButtonDetail({ postId }: { postId: string }) {
  const { liked, formattedCount, toggle } = useLike(postId);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.7, { duration: 60 }),
      withTiming(1.35, { duration: 80 }),
      withTiming(1, { duration: 80 })
    );
    toggle();
  };

  return (
    <Pressable onPress={handlePress} style={styles.actionBtn}>
      <Animated.View style={[
        styles.actionBtnInner,
        animStyle,
        liked && { backgroundColor: 'rgba(244,114,182,0.2)' },
      ]}>
        <Heart
          size={24}
          stroke={liked ? '#F472B6' : '#FFFFFF'}
          strokeWidth={1.8}
          fill={liked ? '#F472B6' : 'transparent'}
        />
      </Animated.View>
      <Text style={[styles.actionCount, liked && { color: '#F472B6' }]}>
        {formattedCount}
      </Text>
    </Pressable>
  );
}

function BookmarkButtonDetail({ postId }: { postId: string }) {
  const { bookmarked, toggle } = useBookmark(postId);
  return (
    <Pressable style={styles.actionBtn} onPress={toggle}>
      <View style={[
        styles.actionBtnInner,
        bookmarked && { backgroundColor: 'rgba(251,191,36,0.15)' },
      ]}>
        <Bookmark
          size={24}
          stroke={bookmarked ? '#FBBF24' : '#FFFFFF'}
          strokeWidth={1.8}
          fill={bookmarked ? '#FBBF24' : 'transparent'}
        />
      </View>
    </Pressable>
  );
}

function CommentButtonDetail({ postId, onPress }: { postId: string; onPress: () => void }) {
  const { data: count = 0 } = useCommentCount(postId);
  const formatted = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
  return (
    <Pressable style={styles.actionBtn} onPress={onPress}>
      <View style={styles.actionBtnInner}>
        <MessageCircle size={24} stroke="#FFFFFF" strokeWidth={1.8} />
      </View>
      <Text style={styles.actionCount}>{formatted}</Text>
    </Pressable>
  );
}

export default function PostDetailScreen() {
  const { id, previewUrl, previewType, previewCaption, previewThumbnailUrl } = useLocalSearchParams<{
    id: string;
    previewUrl?: string;
    previewType?: string;
    previewCaption?: string;
    previewThumbnailUrl?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { mutateAsync: deletePost } = useDeletePost();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const isOwner = post?.author_id === profile?.id;

  // Sofort-Preview aus Params — zeigt Media ohne auf DB zu warten
  const hasPreview = !!previewUrl;

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      if (!id) return;

      (async () => {
        setLoading(true);

        // Post laden — ohne Join, um Foreign-Key-Probleme zu vermeiden
        const { data: postData, error: postErr } = await supabase
          .from('posts')
          .select('id, caption, media_url, thumbnail_url, media_type, tags, created_at, author_id')
          .eq('id', id)
          .single();

        if (postErr || !postData) {
          console.warn('[PostDetail] Post nicht geladen:', postErr?.message);
          setLoading(false);
          return;
        }

        // Autor-Profil separat laden
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', postData.author_id)
          .single();

        setPost({
          ...postData,
          tags: postData.tags ?? [],
          profiles: profileData ?? null,
        } as PostDetail);
        setLoading(false);
      })();

      return () => setScreenFocused(false);
    }, [id])
  );

  const handleDelete = () => {
    Alert.alert(
      'Post löschen',
      'Möchtest du diesen Vibe wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost(id);
              router.back();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Post konnte nicht gelöscht werden.';
              Alert.alert('Fehler', message);
            }
          },
        },
      ]
    );
  };

  // Wenn noch kein Post und keine Preview vorhanden → Spinner
  if (loading && !hasPreview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#A78BFA" size="large" />
      </View>
    );
  }

  // Post aus DB konnte nicht geladen werden und keine Preview
  if (!loading && !post && !hasPreview) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Post nicht gefunden.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtnCenter}>
          <Text style={styles.backBtnText}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  // Daten: entweder aus DB (post) oder aus Preview-Params
  const displayMediaUrl    = post?.media_url    ?? previewUrl    ?? null;
  const displayThumbnailUrl = post?.thumbnail_url ?? previewThumbnailUrl ?? null;
  const displayMediaType   = post?.media_type   ?? previewType   ?? 'image';
  const displayCaption     = post?.caption      ?? previewCaption ?? null;
  const displayAuthorId    = post?.author_id    ?? null;
  const displayCreatedAt   = post?.created_at   ?? null;
  const displayTags        = post?.tags         ?? [];
  const displayUsername    = post?.profiles?.username    ?? null;
  const displayAvatarUrl   = post?.profiles?.avatar_url ?? null;

  const formattedDate = displayCreatedAt
    ? new Date(displayCreatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      {/* Hintergrund */}
      {displayMediaUrl ? (
        displayMediaType === 'video' ? (
          <>
            {displayThumbnailUrl ? (
              <Image
                source={{ uri: displayThumbnailUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                blurRadius={1}
              />
            ) : null}
            <Video
              source={{ uri: displayMediaUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={screenFocused}
              isMuted={isMuted}
            />
          </>
        ) : (
          <>
            <Image
              source={{ uri: displayMediaUrl }}
              style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
              resizeMode="cover"
              blurRadius={20}
            />
            <Image
              source={{ uri: displayMediaUrl }}
              style={styles.mainImage}
              resizeMode="contain"
            />
          </>
        )
      ) : (
        <LinearGradient
          colors={['#0A0A0A', '#1a0533', '#0d1f4a']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dunkler Gradient oben und unten */}
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'transparent']}
        style={styles.topGradient}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={styles.bottomGradient}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} stroke="#FFFFFF" strokeWidth={2} />
        </Pressable>

        {isOwner && post && (
          <View style={styles.ownerActions}>
            <Pressable
              onPress={() => router.push({ pathname: '/edit-post/[id]', params: { id: id! } })}
              style={styles.editBtn}
              hitSlop={8}
            >
              <Pencil size={17} stroke="#A78BFA" strokeWidth={2} />
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.deleteBtn} hitSlop={8}>
              <Trash2 size={17} stroke="#F87171" strokeWidth={2} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Rechte Aktionen — nur wenn Post aus DB geladen (brauchen post.id) */}
      {post && (
        <>
          <View style={[styles.rightActions, { bottom: insets.bottom + 120 }]}>
            {/* Mute-Toggle — nur bei Videos */}
            {displayMediaType === 'video' && (
              <Pressable
                style={styles.actionBtn}
                onPress={() => setIsMuted((m) => !m)}
                hitSlop={8}
              >
                <View style={styles.actionBtnInner}>
                  {isMuted
                    ? <VolumeX size={22} stroke="#FFFFFF" strokeWidth={1.8} />
                    : <Volume2 size={22} stroke="#FFFFFF" strokeWidth={1.8} />
                  }
                </View>
              </Pressable>
            )}
            <LikeButtonDetail postId={post.id} />
            <CommentButtonDetail postId={post.id} onPress={() => setCommentsOpen(true)} />
            <BookmarkButtonDetail postId={post.id} />
            <Pressable style={styles.actionBtn} onPress={() => sharePost(post.id, post.caption)}>
              <View style={styles.actionBtnInner}>
                <Share2 size={24} stroke="#FFFFFF" strokeWidth={1.8} />
              </View>
            </Pressable>
          </View>
          <CommentsSheet
            postId={post.id}
            visible={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            mediaUrl={displayMediaUrl}
            thumbnailUrl={displayThumbnailUrl}
            mediaType={displayMediaType}
          />
        </>
      )}

      {/* Unten: Autor, Caption, Tags, Datum */}
      <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 100 }]}>
        <Pressable
          style={styles.authorRow}
          onPress={() => displayAuthorId && router.push({ pathname: '/user/[id]', params: { id: displayAuthorId } })}
        >
          <View style={styles.avatarSmall}>
            {displayAvatarUrl ? (
              <Image source={{ uri: displayAvatarUrl }} style={styles.avatarSmallImage} />
            ) : (
              <Text style={styles.avatarText}>
                {displayUsername?.[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.authorName}>@{displayUsername ?? 'unknown'}</Text>
            {formattedDate ? <Text style={styles.dateText}>{formattedDate}</Text> : null}
          </View>
        </Pressable>

        {displayCaption ? (
          <Text style={styles.caption}>{displayCaption}</Text>
        ) : null}

        {displayTags.length > 0 && (
          <View style={styles.tagsRow}>
            {displayTags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  notFound: { color: '#6B7280', fontSize: 16 },
  backBtnCenter: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0D0D0D',
  },
  backBtnText: { color: '#A78BFA', fontWeight: '600' },
  mainImage: {
    width: W,
    height: H,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(248,113,113,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightActions: {
    position: 'absolute',
    right: 16,
    gap: 4,
    alignItems: 'center',
  },
  actionBtn: { alignItems: 'center', marginBottom: 12 },
  actionBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 72,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  avatarSmallImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  authorName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dateText: { color: '#6B7280', fontSize: 11, marginTop: 1 },
  caption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  tagText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },
});
