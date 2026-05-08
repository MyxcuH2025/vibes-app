import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Dimensions,
  TextInput, Keyboard, Alert, Modal, Platform,
  KeyboardEvent, ScrollView, Share, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
  withSequence, runOnJS, Easing,
} from 'react-native-reanimated';
import { X, Heart, Send, Share2, UserPlus, UserCheck, Check, Copy, Flag, EyeOff, Download, Search as SearchIcon } from 'lucide-react-native';
import {
  impactAsync,
  notificationAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { StoryGroup, Story } from '@/lib/useStories';
import { useMarkStoryViewed } from '@/lib/useStories';
import { useFollow } from '@/lib/useFollow';
import { useAuthStore } from '@/lib/authStore';
import { useOrCreateConversation, useSendMessage } from '@/lib/useMessages';
import { Video, ResizeMode } from 'expo-av';

// expo-video optional (z. B. ohne natives Modul in Expo Go)
let VideoView: any = null;
let useVideoPlayer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoVideo = require('expo-video');
  VideoView = expoVideo.VideoView;
  useVideoPlayer = expoVideo.useVideoPlayer;
} catch {
  /* kein expo-video */
}

const { width: W } = Dimensions.get('window');
const IMAGE_DURATION     = 5000;
const MAX_VIDEO_DURATION = 15000;
const USE_EXPO_VIDEO     = VideoView !== null && useVideoPlayer !== null;

type Props = {
  group: StoryGroup;
  allGroups: StoryGroup[];
  visible: boolean;
  onClose: () => void;
  onNextGroup: () => void;
  onPrevGroup: () => void;
};

// ── Video-Komponenten ────────────────────────────────────────────────────────
function NativeVideoStory({ uri, onDurationKnown }: { uri: string; onDurationKnown: (ms: number) => void }) {
  const player = useVideoPlayer(uri, (p: any) => { p.loop = false; p.muted = false; p.play(); });
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', () => {
      const dur = player.duration;
      if (dur && dur > 0) onDurationKnown(Math.min(dur * 1000, MAX_VIDEO_DURATION));
    });
    return () => sub.remove();
  }, [player, onDurationKnown]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function FallbackVideoStory({ uri, onDurationKnown }: { uri: string; onDurationKnown: (ms: number) => void }) {
  const fixedRef = useRef(false);
  return (
    <Video
      key={uri} source={{ uri }} style={StyleSheet.absoluteFill}
      resizeMode={ResizeMode.COVER} shouldPlay isLooping={false} isMuted={false}
      onPlaybackStatusUpdate={(s: any) => {
        if (!s.isLoaded || fixedRef.current) return;
        if (s.durationMillis && s.durationMillis > 0) {
          fixedRef.current = true;
          onDurationKnown(Math.min(s.durationMillis, MAX_VIDEO_DURATION));
        }
      }}
    />
  );
}

// ── Like Button ──────────────────────────────────────────────────────────────
function LikeBtn() {
  const [liked, setLiked] = useState(false);
  const scale = useSharedValue(1);
  const anim  = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = () => {
    const next = !liked;
    setLiked(next);
    impactAsync(next ? ImpactFeedbackStyle.Medium : ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.65, { duration: 60 }),
      withTiming(1.35, { duration: 80 }),
      withTiming(1,    { duration: 80 }),
    );
  };
  return (
    <Pressable onPress={press} hitSlop={12}>
      <Animated.View style={anim}>
        <Heart size={28} color={liked ? '#F472B6' : '#fff'} fill={liked ? '#F472B6' : 'transparent'} strokeWidth={1.8} />
      </Animated.View>
    </Pressable>
  );
}

// ── TikTok-Style Share Sheet ─────────────────────────────────────────────────
type ShareTarget = { id: string; username: string | null; avatar_url: string | null };

const APP_SHARE_OPTIONS = [
  { id: 'whatsapp', label: 'WhatsApp',  emoji: '💬', color: '#25D366' },
  { id: 'telegram', label: 'Telegram',  emoji: '✈️',  color: '#2CA5E0' },
  { id: 'copy',     label: 'Link',      icon: Copy,   color: '#6366f1' },
  { id: 'more',     label: 'Mehr',      icon: Share2, color: '#374151' },
];

const ACTION_BUTTONS = [
  { id: 'report',       label: 'Melden',             icon: Flag,    color: '#ef4444' },
  { id: 'notinterested',label: 'Kein Interesse',      icon: EyeOff,  color: '#6B7280' },
  { id: 'download',     label: 'Herunterladen',       icon: Download,color: '#6B7280' },
];

function InAppShareModal({
  visible,
  storyUsername,
  storyMediaUrl,
  onClose,
}: {
  visible: boolean;
  storyUsername: string;
  storyMediaUrl: string;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.profile?.id);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending]   = useState(false);

  const { mutateAsync: getOrCreateConv } = useOrCreateConversation();
  const { mutateAsync: sendMsg }         = useSendMessage();

  const { data: users = [] } = useQuery<ShareTarget[]>({
    queryKey: ['share-user-list'],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .neq('id', currentUserId)
        .order('username')
        .limit(50);
      return (data ?? []) as ShareTarget[];
    },
    enabled: visible && !!currentUserId,
    staleTime: 1000 * 60 * 5,
  });

  const storyLink = `https://vibes.app/story/${storyUsername}`;

  const filtered = search.trim()
    ? users.filter((u) => u.username?.toLowerCase().includes(search.toLowerCase()))
    : users;

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    impactAsync(ImpactFeedbackStyle.Light);
  };

  const handleSendToUsers = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      await Promise.all(
        Array.from(selected).map(async (userId) => {
          const convId = await getOrCreateConv(userId);
          await sendMsg({ conversationId: convId, content: `📸 Story von @${storyUsername}: ${storyLink}` });
        })
      );
      notificationAsync(NotificationFeedbackType.Success);
      setSelected(new Set());
      setSearch('');
      onClose();
    } catch {
      Alert.alert('Fehler', 'Story konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  };

  const handleAppShare = (id: string) => {
    impactAsync(ImpactFeedbackStyle.Light);
    switch (id) {
      case 'whatsapp':
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`📸 Story von @${storyUsername} auf Vibes: ${storyLink}`)}`).catch(() => Alert.alert('WhatsApp nicht installiert'));
        break;
      case 'telegram':
        Linking.openURL(`tg://msg_url?url=${encodeURIComponent(storyLink)}&text=${encodeURIComponent(`Story von @${storyUsername}`)}`).catch(() => Alert.alert('Telegram nicht installiert'));
        break;
      case 'copy':
        // expo-clipboard oder Alert
        Alert.alert('Link kopiert', storyLink);
        break;
      case 'more':
        Share.share({ message: `📸 Story von @${storyUsername} auf Vibes: ${storyLink}`, url: storyLink });
        break;
    }
  };

  const handleAction = (id: string) => {
    impactAsync(ImpactFeedbackStyle.Medium);
    onClose();
    switch (id) {
      case 'report':
        Alert.alert('Melden', 'Wähle einen Grund:', [
          { text: 'Spam',                 onPress: () => Alert.alert('Gemeldet', 'Danke.') },
          { text: 'Unangemessener Inhalt',onPress: () => Alert.alert('Gemeldet', 'Danke.') },
          { text: 'Abbrechen', style: 'cancel' },
        ]);
        break;
      case 'notinterested':
        Alert.alert('Verstanden', 'Weniger Stories dieser Art.');
        break;
      case 'download':
        Alert.alert('Download', 'Story wird gespeichert…');
        break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.overlay} onPress={onClose}>
        <Pressable style={ss.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={ss.handle} />

          {/* ── Reihe 1: App-User ─────────────────────────────────────────── */}
          <Text style={ss.sectionLabel}>Senden an</Text>

          {/* Suchfeld */}
          <View style={ss.searchRow}>
            <SearchIcon size={15} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={ss.searchInput}
              placeholder="Suchen…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          {/* Horizontale User-Liste */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.userScroll} contentContainerStyle={ss.userScrollContent}>
            {filtered.length === 0 ? (
              <Text style={ss.emptyUsers}>Keine User</Text>
            ) : (
              filtered.map((u) => {
                const chosen = selected.has(u.id);
                return (
                  <Pressable key={u.id} style={ss.userItem} onPress={() => toggleUser(u.id)}>
                    <View style={[ss.userAvatarWrap, chosen && ss.userAvatarChosen]}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={ss.userAvatar} />
                      ) : (
                        <View style={[ss.userAvatar, ss.userAvatarFallback]}>
                          <Text style={ss.userAvatarText}>{(u.username ?? '?')[0].toUpperCase()}</Text>
                        </View>
                      )}
                      {chosen && (
                        <View style={ss.checkBadge}>
                          <Check size={10} color="#fff" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text style={ss.userLabel} numberOfLines={1}>
                      {u.username ?? '?'}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Senden-Button */}
          {selected.size > 0 && (
            <Pressable style={[ss.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSendToUsers} disabled={sending}>
              <Send size={16} color="#fff" />
              <Text style={ss.sendBtnText}>{sending ? 'Senden…' : `Senden (${selected.size})`}</Text>
            </Pressable>
          )}

          <View style={ss.divider} />

          {/* ── Reihe 2: Externe Apps ─────────────────────────────────────── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.appRow}>
            {APP_SHARE_OPTIONS.map((opt) => {
              const IconComp = (opt as any).icon;
              return (
                <Pressable key={opt.id} style={ss.appItem} onPress={() => handleAppShare(opt.id)}>
                  <View style={[ss.appIcon, { backgroundColor: opt.color }]}>
                    {(opt as any).emoji
                      ? <Text style={ss.appEmoji}>{(opt as any).emoji}</Text>
                      : <IconComp size={22} color="#fff" strokeWidth={1.8} />
                    }
                  </View>
                  <Text style={ss.appLabel}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={ss.divider} />

          {/* ── Reihe 3: Aktionen ─────────────────────────────────────────── */}
          <View style={ss.actionRow}>
            {ACTION_BUTTONS.map((btn) => {
              const IconComp = btn.icon;
              return (
                <Pressable key={btn.id} style={ss.actionItem} onPress={() => handleAction(btn.id)}>
                  <View style={[ss.actionIcon, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                    <IconComp size={22} color={btn.color} strokeWidth={1.8} />
                  </View>
                  <Text style={ss.actionLabel}>{btn.label}</Text>
                </Pressable>
              );
            })}
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────
export function StoryViewer({ group, allGroups, visible, onClose, onNextGroup, onPrevGroup }: Props) {
  const insets        = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.profile?.id);
  const [storyIndex, setStoryIndex]   = useState(0);
  const [replyText, setReplyText]     = useState('');
  const [shareOpen, setShareOpen]     = useState(false);
  const [kbHeight, setKbHeight]       = useState(0);

  const { mutate: markViewed }                      = useMarkStoryViewed();
  const { mutateAsync: getOrCreateConv }            = useOrCreateConversation();
  const { mutateAsync: sendMsg, isPending: sending } = useSendMessage();

  const progress         = useSharedValue(0);
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationFixedRef = useRef(false);
  const inputRef         = useRef<TextInput>(null);

  const currentStory: Story | undefined = group.stories[storyIndex];
  const isOwnStory = currentStory?.user_id === currentUserId;

  const { isFollowing, toggle: toggleFollow, isOwnProfile } =
    useFollow(currentStory?.user_id ?? null);

  useEffect(() => { setStoryIndex(0); }, [group.userId]);

  // Keyboard-Höhe tracken für manuelles Verschieben der Bottom-Bar
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => setKbHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const goNext = useCallback(() => {
    if (storyIndex < group.stories.length - 1) setStoryIndex((i) => i + 1);
    else onNextGroup();
  }, [storyIndex, group.stories.length, onNextGroup]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) setStoryIndex((i) => i - 1);
    else onPrevGroup();
  }, [storyIndex, onPrevGroup]);

  const startProgress = useCallback((duration: number) => {
    timerRef.current && clearTimeout(timerRef.current);
    progress.value = 0;
    progress.value = withTiming(1, { duration, easing: Easing.linear });
    timerRef.current = setTimeout(() => runOnJS(goNext)(), duration);
  }, [goNext, progress]);

  // Story pausieren wenn Keyboard offen oder Share-Modal offen
  const isPaused = kbHeight > 0 || shareOpen;

  useEffect(() => {
    if (isPaused) {
      timerRef.current && clearTimeout(timerRef.current);
      return;
    }
    if (!visible || !currentStory) return;
    const isVideo = currentStory.media_type === 'video';
    startProgress(isVideo ? MAX_VIDEO_DURATION : IMAGE_DURATION);
    return () => { timerRef.current && clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentStory/startProgress: bewusst über id + Callback
  }, [isPaused, currentStory?.id, visible]);

  useEffect(() => {
    if (!visible || !currentStory || isPaused) return;
    markViewed(currentStory.id);
    durationFixedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markViewed + isPaused bewusst
  }, [currentStory?.id, visible]);

  const handleDurationKnown = useCallback((ms: number) => {
    if (durationFixedRef.current) return;
    durationFixedRef.current = true;
    startProgress(ms);
  }, [startProgress]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!text || !currentStory?.user_id || sending) return;
    try {
      Keyboard.dismiss();
      const convId = await getOrCreateConv(currentStory.user_id);
      await sendMsg({ conversationId: convId, content: `📖 Story-Antwort: ${text}` });
      setReplyText('');
      notificationAsync(NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Fehler', 'Nachricht konnte nicht gesendet werden.');
    }
  };

  if (!visible || !currentStory) return null;
  const isVideo = currentStory.media_type === 'video';

  return (
    <View style={styles.screen}>
      {/* ── Media ── */}
      {isVideo ? (
        USE_EXPO_VIDEO
          ? <NativeVideoStory uri={currentStory.media_url} onDurationKnown={handleDurationKnown} />
          : <FallbackVideoStory uri={currentStory.media_url} onDurationKnown={handleDurationKnown} />
      ) : (
        <>
          <Image source={{ uri: currentStory.media_url }} style={[StyleSheet.absoluteFill, styles.blurBg]} resizeMode="cover" blurRadius={18} />
          <Image source={{ uri: currentStory.media_url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        </>
      )}

      <View style={styles.vignetteTop}    pointerEvents="none" />
      <View style={styles.vignetteBottom} pointerEvents="none" />

      {/* ── Fortschrittsbalken ── */}
      <View style={[styles.progressRow, { top: insets.top + 8 }]} pointerEvents="none">
        {group.stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            {i < storyIndex
              ? <View style={[styles.progressFill, { width: '100%' }]} />
              : i === storyIndex
                ? <Animated.View style={[styles.progressFill, progressStyle]} />
                : null}
          </View>
        ))}
      </View>

      {/* ── Autor-Header ── */}
      <View style={[styles.header, { top: insets.top + 24 }]}>
        <Pressable
          onPress={() => { onClose(); router.push({ pathname: '/user/[id]', params: { id: currentStory.user_id } }); }}
          style={styles.headerLeft}
        >
          {currentStory.avatar_url ? (
            <Image source={{ uri: currentStory.avatar_url }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={styles.headerAvatarText}>{(currentStory.username ?? '?')[0].toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={styles.headerUsername}>@{currentStory.username ?? '?'}</Text>
            <Text style={styles.headerTime}>{formatTimeAgo(currentStory.created_at)}</Text>
          </View>
        </Pressable>

        {!isOwnStory && !isOwnProfile && (
          <Pressable
            onPress={() => { toggleFollow(); impactAsync(ImpactFeedbackStyle.Light); }}
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            hitSlop={8}
          >
            {isFollowing ? <UserCheck size={14} color="#fff" /> : <UserPlus size={14} color="#fff" />}
            <Text style={styles.followBtnText}>{isFollowing ? 'Gefolgt' : 'Folgen'}</Text>
          </Pressable>
        )}

        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
          <X size={22} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* ── Tap-Zonen ── */}
      <Pressable style={styles.tapLeft}  onPress={goPrev} />
      <Pressable style={styles.tapRight} onPress={goNext} />

      {/* ── Bottom-Bar ── */}
      <View style={[styles.bottomBar, { bottom: kbHeight + Math.max(insets.bottom, 10) }]}>
        {isOwnStory ? (
          // Eigene Story: nur Like + Share
          <View style={styles.ownStoryActions}>
            <Text style={styles.ownStoryHint}>Deine Story</Text>
            <LikeBtn />
            <Pressable onPress={() => setShareOpen(true)} hitSlop={12}>
              <Share2 size={26} color="#fff" strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : (
          // Fremde Story: Reply-Feld + Like + Share
          <>
            <BlurView intensity={40} tint="dark" style={styles.replyBlur}>
              <TextInput
                ref={inputRef}
                style={styles.replyInput}
                placeholder="Antworten…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={replyText}
                onChangeText={setReplyText}
                returnKeyType="send"
                onSubmitEditing={handleSendReply}
                blurOnSubmit
              />
              {replyText.length > 0 && (
                <Pressable onPress={handleSendReply} hitSlop={8} style={styles.sendIconBtn}>
                  <Send size={18} color="#A78BFA" />
                </Pressable>
              )}
            </BlurView>
            <LikeBtn />
            <Pressable onPress={() => { Keyboard.dismiss(); setShareOpen(true); }} hitSlop={12}>
              <Share2 size={26} color="#fff" strokeWidth={1.8} />
            </Pressable>
          </>
        )}
      </View>

      {/* ── In-App Share Modal ── */}
      <InAppShareModal
        visible={shareOpen}
        storyUsername={currentStory.username ?? '?'}
        storyMediaUrl={currentStory.media_url}
        onClose={() => setShareOpen(false)}
      />
    </View>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h >= 1) return `vor ${h}h`;
  if (m >= 1) return `vor ${m}min`;
  return 'gerade eben';
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#000' },
  blurBg:        { opacity: 0.6 },
  vignetteTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 200,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  vignetteBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 180,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  progressRow:  { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 10 },
  progressTrack:{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 2 },

  header:              { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 10 },
  headerLeft:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar:        { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  headerAvatarFallback:{ backgroundColor: 'rgba(167,139,250,0.3)', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText:    { fontSize: 15, fontWeight: '700', color: '#A78BFA' },
  headerUsername:      { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  headerTime:          { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  closeBtn:            { padding: 4 },

  followBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(0,0,0,0.3)' },
  followBtnActive:{ borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.15)' },
  followBtnText:  { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Tap-Zonen lassen 130px unten frei für Bottom-Bar
  tapLeft:  { position: 'absolute', left: 0, top: 0, bottom: 130, width: W * 0.35, zIndex: 5 },
  tapRight: { position: 'absolute', right: 0, top: 0, bottom: 130, width: W * 0.65, zIndex: 5 },

  bottomBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20 },

  replyBlur:   { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  replyInput:  { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  sendIconBtn: { marginLeft: 8 },

  ownStoryActions: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  ownStoryHint:    { color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 },
});

// ── TikTok Share Sheet Styles ─────────────────────────────────────────────────
const ss = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 34,
  },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 14 },
  sectionLabel: { color: '#fff', fontSize: 15, fontWeight: '700', paddingHorizontal: 18, marginBottom: 10 },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 14, marginHorizontal: 18 },

  // ── Reihe 1: User-Suche & horizontale Liste ──
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 18, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput:     { flex: 1, color: '#fff', fontSize: 13 },
  userScroll:      { marginBottom: 4 },
  userScrollContent:{ paddingHorizontal: 14, gap: 6 },
  userItem:        { alignItems: 'center', width: 66, gap: 5 },
  userAvatarWrap:  { position: 'relative' },
  userAvatarChosen:{ },
  userAvatar:      { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  userAvatarFallback: { backgroundColor: 'rgba(167,139,250,0.25)', alignItems: 'center', justifyContent: 'center' },
  userAvatarText:  { color: '#A78BFA', fontSize: 20, fontWeight: '700' },
  checkBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#111118',
  },
  userLabel:       { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', width: 62 },
  emptyUsers:      { color: 'rgba(255,255,255,0.3)', fontSize: 13, paddingHorizontal: 4, paddingVertical: 6 },
  sendBtn: {
    marginHorizontal: 18, marginTop: 10,
    backgroundColor: '#A78BFA', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 8,
  },
  sendBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Reihe 2: App-Icons ──
  appRow:          { paddingHorizontal: 14, gap: 8 },
  appItem:         { alignItems: 'center', width: 68, gap: 6 },
  appIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  appEmoji:        { fontSize: 26 },
  appLabel:        { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center' },

  // ── Reihe 3: Aktions-Buttons ──
  actionRow:       { flexDirection: 'row', paddingHorizontal: 18, gap: 10 },
  actionItem:      { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center' },
});
