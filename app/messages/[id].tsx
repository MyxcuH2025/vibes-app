import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useMessages, useSendMessage, useMarkMessagesRead, type Message } from '@/lib/useMessages';
import { useAuthStore } from '@/lib/authStore';

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  return (
    <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
          {msg.content}
        </Text>
        <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
          {formatTime(msg.created_at)}
          {isOwn && (
            <Text style={styles.readTick}> {msg.read ? ' ✓✓' : ' ✓'}</Text>
          )}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id: conversationId, username, avatarUrl } = useLocalSearchParams<{
    id: string;
    username: string;
    avatarUrl: string;
  }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const userId    = useAuthStore((s) => s.profile?.id);
  const listRef   = useRef<FlatList>(null);
  const [text, setText] = useState('');

  const { data: messagesRaw = [], isLoading } = useMessages(conversationId ?? null);
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return messagesRaw.filter((m) => {
      if (!m.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messagesRaw]);
  const { mutateAsync: sendMessage, isPending: sending } = useSendMessage();
  useMarkMessagesRead(conversationId ?? null);

  // Scroll ans Ende bei neuen Nachrichten
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !conversationId || sending) return;
    const content = text.trim();
    setText('');
    impactAsync(ImpactFeedbackStyle.Light);
    await sendMessage({ conversationId, content });
  }, [text, conversationId, sending, sendMessage]);

  // Datum-Trenner zwischen Nachrichten verschiedener Tage
  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.sender_id === userId;
    const prev  = messages[index - 1];
    const showDay = !prev || formatDay(prev.created_at) !== formatDay(item.created_at);

    return (
      <>
        {showDay && (
          <View style={styles.dayRow}>
            <Text style={styles.dayText}>{formatDay(item.created_at)}</Text>
          </View>
        )}
        <MessageBubble msg={item} isOwn={isOwn} />
      </>
    );
  }, [messages, userId]);

  const initial = (username ?? '?')[0].toUpperCase();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={styles.headerAvatarInitial}>{initial}</Text>
            </View>
          )}
          <Text style={styles.headerUsername}>@{username ?? '?'}</Text>
        </View>

        {/* Messages */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#A78BFA" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>Schreib die erste Nachricht 👋</Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Nachricht…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            onPress={handleSend}
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Send size={18} color="#FFFFFF" strokeWidth={2} />
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050508' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  headerAvatarFallback: { backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerAvatarInitial: { color: '#A78BFA', fontSize: 14, fontWeight: '700' },
  headerUsername: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 15 },
  listContent: { paddingHorizontal: 12, paddingVertical: 16, gap: 2, flexGrow: 1 },
  dayRow: { alignItems: 'center', marginVertical: 12 },
  dayText: {
    color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12,
    paddingVertical: 4, borderRadius: 10,
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18, gap: 3,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 15, color: 'rgba(255,255,255,0.85)', lineHeight: 21 },
  bubbleTextOwn: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.35)', alignSelf: 'flex-end' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.55)' },
  readTick: { color: 'rgba(255,255,255,0.55)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#050508',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(124,58,237,0.35)' },
});
