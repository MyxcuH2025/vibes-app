import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, X } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useUpdatePost } from '@/lib/usePostManagement';

const SUGGESTED_TAGS = [
  'Tech', 'Design', 'AI', 'Art', 'Music',
  'Travel', 'Nature', 'Fitness', 'Photography', 'Gaming',
  'Vibes', 'Architecture', 'Food', 'Fashion', 'Meme',
];

type PostData = {
  caption: string | null;
  tags: string[];
};

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [loading, setLoading]   = useState(true);
  const [caption, setCaption]   = useState('');
  const [tags, setTags]         = useState<string[]>([]);

  const { mutateAsync: updatePost, isPending: saving } = useUpdatePost();

  useEffect(() => {
    if (!id) return;
    supabase
      .from('posts')
      .select('caption, tags')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        const p = data as PostData | null;
        setCaption(p?.caption ?? '');
        setTags(p?.tags ?? []);
        setLoading(false);
      });
  }, [id]);

  const toggleTag = (tag: string) => {
    impactAsync(ImpactFeedbackStyle.Light);
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    if (!id) return;
    impactAsync(ImpactFeedbackStyle.Medium);
    try {
      await updatePost({ postId: id, caption: caption.trim(), tags });
      router.back();
    } catch {
      Alert.alert('Fehler', 'Speichern fehlgeschlagen. Bitte versuche es erneut.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#A78BFA" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.headerBtn}
            hitSlop={12}
          >
            <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Post bearbeiten</Text>
          <Pressable
            onPress={handleSave}
            style={[styles.headerBtn, styles.saveBtn]}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
            }
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Caption */}
          <Text style={styles.label}>Caption</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Was ist dein Vibe?"
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              maxLength={300}
              autoFocus
            />
            {caption.length > 0 && (
              <Pressable
                onPress={() => setCaption('')}
                style={styles.clearBtn}
                hitSlop={8}
              >
                <X size={14} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </View>
          <Text style={styles.charCount}>{caption.length}/300</Text>

          {/* Tags */}
          <Text style={[styles.label, { marginTop: 24 }]}>Tags</Text>
          <Text style={styles.tagHint}>Bis zu 4 Tags auswählen</Text>
          <View style={styles.tagsWrap}>
            {SUGGESTED_TAGS.map((tag) => {
              const active = tags.includes(tag);
              const disabled = !active && tags.length >= 4;
              return (
                <Pressable
                  key={tag}
                  onPress={() => !disabled && toggleTag(tag)}
                  style={[
                    styles.tagChip,
                    active && styles.tagChipActive,
                    disabled && styles.tagChipDisabled,
                  ]}
                >
                  <Text style={[
                    styles.tagChipText,
                    active && styles.tagChipTextActive,
                    disabled && styles.tagChipTextDisabled,
                  ]}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050508',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: '#7C3AED',
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inputWrap: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 8,
  },
  captionInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    padding: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  clearBtn: {
    paddingTop: 16,
    paddingLeft: 4,
  },
  charCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
  tagHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 12,
    marginTop: -4,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagChipActive: {
    backgroundColor: 'rgba(167,139,250,0.2)',
    borderColor: '#A78BFA',
  },
  tagChipDisabled: {
    opacity: 0.35,
  },
  tagChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: '#A78BFA',
  },
  tagChipTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
});
