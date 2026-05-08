import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Image, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Timer, Flame, Trophy } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useGuildLeaderboard, type LeaderboardPost, type LeaderboardMember } from '@/lib/useGuildLeaderboard';
import { VideoGridThumb } from './VideoGridThumb';

// ── Medaillen ──────────────────────────────────────────────────────────────
const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_COLORS = [
  ['#FFD700', '#FFA500'],  // Gold
  ['#C0C0C0', '#A8A8A8'],  // Silber
  ['#CD7F32', '#A0522D'],  // Bronze
];

function ResonanzBadge({ pct, seconds }: { pct: number; seconds: number }) {
  const color = pct >= 70 ? '#34D399' : pct >= 40 ? '#FBBF24' : '#F87171';
  return (
    <View style={[badge.wrap, { borderColor: color + '44' }]}>
      <Timer size={11} color={color} strokeWidth={2.2} />
      <Text style={[badge.pct, { color }]}>{pct}%</Text>
      <Text style={badge.secs}>{seconds}s</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pct:  { color: '#34D399', fontSize: 12, fontWeight: '800' },
  secs: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '500' },
});

// ── Top-Post Karte ─────────────────────────────────────────────────────────
function TopPostCard({
  post, rank, guildColors,
}: { post: LeaderboardPost; rank: number; guildColors: string[] }) {
  const medal      = MEDAL[rank] ?? `#${rank + 1}`;
  const rankColors = RANK_COLORS[rank] ?? ['#6366F1', '#8B5CF6'];
  const initial    = (post.author_username ?? '?')[0].toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(rank * 20).duration(120)}>
      <Pressable
        style={card.wrap}
        onPress={() => {
          impactAsync(ImpactFeedbackStyle.Light);
          router.push({ pathname: '/post/[id]', params: { id: post.id } });
        }}
      >
        <BlurView intensity={18} tint="dark" style={card.blur}>
          {/* Rang-Badge */}
          <View style={card.rankBadge}>
            <LinearGradient colors={rankColors as any} style={card.rankGrad}>
              <Text style={card.rankEmoji}>{medal}</Text>
            </LinearGradient>
          </View>

          {/* Thumbnail */}
          <View style={card.thumb}>
            {post.media_type === 'video' ? (
              <VideoGridThumb
                uri={post.media_url}
                style={{ width: 72, height: 96, borderRadius: 12 }}
              />
            ) : (
              <Image
                source={{ uri: post.media_url }}
                style={{ width: 72, height: 96, borderRadius: 12 }}
                resizeMode="cover"
              />
            )}
          </View>

          {/* Info */}
          <View style={card.info}>
            {/* Autor */}
            <Pressable
              style={card.authorRow}
              onPress={() => {
                impactAsync(ImpactFeedbackStyle.Light);
                router.push({ pathname: '/user/[id]', params: { id: post.author_id } });
              }}
            >
              {post.author_avatar ? (
                <Image source={{ uri: post.author_avatar }} style={card.avatar} />
              ) : (
                <View style={[card.avatar, card.avatarFallback]}>
                  <Text style={card.avatarInitial}>{initial}</Text>
                </View>
              )}
              <Text style={card.username}>@{post.author_username ?? '?'}</Text>
            </Pressable>

            {/* Caption */}
            {post.caption ? (
              <Text style={card.caption} numberOfLines={2}>{post.caption}</Text>
            ) : null}

            {/* USP: Resonanz statt Likes */}
            <ResonanzBadge pct={post.completion_pct} seconds={post.avg_seconds} />

            <Text style={card.dwellLabel}>✦ Resonanz</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const card = StyleSheet.create({
  wrap: {
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  blur: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, overflow: 'hidden' },
  rankBadge: { position: 'absolute', top: 10, left: 10, zIndex: 2 },
  rankGrad: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankEmoji: { fontSize: 14 },
  thumb: { borderRadius: 12, overflow: 'hidden' },
  info: { flex: 1, gap: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  avatarFallback: { backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#A78BFA', fontSize: 9, fontWeight: '700' },
  username: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  caption: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 17 },
  dwellLabel: { color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: -2 },
});

// ── Mitglieder-Zeile ────────────────────────────────────────────────────────
function MemberRow({
  member, rank, guildColors,
}: { member: LeaderboardMember; rank: number; guildColors: string[] }) {
  const medal      = MEDAL[rank] ?? `#${rank + 1}`;
  const rankColors = RANK_COLORS[rank] ?? guildColors;
  const initial    = (member.username ?? '?')[0].toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(rank * 20).duration(120)}>
      <Pressable
        style={member_s.wrap}
        onPress={() => {
          impactAsync(ImpactFeedbackStyle.Light);
          router.push({ pathname: '/user/[id]', params: { id: member.id } });
        }}
      >
        {/* Rang */}
        <View style={member_s.rankWrap}>
          {rank < 3 ? (
            <LinearGradient colors={rankColors as any} style={member_s.rankGrad}>
              <Text style={member_s.rankEmoji}>{medal}</Text>
            </LinearGradient>
          ) : (
            <View style={member_s.rankNum}>
              <Text style={member_s.rankNumText}>{rank + 1}</Text>
            </View>
          )}
        </View>

        {/* Avatar */}
        {member.avatar_url ? (
          <Image source={{ uri: member.avatar_url }} style={member_s.avatar} />
        ) : (
          <View style={[member_s.avatar, member_s.avatarFallback]}>
            <Text style={member_s.avatarInitial}>{initial}</Text>
          </View>
        )}

        {/* Info */}
        <View style={member_s.info}>
          <Text style={member_s.username}>@{member.username ?? '?'}</Text>
          <Text style={member_s.sub}>{member.post_count} Post{member.post_count !== 1 ? 's' : ''} diese Woche</Text>
        </View>

        {/* Score */}
        <View style={member_s.scoreWrap}>
          <Text style={member_s.scoreNum}>{member.avg_completion_pct}%</Text>
          <Text style={member_s.scoreLabel}>Ø Vibe-Score</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const member_s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  rankWrap: { width: 32, alignItems: 'center' },
  rankGrad: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankEmoji: { fontSize: 14 },
  rankNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  rankNumText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  avatarFallback: { backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#A78BFA', fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  username: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  scoreWrap: { alignItems: 'flex-end' },
  scoreNum: { color: '#34D399', fontSize: 18, fontWeight: '800' },
  scoreLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 1 },
});

// ── Abschnitt-Header ────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <View style={sec.wrap}>
      <View style={sec.iconWrap}>{icon}</View>
      <View>
        <Text style={sec.title}>{title}</Text>
        <Text style={sec.sub}>{sub}</Text>
      </View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  sub:   { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 },
});

// ── Hauptkomponente ────────────────────────────────────────────────────────
export function GuildLeaderboard({
  guildId, guildColors,
}: { guildId: string | null | undefined; guildColors: string[] }) {
  const { data, isLoading } = useGuildLeaderboard(guildId);

  if (isLoading) {
    return (
      <View style={lb.loading}>
        <ActivityIndicator color={guildColors[0]} size="large" />
        <Text style={lb.loadingText}>Lade Rangliste…</Text>
      </View>
    );
  }

  const posts   = data?.top_posts   ?? [];
  const members = data?.top_members ?? [];
  const isEmpty = posts.length === 0 && members.length === 0;

  if (isEmpty) {
    return (
      <View style={lb.empty}>
        <Text style={lb.emptyIcon}>🏆</Text>
        <Text style={lb.emptyTitle}>Noch keine Rangliste</Text>
        <Text style={lb.emptyDesc}>
          Poste diese Woche im Guild-Room — deine Verweildauer entscheidet über den Platz.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={lb.scroll}
      contentContainerStyle={lb.content}
      showsVerticalScrollIndicator={false}
    >
      {/* USP-Erklärung */}
      <Animated.View entering={FadeInDown.duration(120)} style={lb.uspBanner}>
        <BlurView intensity={20} tint="dark" style={lb.uspBlur}>
          <Timer size={16} color="#34D399" strokeWidth={2} />
          <Text style={lb.uspText}>
            Keine Likes. Nur echte Verweildauer entscheidet.
          </Text>
        </BlurView>
      </Animated.View>

      {/* Top Posts */}
      {posts.length > 0 && (
        <View style={lb.section}>
          <SectionHeader
            icon={<Flame size={18} color="#F97316" strokeWidth={2} />}
            title="Top Posts"
            sub="Diese Woche · sortiert nach Ø Verweildauer"
          />
          <View style={lb.postList}>
            {posts.map((post, i) => (
              <TopPostCard key={post.id} post={post} rank={i} guildColors={guildColors} />
            ))}
          </View>
        </View>
      )}

      {/* Divider */}
      {posts.length > 0 && members.length > 0 && (
        <View style={lb.divider} />
      )}

      {/* Top Mitglieder */}
      {members.length > 0 && (
        <View style={lb.section}>
          <SectionHeader
            icon={<Trophy size={18} color="#FBBF24" strokeWidth={2} />}
            title="Top Mitglieder"
            sub="Diese Woche · Ø Vibe-Score aller Posts"
          />
          <View>
            {members.map((m, i) => (
              <MemberRow key={m.id} member={m} rank={i} guildColors={guildColors} />
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const lb = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  emptyDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  uspBanner: { borderRadius: 14, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)' },
  uspBlur: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  uspText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontStyle: 'italic', flex: 1 },
  section: { marginBottom: 8 },
  postList: { gap: 10 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 24 },
});
