const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ─── Build-Modus-Erkennung ───────────────────────────────────────────────────
// EAS_BUILD=1 wird in eas.json für preview + production gesetzt.
// EXPO_NATIVE_BUILD=1 setzen unsere lokalen run:* Scripts für Dev-Clients.
// Nur im echten Expo Go bleiben alle Stubs aktiv um Crashes zu verhindern.
// In EAS + lokalem Dev-Client sind nur die permanenten Stubs aktiv.
const IS_EAS_BUILD = process.env.EAS_BUILD === '1';
const USE_NATIVE_MODULES = IS_EAS_BUILD || process.env.EXPO_NATIVE_BUILD === '1';

console.log(`[metro] Build-Modus: ${USE_NATIVE_MODULES ? '🏗️  Native Module aktiv' : '📱 Expo Go (Stubs aktiv)'}`);

// ─── Permanente Stubs (immer aktiv — lösen CJS/ESM-Hazards) ─────────────────
const ALWAYS_STUBS = {
  // @tanstack/react-query: dual-package hazard → zwei Context-Instanzen → "No QueryClient set"
  '@tanstack/react-query': require.resolve('@tanstack/react-query'),
  // LiveKit: ab Phase 3 installiert → Stubs entfernt, echte Native Module aktiv
};

// ─── Expo-Go-Stubs (nur aktiv wenn KEIN EAS Build) ───────────────────────────
// Ersetzt native TurboModule die in Hermes HBC crashen würden.
const EXPO_GO_STUBS = {
  'react-native-reanimated':        path.resolve(__dirname, 'stubs/reanimated-compat.js'),
  'react-native-safe-area-context': path.resolve(__dirname, 'stubs/safe-area-compat.js'),
  'react-native-screens':           path.resolve(__dirname, 'stubs/screens-compat.js'),
  'lucide-react-native':            path.resolve(__dirname, 'stubs/lucide-compat.js'),
  'expo-linear-gradient':           path.resolve(__dirname, 'stubs/linear-gradient-compat.js'),
  'expo-haptics':                   path.resolve(__dirname, 'stubs/haptics-compat.js'),
  'expo-image-picker':              path.resolve(__dirname, 'stubs/expo-image-picker-mock.js'),
  'expo-clipboard':                 path.resolve(__dirname, 'stubs/expo-clipboard-mock.js'),
  'expo-video-thumbnails':          path.resolve(__dirname, 'stubs/expo-video-thumbnails-mock.js'),
  'expo-image':                     path.resolve(__dirname, 'stubs/expo-image-mock.js'),
  'expo-blur':                      path.resolve(__dirname, 'stubs/expo-blur-mock.js'),
  'expo-av':                        path.resolve(__dirname, 'stubs/expo-av-mock.js'),
  'expo-network':                   path.resolve(__dirname, 'stubs/expo-network-mock.js'),
  // expo-notifications: nur in Expo Go stubben (kein natives TurboModule verfügbar)
  'expo-notifications':             path.resolve(__dirname, 'stubs/expo-notifications-mock.js'),
  // @shopify/flash-list: nur in Expo Go stubben (AutoLayoutView ist ein nativer View)
  '@shopify/flash-list':            path.resolve(__dirname, 'stubs/flash-list-mock.js'),
  // LiveKit: in Expo Go stubben — native WebRTC Module nur in EAS-Builds verfügbar
  '@livekit/react-native':          path.resolve(__dirname, 'stubs/livekit-mock.js'),
  '@livekit/react-native-webrtc':   path.resolve(__dirname, 'stubs/livekit-webrtc-mock.js'),
};

// Aktive Stubs basierend auf Build-Modus
const STUBS = USE_NATIVE_MODULES
  ? ALWAYS_STUBS
  : { ...ALWAYS_STUBS, ...EXPO_GO_STUBS };

const originalResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (STUBS[moduleName]) {
    return { filePath: STUBS[moduleName], type: 'sourceFile' };
  }
  if (originalResolve) {
    return originalResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// ────────────────────────────────────────────────────────────────────────────
// GLOBALER INTEROP-FIX: Metro's _interopRequireWildcard() wirft TypeError in
// Hermes strict-mode wenn 'default' ein non-configurable getter ist.
// Fix: Bundle-String nach dem Build patchen.
// ────────────────────────────────────────────────────────────────────────────
config.serializer = config.serializer || {};
const expoSerializer = config.serializer.customSerializer;

if (expoSerializer) {
  config.serializer.customSerializer = async function patchBundle(
    entryPoint, preModules, graph, options
  ) {
    const result = await expoSerializer(entryPoint, preModules, graph, options);

    if (typeof result !== 'string') return result;

    const patched = result.replace(
      /\bn\.default\s*=\s*e(?=[,;])/g,
      '(0,function(){try{n.default=e}catch(_IE){try{Object.defineProperty(n,"default",{value:e,writable:true,configurable:true})}catch(_IE2){}}})()' 
    );

    if (patched !== result) {
      console.log('[metro-patch] ✅ _interopNamespace fix applied');
    } else {
      console.warn('[metro-patch] ⚠️ Pattern "n.default=e" NOT FOUND – fix not applied!');
    }

    return patched;
  };
} else {
  console.warn('[metro-patch] ⚠️ Expo serializer not found – interop fix skipped');
}

module.exports = config;
