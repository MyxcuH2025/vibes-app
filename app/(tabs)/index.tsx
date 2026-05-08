import { useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  FlatList,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// expo-haptics: 'import * as' → _interopRequireWildcard → TypeError in Hermes HBC
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { Search } from 'lucide-react-native';
import TuneMyVibeOverlay from '@/components/ui/TuneMyVibeOverlay';
import { useFocusEffect, useRouter } from 'expo-router';
import { useVibeFeed } from '@/lib/usePosts';
import { supabase } from '@/lib/supabase';
import { CategoryFilter } from '@/components/ui/CategoryFilter';
import { useDwellTracker } from '@/lib/useDwellTracker';
import { useGuildStories, type StoryGroup } from '@/lib/useStories';
import { useStoryViewerStore } from '@/lib/storyViewerStore';
import { useFeedEngagement, emptyFeedEngagementMaps } from '@/lib/useFeedEngagement';
import { FeedItem } from '@/components/feed/FeedItem';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import { vibeFeedScreenStyles as styles } from '@/components/feed/feedStyles';
import { FEED_VIDEO_VIEWABILITY, SCREEN_HEIGHT } from '@/components/feed/feedConstants';
import type { FeedItemData } from '@/components/feed/types';

// reanimated: CJS require() is used to avoid _interopRequireDefault crash in Hermes HBC.
// Stub (Expo Go): module.exports = Animated  →  _animMod.View works directly
// Real Reanimated v3: module.exports.default = Animated  →  need _animMod.default?.View
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _animMod = require('react-native-reanimated') as any;
const _animNS  = _animMod?.default ?? _animMod;            // default namespace or module itself
const Animated = { View: _animNS?.View ?? _animMod?.View }; // covers both export styles


export default function VibeFeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const [visibleItemId, setVisibleItemId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchedAt = useRef<string>(new Date().toISOString());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const bannerY = useSharedValue(-60);
  const bannerOpacity = useSharedValue(0);

  const {
    data: pagedPosts,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useVibeFeed(activeTag);
  const { onViewableItemsChanged: dwellOnViewable } = useDwellTracker();
  const dwellOnViewableRef = useRef(dwellOnViewable);
  const setVisibleItemIdRef = useRef(setVisibleItemId);
  dwellOnViewableRef.current = dwellOnViewable;
  setVisibleItemIdRef.current = setVisibleItemId;

  /** useRef statt useMemo: FlatList erlaubt kein Ersetzen von `viewabilityConfigCallbackPairs` –
   *  auch nicht bei React Fast Refresh. useRef bleibt über alle Re-Renders stabil. */
  const viewabilityConfigCallbackPairsRef = useRef([
    {
      viewabilityConfig: FEED_VIDEO_VIEWABILITY,
      onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => {
        const raw = info.viewableItems[0]?.item;
        const id =
          raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: string }).id) : null;
        setVisibleItemIdRef.current(id);
      },
    },
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 80,
          minimumViewTime: 500,
        },
        onViewableItemsChanged: (info: { changed: ViewToken[] }) => {
          dwellOnViewableRef.current(info);
        },
      },
    ]);
  const viewabilityConfigCallbackPairs = viewabilityConfigCallbackPairsRef.current;
  const { data: storyGroups = [], refetch: refetchStories } = useGuildStories();
  const storyGroupMap = useMemo(() => new Map(storyGroups.map((g) => [g.userId, g])), [storyGroups]);
  const openStory = useStoryViewerStore((s) => s.open);
  const handleOpenStory = useCallback(
    (group: StoryGroup) => {
      openStory(group, storyGroups);
      router.push('/story-viewer' as any);
    },
    [openStory, storyGroups, router]
  );

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
    opacity: bannerOpacity.value,
  }));

  const showBanner = useCallback(() => {
    bannerY.value = withTiming(0, { duration: 80 });
    bannerOpacity.value = withTiming(1, { duration: 60 });
  }, [bannerY, bannerOpacity]);

  const hideBanner = useCallback(() => {
    bannerY.value = withTiming(-60, { duration: 80 });
    bannerOpacity.value = withTiming(0, { duration: 60 });
  }, [bannerY, bannerOpacity]);

  const checkForNewPosts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('posts')
        .select('created_at')
        .eq('is_guild_post', false)
        .gt('created_at', lastFetchedAt.current)
        .limit(1);
      if (data && data.length > 0) {
        setHasNewPosts(true);
        showBanner();
      }
    } catch {
      /* ignore */
    }
  }, [showBanner]);

  const handleRefresh = useCallback(async () => {
    impactAsync(ImpactFeedbackStyle.Medium);
    setIsRefreshing(true);
    setHasNewPosts(false);
    hideBanner();
    lastFetchedAt.current = new Date().toISOString();
    await refetch();
    setIsRefreshing(false);
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
  }, [refetch, hideBanner]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      refetchStories();
      lastFetchedAt.current = new Date().toISOString();
      pollTimer.current = setInterval(checkForNewPosts, 60_000);

      return () => {
        setScreenFocused(false);
        if (pollTimer.current) clearInterval(pollTimer.current);
      };
    }, [checkForNewPosts, refetchStories])
  );

  const onMuteToggle = useCallback(() => setIsMuted((m) => !m), []);
  const onOpenTune = useCallback(() => setOverlayVisible(true), []);

  // Alle Seiten zu einer flachen Liste zusammenführen
  const allPosts = useMemo(
    () => (pagedPosts?.pages ?? []).flatMap((page) => page),
    [pagedPosts]
  );

  const feedData = useMemo<FeedItemData[]>(
    () =>
      allPosts.map((p) => ({
        id: p.id,
        author: `@${p.username ?? 'unknown'}`,
        caption: p.caption ?? '',
        tag: p.tags?.[0] ?? 'Vibe',
        tags: (p.tags ?? []).slice(0, 4),
        mediaUrl: p.media_url ?? null,
        mediaType: p.media_type ?? 'image',
        authorId: p.author_id,
        avatarUrl: p.avatar_url ?? null,
        gradient: ['#0A0A0A', '#1a0533', '#0d1f4a'],
        accentColor: '#A78BFA',
      })),
    [allPosts]
  );

  const postIds = useMemo(() => feedData.map((p) => p.id), [feedData]);
  const authorIds = useMemo(() => feedData.map((p) => p.authorId).filter((id): id is string => !!id), [feedData]);
  const { data: engagementMaps = emptyFeedEngagementMaps() } = useFeedEngagement(postIds, authorIds);

  const renderItem = useCallback(
    ({ item }: { item: FeedItemData }) => (
      <FeedItem
        item={item}
        shouldPlayVideo={screenFocused && item.id === visibleItemId}
        isMuted={isMuted}
        onMuteToggle={onMuteToggle}
        storyGroup={item.authorId ? storyGroupMap.get(item.authorId) : undefined}
        onOpenStory={handleOpenStory}
        onOpenTune={onOpenTune}
        engagement={engagementMaps}
      />
    ),
    [
      screenFocused,
      visibleItemId,
      isMuted,
      storyGroupMap,
      handleOpenStory,
      onMuteToggle,
      onOpenTune,
      engagementMaps,
    ]
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: SCREEN_HEIGHT,
      offset: SCREEN_HEIGHT * index,
      index,
    }),
    []
  );

  return (
    <View style={styles.container}>
      {isLoading && <FeedSkeleton />}
      {isError && (
        <View style={styles.emptyTag}>
          <Text style={styles.emptyTagEmoji}>⚠️</Text>
          <Text style={styles.emptyTagTitle}>Feed-Fehler</Text>
          <Text style={styles.emptyTagSub}>{(error as Error)?.message ?? 'Unbekannter Fehler — Pull zum Neu laden.'}</Text>
        </View>
      )}
      {!isLoading && !isError && feedData.length === 0 && (
        <View style={styles.emptyTag}>
          {activeTag ? (
            <>
              <Text style={styles.emptyTagEmoji}>🔍</Text>
              <Text style={styles.emptyTagTitle}>{`Nichts unter „${activeTag}“`}</Text>
              <Text style={styles.emptyTagSub}>Noch keine Posts mit diesem Tag — sei der Erste.</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTagEmoji}>⚡</Text>
              <Text style={styles.emptyTagTitle}>Dein Feed ist leer</Text>
              <Text style={styles.emptyTagSub}>Folge anderen Creators oder erstelle deinen ersten Vibe.</Text>
            </>
          )}
        </View>
      )}
      <FlatList
        ref={listRef}
        data={feedData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        removeClippedSubviews={Platform.OS === 'android'}
        style={styles.list}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        windowSize={5}
        maxToRenderPerBatch={5}
        initialNumToRender={2}
        updateCellsBatchingPeriod={30}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.pageLoadingFooter}>
              <ActivityIndicator color="#A78BFA" size="small" />
            </View>
          ) : null
        }
        {...(Platform.OS === 'android' ? ({ overScrollMode: 'never' } as const) : {})}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#A78BFA"
            progressViewOffset={insets.top + 100}
          />
        }
      />

      <Animated.View
        style={[styles.newPostsBanner, { top: insets.top + 6 }, bannerStyle]}
        pointerEvents={hasNewPosts ? 'auto' : 'none'}
      >
        <Pressable onPress={handleRefresh} style={styles.newPostsBannerInner}>
          <View style={[styles.newPostsBlur, { backgroundColor: 'rgba(10,10,20,0.92)' }]}>
            <View style={styles.newPostsDot} />
            <Text style={styles.newPostsText}>Neue Vibes verfügbar</Text>
            <Text style={styles.newPostsArrow}>↑</Text>
          </View>
        </Pressable>
      </Animated.View>

      <View style={[styles.filterBar, { top: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.filterRow} pointerEvents="box-none">
<View style={styles.filterScroll}>
            <CategoryFilter activeTag={activeTag} onSelect={setActiveTag} />
          </View>

          <Pressable
            onPress={() => {
              impactAsync(ImpactFeedbackStyle.Light);
              router.push('/(tabs)/explore');
            }}
            hitSlop={8}
            style={styles.filterExploreBtn}
          >
            <View style={[styles.filterExploreBtnBlur, { backgroundColor: 'rgba(10,10,20,0.75)' }]}>
              <Search size={17} stroke="rgba(255,255,255,0.8)" strokeWidth={2} />
            </View>
          </Pressable>
        </View>


      </View>

      <TuneMyVibeOverlay visible={overlayVisible} onClose={() => setOverlayVisible(false)} />
    </View>
  );
}
