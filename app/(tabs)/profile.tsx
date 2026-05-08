import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PlusCircle } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useUnreadCount } from '@/lib/useNotifications';
import { useBookmarkedPosts } from '@/lib/useBookmark';
import { useDeletePost } from '@/lib/usePostManagement';
import { useAuthStore } from '@/lib/authStore';
import { useGuildStories } from '@/lib/useStories';
import { useStoryViewerStore } from '@/lib/storyViewerStore';
import { useFollowCounts } from '@/lib/useFollow';
import { useUserPosts } from '@/lib/usePosts';
import {
  GRID_COLUMNS,
  ProfileGridCell,
  PostManageModal,
  ProfileListHeader,
  ProfileStudioHeader,
  profileStyles as s,
  type ProfilePostGridItem,
  type ProfileTab,
} from '@/components/profile';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();

  const [activeTab, setActiveTab] = useState<ProfileTab>('vibes');
  const [managePostId, setManagePostId] = useState<string | null>(null);

  const { data: posts = [], isLoading: loadingPosts } = useUserPosts(profile?.id ?? null);
  const { data: savedPosts = [], isLoading: loadingSaved } = useBookmarkedPosts();
  const { data: unreadNotifs = 0 } = useUnreadCount();
  const { mutateAsync: deletePost } = useDeletePost();
  const { data: storyGroups = [] } = useGuildStories();
  const openStoryViewer = useStoryViewerStore((s) => s.open);
  const { data: followCounts } = useFollowCounts(profile?.id ?? null);

  const myUserId = profile?.id;
  const myStoryGroup = storyGroups.find((g) => g.userId === myUserId);
  const hasStories = (myStoryGroup?.stories?.length ?? 0) > 0;
  const hasUnviewedStories = myStoryGroup?.hasUnviewed ?? false;

  const avgDwell = useMemo(() => {
    if (posts.length === 0) return 0;
    const sum = posts.reduce((acc, p) => acc + (p.dwell_time_score ?? 0), 0);
    return Math.round((sum / posts.length) * 100);
  }, [posts]);

  const handlePostLongPress = (postId: string) => setManagePostId(postId);

  const handleEditPost = (postId: string) => {
    router.push({ pathname: '/edit-post/[id]', params: { id: postId } });
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert('Löschen?', 'Wirklich?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => deletePost(postId) },
    ]);
  };

  const handleSignOut = () =>
    Alert.alert('Abmelden?', undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Ausloggen', style: 'destructive', onPress: signOut },
    ]);

  const avatarInitial = (profile?.username ?? '?')[0].toUpperCase();
  const postCount = posts.length;

  const listData = (activeTab === 'vibes' ? posts : savedPosts) as ProfilePostGridItem[];

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['rgba(124,58,237,0.14)', 'transparent']}
        style={[s.heroBg, { height: 200 + insets.top }]}
        pointerEvents="none"
      />

      <ProfileStudioHeader
        username={profile?.username ?? '…'}
        paddingTop={insets.top + 14}
        unreadNotifs={unreadNotifs}
        onNotifications={() => router.push('/notifications')}
        onSettings={() => router.push('/settings')}
        onSignOut={handleSignOut}
      />

      <FlashList
        data={listData}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        estimatedItemSize={130}
        extraData={activeTab}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <ProfileListHeader
            profile={profile}
            followCounts={followCounts}
            hasStories={hasStories}
            hasUnviewedStories={hasUnviewedStories}
            onAvatarPress={() => {
              if (!myStoryGroup) return;
              impactAsync(ImpactFeedbackStyle.Light);
              openStoryViewer(myStoryGroup, storyGroups);
              router.push('/story-viewer' as any);
            }}
            onEditProfile={() => router.push('/settings')}
            avatarInitial={avatarInitial}
            avgDwell={avgDwell}
            postCount={postCount}
            loadingPosts={loadingPosts}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        renderItem={({ item, index }) => (
          <View style={s.gridCell}>
            <ProfileGridCell
              post={item}
              onPress={() => {
                if (activeTab === 'vibes') {
                  // Eigene Posts: scrollbarer Feed durch alle eigenen Vibes
                  router.push({
                    pathname: '/user-posts',
                    params: {
                      userId: profile?.id ?? '',
                      startIndex: String(index),
                      username: profile?.username ?? '',
                    },
                  });
                } else {
                  // Gespeicherte Posts: verschiedene Autoren → Einzelansicht
                  router.push({
                    pathname: '/post/[id]',
                    params: {
                      id: item.id,
                      previewUrl: item.media_url ?? '',
                      previewType: item.media_type ?? 'image',
                      previewCaption: item.caption ?? '',
                      previewThumbnailUrl: item.thumbnail_url ?? '',
                    },
                  });
                }
              }}
              onLongPress={
                activeTab === 'vibes'
                  ? () => {
                      impactAsync(ImpactFeedbackStyle.Medium);
                      handlePostLongPress(item.id);
                    }
                  : undefined
              }
            />
          </View>
        )}
        ListEmptyComponent={
          activeTab === 'vibes' && loadingPosts ? (
            <View style={s.empty}>
              <ActivityIndicator color="#A78BFA" />
            </View>
          ) : activeTab === 'saved' && loadingSaved ? (
            <View style={s.empty}>
              <ActivityIndicator color="#FBBF24" />
            </View>
          ) : activeTab === 'vibes' ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>✨</Text>
              <Text style={s.emptyTitle}>Noch keine Vibes</Text>
              <Text style={s.emptySub}>Erstelle deinen ersten Post über das + unten.</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🔖</Text>
              <Text style={s.emptyTitle}>Noch nichts gespeichert</Text>
              <Text style={s.emptySub}>Tippe auf 🔖 bei einem Post.</Text>
            </View>
          )
        }
        ListFooterComponent={
          activeTab === 'vibes' && posts.length > 0 ? (
            <Pressable style={s.cellAdd} onPress={() => router.push('/create')}>
              <PlusCircle size={24} color="rgba(255,255,255,0.1)" strokeWidth={1.2} />
            </Pressable>
          ) : null
        }
      />

      <PostManageModal
        visible={!!managePostId}
        onClose={() => setManagePostId(null)}
        onEdit={() => managePostId && handleEditPost(managePostId)}
        onDelete={() => managePostId && handleDeletePost(managePostId)}
      />
    </View>
  );
}
