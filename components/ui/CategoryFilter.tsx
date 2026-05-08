import { useRef, useCallback } from 'react';
import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

export type Category = {
  id: string | null;
  label: string;
  emoji: string;
  gradient: [string, string];
};

export const CATEGORIES: Category[] = [
  { id: null,           label: 'For You',      emoji: '✦',  gradient: ['#7C3AED', '#A78BFA'] },
  { id: 'tech',         label: 'Tech',         emoji: '💻', gradient: ['#0EA5E9', '#38BDF8'] },
  { id: 'design',       label: 'Design',       emoji: '🎨', gradient: ['#EC4899', '#F9A8D4'] },
  { id: 'art',          label: 'Art',          emoji: '🖼️',  gradient: ['#F59E0B', '#FDE68A'] },
  { id: 'travel',       label: 'Travel',       emoji: '✈️',  gradient: ['#10B981', '#6EE7B7'] },
  { id: 'architecture', label: 'Architecture', emoji: '🏛️',  gradient: ['#6366F1', '#A5B4FC'] },
  { id: 'fashion',      label: 'Fashion',      emoji: '👗', gradient: ['#F43F5E', '#FDA4AF'] },
  { id: 'music',        label: 'Music',        emoji: '🎵', gradient: ['#8B5CF6', '#C4B5FD'] },
  { id: 'food',         label: 'Food',         emoji: '🍜', gradient: ['#EF4444', '#FCA5A5'] },
  { id: 'sport',        label: 'Sport',        emoji: '⚡', gradient: ['#F97316', '#FED7AA'] },
];

// ── "For You" — Sonderpill mit KI-Aura ────────────────────────────────────────
function ForYouPill({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.88, { duration: 60 }),
      withTiming(1, { duration: 80 })
    );
    onPress();
  }, [onPress, scale]);

  return (
    <Animated.View style={animStyle}>
      <Pressable onPress={handlePress}>
        {isActive ? (
          <LinearGradient
            colors={['#7C3AED', '#A78BFA']}
            style={s.forYouActive}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={s.forYouGlyph}>✦</Text>
            <Text style={s.forYouTextActive}>For You</Text>
          </LinearGradient>
        ) : (
          <View style={[s.forYouInactive, { backgroundColor: 'rgba(20,15,35,0.85)' }]}>
            <Text style={[s.forYouGlyph, { color: 'rgba(167,139,250,0.55)' }]}>✦</Text>
            <Text style={s.forYouTextInactive}>For You</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Normale Kategorie-Pill ─────────────────────────────────────────────────────
function CategoryPill({
  cat, isActive, onPress,
}: { cat: Category; isActive: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isActive ? 1 : 0, { duration: 60 }),
    transform: [{ scale: withTiming(isActive ? 1 : 0.6, { duration: 60 }) }],
  }));

  const handlePress = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(0.85, { duration: 60 }),
      withTiming(1, { duration: 80 })
    );
    onPress();
  }, [onPress, scale]);

  return (
    <Animated.View style={[s.pillWrap, animStyle]}>
      {/* Glow-Halo */}
      <Animated.View
        style={[s.pillGlow, glowStyle, { backgroundColor: cat.gradient[0] + '28' }]}
        pointerEvents="none"
      />
      <Pressable onPress={handlePress}>
        {isActive ? (
          <LinearGradient
            colors={cat.gradient}
            style={s.pillActive}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={s.pillEmoji}>{cat.emoji}</Text>
            <Text style={s.pillTextActive}>{cat.label}</Text>
          </LinearGradient>
        ) : (
          <View style={s.pillInactive}>
            <Text style={s.pillEmoji}>{cat.emoji}</Text>
            <Text style={s.pillTextInactive}>{cat.label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Filter-Leiste ──────────────────────────────────────────────────────────────
type Props = {
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
};

export function CategoryFilter({ activeTag, onSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scrollContent}
      style={s.scroll}
      decelerationRate="fast"
    >
      {/* For You als erster, spezieller Chip */}
      <ForYouPill
        isActive={activeTag === null}
        onPress={() => onSelect(null)}
      />

      {/* Separator */}
      <View style={s.separator} />

      {/* Rest der Kategorien */}
      {CATEGORIES.filter((c) => c.id !== null).map((cat) => (
        <CategoryPill
          key={String(cat.id)}
          cat={cat}
          isActive={activeTag === cat.id}
          onPress={() => onSelect(cat.id)}
        />
      ))}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // For You — Sonderpill
  forYouActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  forYouInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  forYouGlyph: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '800',
  },
  forYouTextActive: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  forYouTextInactive: {
    color: 'rgba(167,139,250,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },

  // Separator zwischen For You und Kategorien
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 2,
  },

  // Normale Pills
  pillWrap: { position: 'relative' },
  pillGlow: {
    position: 'absolute',
    top: -5, left: -5, right: -5, bottom: -5,
    borderRadius: 26,
  },
  pillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  pillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  pillEmoji: { fontSize: 12 },
  pillTextActive: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  pillTextInactive: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
});
