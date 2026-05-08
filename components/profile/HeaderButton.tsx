import { type ElementType } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { profileStyles as s } from './profileStyles';

export function HeaderButton({
  icon: Icon,
  onPress,
  badge,
}: {
  icon: ElementType;
  onPress: () => void;
  badge?: number;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withTiming(0.82, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 80 });
      }}
      onPress={() => {
        impactAsync(ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={[s.hBtn, anim]}>
        <Icon size={17} color="rgba(255,255,255,0.55)" strokeWidth={1.8} />
        {badge != null && badge > 0 && (
          <View style={s.hBadge}>
            <Text style={s.hBadgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}
