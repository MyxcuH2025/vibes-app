import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Plus } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import type { StoryGroup } from '@/lib/useStories';
import { useAuthStore } from '@/lib/authStore';

type Props = {
  groups: StoryGroup[];
  onSelectGroup: (group: StoryGroup) => void;
  onAddStory: () => void;
};

function StoryBubble({
  group,
  isOwn,
  onPress,
}: {
  group: StoryGroup;
  isOwn: boolean;
  onPress: () => void;
}) {
  const initial   = (group.username ?? '?')[0].toUpperCase();
  const hasNew    = group.hasUnviewed;
  const ringColor = hasNew
    ? ['#A78BFA', '#F472B6'] as [string, string]
    : ['#2D2D2D', '#2D2D2D'] as [string, string];

  // Pulsierender Glow für ungesehene Stories
  const glow = useSharedValue(1);
  useEffect(() => {
    if (!hasNew) { glow.value = 1; return; }
    glow.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 250, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0,  { duration: 250, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [hasNew, glow]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
  }));

  return (
    <Pressable
      style={styles.bubble}
      onPress={() => {
        impactAsync(ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={glowStyle}>
        <LinearGradient
          colors={ringColor}
          style={styles.ring}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.ringInner}>
            {group.avatar_url ? (
              <Image source={{ uri: group.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      <Text style={[styles.bubbleLabel, hasNew && styles.bubbleLabelNew]} numberOfLines={1}>
        {isOwn ? 'Deine Story' : `@${group.username ?? '?'}`}
      </Text>
    </Pressable>
  );
}

function AddStoryBubble({ onPress }: { onPress: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const initial = (profile?.username ?? '?')[0].toUpperCase();

  return (
    <Pressable
      style={styles.bubble}
      onPress={() => {
        impactAsync(ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.ring, styles.addRing]}>
        <View style={styles.ringInner}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.addBadge}>
        <Plus size={10} color="#fff" strokeWidth={3} />
      </View>
      <Text style={styles.bubbleLabel} numberOfLines={1}>
        Deine Story
      </Text>
    </Pressable>
  );
}

export function StoriesRow({ groups, onSelectGroup, onAddStory }: Props) {
  const userId     = useAuthStore((s) => s.profile?.id);
  const ownGroup   = groups.find((g) => g.userId === userId);
  const otherGroups = groups.filter((g) => g.userId !== userId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <AddStoryBubble onPress={onAddStory} />

      {ownGroup && (
        <StoryBubble
          group={ownGroup}
          isOwn
          onPress={() => onSelectGroup(ownGroup)}
        />
      )}

      {otherGroups.map((group) => (
        <StoryBubble
          key={group.userId}
          group={group}
          isOwn={false}
          onPress={() => onSelectGroup(group)}
        />
      ))}
    </ScrollView>
  );
}

const BUBBLE_SIZE = 62;

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bubble: {
    alignItems: 'center',
    width: BUBBLE_SIZE + 8,
    position: 'relative',
  },
  ring: {
    width: BUBBLE_SIZE + 4,
    height: BUBBLE_SIZE + 4,
    borderRadius: (BUBBLE_SIZE + 4) / 2,
    padding: 2.5,
  },
  addRing: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ringInner: {
    flex: 1,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: '#0A0A0A',
    padding: 2,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: BUBBLE_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#A78BFA',
  },
  addBadge: {
    position: 'absolute',
    bottom: 20,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  bubbleLabel: {
    marginTop: 5,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    maxWidth: BUBBLE_SIZE + 8,
    textAlign: 'center',
  },
  bubbleLabelNew: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
});
