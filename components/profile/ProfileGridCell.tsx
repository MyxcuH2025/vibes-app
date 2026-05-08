import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { VideoGridThumb } from '@/components/ui/VideoGridThumb';
import { profileStyles as s } from './profileStyles';
import type { ProfilePostGridItem } from './types';

export function ProfileGridCell({
  post,
  onPress,
  onLongPress,
}: {
  post: ProfilePostGridItem;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [imageError, setImageError] = useState(false);

  const showFallback = !post.media_url || imageError;

  return (
    <Pressable
      style={s.cell}
      onPressIn={() => {
        scale.value = withTiming(0.93, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 80 });
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        {!showFallback && post.media_type === 'video' && (
          <VideoGridThumb uri={post.media_url!} thumbnailUri={post.thumbnail_url} style={s.cellImg} />
        )}
        {!showFallback && post.media_type !== 'video' && (
          <Image
            source={{ uri: post.media_url! }}
            style={s.cellImg}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        )}
        {showFallback && (
          <View style={[s.cellText, { backgroundColor: '#1a0533' }]}>
            <Text style={s.cellCaption} numberOfLines={4}>
              {post.caption}
            </Text>
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={s.cellGrad} pointerEvents="none" />
      </Animated.View>
    </Pressable>
  );
}
