import { useState, type ElementType } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Share,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Search,
  Send,
  Share2,
  Copy,
  UserPlus,
  UserCheck,
  EyeOff,
  Flag,
  Download,
  Check,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import {
  impactAsync,
  notificationAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { useOrCreateConversation, useSendMessage } from '@/lib/useMessages';
import { useReport } from '@/lib/useReport';
import { postShareModalStyles as pss } from './feedStyles';

const POST_APP_OPTIONS = [
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬', color: '#25D366' },
  { id: 'telegram', label: 'Telegram', emoji: '✈️', color: '#2CA5E0' },
  { id: 'copy', label: 'Link', icon: Copy, color: '#6366f1' },
  { id: 'more', label: 'Mehr', icon: Share2, color: '#374151' },
];

type ShareTarget = { id: string; username: string | null; avatar_url: string | null };

export function PostShareModal({
  visible,
  postId,
  postCaption,
  postAuthor,
  isFollowing,
  isOwnProfile,
  onToggleFollow,
  onClose,
}: {
  visible: boolean;
  postId: string;
  postCaption?: string;
  postAuthor: string;
  isFollowing: boolean;
  isOwnProfile: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.profile?.id);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const { mutateAsync: getOrCreateConv } = useOrCreateConversation();
  const { mutateAsync: sendMsg } = useSendMessage();

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

  const postLink = `https://vibes.app/post/${postId}`;
  const filtered = search.trim()
    ? users.filter((u) => u.username?.toLowerCase().includes(search.toLowerCase()))
    : users;

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    impactAsync(ImpactFeedbackStyle.Light);
  };

  const handleSendToUsers = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const caption = postCaption ? `"${postCaption}"` : 'einen Post';
      await Promise.all(
        Array.from(selected).map(async (uid) => {
          const convId = await getOrCreateConv(uid);
          await sendMsg({
            conversationId: convId,
            content: `📸 ${caption} von @${postAuthor}: ${postLink}`,
          });
        })
      );
      notificationAsync(NotificationFeedbackType.Success);
      setSelected(new Set());
      setSearch('');
      onClose();
    } catch {
      Alert.alert('Fehler', 'Post konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  };

  const handleAppShare = (id: string) => {
    impactAsync(ImpactFeedbackStyle.Light);
    const text = postCaption ? `"${postCaption}" von @${postAuthor} auf Vibes` : `Post von @${postAuthor} auf Vibes`;
    switch (id) {
      case 'whatsapp':
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`${text}: ${postLink}`)}`).catch(() =>
          Alert.alert('WhatsApp nicht installiert')
        );
        break;
      case 'telegram':
        Linking.openURL(`tg://msg_url?url=${encodeURIComponent(postLink)}&text=${encodeURIComponent(text)}`).catch(() =>
          Alert.alert('Telegram nicht installiert')
        );
        break;
      case 'copy':
        Alert.alert('Link kopiert', postLink);
        break;
      case 'more':
        Share.share(
          Platform.OS === 'ios' ? { message: text, url: postLink } : { message: `${text}\n${postLink}` },
          { dialogTitle: 'Post teilen' }
        );
        break;
    }
  };

  const actionButtons = [
    ...(!isOwnProfile
      ? [
          {
            id: 'follow',
            label: isFollowing ? 'Entfolgen' : 'Folgen',
            icon: isFollowing ? UserCheck : UserPlus,
            color: '#A78BFA',
          },
        ]
      : []),
    { id: 'notinterested', label: 'Kein Interesse', icon: EyeOff, color: '#6B7280' },
    { id: 'report', label: 'Melden', icon: Flag, color: '#ef4444' },
    { id: 'download', label: 'Speichern', icon: Download, color: '#6B7280' },
  ];

  const { mutate: reportPost } = useReport();

  const handleAction = (id: string) => {
    impactAsync(ImpactFeedbackStyle.Medium);
    onClose();
    switch (id) {
      case 'follow':
        onToggleFollow();
        break;
      case 'notinterested':
        reportPost({ postId, reason: 'not_interested' });
        Alert.alert('Verstanden', 'Wir zeigen dir weniger von diesem Content.');
        break;
      case 'report':
        Alert.alert('Melden', 'Wähle einen Grund:', [
          {
            text: 'Spam',
            onPress: () => {
              reportPost({ postId, reason: 'report' });
              Alert.alert('Danke', 'Der Post wurde gemeldet.');
            },
          },
          {
            text: 'Unangemessener Inhalt',
            onPress: () => {
              reportPost({ postId, reason: 'report' });
              Alert.alert('Danke', 'Der Post wurde gemeldet.');
            },
          },
          { text: 'Abbrechen', style: 'cancel' },
        ]);
        break;
      case 'download':
        Alert.alert('Speichern', 'Download-Funktion kommt bald.');
        break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pss.overlay} onPress={onClose}>
        <Pressable style={pss.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={pss.handle} />

          <Text style={pss.sectionLabel}>Senden an</Text>
          <View style={pss.searchRow}>
            <Search size={15} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={pss.searchInput}
              placeholder="Suchen…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pss.userScroll} contentContainerStyle={pss.userScrollContent}>
            {filtered.length === 0 ? (
              <Text style={pss.emptyUsers}>Keine User</Text>
            ) : (
              filtered.map((u) => {
                const chosen = selected.has(u.id);
                return (
                  <Pressable key={u.id} style={pss.userItem} onPress={() => toggleUser(u.id)}>
                    <View style={[pss.userAvatarWrap, chosen && pss.userAvatarChosen]}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={pss.userAvatar} />
                      ) : (
                        <View style={[pss.userAvatar, pss.userAvatarFallback]}>
                          <Text style={pss.userAvatarText}>{(u.username ?? '?')[0].toUpperCase()}</Text>
                        </View>
                      )}
                      {chosen && (
                        <View style={pss.checkBadge}>
                          <Check size={10} color="#fff" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text style={pss.userLabel} numberOfLines={1}>
                      {u.username ?? '?'}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          {selected.size > 0 && (
            <Pressable style={[pss.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSendToUsers} disabled={sending}>
              <Send size={16} color="#fff" />
              <Text style={pss.sendBtnText}>{sending ? 'Senden…' : `Senden (${selected.size})`}</Text>
            </Pressable>
          )}

          <View style={pss.divider} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pss.appRow}>
            {POST_APP_OPTIONS.map((opt) => {
              const IconComp = (opt as { icon?: ElementType }).icon;
              return (
                <Pressable key={opt.id} style={pss.appItem} onPress={() => handleAppShare(opt.id)}>
                  <View style={[pss.appIcon, { backgroundColor: opt.color }]}>
                    {'emoji' in opt && opt.emoji ? (
                      <Text style={pss.appEmoji}>{opt.emoji}</Text>
                    ) : (
                      IconComp && <IconComp size={22} color="#fff" strokeWidth={1.8} />
                    )}
                  </View>
                  <Text style={pss.appLabel}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={pss.divider} />

          <View style={pss.actionRow}>
            {actionButtons.map((btn) => {
              const IconComp = btn.icon;
              return (
                <Pressable key={btn.id} style={pss.actionItem} onPress={() => handleAction(btn.id)}>
                  <View style={[pss.actionIcon, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                    <IconComp size={22} color={btn.color} strokeWidth={1.8} />
                  </View>
                  <Text style={pss.actionLabel}>{btn.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
