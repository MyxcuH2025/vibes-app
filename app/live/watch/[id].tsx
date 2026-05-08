/**
 * live/watch/[id].tsx
 * Zuschauer-Ansicht eines Live-Streams via LiveKit.
 * Braucht Dev-Build: npx expo run:ios / npx expo run:android
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
  type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Users, Send } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  FadeInDown,
} from 'react-native-reanimated';
import {
  LiveKitRoom,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import {
  useLiveSession,
  useLiveViewer,
  useLiveComments,
  useLiveReactions,
  fetchLiveKitToken,
  type LiveComment,
  type LiveReaction,
} from '@/lib/useLiveSession';
import { useAuthStore } from '@/lib/authStore';
// expo-constants: default import causes _interopRequireDefault TypeError in Hermes HBC
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _cMod = require('expo-constants') as any; const Constants = _cMod?.default ?? _cMod;

const EMOJIS = ['❤️', '🔥', '👏', '😱', '💜'];
const videoFillStyle: ViewStyle = { ...StyleSheet.absoluteFillObject };

// ─── Floating Reaktions-Bubble ────────────────────────────────────────────────
function ReactionBubble({ reaction }: { reaction: LiveReaction }) {
  const left       = 20 + Math.random() * 140;
  const translateY = useSharedValue(0);
  const opacity    = useSharedValue(1);

  useEffect(() => {
    translateY.value = withTiming(-220, { duration: 2800 });
    opacity.value    = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 2700 })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Werte nur beim Mount starten
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
    left,
  }));

  return (
    <Animated.View style={[s.reactionBubble, style]}>
      <Text style={s.reactionEmoji}>{reaction.emoji}</Text>
    </Animated.View>
  );
}

// ─── Kommentar-Zeile ──────────────────────────────────────────────────────────
function CommentRow({ comment }: { comment: LiveComment }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={s.commentRow}>
      <Text style={s.commentUser}>@{comment.profiles?.username ?? 'User'}</Text>
      <Text style={s.commentText}> {comment.text}</Text>
    </Animated.View>
  );
}

// ─── Remote Video (Host-Stream) ───────────────────────────────────────────────
function RemoteVideoView({ hostAvatar }: { hostAvatar?: string | null }) {
  const tracks = useTracks([Track.Source.Camera]);
  const remoteTrack = tracks.find((t) => !t.participant?.isLocal);

  if (!remoteTrack) {
    // Noch kein Stream → Avatar-Placeholder
    return (
      <View style={s.videoPlaceholder}>
        {hostAvatar ? (
          <Image source={{ uri: hostAvatar }} style={s.hostAvatar} />
        ) : (
          <View style={[s.hostAvatar, s.hostAvatarFallback]}>
            <Text style={s.hostInitial}>?</Text>
          </View>
        )}
        <ActivityIndicator color="rgba(255,255,255,0.5)" style={{ marginTop: 16 }} />
        <Text style={s.connectingText}>Verbinde …</Text>
      </View>
    );
  }

  return (
    <VideoTrack
      trackRef={remoteTrack}
      style={videoFillStyle}
      objectFit="cover"
    />
  );
}

// ─── Inner Watch UI (innerhalb LiveKitRoom) ───────────────────────────────────
function WatchUI({ sessionId }: { sessionId: string }) {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuthStore();

  const { data: session } = useLiveSession(sessionId);
  useLiveViewer(sessionId);
  const { comments, sendComment } = useLiveComments(sessionId);
  const { reactions, sendReaction } = useLiveReactions(sessionId);
  const flatRef  = useRef<FlatList>(null);
  const [input, setInput] = useState('');

  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmalig starten
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  useEffect(() => {
    if (comments.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [comments.length]);

  // Live beendet → zurück
  useEffect(() => {
    if (session?.status === 'ended') router.replace('/(tabs)');
  }, [session?.status, router]);

  const submit = () => {
    if (!input.trim()) return;
    sendComment(input.trim());
    setInput('');
    Keyboard.dismiss();
  };

  const host = session?.profiles;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Host-Video */}
      <RemoteVideoView hostAvatar={host?.avatar_url} />

      {/* Blur-Hintergrund wenn kein Video */}
      {host?.avatar_url && (
        <Image
          source={{ uri: host.avatar_url }}
          style={[StyleSheet.absoluteFill, { opacity: 0.18, zIndex: -1 }]}
          resizeMode="cover"
          blurRadius={18}
        />
      )}

      {/* Overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.88)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Floating Reaktionen */}
      <View style={s.reactionsLayer} pointerEvents="none">
        {reactions.map((r) => <ReactionBubble key={r.id} reaction={r} />)}
      </View>

      {/* Oben */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <ArrowLeft size={20} stroke="#fff" strokeWidth={2.2} />
        </Pressable>

        <View style={s.hostInfo}>
          {host?.avatar_url ? (
            <Image source={{ uri: host.avatar_url }} style={s.hostAvatarSmall} />
          ) : (
            <View style={[s.hostAvatarSmall, s.hostAvatarSmallFallback]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                {host?.username?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          <Text style={s.hostName}>@{host?.username ?? '...'}</Text>
        </View>

        <View style={s.livePill}>
          <Animated.View style={[s.liveDot, dotStyle]} />
          <Text style={s.liveLabel}>LIVE</Text>
        </View>

        <View style={s.viewerBadge}>
          <Users size={13} stroke="#fff" strokeWidth={2} />
          <Text style={s.viewerCount}>{session?.viewer_count ?? 0}</Text>
        </View>
      </View>

      {/* Titel */}
      {session?.title ? (
        <View style={[s.titleWrap, { top: insets.top + 56 }]}>
          <Text style={s.titleText} numberOfLines={1}>{session.title}</Text>
        </View>
      ) : null}

      {/* Reaktions-Buttons */}
      <View style={s.emojiRow}>
        {EMOJIS.map((emoji) => (
          <Pressable key={emoji} onPress={() => sendReaction(emoji)} style={s.emojiBtn}>
            <Text style={s.emojiText}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      {/* Kommentare: bottom = Kommentar-Leisten-Höhe (paddingTop10 + input36 + paddingBottom10 + insets.bottom) */}
      <View style={[s.commentsArea, { bottom: insets.bottom + 62 }]}>
        <FlatList
          ref={flatRef}
          data={comments.slice(-30)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CommentRow comment={item} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>

      {/* TikTok-Style Kommentar-Leiste */}
      <View style={[s.commentBar, { paddingBottom: insets.bottom + 10 }]}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={s.myAvatar} />
        ) : (
          <View style={[s.myAvatar, s.myAvatarFallback]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              {profile?.username?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            placeholder="Kommentieren …"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submit}
            returnKeyType="send"
            selectionColor="#A78BFA"
            maxLength={300}
          />
        </View>
        {input.trim().length > 0 && (
          <Pressable onPress={submit} hitSlop={8} style={s.sendBtn}>
            <Send size={20} stroke="#A78BFA" strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Screen (lädt LiveKit Token dann verbindet) ───────────────────────────────
export default function LiveWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { data: session } = useLiveSession(id);

  // Hooks MÜSSEN vor allen bedingten Returns stehen (Rules of Hooks)
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [lkUrl,   setLkUrl]   = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!session?.room_name) return;
    fetchLiveKitToken(session.room_name, false).then((res) => {
      if (!res) { setTokenError(true); return; }
      setLkToken(res.token);
      setLkUrl(res.url);
    });
  }, [session?.room_name]);

  // Expo Go Placeholder (nach den Hooks — Rules of Hooks einhalten!)
  if (Constants.appOwnership === 'expo') {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ fontSize: 48 }}>📺</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Dev-Build erforderlich</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          Live Studio läuft nicht in Expo Go.{'\n'}Bitte einen Dev-Build verwenden.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={{ marginTop: 8, backgroundColor: '#7C3AED', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  if (tokenError) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ color: '#fff', fontSize: 16 }}>Verbindung fehlgeschlagen</Text>
        <Pressable onPress={() => router.back()} style={s.backBtnCenter}>
          <Text style={{ color: '#A78BFA', fontWeight: '700' }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  if (!lkToken || !lkUrl) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <ActivityIndicator color="#A78BFA" size="large" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Verbinde mit Live …</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LiveKitRoom
        serverUrl={lkUrl}
        token={lkToken}
        connect
        audio
        video={false}
        onError={(err) => {
          Alert.alert('Verbindungsfehler', err.message);
          router.replace('/(tabs)');
        }}
      >
        <WatchUI sessionId={id} />
      </LiveKitRoom>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  videoPlaceholder: {
    position: 'absolute', top: '25%', left: 0, right: 0,
    alignItems: 'center', gap: 12, zIndex: 2,
  },
  hostAvatar: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: '#EF4444',
  },
  hostAvatarFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  hostInitial: { color: '#fff', fontSize: 44, fontWeight: '900' },
  connectingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 8 },

  reactionsLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 110,
    zIndex: 5,
  } as any,
  reactionBubble: {
    position: 'absolute', bottom: 0,
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 26 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, zIndex: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnCenter: {
    paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderRadius: 16,
  },
  hostInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  hostAvatarSmall: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  hostAvatarSmallFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  hostName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  liveLabel: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
  },
  viewerCount: { color: '#fff', fontSize: 13, fontWeight: '700' },

  titleWrap: {
    position: 'absolute', alignSelf: 'center', zIndex: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 14,
  },
  titleText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },

  emojiRow: {
    position: 'absolute', right: 14, bottom: 100,
    gap: 8, zIndex: 15,
  },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },

  commentsArea: {
    position: 'absolute', left: 0, right: 70,
    maxHeight: 220, paddingHorizontal: 14, zIndex: 10,
  },
  commentRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: 5, alignSelf: 'flex-start',
  },
  commentUser: { color: '#A78BFA', fontWeight: '700', fontSize: 13 },
  commentText: { color: '#fff', fontSize: 13 },

  commentBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: 'rgba(10,10,10,0.92)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  myAvatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', flexShrink: 0 },
  myAvatarFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  input: { color: '#fff', fontSize: 14, padding: 0, margin: 0 },
  sendBtn: { padding: 6 },
});
