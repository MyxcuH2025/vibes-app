import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Dimensions,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  ArrowLeft,
  UserCheck,
  UserPlus,
  MessageCircle,
  Timer,
  Zap,
  Users,
  Grid3X3,
  Share2,
} from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useFollow, useFollowCounts } from '@/lib/useFollow';
import { useAuthStore } from '@/lib/authStore';
import { useOrCreateConversation } from '@/lib/useMessages';
import { VideoGridThumb } from '@/components/ui/VideoGridThumb';
import { VibeScoreRing } from '@/components/profile/VibeScoreRing';
import { StatKachel } from '@/components/profile/StatKachel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_H      = 190;
const AVATAR_SIZE = 100;
const AVATAR_OVERLAP = AVATAR_SIZE / 2 + 6;

const GRID_COLS        = 3;
const GRID_GAP         = 2;
const GRID_ITEM_WIDTH  = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const GRID_ITEM_HEIGHT = GRID_ITEM_WIDTH * (4 / 3);

type PublicProfile = {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  guild_id: string | null;
  guild_name?: string | null;
};

type PostThumb = {
  id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  caption: string | null;
  dwell_time_score?: number;
};

function heroBg(name: string): [string, string, string] {
  const palettes: [string, string, string][] = [
    ['#0f0c29', '#302b63', '#24243e'],
    ['#0a0a0a', '#1a0533', '#0d1f4a'],
    ['#0d0016', '#1a1033', '#0a0d28'],
    ['#050508', '#150a30', '#0a1528'],
    ['#0a0510', '#200a30', '#0d0020'],
  ];
  return palettes[name.charCodeAt(0) % palettes.length];
}

export default function UserProfileScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const currentUserId = useAuthStore((s) => s.profile?.id);

  const [profile,   setProfile]   = useState<PublicProfile | null>(null);
  const [posts,     setPosts]     = useState<PostThumb[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [loading,   setLoading]   = useState(true);

  const { isFollowing, toggle, isLoading: followLoading } = useFollow(id ?? null);
  const { data: counts } = useFollowCounts(id ?? null);
  const { mutateAsync: openConversation, isPending: dmLoading } = useOrCreateConversation();

  const avatarScale   = useSharedValue(0.6);
  const avatarOpacity = useSharedValue(0);
  const followScale   = useSharedValue(1);
  const listRef       = useRef<FlatList>(null);

  const avatarStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
    opacity: avatarOpacity.value,
  }));
  const followBtnAnim = useAnimatedStyle(() => ({
    transform: [{ scale: followScale.value }],
  }));

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, username, bio, avatar_url, guild_id, guilds(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('posts')
        .select('id, media_url, thumbnail_url, media_type, caption, dwell_time_score')
        .eq('author_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', id),
    ]).then(([{ data: p }, { data: ps }, { count }]) => {
      const raw = p as any;
      setProfile({ ...(raw as PublicProfile), guild_name: raw?.guilds?.name ?? null });
      setPosts((ps ?? []) as PostThumb[]);
      setPostCount(count ?? (ps ?? []).length);
      setLoading(false);
      avatarScale.value   = withSpring(1,   { damping: 13, stiffness: 160 });
      avatarOpacity.value = withTiming(1, { duration: 280 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const avgResonanz = useMemo(() => {
    if (posts.length === 0) return 0;
    const sum = posts.reduce((acc, p) => acc + (p.dwell_time_score ?? 0), 0);
    return Math.round((sum / posts.length) * 100);
  }, [posts]);

  const handleDM = async () => {
    if (!profile) return;
    const convId = await openConversation(profile.id);
    router.push({ pathname: '/messages/[id]', params: { id: convId, username: profile.username, avatarUrl: profile.avatar_url ?? '' } });
  };

  const handleFollow = () => {
    impactAsync(ImpactFeedbackStyle.Medium);
    followScale.value = withSpring(0.91, { damping: 8 }, () => {
      followScale.value = withSpring(1, { damping: 12 });
    });
    toggle();
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <LinearGradient colors={['#050508', '#0d0020', '#050508']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#A78BFA" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={s.loadingWrap}>
        <Text style={{ color: '#6B7280', fontSize: 16 }}>Profil nicht gefunden.</Text>
        <Pressable onPress={() => router.back()} style={s.backPill}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  const initials = profile.username.slice(0, 2).toUpperCase();
  const isOwn    = currentUserId === id;
  const bg       = heroBg(profile.username);

  // ── List-Header (alles oberhalb des Grids) ────────────────────────────────
  const Header = (
    <View>
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <View style={[s.hero, { height: HERO_H + insets.top }]}>
        <LinearGradient colors={bg} style={StyleSheet.absoluteFill} />
        {/* Weicher Glow hinter Avatar-Position */}
        <View style={[s.heroGlow, { bottom: -(AVATAR_SIZE * 0.3) }]} />
        {/* Zurück */}
        <View style={[s.backBtn, { top: insets.top + 10 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtnInner}>
            <ArrowLeft size={20} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {/* ── AVATAR (überlappt Hero und Info) ───────────────────────────── */}
      <Animated.View style={[s.avatarAbsolute, { top: HERO_H + insets.top - AVATAR_OVERLAP }, avatarStyle]}>
        <LinearGradient
          colors={['#A78BFA', '#7C3AED', '#4C1D95']}
          style={s.avatarRingGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={s.avatarGap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
            ) : (
              <LinearGradient colors={['#6D28D9', '#A78BFA']} style={s.avatarImg}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── INFO-SECTION ──────────────────────────────────────────────── */}
      <View style={[s.infoSection, { paddingTop: AVATAR_OVERLAP + 10 }]}>

        {/* Username + VibeScoreRing in einer Zeile */}
        <View style={s.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.username}>@{profile.username}</Text>
            {profile.guild_name && (
              <View style={s.guildPill}>
                <Zap size={10} color="#A78BFA" fill="#A78BFA" />
                <Text style={s.guildPillText}>{profile.guild_name}</Text>
              </View>
            )}
          </View>
          {!loading && <VibeScoreRing score={avgResonanz} size={64} />}
        </View>

        {/* Bio */}
        {profile.bio ? (
          <Text style={s.bio}>{profile.bio}</Text>
        ) : null}

        {/* Metrik-Kacheln */}
        <View style={s.metricsRow}>
          <StatKachel icon={Timer} value={`${avgResonanz}%`} label="Resonanz" accent="#A78BFA" />
          <View style={s.metricDivider} />
          <StatKachel icon={Zap}   value={String(postCount)}           label="Vibes"    accent="#60A5FA" />
          <View style={s.metricDivider} />
          <StatKachel icon={Users} value={String(counts?.followers ?? 0)} label="Follower" accent="#34D399" />
        </View>

        {/* Follow + DM + Share */}
        {!isOwn && (
          <View style={s.actionRow}>
            <Animated.View style={[{ flex: 1 }, followBtnAnim]}>
              <Pressable onPress={handleFollow} disabled={followLoading} style={s.followBtnWrap}>
                {isFollowing ? (
                  <View style={s.followBtnOutline}>
                    {followLoading
                      ? <ActivityIndicator size="small" color="#A78BFA" />
                      : <>
                          <UserCheck size={16} color="#A78BFA" strokeWidth={2.2} />
                          <Text style={[s.followBtnText, { color: '#A78BFA' }]}>Folgst du</Text>
                        </>
                    }
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#7C3AED', '#A78BFA']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.followBtnFill}
                  >
                    {followLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <UserPlus size={16} color="#fff" strokeWidth={2.2} />
                          <Text style={s.followBtnText}>Folgen</Text>
                        </>
                    }
                  </LinearGradient>
                )}
              </Pressable>
            </Animated.View>

            <Pressable onPress={handleDM} disabled={dmLoading} style={s.iconBtn}>
              {dmLoading
                ? <ActivityIndicator size="small" color="#A78BFA" />
                : <MessageCircle size={20} color="#A78BFA" strokeWidth={2} />
              }
            </Pressable>

            <Pressable
              onPress={() => impactAsync(ImpactFeedbackStyle.Light)}
              style={s.iconBtn}
            >
              <Share2 size={18} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {isOwn && (
          <Pressable onPress={() => router.push('/settings')} style={s.editBtn}>
            <Text style={s.editBtnText}>Profil bearbeiten</Text>
          </Pressable>
        )}
      </View>

      {/* ── GRID-HEADER ──────────────────────────────────────────────── */}
      <View style={s.gridHeader}>
        <Grid3X3 size={13} color="#6B7280" />
        <Text style={s.gridLabel}>Vibes</Text>
        {postCount > 0 && (
          <View style={s.gridCountPill}>
            <Text style={s.gridCountText}>{postCount}</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLS}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={Header}
        columnWrapperStyle={s.gridRow}
        ListEmptyComponent={
          <View style={s.emptyGrid}>
            <Users size={36} stroke="#1F2937" strokeWidth={1.2} />
            <Text style={s.emptyTitle}>Noch keine Vibes</Text>
            <Text style={s.emptySub}>
              {profile.username} hat noch nichts geteilt.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={s.gridItem}
            onPress={() => router.push({
              pathname: '/user-posts',
              params: { userId: id, startIndex: String(index), username: profile.username },
            })}
          >
            {item.media_url ? (
              item.media_type === 'video' ? (
                <VideoGridThumb
                  uri={item.media_url}
                  thumbnailUri={item.thumbnail_url}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Image
                  source={{ uri: item.media_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              )
            ) : (
              <LinearGradient
                colors={['#1a0533', '#0d1040']}
                style={[StyleSheet.absoluteFill, s.textThumb]}
              >
                <Text style={s.textThumbCaption} numberOfLines={4}>
                  {item.caption}
                </Text>
              </LinearGradient>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050508' },
  loadingWrap: {
    flex: 1, backgroundColor: '#050508',
    alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  backPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },

  // Hero
  hero: { width: '100%', overflow: 'hidden' },
  heroGlow: {
    position: 'absolute',
    alignSelf: 'center',
    width: AVATAR_SIZE * 2.5,
    height: AVATAR_SIZE * 2.5,
    borderRadius: AVATAR_SIZE * 1.25,
    backgroundColor: 'rgba(124,58,237,0.28)',
  },
  backBtn: { position: 'absolute', left: 16 },
  backBtnInner: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  // Avatar overlap
  avatarAbsolute: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
  },
  avatarRingGradient: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    padding: 3,
    // Shadow
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
  },
  avatarGap: {
    flex: 1,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  avatarImg: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1,
  },

  // Info
  infoSection: {
    backgroundColor: '#050508',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  username: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  guildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  guildPillText: {
    color: '#A78BFA', fontSize: 11, fontWeight: '600', letterSpacing: 0.1,
  },
  bio: {
    color: '#9CA3AF', fontSize: 14,
    lineHeight: 21, maxWidth: 280,
  },

  // Metriken (wie eigenes Profil)
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 4,
    overflow: 'hidden',
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 10,
  },

  // Buttons
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  followBtnWrap: { borderRadius: 28, overflow: 'hidden' },
  followBtnFill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 28,
  },
  followBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 28,
    backgroundColor: 'rgba(167,139,250,0.1)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)',
  },
  followBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    marginTop: 4,
    paddingHorizontal: 28, paddingVertical: 13, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'stretch', alignItems: 'center',
  },
  editBtnText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },

  // Grid
  gridHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14, marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  gridLabel: {
    color: '#6B7280', fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', flex: 1,
  },
  gridCountPill: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  gridCountText: { color: '#A78BFA', fontSize: 11, fontWeight: '700' },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridItem: {
    width: GRID_ITEM_WIDTH, height: GRID_ITEM_HEIGHT,
    backgroundColor: '#0D0D0D', overflow: 'hidden',
  },
  textThumb: {
    flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center',
  },
  textThumbCaption: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center', lineHeight: 16,
  },
  emptyGrid: {
    paddingVertical: 60, alignItems: 'center', gap: 10, paddingHorizontal: 40,
  },
  emptyTitle: { color: '#374151', fontSize: 16, fontWeight: '700' },
  emptySub: {
    color: '#1F2937', fontSize: 13, textAlign: 'center', lineHeight: 19,
  },
});
