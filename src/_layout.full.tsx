/**
 * Full app root layout – loaded lazily from app/_layout.tsx via require().
 *
 * CRITICAL: This module's factory MUST NOT throw. Any throw in the factory causes
 * Hermes production to silently return `undefined` for this module.
 *
 * Strategy:
 *  - ONLY named imports from 'react' and 'react-native' at the top level.
 *  - EVERYTHING else: lazy require() with string literals inside component bodies.
 *    This avoids ANY module-init-time failure (tanstack-query, zustand, supabase, etc.)
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';

// ─── AuthGuard ────────────────────────────────────────────────────────────────
function AuthGuard() {
  const { useRouter, useSegments } =
    require('expo-router') as typeof import('expo-router');
  const { supabase } =
    require('@/lib/supabase') as typeof import('@/lib/supabase');
  const { useAuthStore } =
    require('@/lib/authStore') as typeof import('@/lib/authStore');

  const { session, initialized, profile, profileStatus, setSession, fetchProfile } =
    useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      useAuthStore.setState({ initialized: true });
    }, 2500);

    supabase.auth
      .getSession()
      .then(
        async ({
          data: { session },
        }: {
          data: { session: import('@supabase/supabase-js').Session | null };
        }) => {
          setSession(session);
          if (session?.user) await fetchProfile(session.user.id);
          useAuthStore.setState({ initialized: true });
        },
      )
      .catch(() => {
        useAuthStore.setState({ initialized: true });
      })
      .finally(() => clearTimeout(safetyTimer));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: string, session: import('@supabase/supabase-js').Session | null) => {
        setSession(session);
        if (session?.user) await fetchProfile(session.user.id);
        if (event === 'PASSWORD_RECOVERY')
          router.replace('/reset-password' as never);
      },
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login' as never);
      return;
    }
    if (profileStatus === 'loading' || profileStatus === 'idle') return;
    if (profileStatus === 'error') return;
    if (profileStatus === 'missing') {
      if (!inOnboardingGroup) router.replace('/(onboarding)' as never);
      return;
    }
    if (!profile) return;
    if (inAuthGroup) {
      router.replace(
        !profile.onboarding_complete
          ? ('/(onboarding)' as never)
          : ('/(tabs)' as never),
      );
      return;
    }
    if (!inAuthGroup && !inOnboardingGroup && !profile.onboarding_complete) {
      router.replace('/(onboarding)' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, initialized, profile, profileStatus, segments]);

  return null;
}

// ─── PushNotificationsProvider ────────────────────────────────────────────────
function PushNotificationsProvider() {
  const { usePushNotifications } =
    require('@/lib/usePushNotifications') as typeof import('@/lib/usePushNotifications');
  usePushNotifications();
  return null;
}

// ─── AppSplash ────────────────────────────────────────────────────────────────
function AppSplash() {
  const { useAuthStore } =
    require('@/lib/authStore') as typeof import('@/lib/authStore');
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const profileStatus = useAuthStore((s) => s.profileStatus);
  const profileError = useAuthStore((s) => s.profileError);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const waitingForProfile =
    !!session && (profileStatus === 'idle' || profileStatus === 'loading');
  const profileFailed = !!session && profileStatus === 'error';
  if (profileFailed) {
    return (
      <View style={splashStyles.overlay}>
        <Text style={splashStyles.errorTitle}>Profil konnte nicht geladen werden</Text>
        <Text style={splashStyles.errorText}>
          {profileError ?? 'Bitte prüfe deine Verbindung und versuche es erneut.'}
        </Text>
        <Pressable
          style={splashStyles.retryButton}
          onPress={() => {
            if (session?.user?.id) fetchProfile(session.user.id);
          }}
        >
          <Text style={splashStyles.retryText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }
  if (initialized && !waitingForProfile) return null;
  return (
    <View style={splashStyles.overlay}>
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={splashStyles.label}>Vibes — wird geladen…</Text>
    </View>
  );
}

// ─── BuildBanner ─────────────────────────────────────────────────────────────
function BuildBanner() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;

  const cMod = require('expo-constants') as any;
  const C = cMod?.default ?? cMod;
  const build = C?.expoConfig?.ios?.buildNumber ?? '?';
  const version = C?.expoConfig?.version ?? '?';
  return (
    <View style={splashStyles.banner} pointerEvents="none">
      <Text style={splashStyles.bannerText}>
        v{version} ({build})
      </Text>
    </View>
  );
}

// ─── OfflineBanner wrapper ────────────────────────────────────────────────────
function OfflineBanner() {
  const mod = require('@/components/ui/OfflineBanner') as any;
  const OB = mod?.OfflineBanner;
  if (typeof OB !== 'function') return null;
  return <OB />;
}

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    gap: 16,
  },
  label: {
    color: '#EDE9FE',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  banner: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(109, 40, 217, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 1000,
  },
  bannerText: {
    color: '#EDE9FE',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    color: '#EDE9FE',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 300,
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: {
    color: '#4C1D95',
    fontSize: 14,
    fontWeight: '800',
  },
});

// ─── Root ─────────────────────────────────────────────────────────────────────
/**
 * Volle App-Root-Layout.
 * QueryClient is created inside the component via useRef so it's never on
 * module level (module-level @tanstack/react-query calls can throw in Hermes).
 */
export default function RootLayoutFull() {
  // Lazy-load everything inside the function – NEVER at module level
  const { Stack } = require('expo-router') as typeof import('expo-router');
  const { ErrorBoundary } =
    require('@/components/ui/ErrorBoundary') as typeof import('@/components/ui/ErrorBoundary');
  const { QueryClient, QueryClientProvider } =
    require('@tanstack/react-query') as typeof import('@tanstack/react-query');

  // QueryClient created once via ref, not state, to avoid re-creating on re-renders
  const qcRef = useRef<InstanceType<typeof QueryClient> | null>(null);
  if (!qcRef.current) {
    qcRef.current = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60 * 1000, retry: 1, gcTime: 5 * 60 * 1000 },
      },
    });
  }

  // Enable screens lazily (not at module init time)
  useEffect(() => {
    try {
      const { enableScreens } =
        require('react-native-screens') as typeof import('react-native-screens');
      enableScreens(false);
    } catch { /* stub may not export enableScreens */ }
  }, []);

  useEffect(() => {
    // Guaranteed SplashScreen.hideAsync() with delay.
    const hide = () =>
      (require('expo-splash-screen') as any).hideAsync?.().catch(() => {});
    const t1 = setTimeout(hide, 500);
    const t2 = setTimeout(hide, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={qcRef.current}>
        <View style={{ flex: 1 }}>
          <AuthGuard />
          <PushNotificationsProvider />
          <AppSplash />
          <BuildBanner />
          <OfflineBanner />
          <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen
              name="create/index"
              options={{ presentation: 'modal', animation: 'none' }}
            />
            <Stack.Screen name="post/[id]" options={{ animation: 'none' }} />
            <Stack.Screen
              name="settings"
              options={{ presentation: 'modal', animation: 'none' }}
            />
            <Stack.Screen name="user/[id]" options={{ animation: 'none' }} />
            <Stack.Screen
              name="story-viewer"
              options={{
                headerShown: false,
                animation: 'none',
                presentation: 'fullScreenModal',
              }}
            />
            <Stack.Screen
              name="edit-post/[id]"
              options={{
                headerShown: false,
                presentation: 'modal',
                animation: 'none',
              }}
            />
            <Stack.Screen
              name="messages/index"
              options={{ headerShown: false, animation: 'none' }}
            />
            <Stack.Screen
              name="messages/[id]"
              options={{ headerShown: false, animation: 'none' }}
            />
            <Stack.Screen
              name="reset-password"
              options={{ headerShown: false, animation: 'none' }}
            />
            <Stack.Screen
              name="user-posts"
              options={{
                headerShown: false,
                animation: 'none',
                presentation: 'fullScreenModal',
              }}
            />
          </Stack>
        </View>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
