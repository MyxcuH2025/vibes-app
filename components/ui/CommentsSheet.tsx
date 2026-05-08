import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
  Alert,
  Modal,
  Keyboard,
  type KeyboardEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { X, Send, Trash2, Copy, Video } from 'lucide-react-native';
import { setStringAsync as setClipboardStringAsync } from 'expo-clipboard';
import {
  impactAsync,
  notificationAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useComments, useAddComment, useDeleteComment, type Comment } from '@/lib/useComments';
import { useAuthStore } from '@/lib/authStore';
import { VideoGridThumb } from './VideoGridThumb';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// TikTok: Post-Preview oben (~22%), Sheet darunter
const SHEET_TOP = SCREEN_HEIGHT * 0.22;

function useKeyboardOffset() {
  const keyboardHeight = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => {
        keyboardHeight.value = withTiming(e.endCoordinates.height, { duration: 60 });
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e: KeyboardEvent) => {
        keyboardHeight.value = withTiming(0, { duration: 50 });
      }
    );
    return () => { show.remove(); hide.remove(); };
  }, [keyboardHeight]);

  return keyboardHeight;
}

type Props = {
  postId: string;
  visible: boolean;
  onClose: () => void;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string;
};

const CLOSE_DURATION = 300;
const OPEN_DURATION = 250;
const CLOSE_EASING = Easing.out(Easing.cubic);

export default function CommentsSheet({ postId, visible, onClose, mediaUrl, thumbnailUrl, mediaType }: Props) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const keyboardOffset = useKeyboardOffset();
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    overlayOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
    contentOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: CLOSE_DURATION, easing: CLOSE_EASING },
      (finished) => {
        if (finished) runOnJS(onClose)();
      }
    );
  }, [onClose, overlayOpacity, contentOpacity, translateY]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      overlayOpacity.value = withTiming(1, { duration: OPEN_DURATION * 0.5 });
      contentOpacity.value = withTiming(1, { duration: OPEN_DURATION, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(0, { duration: OPEN_DURATION, easing: Easing.out(Easing.cubic) });
    } else {
      translateY.value = SCREEN_HEIGHT;
      overlayOpacity.value = 0;
      contentOpacity.value = 0;
    }
  }, [visible, overlayOpacity, contentOpacity, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    top: SHEET_TOP,
    bottom: keyboardOffset.value,
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    opacity: overlayOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: contentOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1 }}>
        {/* Hintergrund – sanftes Ein-/Ausblenden */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
          <Animated.View style={overlayStyle} pointerEvents="none" />
        </Pressable>

        {/* Post + Sheet – gemeinsam ein-/ausblenden für weichen Übergang */}
        <Animated.View style={contentStyle} pointerEvents="box-none">
          {mediaUrl && (
            <View style={styles.postPreviewFrame} pointerEvents="none">
              {mediaType === 'video' ? (
                <VideoGridThumb uri={mediaUrl} thumbnailUri={thumbnailUrl} style={StyleSheet.absoluteFill} />
              ) : (
                <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
            </View>
          )}

          <Animated.View style={[styles.sheet, sheetStyle]}>
            <SheetInner
              postId={postId}
              onClose={handleClose}
              enabled={visible}
            />
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SheetInner({
  postId,
  onClose,
  enabled,
}: {
  postId: string;
  onClose: () => void;
  enabled: boolean;
}) {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { data: comments, isLoading } = useComments(postId, enabled);
  const addComment = useAddComment(postId);
  const deleteComment = useDeleteComment(postId);

  const [text, setText] = useState('');
  const [lastSentId, setLastSentId] = useState<string | null>(null);
  const [actionSheetComment, setActionSheetComment] = useState<Comment | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<any>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || addComment.isPending) return;
    setText('');
    Keyboard.dismiss();
    const tempId = `temp-${Date.now()}`;
    addComment.mutate(
      { text: trimmed, tempId },
      {
        onSuccess: (newComment) => {
          impactAsync(ImpactFeedbackStyle.Light);
          setLastSentId(newComment.id);
          timersRef.current.push(setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50));
          timersRef.current.push(setTimeout(() => setLastSentId(null), 1200));
        },
        onError: () => setText(trimmed),
      }
    );
  }, [text, addComment]);

  const handleDelete = useCallback((commentId: string) => {
    Alert.alert('Kommentar löschen', 'Möchtest du diesen Kommentar wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => deleteComment.mutate(commentId) },
    ]);
  }, [deleteComment]);

  const handleReplyWithVideo = useCallback((username: string) => {
    setText(`@${username} `);
    inputRef.current?.focus();
  }, []);

  const timeAgo = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Handle + Header */}
      <View>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Kommentare</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={18} stroke="#6B7280" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Kommentarliste */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A78BFA" />
        </View>
      ) : comments?.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Noch keine Kommentare.</Text>
          <Text style={styles.emptySubText}>Sei der Erste! 💬</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.commentsList}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              isOwn={item.user_id === profile?.id}
              timeAgo={timeAgo(item.created_at)}
              onDelete={() => handleDelete(item.id)}
              onLongPress={() => {
                impactAsync(ImpactFeedbackStyle.Medium);
                setActionSheetComment(item);
              }}
              isHighlighted={item.id === lastSentId}
            />
          )}
        />
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputRowInner}>
            <View style={styles.avatarTiny}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarTinyImage} />
              ) : (
                <Text style={styles.avatarTinyText}>
                  {profile?.username?.[0]?.toUpperCase() ?? '?'}
                </Text>
              )}
            </View>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Kommentar schreiben..."
              placeholderTextColor="#4B5563"
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />
          </View>
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || addComment.isPending}
          style={[styles.sendBtn, (!text.trim() || addComment.isPending) && styles.sendBtnDisabled]}
        >
          {addComment.isPending
            ? <ActivityIndicator color="#A78BFA" size="small" />
            : <Send size={18} stroke={text.trim() ? '#A78BFA' : '#374151'} strokeWidth={2} />
          }
        </Pressable>
      </View>

      <CommentActionSheet
        visible={!!actionSheetComment}
        onClose={() => setActionSheetComment(null)}
        comment={actionSheetComment}
        isOwn={actionSheetComment?.user_id === profile?.id}
        onDelete={() => actionSheetComment && handleDelete(actionSheetComment.id)}
        onCopy={() => {}}
        onReplyWithVideo={handleReplyWithVideo}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

function CommentActionSheet({
  visible,
  onClose,
  comment,
  isOwn,
  onDelete,
  onCopy,
  onReplyWithVideo,
  bottomInset = 24,
}: {
  visible: boolean;
  onClose: () => void;
  comment: Comment | null;
  isOwn: boolean;
  onDelete: () => void;
  onCopy: (text: string) => void;
  onReplyWithVideo: (username: string) => void;
  bottomInset?: number;
}) {
  if (!visible) return null;

  const handleCopy = () => {
    if (comment?.text) {
      setClipboardStringAsync(comment.text);
      notificationAsync(NotificationFeedbackType.Success);
      onCopy(comment.text);
    }
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleReplyWithVideo = () => {
    onReplyWithVideo(comment?.profiles?.username ?? 'unknown');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={[styles.actionSheetOverlay, { paddingBottom: Math.max(bottomInset, 24) }]} onPress={onClose}>
        <Pressable style={styles.actionSheetContent} onPress={(e) => e.stopPropagation()}>
          {isOwn && (
            <View style={styles.actionSheetGroup}>
              <Pressable style={styles.actionSheetItem} onPress={handleDelete}>
                <Trash2 size={20} stroke="#EF4444" strokeWidth={2} />
                <Text style={styles.actionSheetItemTextDestructive}>Löschen</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.actionSheetGroup}>
            <Pressable style={[styles.actionSheetItem, styles.actionSheetItemBorder]} onPress={handleCopy}>
              <Copy size={20} stroke="#9CA3AF" strokeWidth={2} />
              <Text style={styles.actionSheetItemText}>Kopieren</Text>
            </Pressable>
            <Pressable style={styles.actionSheetItem} onPress={handleReplyWithVideo}>
              <Video size={20} stroke="#9CA3AF" strokeWidth={2} />
              <Text style={styles.actionSheetItemText}>Mit Video antworten</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CommentRow({
  comment,
  isOwn,
  timeAgo,
  onDelete,
  onLongPress,
  isHighlighted,
}: {
  comment: Comment;
  isOwn: boolean;
  timeAgo: string;
  onDelete: () => void;
  onLongPress: () => void;
  isHighlighted?: boolean;
}) {
  const highlightOpacity = useSharedValue(0);
  useEffect(() => {
    if (isHighlighted) {
      highlightOpacity.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 400 })
      );
    }
  }, [isHighlighted, highlightOpacity]);
  const highlightStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(167,139,250,${highlightOpacity.value * 0.15})`,
    borderRadius: 12,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginVertical: -2,
  }));

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={400}>
      <Animated.View style={[styles.commentRow, highlightStyle]}>
        <View style={styles.commentAvatar}>
          {comment.profiles?.avatar_url ? (
            <Image source={{ uri: comment.profiles.avatar_url }} style={styles.commentAvatarImage} />
          ) : (
            <Text style={styles.commentAvatarText}>
              {comment.profiles?.username?.[0]?.toUpperCase() ?? '?'}
            </Text>
          )}
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentUsername}>@{comment.profiles?.username ?? 'unknown'}</Text>
            <Text style={styles.commentTime}>{timeAgo}</Text>
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    // top + bottom werden durch animatedStyle gesetzt
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,10,0.97)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  postPreviewOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  postPreviewFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SHEET_TOP,
    overflow: 'hidden',
    zIndex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  emptySubText: { color: '#374151', fontSize: 13 },
  commentsList: { padding: 16, gap: 20 },
  commentRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  commentAvatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  commentAvatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  commentBody: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentUsername: { color: '#D1D5DB', fontSize: 13, fontWeight: '700' },
  commentTime: { color: '#4B5563', fontSize: 11 },
  commentText: { color: '#E5E7EB', fontSize: 14, lineHeight: 20 },
  deleteBtn: { padding: 4, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  inputRowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  avatarTiny: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarTinyImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarTinyText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(167,139,250,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.4 },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  actionSheetContent: {
    gap: 8,
  },
  actionSheetGroup: {
    backgroundColor: 'rgba(30,30,30,0.98)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  actionSheetItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  actionSheetItemText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  actionSheetItemTextDestructive: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
