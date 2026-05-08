/**
 * live/host.tsx
 * Host-Ansicht während eines Live-Streams.
 * - LiveKit: echtes Video-Streaming (braucht Dev-Build: npx expo run:ios)
 * - Supabase Realtime: Kommentare & Reaktionen
 */
import { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  Keyboard,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  Users,
  Send,
  MicOff,
  Mic,
  CameraOff,
  Camera,
  Share2,
  RotateCcw,
} from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  FadeInDown,
  FadeOutUp,
} from "react-native-reanimated";
import {
  AudioSession,
  useLocalParticipant,
  VideoTrack,
} from "@livekit/react-native";
import { supabase } from "@/lib/supabase";
import { RoomContext } from "@livekit/components-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { TrackPublication, Participant } from "livekit-client";
import {
  useLiveHost,
  useLiveComments,
  useLiveReactions,
  type LiveComment,
  type LiveReaction,
} from "@/lib/useLiveSession";
import LiveShareSheet from "@/components/ui/LiveShareSheet";
import ViewerListSheet from "@/components/ui/ViewerListSheet";
// expo-constants: default import causes _interopRequireDefault TypeError in Hermes HBC
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _cMod = require("expo-constants") as any;
const Constants = _cMod?.default ?? _cMod;

const EMOJIS = ["❤️", "🔥", "👏", "😱", "💜"];

// ─── Floating Reaktions-Bubble ────────────────────────────────────────────────
function ReactionBubble({ reaction }: { reaction: LiveReaction }) {
  const left = 20 + Math.random() * 80;
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withTiming(-220, { duration: 2800 });
    opacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 2700 }),
    );
  }, [opacity, translateY]);

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
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(150)}
      style={s.commentRow}
    >
      <Text style={s.commentUser}>@{comment.profiles?.username ?? "User"}</Text>
      <Text style={s.commentText}> {comment.text}</Text>
    </Animated.View>
  );
}

// ─── Echtzeit Viewer Count (LiveKit-basiert) ──────────────────────────────────
function useViewerCount(sessionId: string) {
  const room = useContext(RoomContext);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);

  useEffect(() => {
    if (!room) return;

    const update = () => {
      const count = room.remoteParticipants.size;
      setViewerCount(count);
      setPeakViewers((prev) => Math.max(prev, count));
    };

    // Initial count
    update();

    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    return () => {
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
    };
  }, [room]);

  // Sync count back to DB every 5s so watchers can see it too
  useEffect(() => {
    const interval = setInterval(() => {
      supabase
        .from("live_sessions")
        .update({ viewer_count: viewerCount, peak_viewers: peakViewers })
        .eq("id", sessionId)
        .then();
    }, 5000);
    return () => clearInterval(interval);
  }, [viewerCount, peakViewers, sessionId]);

  return { viewerCount, peakViewers };
}

// ─── LiveKit Host-Steuerung (Mikrofon / Kamera toggle) ────────────────────────
function HostControls() {
  const { localParticipant } = useLocalParticipant();
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!micEnabled);
    setMicEnabled((v) => !v);
  };

  const toggleCamera = async () => {
    await localParticipant.setCameraEnabled(!cameraEnabled);
    setCameraEnabled((v) => !v);
  };

  const switchCamera = async () => {
    try {
      // Toggle between front and back camera
      const devices = await Room.getLocalDevices("videoinput");
      if (devices.length < 2) return;
      const currentTrack = localParticipant.getTrackPublication(
        Track.Source.Camera,
      );
      if (!currentTrack?.track) return;
      const currentDeviceId =
        currentTrack.track.mediaStreamTrack?.getSettings()?.deviceId;
      const nextDevice =
        devices.find((d) => d.deviceId !== currentDeviceId) ?? devices[0];
      await currentTrack.track.setDeviceId(nextDevice.deviceId);
    } catch {
      // Fallback: einfach Camera neu starten
    }
  };

  return (
    <View style={s.controls}>
      <Pressable
        style={[s.controlBtn, !micEnabled && s.controlBtnOff]}
        onPress={toggleMic}
        hitSlop={8}
      >
        {micEnabled ? (
          <Mic size={18} stroke="#fff" strokeWidth={2} />
        ) : (
          <MicOff size={18} stroke="#EF4444" strokeWidth={2} />
        )}
      </Pressable>
      <Pressable
        style={[s.controlBtn, !cameraEnabled && s.controlBtnOff]}
        onPress={toggleCamera}
        hitSlop={8}
      >
        {cameraEnabled ? (
          <Camera size={18} stroke="#fff" strokeWidth={2} />
        ) : (
          <CameraOff size={18} stroke="#EF4444" strokeWidth={2} />
        )}
      </Pressable>
      <Pressable style={s.controlBtn} onPress={switchCamera} hitSlop={8}>
        <RotateCcw size={18} stroke="#fff" strokeWidth={2} />
      </Pressable>
    </View>
  );
}

// ─── LocalCameraView ─────────────────────────────────────────────────
// Hört direkt auf RoomEvent - kein useTracks-Timing-Bug in React Native.
function LocalCameraView() {
  const room = useContext(RoomContext);
  const [trackRef, setTrackRef] = useState<{
    participant: Participant;
    publication: TrackPublication;
    source: Track.Source;
  } | null>(null);

  useEffect(() => {
    if (!room) return;

    const onPublished = (pub: TrackPublication, participant: Participant) => {
      if (pub.source === Track.Source.Camera) {
        setTrackRef({
          participant,
          publication: pub,
          source: Track.Source.Camera,
        });
      }
    };
    const onUnpublished = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) setTrackRef(null);
    };

    room.on(RoomEvent.LocalTrackPublished, onPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onUnpublished);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onPublished);
      room.off(RoomEvent.LocalTrackUnpublished, onUnpublished);
    };
  }, [room]);

  if (!trackRef) return null;
  return (
    <VideoTrack
      trackRef={trackRef as any}
      style={StyleSheet.absoluteFill as any}
      objectFit="cover"
      mirror
    />
  );
}

// ─── Inner Host UI (innerhalb LiveKitRoom) ────────────────────────────────────
function HostUI({
  sessionId,
  title,
  onEnd,
}: {
  sessionId: string;
  title?: string;
  onEnd: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { comments, sendComment } = useLiveComments(sessionId);
  const { reactions, sendReaction } = useLiveReactions(sessionId);
  const { viewerCount, peakViewers } = useViewerCount(sessionId);
  const flatRef = useRef<FlatList>(null);
  const [input, setInput] = useState("");
  const [shareVisible, setShareVisible] = useState(false);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [startTime] = useState(Date.now());

  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  useEffect(() => {
    if (comments.length > 0) flatRef.current?.scrollToEnd({ animated: true });
  }, [comments.length]);

  const submit = () => {
    if (!input.trim()) return;
    sendComment(input.trim());
    setInput("");
    Keyboard.dismiss();
  };

  const handleShare = () => setShareVisible(true);

  const handleEnd = () => {
    setShowSummary(true);
  };

  const confirmEnd = () => {
    setShowSummary(false);
    onEnd();
  };

  // Formatiere Dauer
  const formatDuration = () => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Eigenes Kamerabild */}
      <LocalCameraView />

      {/* Overlay */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Reaktionen */}
      <View style={s.reactionsLayer} pointerEvents="none">
        {reactions.map((r) => (
          <ReactionBubble key={r.id} reaction={r} />
        ))}
      </View>

      {/* Oben */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={s.livePill}>
          <Animated.View style={[s.liveDot, dotStyle]} />
          <Text style={s.liveLabel}>LIVE</Text>
        </View>
        {title ? (
          <Text style={s.titleText} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Pressable
          onPress={() => setViewersVisible(true)}
          style={s.viewerBadge}
        >
          <Users size={13} stroke="#fff" strokeWidth={2} />
          <Text style={s.viewerCount}>{viewerCount}</Text>
        </Pressable>
        <Pressable onPress={handleEnd} style={s.endBtn} hitSlop={8}>
          <X size={18} stroke="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Mikrofon / Kamera + Share Controls */}
      <View style={[s.controlsPos, { top: insets.top + 60 }]}>
        <HostControls />
        {/* Share-Button */}
        <Pressable onPress={handleShare} style={s.controlBtn}>
          <Share2 size={22} stroke="#fff" strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Reaktions-Buttons */}
      <View style={s.emojiRow}>
        {EMOJIS.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => sendReaction(emoji)}
            style={s.emojiBtn}
          >
            <Text style={s.emojiText}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      {/* Kommentare */}
      <View style={[s.commentsArea, { paddingBottom: insets.bottom + 76 }]}>
        <FlatList
          ref={flatRef}
          data={comments.slice(-30)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CommentRow comment={item} />}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>

      {/* Kommentar-Eingabe */}
      <View style={[s.inputBar, { paddingBottom: insets.bottom + 12 }]}>
        <TextInput
          style={s.input}
          placeholder="Als Host kommentieren …"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submit}
          returnKeyType="send"
          selectionColor="#A78BFA"
          maxLength={300}
        />
        {input.trim().length > 0 && (
          <Pressable onPress={submit} hitSlop={8} style={s.sendBtn}>
            <Send size={18} stroke="#A78BFA" strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
      {/* Share Sheet */}
      <LiveShareSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        sessionId={sessionId}
        title={title}
      />
      {/* Viewer List Sheet */}
      <ViewerListSheet
        visible={viewersVisible}
        onClose={() => setViewersVisible(false)}
        sessionId={sessionId}
        onMention={(username) => {
          setViewersVisible(false);
          setInput((prev) => `${prev}@${username} `);
        }}
      />

      {/* Live-End Summary Modal */}
      <Modal transparent visible={showSummary} animationType="fade">
        <View style={s.summaryBackdrop}>
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>Live beendet 🎬</Text>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryValue}>{formatDuration()}</Text>
                <Text style={s.summaryLabel}>Dauer</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={s.summaryValue}>{peakViewers}</Text>
                <Text style={s.summaryLabel}>Peak Zuschauer</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={s.summaryValue}>{comments.length}</Text>
                <Text style={s.summaryLabel}>Kommentare</Text>
              </View>
            </View>
            <Pressable onPress={confirmEnd} style={s.summaryBtn}>
              <Text style={s.summaryBtnText}>Fertig</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Expo Go Placeholder ─────────────────────────────────────────────────────
function ExpoGoPlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0a0010",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 48 }}>🎥</Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 18,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        Dev-Build erforderlich
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 14,
          textAlign: "center",
          paddingHorizontal: 32,
        }}
      >
        Live Studio läuft nicht in Expo Go.{"\n"}Bitte einen Dev-Build
        verwenden.
      </Text>
      <Pressable
        onPress={onBack}
        style={{
          marginTop: 8,
          backgroundColor: "#7C3AED",
          borderRadius: 14,
          paddingHorizontal: 24,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Zurück</Text>
      </Pressable>
    </View>
  );
}

export default function LiveHostScreen() {
  const { sessionId, title, lkToken, lkUrl } = useLocalSearchParams<{
    sessionId: string;
    title?: string;
    lkToken: string;
    lkUrl: string;
  }>();
  const router = useRouter();
  const { endSession } = useLiveHost();
  const [lkError, setLkError] = useState<string | null>(null);

  // Room einmalig erstellen — stabile Referenz über gesamten Lebenszyklus.
  // KEIN useLiveKitRoom-Wrapper, der bei Re-Renders disconnectet.
  const [room] = useState(
    () => new Room({ adaptiveStream: { pixelDensity: "screen" } }),
  );

  // EINMALIGER useEffect (leere Deps) — verbindet, aktiviert Tracks, räumt auf.
  useEffect(() => {
    if (!lkUrl || !lkToken) return;

    let canceled = false;
    AudioSession.startAudioSession();

    (async () => {
      try {
        await room.connect(lkUrl, lkToken);
        if (canceled) {
          room.disconnect();
          return;
        }

        // expo-camera freisetzen: 2500 ms nach connect warten
        await new Promise<void>((r) => setTimeout(r, 2500));
        if (canceled) return;

        // Mikro/Kamera aktivieren — Fehler nur loggen, kein Error-Screen
        // (Benutzer kann über Buttons retriggen)
        await room.localParticipant
          .setMicrophoneEnabled(true)
          .catch((e: unknown) => {
            console.warn(
              "[LiveHost] Mikrofonaktivierung fehlgeschlagen:",
              String(e),
            );
          });

        // Kamera mit explizitem facingMode um Device-Enumeration-Bug zu umgehen
        const enableCamera = async () => {
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: "user", // verhindert toLowerCase-Fehler bei undefined deviceId
            resolution: {
              width: 720,
              height: 1280,
              frameRate: 25,
              aspectRatio: 1280 / 720,
            },
          });
        };

        await enableCamera().catch(async (e: unknown) => {
          console.warn(
            "[LiveHost] Kamera fehlgeschlagen (1. Versuch):",
            String(e),
          );
          // Retry nach 3s — gibt iOS mehr Zeit die Kamera freizugeben
          await new Promise<void>((r) => setTimeout(r, 3000));
          if (canceled) return;
          await enableCamera().catch((e2: unknown) => {
            console.warn(
              "[LiveHost] Kamera fehlgeschlagen (2. Versuch):",
              String(e2),
            );
          });
        });
      } catch (e: unknown) {
        // Nur Room.connect()-Fehler zeigen Fehlerscreen
        if (!canceled) {
          const msg = e instanceof Error ? e.message : String(e);
          setLkError(`${msg} | URL: ${lkUrl.slice(0, 30)}`);
        }
      }
    })();

    return () => {
      canceled = true;
      AudioSession.stopAudioSession();
      room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← ABSICHTLICH LEER: läuft nur einmal!

  const handleEnd = () => {
    Alert.alert("Live beenden", "Dein Live wird für alle Zuschauer beendet.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Beenden",
        style: "destructive",
        onPress: async () => {
          await endSession(sessionId);
          router.replace("/(tabs)");
        },
      },
    ]);
  };

  if (Constants.appOwnership === "expo") {
    return <ExpoGoPlaceholder onBack={() => router.replace("/(tabs)")} />;
  }

  if (!lkToken || !lkUrl || !sessionId) {
    return (
      <View
        style={[s.root, { alignItems: "center", justifyContent: "center" }]}
      >
        <Text style={{ color: "#fff" }}>Verbindungsdaten fehlen</Text>
      </View>
    );
  }

  if (lkError) {
    return (
      <View
        style={[
          s.root,
          {
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
          },
        ]}
      >
        <Text style={{ color: "#EF4444", fontSize: 16, fontWeight: "700" }}>
          Verbindungsfehler
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {lkError}
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={{
            backgroundColor: "#7C3AED",
            borderRadius: 14,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  return (
    // RoomContext.Provider direkt — alle @livekit/react-native Hooks (useLocalParticipant etc.) lesen hieraus.
    <RoomContext.Provider value={room}>
      <View style={s.root}>
        <HostUI sessionId={sessionId} title={title} onEnd={handleEnd} />
      </View>
    </RoomContext.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  reactionsLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingBottom: 120,
    zIndex: 5,
    pointerEvents: "none",
  } as any,
  reactionBubble: {
    position: "absolute",
    bottom: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmoji: { fontSize: 26 },

  topBar: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  liveLabel: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
  },
  titleText: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  viewerCount: { color: "#fff", fontSize: 13, fontWeight: "700" },
  endBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  controlsPos: { position: "absolute", right: 14, zIndex: 20 },
  controls: { gap: 8 },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnOff: { backgroundColor: "rgba(239,68,68,0.25)" },

  emojiRow: {
    position: "absolute",
    right: 14,
    bottom: 160,
    gap: 8,
    zIndex: 15,
  },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 22 },

  commentsArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 70,
    maxHeight: 240,
    paddingHorizontal: 14,
    zIndex: 10,
  },
  commentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 5,
    alignSelf: "flex-start",
  },
  commentUser: { color: "#A78BFA", fontWeight: "700", fontSize: 13 },
  commentText: { color: "#fff", fontSize: 13 },

  inputBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 20,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: "#fff",
    fontSize: 14,
  },
  sendBtn: { padding: 6 },

  // ── Live-End Summary ──
  summaryBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  summaryCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 20,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.2)",
  },
  summaryTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    color: "#A78BFA",
    fontSize: 28,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
  },
  summaryBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingHorizontal: 48,
    paddingVertical: 14,
    marginTop: 4,
  },
  summaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
