/**
 * live/start.tsx
 * Vor dem Live gehen: Titel eingeben, Kamera-Preview, Countdown.
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Radio, ChevronRight } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { useLiveHost } from '@/lib/useLiveSession';
// expo-constants: default import causes _interopRequireDefault TypeError in Hermes HBC
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _cMod = require('expo-constants') as any; const Constants = _cMod?.default ?? _cMod;

export default function LiveStartScreen() {
  const router       = useRouter();
  const insets       = useSafeAreaInsets();
  const { startSession, loading } = useLiveHost();

  const [permission, requestPermission] = useCameraPermissions();
  const [title, setTitle] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(true); // false setzen VOR Navigation damit iOS die Kamera freigibt

  // Pulsierender Dot-Anim
  const dotOpacity = useSharedValue(1);
  const dotStyle   = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const startCountdown = async () => {
    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    // Dot pulsieren
    dotOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
      false
    );

    // 3-2-1 Countdown
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);

    try {
      const result = await startSession(title);
      if (!result) {
        Alert.alert('Fehler', 'Live konnte nicht gestartet werden. Bitte prüfe deine Verbindung.');
        return;
      }
      // Kamera 1 s vor Navigation stoppen → iOS gibt Kamera frei bevor LiveKit sie braucht
      setCameraActive(false);
      await new Promise((r) => setTimeout(r, 1000));

      router.replace({
        pathname: '/live/host',
        params: {
          sessionId: result.sessionId,
          title,
          lkToken: result.token,
          lkUrl: result.url,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      Alert.alert('Live-Fehler', msg);
    }
  };

  if (Constants.appOwnership === 'expo') {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Text style={{ fontSize: 48 }}>🎥</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Dev-Build erforderlich</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          Live Studio läuft nicht in Expo Go.{'\n'}Bitte einen Dev-Build verwenden.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 8, backgroundColor: '#7C3AED', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Kamera-Preview */}
      {permission?.granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="front" active={cameraActive} />
      ) : (
        <LinearGradient
          colors={['#0a0010', '#1a0040', '#0a0020']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dunkler Overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.75)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Zurück */}
      <Pressable
        style={[s.backBtn, { top: insets.top + 10 }]}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <ArrowLeft size={22} stroke="#fff" strokeWidth={2.2} />
      </Pressable>

      {/* LIVE Indikator oben */}
      <View style={[s.liveIndicator, { top: insets.top + 14 }]}>
        <Animated.View style={[s.liveDot, dotStyle]} />
        <Text style={s.liveText}>LIVE</Text>
      </View>

      {/* Countdown */}
      {countdown !== null && (
        <View style={s.countdownWrap}>
          <Text style={s.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Kamera-Zugriff anfragen */}
      {!permission?.granted && (
        <View style={s.permissionBox}>
          <Text style={s.permissionTitle}>Kamera-Zugriff benötigt</Text>
          <Pressable style={s.permissionBtn} onPress={requestPermission}>
            <Text style={s.permissionBtnText}>Erlauben</Text>
          </Pressable>
        </View>
      )}

      {/* Unten: Titel + Start-Button */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={s.hint}>Deine Follower werden benachrichtigt 🔴</Text>

        <TextInput
          style={s.titleInput}
          placeholder="Titel für dein Live (optional)"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          selectionColor="#A78BFA"
        />

        <Pressable
          style={[s.startBtn, (loading || countdown !== null) && s.startBtnDisabled]}
          onPress={startCountdown}
          disabled={loading || countdown !== null}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Radio size={20} stroke="#fff" strokeWidth={2.2} />
              <Text style={s.startBtnText}>Live gehen</Text>
              <ChevronRight size={18} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  backBtn: {
    position: 'absolute', left: 16, zIndex: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  liveIndicator: {
    position: 'absolute', alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff',
  },
  liveText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },

  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  countdownText: {
    fontSize: 120,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: '#A78BFA',
    textShadowRadius: 30,
  },

  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  permissionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  permissionBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20,
  },
  permissionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, gap: 14,
  },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center' },
  titleInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13,
    color: '#fff', fontSize: 16,
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#EF4444',
    borderRadius: 16, paddingVertical: 16,
    shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
