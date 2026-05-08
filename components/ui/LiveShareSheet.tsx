/**
 * LiveShareSheet.tsx
 * TikTok-style 3-layer share bottom sheet for Live-Streams.
 * Layer 1: In-app follower/following users
 * Layer 2: External apps (WhatsApp, Telegram, SMS, etc.)
 * Layer 3: Function buttons (Link kopieren, Story, Melden, etc.)
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Linking,
  Share,
  Modal,
} from 'react-native';
import { setStringAsync as setClipboardStringAsync } from 'expo-clipboard';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import {
  Link2,
  MessageCircle,
  Send,
  Flag,
  HelpCircle,
  ThumbsUp,
  X,
  QrCode,
  BookmarkPlus,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';


// ─── Types ────────────────────────────────────────────────────────────────────
type FollowerUser = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  title?: string;
};

// ─── External App Config ──────────────────────────────────────────────────────
const EXTERNAL_APPS = [
  {
    name: 'Link\nkopieren',
    color: '#333',
    icon: (p: any) => <Link2 {...p} />,
    action: 'copy',
  },
  {
    name: 'WhatsApp',
    color: '#25D366',
    icon: () => <Text style={{ fontSize: 22 }}>💬</Text>,
    action: 'whatsapp',
  },
  {
    name: 'Instagram',
    color: '#E1306C',
    icon: () => <Text style={{ fontSize: 22 }}>📷</Text>,
    action: 'instagram',
  },
  {
    name: 'Telegram',
    color: '#0088CC',
    icon: () => <Text style={{ fontSize: 22 }}>✈️</Text>,
    action: 'telegram',
  },
  {
    name: 'SMS',
    color: '#34C759',
    icon: (p: any) => <MessageCircle {...p} />,
    action: 'sms',
  },
  {
    name: 'Mehr …',
    color: '#666',
    icon: (p: any) => <Send {...p} />,
    action: 'native',
  },
];

const FUNCTION_BUTTONS = [
  {
    name: 'Link\nkopieren',
    icon: (p: any) => <Link2 {...p} />,
    action: 'copy',
  },
  {
    name: 'Zu Story\nhinzufügen',
    icon: (p: any) => <BookmarkPlus {...p} />,
    action: 'story',
  },
  {
    name: 'Melden',
    icon: (p: any) => <Flag {...p} />,
    action: 'report',
  },
  {
    name: 'QR-Code',
    icon: (p: any) => <QrCode {...p} />,
    action: 'qr',
  },
  {
    name: 'Feedback',
    icon: (p: any) => <HelpCircle {...p} />,
    action: 'feedback',
  },
  {
    name: 'Werbung',
    icon: (p: any) => <ThumbsUp {...p} />,
    action: 'promote',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LiveShareSheet({ visible, onClose, sessionId, title }: Props) {
  const currentUserId = useAuthStore((s) => s.profile?.id);
  const [followers, setFollowers] = useState<FollowerUser[]>([]);
  const [copied, setCopied] = useState(false);

  const shareLink = `vibes://_live/watch/${sessionId}`;
  const shareMsg = `🔴 ${title || 'Ich bin LIVE auf Vibes!'} Schau vorbei 👀\n\n${shareLink}`;

  // Followers/Following laden
  useEffect(() => {
    if (!visible || !currentUserId) return;
    (async () => {
      const { data } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(id, username, avatar_url)')
        .eq('follower_id', currentUserId)
        .limit(20);

      if (data) {
        const users: FollowerUser[] = data
          .map((row: any) => row.profiles)
          .filter(Boolean);
        setFollowers(users);
      }
    })();
  }, [visible, currentUserId]);

  const copyLink = useCallback(async () => {
    await setClipboardStringAsync(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const handleExternalApp = useCallback(async (action: string) => {
    switch (action) {
      case 'copy':
        copyLink();
        break;
      case 'whatsapp':
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(shareMsg)}`).catch(() =>
          Share.share({ message: shareMsg })
        );
        break;
      case 'instagram':
        // Instagram DM hat keine direkte URL-Sharing API → natives Share
        Share.share({ message: shareMsg });
        break;
      case 'telegram':
        Linking.openURL(`tg://msg?text=${encodeURIComponent(shareMsg)}`).catch(() =>
          Share.share({ message: shareMsg })
        );
        break;
      case 'sms':
        Linking.openURL(`sms:?body=${encodeURIComponent(shareMsg)}`).catch(() => {});
        break;
      case 'native':
        Share.share({ message: shareMsg, title: title || 'Live auf Vibes' });
        break;
    }
  }, [shareMsg, title, copyLink]);

  const handleFunction = useCallback((action: string) => {
    switch (action) {
      case 'copy':
        copyLink();
        break;
      case 'story':
        // TODO: Story-Sharing implementieren
        break;
      case 'report':
        // TODO: Melden implementieren
        break;
      case 'qr':
        // TODO: QR-Code generieren
        break;
      default:
        break;
    }
  }, [copyLink]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={s.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.springify().damping(18).stiffness(140)}
        exiting={SlideOutDown.duration(250)}
        style={s.sheet}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.handle} />
          <Text style={s.headerTitle}>Teilen</Text>
          <Pressable onPress={onClose} style={s.closeBtn} hitSlop={12}>
            <X size={20} stroke="#aaa" strokeWidth={2} />
          </Pressable>
        </View>

        {/* ── Ebene 1: Follower ─────────────────────────────── */}
        <Text style={s.sectionLabel}>An Follower senden</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollRow}
        >
          {followers.length === 0 ? (
            <Text style={s.emptyText}>Keine Follower gefunden</Text>
          ) : (
            followers.map((user) => (
              <Pressable key={user.id} style={s.userItem}>
                {user.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={s.avatarLetter}>
                      {user.username?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <Text style={s.userName} numberOfLines={1}>
                  {user.username}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>

        {/* Divider */}
        <View style={s.divider} />

        {/* ── Ebene 2: Externe Apps ─────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollRow}
        >
          {EXTERNAL_APPS.map((app) => (
            <Pressable
              key={app.action}
              style={s.appItem}
              onPress={() => handleExternalApp(app.action)}
            >
              <View style={[s.appIcon, { backgroundColor: app.color }]}>
                {app.action === 'copy' && copied
                  ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                  : app.icon({ size: 20, stroke: '#fff', strokeWidth: 2 })
                }
              </View>
              <Text style={s.appName}>{app.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Divider */}
        <View style={s.divider} />

        {/* ── Ebene 3: Funktions-Buttons ────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.scrollRow, { paddingBottom: 10 }]}
        >
          {FUNCTION_BUTTONS.map((btn) => (
            <Pressable
              key={btn.action}
              style={s.funcItem}
              onPress={() => handleFunction(btn.action)}
            >
              <View style={s.funcIcon}>
                {btn.icon({ size: 20, stroke: '#ccc', strokeWidth: 1.8 })}
              </View>
              <Text style={s.funcName}>{btn.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  handle: {
    position: 'absolute',
    top: 8,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  scrollRow: {
    paddingHorizontal: 12,
    gap: 4,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
    marginHorizontal: 16,
  },

  // ── Follower Items ──
  userItem: {
    width: 68,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  avatarFallback: {
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  userName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textAlign: 'center',
  },

  // ── External App Items ──
  appItem: {
    width: 68,
    alignItems: 'center',
    gap: 6,
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Function Buttons ──
  funcItem: {
    width: 68,
    alignItems: 'center',
    gap: 6,
  },
  funcIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  funcName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
});
