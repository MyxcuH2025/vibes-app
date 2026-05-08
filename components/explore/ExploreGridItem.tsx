import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { VideoGridThumb } from '@/components/ui/VideoGridThumb';
import { EXPLORE_ITEM_HEIGHT, EXPLORE_ITEM_WIDTH } from './exploreConstants';
import { exploreStyles as styles } from './exploreStyles';
import type { ExplorePostThumb } from '@/lib/useExplore';

export function ExploreGridItem({ item }: { item: ExplorePostThumb }) {
  const isVideo = item.media_type === 'video';
  return (
    <Pressable
      style={styles.gridItem}
      onPress={() =>
        router.push({
          pathname: '/post/[id]',
          params: {
            id: item.id,
            previewUrl: item.media_url ?? '',
            previewType: item.media_type ?? 'image',
            previewCaption: item.caption ?? '',
            previewThumbnailUrl: item.thumbnail_url ?? '',
          },
        })
      }
    >
      {item.media_url ? (
        isVideo ? (
          <VideoGridThumb
            uri={item.media_url}
            thumbnailUri={item.thumbnail_url}
            style={{ width: EXPLORE_ITEM_WIDTH, height: EXPLORE_ITEM_HEIGHT }}
          />
        ) : (
          <Image source={{ uri: item.media_url }} style={styles.gridImage} resizeMode="cover" />
        )
      ) : (
        <View style={[styles.gridImage, styles.gridPlaceholder]}>
          <Text style={styles.placeholderText}>{item.caption?.charAt(0)?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
    </Pressable>
  );
}
