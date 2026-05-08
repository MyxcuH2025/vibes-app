import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Animated: 'import Animated from' → _interopRequireDefault → TypeError in Hermes HBC.
// Use named imports only. The reanimated stub exports these as named properties.
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  // Animated object (View etc.) accessed via named import of the default export value
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStatus } from '@/lib/useNetworkStatus';

// Animated.View component: get it from the module directly via require to avoid default interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _ra = require('react-native-reanimated') as any;
const AnimatedView = (_ra?.default ?? _ra)?.View ?? View;

/**
 * Schiebt sich von oben ins Bild wenn kein Internet vorhanden ist.
 * Verschwindet automatisch sobald die Verbindung zurückkommt.
 * Einbinden in app/_layout.tsx (einmal, deckt die gesamte App ab).
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const isConnected = useNetworkStatus();

  const translateY = useSharedValue(-80);
  const opacity    = useSharedValue(0);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    // null = noch unbekannt → nichts anzeigen
    if (isConnected === null) return;

    if (!isConnected) {
      translateY.value = withSpring(0,  { damping: 18, stiffness: 200 });
      opacity.value    = withTiming(1,  { duration: 200 });
    } else {
      translateY.value = withTiming(-80, { duration: 250 });
      opacity.value    = withTiming(0,   { duration: 200 });
    }
  }, [isConnected, translateY, opacity]);

  return (
    <AnimatedView
      style={[styles.banner, { paddingTop: insets.top + 8 }, bannerStyle]}
      pointerEvents="none"
    >
      <View style={styles.inner}>
        <WifiOff size={15} stroke="#fff" strokeWidth={2} />
        <Text style={styles.text}>Keine Internetverbindung</Text>
      </View>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1F1F1F',
    paddingBottom: 10,
    zIndex: 1000,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
