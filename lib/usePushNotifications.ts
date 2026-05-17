import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from './authStore';

// Expo Project ID aus app.json (für getExpoPushTokenAsync in Expo SDK 54 erforderlich)
const EXPO_PROJECT_ID = '02ab536a-5836-4560-a5ec-2dfd6e059f90';

function pushPlatform(): 'ios' | 'android' | 'other' {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return 'other';
}

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  /* Expo Go stub — ignorieren */
}

export function usePushNotifications() {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener    = useRef<Notifications.EventSubscription | null>(null);
  const tokenRegistered     = useRef(false);

  // ── Reaktiv auf Session warten ────────────────────────────────────────────
  // useAuthStore.getState().session ist beim ersten Mount noch null (SecureStore
  // lädt async). Durch Subscribeuse – wir auf die Session warten.
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Noch nicht eingeloggt → warten
    if (!session || !profile?.id) return;
    // Bereits registriert in dieser Session → nicht nochmal
    if (tokenRegistered.current) return;

    const register = async () => {
      try {
        if (typeof Notifications.getPermissionsAsync !== 'function') return;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
        });

        const token = tokenData?.data;
        if (!token) {
          console.warn('[PushNotif] Kein Token erhalten');
          return;
        }

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

        const tokenRes = await fetch(`${supabaseUrl}/rest/v1/push_tokens?on_conflict=user_id,token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            user_id: profile.id,
            token,
            platform: pushPlatform(),
            last_seen_at: new Date().toISOString(),
          }),
        });

        if (tokenRes.ok) {
          tokenRegistered.current = true;
          return;
        }

        // Fallback fuer Datenbanken vor push_tokens_multi_device.sql.
        const fallbackRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${profile.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ expo_push_token: token }),
        });

        if (fallbackRes.ok) {
          tokenRegistered.current = true;
        } else {
          const tokenText = await tokenRes.text().catch(() => '');
          const fallbackText = await fallbackRes.text().catch(() => '');
          console.warn(
            '[PushNotif] Token speichern fehlgeschlagen:',
            `push_tokens=${tokenRes.status} ${tokenText.substring(0, 120)}`,
            `profiles=${fallbackRes.status} ${fallbackText.substring(0, 120)}`,
          );
        }
      } catch (err) {
        if (__DEV__) console.warn('[PushNotif] Fehler (Expo Go oder Stub):', (err as Error)?.message ?? err);
      }
    };

    register();
  }, [session, profile?.id]); // Re-fires wenn Session/Profile verfügbar wird

  // Notification Listeners
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
    } catch {
      /* Expo Go stub */
    }
    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}
