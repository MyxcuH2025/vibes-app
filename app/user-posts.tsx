/**
 * user-posts.tsx
 *
 * Vertikaler Post-Feed für ein einzelnes Profil – öffnet sich wenn man
 * im Grid eines Profils (eigen oder fremd) auf einen Post tippt.
 * Verhalten: wie der Haupt-Feed, aber auf einen User gefiltert.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Alert,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Trash2,
  Pencil,
  Volume2,
  VolumeX,
  Eye,
  Send,
} from 'lucide-react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { useLike } from '@/lib/useLike';
import { useCommentCount, useAddComment } from '@/lib/useComments';
import { useBookmark } from '@/lib/useBookmark';
import { sharePost } from '@/lib/useShare';
import CommentsSheet from '@/components/ui/CommentsSheet';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };
// Höhe der Kommentar-Leiste (paddingVertical 10*2 + Avatar 34 + Border 1 ≈ 55)
const COMMENT_BAR_H = 58;


const { width: W, height: H } = Dimensions.get('window');

type PostItem = {
  id: string;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  tags: string[];
  created_at: string;
  author_id: string;
  username: string | null;
  avatar_url: string | null;
  view_count: number;
};

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Action-Buttons (lokal, identisch zu post/[id]) ──────────────────────────

function LikeBtn({ postId }: { postId: string }) {
  const { liked, formattedCount, toggle } = useLike(postId);
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const press = () => {
    scale.value = withSequence(
      withTiming(0.7, { duration: 60 }),
      withTiming(1.35, { duration: 80 }),
      withTiming(1, { duration: 80 })
    );
    toggle();
  };

  return (
    <Pressable onPress={press} style={s.actionBtn}>
      <Animated.View style={[s.actionBtnInner, anim, liked && { backgroundColor: 'rgba(244,114,182,0.2)' }]}>
        <Heart size={24} stroke={liked ? '#F472B6' : '#FFFFFF'} strokeWidth={1.8} fill={liked ? '#F472B6' : 'transparent'} />
      </Animated.View>
      <Text style={[s.actionCount, liked && { color: '#F472B6' }]}>{formattedCount}</Text>
    </Pressable>
  );
}

function CommentBtn({ postId, onPress }: { postId: string; onPress: () => void }) {
  const { data: count = 0 } = useCommentCount(postId);
  const fmt = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
  return (
    <Pressable style={s.actionBtn} onPress={onPress}>
      <View style={s.actionBtnInner}>
        <MessageCircle size={24} stroke="#FFFFFF" strokeWidth={1.8} />
      </View>
      <Text style={s.actionCount}>{fmt}</Text>
    </Pressable>
  );
}

function BookmarkBtn({ postId }: { postId: string }) {
  const { bookmarked, toggle } = useBookmark(postId);
  return (
    <Pressable style={s.actionBtn} onPress={toggle}>
      <View style={[s.actionBtnInner, bookmarked && { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
        <Bookmark size={24} stroke={bookmarked ? '#FBBF24' : '#FFFFFF'} strokeWidth={1.8} fill={bookmarked ? '#FBBF24' : 'transparent'} />
      </View>
    </Pressable>
  );
}

// ─── TikTok-Style Kommentar-Eingabeleiste ────────────────────────────────────

function CommentInputBar({
  postId,
  avatarUrl,
  username,
  onCommentsOpen,
}: {
  postId: string;
  avatarUrl: string | null;
  username: string | null;
  onCommentsOpen: () => void;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { mutateAsync: addComment, isPending } = useAddComment(postId);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setText('');
    Keyboard.dismiss();
    await addComment({ text: trimmed, tempId: `temp-${Date.now()}` });
  };

  return (
    <View style={s.commentBar}>
      {/* Avatar */}
      <Pressable onPress={() => inputRef.current?.focus()} style={s.commentAvatar}>
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={s.commentAvatarImg} />
          : <Text style={s.commentAvatarInitial}>{username?.[0]?.toUpperCase() ?? '?'}</Text>
        }
      </Pressable>

      {/* Eingabefeld */}
      <Pressable style={s.commentInputWrap} onPress={() => inputRef.current?.focus()}>
        <TextInput
          ref={inputRef}
          style={s.commentInput}
          placeholder="Kommentar schreiben …"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="send"
          blurOnSubmit={false}
          maxLength={500}
          selectionColor="#A78BFA"
        />
      </Pressable>

      {/* Senden-Button (nur wenn Text vorhanden) */}
      {text.trim().length > 0 ? (
        <Pressable onPress={submit} disabled={isPending} style={s.commentSendBtn} hitSlop={8}>
          {isPending
            ? <ActivityIndicator size={16} color="#A78BFA" />
            : <Send size={20} stroke="#A78BFA" strokeWidth={2.2} />
          }
        </Pressable>
      ) : (
        /* Kommentar-Icon öffnet vollständige Sheet */
        <Pressable onPress={onCommentsOpen} style={s.commentSendBtn} hitSlop={8}>
          <MessageCircle size={20} stroke="rgba(255,255,255,0.5)" strokeWidth={1.8} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Einzelner Post-Card (Vollbild) ──────────────────────────────────────────

function PostCard({
  item,
  isVisible,
  isMuted,
  onMuteToggle,
  isOwner,
  onOpenComments,
  onDelete,
  onEdit,
}: {
  item: PostItem;
  isVisible: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  isOwner: boolean;
  onOpenComments: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (postId: string) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(0);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const dur = status.durationMillis;
    if (dur && dur > 0) setProgress(status.positionMillis / dur);
  }, []);

  const date = item.created_at
    ? new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const isVideo = item.media_type === 'video';

  return (
    <View style={{ width: W, height: H }}>
      {/* Media */}
      {item.media_url ? (
        isVideo ? (
          <>
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                blurRadius={1}
              />
            ) : null}
            <Video
              source={{ uri: item.media_url }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isVisible}
              isMuted={isMuted}
              onPlaybackStatusUpdate={handlePlaybackStatus}
            />
          </>
        ) : (
          <Image source={{ uri: item.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )
      ) : (
        <LinearGradient colors={['#0A0A0A', '#1a0533', '#0d1f4a']} style={StyleSheet.absoluteFill} />
      )}

      {/* Gradienten oben/unten */}
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={s.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} style={s.bottomGradient} />

      {/* Owner-Aktionen (Bearbeiten/Löschen) oben rechts */}
      {isOwner && (
        <View style={[s.ownerRow, { top: insets.top + 8 }]}>
          <Pressable onPress={() => onEdit(item.id)} style={s.ownerBtn} hitSlop={8}>
            <Pencil size={17} stroke="#A78BFA" strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => onDelete(item.id)} style={[s.ownerBtn, s.ownerBtnDanger]} hitSlop={8}>
            <Trash2 size={17} stroke="#F87171" strokeWidth={2} />
          </Pressable>
        </View>
      )}

      {/* Rechte Aktionen */}
      <View style={[s.rightActions, { bottom: insets.bottom + COMMENT_BAR_H + 12 }]}>
        {isVideo && (
          <Pressable style={s.actionBtn} onPress={onMuteToggle} hitSlop={8}>
            <View style={s.actionBtnInner}>
              {isMuted
                ? <VolumeX size={22} stroke="#FFFFFF" strokeWidth={1.8} />
                : <Volume2 size={22} stroke="#FFFFFF" strokeWidth={1.8} />
              }
            </View>
          </Pressable>
        )}
        <LikeBtn postId={item.id} />
        <CommentBtn postId={item.id} onPress={() => onOpenComments(item.id)} />
        <BookmarkBtn postId={item.id} />
        <Pressable style={s.actionBtn} onPress={() => sharePost(item.id, item.caption)}>
          <View style={s.actionBtnInner}>
            <Share2 size={24} stroke="#FFFFFF" strokeWidth={1.8} />
          </View>
        </Pressable>
      </View>

      {/* Unten: Avatar, Caption, Tags */}
      <View style={[s.bottomInfo, { paddingBottom: insets.bottom + COMMENT_BAR_H + 16 }]}>
        <Pressable
          style={s.authorRow}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.author_id } })}
        >
          <View style={s.avatarSmall}>
            {item.avatar_url
              ? <Image source={{ uri: item.avatar_url }} style={s.avatarSmallImg} />
              : <Text style={s.avatarText}>{item.username?.[0]?.toUpperCase() ?? '?'}</Text>
            }
          </View>
          <View>
            <Text style={s.authorName}>@{item.username ?? 'unknown'}</Text>
            {date ? <Text style={s.dateText}>{date}</Text> : null}
          </View>
        </Pressable>

        {item.caption ? <Text style={s.caption}>{item.caption}</Text> : null}

        {item.tags?.length > 0 && (
          <View style={s.tagsRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={s.tagChip}>
                <Text style={s.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* View-Count */}
        <View style={s.viewCountRow}>
          <Eye size={13} stroke="rgba(255,255,255,0.45)" strokeWidth={2} />
          <Text style={s.viewCountText}>{formatViews(item.view_count)} Aufrufe</Text>
        </View>

        {/* Video-Fortschrittsbalken */}
        {isVideo && (
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function UserPostsScreen() {
  const { userId, startIndex, username } = useLocalSearchParams<{
    userId: string;
    startIndex?: string;
    username?: string;
  }>();
  const router       = useRouter();
  const insets       = useSafeAreaInsets();
  const { profile }  = useAuthStore();
  const queryClient  = useQueryClient();

  const [posts,         setPosts]         = useState<PostItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [visibleIndex,  setVisibleIndex]  = useState(Number(startIndex ?? '0'));
  const [isMuted,       setIsMuted]       = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);

  const flatRef     = useRef<FlatList>(null);
  const initialIdx  = Number(startIndex ?? '0');
  // Set mit bereits gezählten Post-IDs (kein doppeltes Inkrementieren)
  const viewedPosts = useRef<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('posts')
      .select('id, caption, media_url, thumbnail_url, media_type, tags, created_at, author_id, view_count, profiles!author_id(username, avatar_url)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const mapped: PostItem[] = (data ?? []).map((p: any) => ({
          id:         p.id,
          caption:    p.caption,
          media_url:  p.media_url,
          thumbnail_url: p.thumbnail_url,
          media_type: p.media_type,
          tags:       p.tags ?? [],
          created_at: p.created_at,
          author_id:  p.author_id,
          view_count: p.view_count ?? 0,
          username:   p.profiles?.username ?? null,
          avatar_url: p.profiles?.avatar_url ?? null,
        }));
        setPosts(mapped);
        setLoading(false);
      });
  }, [userId]);

  const handleDelete = (postId: string) => {
    Alert.alert('Post löschen', 'Wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('posts').delete().eq('id', postId);
          await queryClient.invalidateQueries({ queryKey: ['vibe-feed'] });
          await queryClient.invalidateQueries({ queryKey: ['user-posts', userId] });
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        },
      },
    ]);
  };

  const handleEdit = (postId: string) => {
    router.push({ pathname: '/edit-post/[id]', params: { id: postId } });
  };

  const getItemLayout = (_: unknown, index: number) => ({
    length: H,
    offset: H * index,
    index,
  });

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#A78BFA" size="large" />
      </View>
    );
  }

  const currentPostId = posts[visibleIndex]?.id ?? '';
  const commentsPost = commentsPostId ? posts.find((p) => p.id === commentsPostId) : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Zurück-Button immer sichtbar oben links */}
      <Pressable
        onPress={() => router.back()}
        style={[s.backBtn, { top: insets.top + 10 }]}
        hitSlop={12}
      >
        <ArrowLeft size={20} stroke="#fff" strokeWidth={2.2} />
      </Pressable>

      {/* Zähler oben Mitte */}
      <View style={[s.counter, { top: insets.top + 18 }]}>
        <Text style={s.counterText}>
          {username ? `@${username}` : ''}{posts.length > 0 ? `  ${visibleIndex + 1} / ${posts.length}` : ''}
        </Text>
      </View>

      <FlatList
        ref={flatRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <PostCard
            item={item}
            isVisible={screenFocused && index === visibleIndex}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            isOwner={item.author_id === profile?.id}
            onOpenComments={setCommentsPostId}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        initialScrollIndex={initialIdx < posts.length ? initialIdx : 0}
        windowSize={3}
        maxToRenderPerBatch={3}
        initialNumToRender={2}
        onViewableItemsChanged={({ viewableItems }) => {
          const idx = viewableItems[0]?.index;
          if (idx != null) {
            setVisibleIndex(idx);
            const postId = posts[idx]?.id;
            if (postId && !viewedPosts.current.has(postId)) {
              viewedPosts.current.add(postId);
              supabase.rpc('increment_post_view', { p_post_id: postId }).then(() => {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === postId ? { ...p, view_count: p.view_count + 1 } : p
                  )
                );
              });
            }
          }
        }}
        viewabilityConfig={VIEWABILITY_CONFIG}
      />

      {/* TikTok-Style Kommentar-Eingabeleiste */}
      {currentPostId ? (
        <CommentInputBar
          postId={currentPostId}
          avatarUrl={profile?.avatar_url ?? null}
          username={profile?.username ?? null}
          onCommentsOpen={() => setCommentsPostId(currentPostId)}
        />
      ) : null}

      {commentsPostId && (
        <CommentsSheet
          postId={commentsPostId}
          visible
          onClose={() => setCommentsPostId(null)}
          mediaUrl={commentsPost?.media_url}
          thumbnailUrl={commentsPost?.thumbnail_url}
          mediaType={commentsPost?.media_type}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center:      { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 340 },

  backBtn: {
    position: 'absolute', left: 16, zIndex: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
  },
  counterText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },

  ownerRow: { position: 'absolute', right: 16, zIndex: 20, flexDirection: 'row', gap: 8 },
  ownerBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  ownerBtnDanger: { backgroundColor: 'rgba(248,113,113,0.15)' },

  rightActions: { position: 'absolute', right: 16, gap: 4, alignItems: 'center', zIndex: 10 },
  actionBtn:    { alignItems: 'center', marginBottom: 12 },
  actionBtnInner: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionCount: { color: '#E5E7EB', fontSize: 11, fontWeight: '600', marginTop: 4 },

  bottomInfo: { position: 'absolute', bottom: 0, left: 0, right: 72, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  authorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarSmall: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarSmallImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarText:  { color: '#fff', fontSize: 14, fontWeight: '800' },
  authorName:  { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dateText:    { color: '#6B7280', fontSize: 11, marginTop: 1 },
  caption:     { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22 },
  tagsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  tagText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },

  // Kommentar-Eingabeleiste
  commentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: 'rgba(10,10,10,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  commentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    flexShrink: 0,
  },
  commentAvatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  commentAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '800' },
  commentInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  commentInput: {
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
    margin: 0,
  },
  commentSendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // View-Count
  viewCountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2,
  },
  viewCountText: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '500',
  },

  // Video-Fortschrittsbalken (wie Haupt-Feed)
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#A78BFA',
    borderRadius: 1,
  },
});
