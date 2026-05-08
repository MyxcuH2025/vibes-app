import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Image, ActivityIndicator, RefreshControl,
  Modal, TextInput, TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MessageCircle, PenSquare, Search, X } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { useConversations, useOrCreateConversation, type Conversation } from '@/lib/useMessages';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${d}d`;
  if (h >= 1) return `${h}h`;
  if (m >= 1) return `${m}min`;
  return 'Jetzt';
}

function ConvItem({ item }: { item: Conversation }) {
  const initial = (item.other_user.username ?? '?')[0].toUpperCase();
  const hasUnread = item.unread_count > 0;

  return (
    <Pressable
      style={[styles.item, hasUnread && styles.itemUnread]}
      onPress={() => {
        impactAsync(ImpactFeedbackStyle.Light);
        router.push({ pathname: '/messages/[id]', params: { id: item.id, username: item.other_user.username ?? '', avatarUrl: item.other_user.avatar_url ?? '' } });
      }}
    >
      {hasUnread && <View style={styles.unreadDot} />}

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {item.other_user.avatar_url ? (
          <Image source={{ uri: item.other_user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        {hasUnread && <View style={styles.onlineDot} />}
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <View style={styles.nameRow}>
          <Text style={[styles.username, hasUnread && styles.usernameUnread]}>
            @{item.other_user.username ?? '?'}
          </Text>
          <Text style={styles.timeText}>{timeAgo(item.last_message_at)}</Text>
        </View>
        <Text
          style={[styles.preview, hasUnread && styles.previewUnread]}
          numberOfLines={1}
        >
          {item.last_message ?? 'Konversation starten…'}
        </Text>
      </View>

      {/* Ungelesen-Badge */}
      {hasUnread && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.unread_count > 9 ? '9+' : String(item.unread_count)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type UserResult = { id: string; username: string | null; avatar_url: string | null };

function NewMessageModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const currentUserId = useAuthStore((s) => s.profile?.id);
  const { mutateAsync: openConv, isPending } = useOrCreateConversation();

  const { data: results = [], isFetching } = useQuery<UserResult[]>({
    queryKey: ['user-search-dm', query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${query.trim()}%`)
        .neq('id', currentUserId ?? '')
        .limit(20);
      return (data ?? []) as UserResult[];
    },
    enabled: query.trim().length > 0,
    staleTime: 0,
  });

  const handleSelect = async (user: UserResult) => {
    impactAsync(ImpactFeedbackStyle.Light);
    const convId = await openConv(user.id);
    onClose();
    router.push({ pathname: '/messages/[id]', params: { id: convId, username: user.username ?? '', avatarUrl: user.avatar_url ?? '' } });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.sheet}>
        <View style={modal.handle} />
        <View style={modal.header}>
          <Text style={modal.title}>Neue Nachricht</Text>
          <Pressable onPress={onClose} style={modal.closeBtn} hitSlop={10}>
            <X size={20} color="rgba(255,255,255,0.6)" strokeWidth={2} />
          </Pressable>
        </View>

        {/* Suchfeld */}
        <View style={modal.searchBar}>
          <Search size={16} color="rgba(255,255,255,0.35)" strokeWidth={2} />
          <TextInput
            style={modal.searchInput}
            placeholder="Username suchen…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={14} color="rgba(255,255,255,0.35)" />
            </Pressable>
          )}
        </View>

        {/* Ergebnisse */}
        {isFetching || isPending ? (
          <ActivityIndicator color="#A78BFA" style={{ marginTop: 32 }} />
        ) : query.trim().length === 0 ? (
          <View style={modal.hint}>
            <Text style={modal.hintText}>Tippe einen Username ein um zu suchen</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={modal.hint}>
            <Text style={modal.hintText}>Kein User gefunden</Text>
          </View>
        ) : (
          <FlashList
            data={results}
            keyExtractor={(u) => u.id}
            estimatedItemSize={56}
            renderItem={({ item }) => {
              const initial = (item.username ?? '?')[0].toUpperCase();
              return (
                <TouchableOpacity style={modal.userRow} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={modal.avatar} />
                  ) : (
                    <View style={[modal.avatar, modal.avatarFallback]}>
                      <Text style={modal.avatarInitial}>{initial}</Text>
                    </View>
                  )}
                  <Text style={modal.userName}>@{item.username ?? '?'}</Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </View>
    </Modal>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [showNew, setShowNew] = useState(false);
  const { data: convs = [], isLoading, refetch, isRefetching } = useConversations();

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => <ConvItem item={item} />,
    [],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <NewMessageModal visible={showNew} onClose={() => setShowNew(false)} />
      <View style={styles.header}>
        <Text style={styles.title}>Nachrichten</Text>
        <Pressable
          onPress={() => { impactAsync(ImpactFeedbackStyle.Light); setShowNew(true); }}
          style={styles.composeBtn}
          hitSlop={8}
        >
          <PenSquare size={20} color="#A78BFA" strokeWidth={2} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A78BFA" size="large" />
        </View>
      ) : convs.length === 0 ? (
        <View style={styles.center}>
          <MessageCircle size={52} color="rgba(255,255,255,0.1)" strokeWidth={1.2} />
          <Text style={styles.emptyTitle}>Noch keine Nachrichten</Text>
          <Text style={styles.emptyDesc}>
            Öffne ein Profil und tippe auf „Nachricht“ um zu starten.
          </Text>
        </View>
      ) : (
        <FlashList
          data={convs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          estimatedItemSize={80}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#A78BFA" />
          }
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050508' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, flex: 1 },
  composeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptyDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', maxWidth: 240, lineHeight: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    position: 'relative',
  },
  itemUnread: { backgroundColor: 'rgba(167,139,250,0.04)' },
  unreadDot: {
    position: 'absolute', left: 4, top: '50%',
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: '#A78BFA', marginTop: -2.5,
  },
  avatarWrap: { position: 'relative', width: 52, height: 52 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  avatarFallback: { backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#A78BFA', fontSize: 20, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: '#34D399', borderWidth: 2, borderColor: '#050508',
  },
  textWrap: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  username: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  usernameUnread: { color: '#FFFFFF', fontWeight: '700' },
  preview: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  previewUnread: { color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  timeText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
});

const modal = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#0A0A0F', paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: { flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  hint: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  hintText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 13,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#A78BFA', fontSize: 17, fontWeight: '700' },
  userName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
