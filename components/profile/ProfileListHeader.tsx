import { View, Text, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Grid3X3, Bookmark, Edit3, Timer, Zap, Shield } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import type { Profile } from '@/lib/authStore';
import { VibeScoreRing } from './VibeScoreRing';
import { StatKachel } from './StatKachel';
import { profileStyles as s } from './profileStyles';
import type { ProfileTab } from './types';

export function ProfileListHeader({
  profile,
  followCounts,
  hasStories,
  hasUnviewedStories,
  onAvatarPress,
  onEditProfile,
  avatarInitial,
  avgDwell,
  postCount,
  loadingPosts,
  activeTab,
  onTabChange,
}: {
  profile: Profile | null;
  followCounts: { followers: number; following: number } | undefined;
  hasStories: boolean;
  hasUnviewedStories: boolean;
  onAvatarPress: () => void;
  onEditProfile: () => void;
  avatarInitial: string;
  avgDwell: number;
  postCount: number;
  loadingPosts: boolean;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
}) {
  return (
    <>
      <View style={s.creatorCard}>
        <View style={s.avatarCol}>
          <Pressable onPress={onAvatarPress} disabled={!hasStories}>
            <LinearGradient
              colors={
                hasStories && hasUnviewedStories
                  ? ['#A78BFA', '#F472B6', '#FB923C']
                  : ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)']
              }
              style={s.avatarRing}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={s.avatarGap}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
                ) : (
                  <LinearGradient colors={['#1a0533', '#2d0f6b']} style={s.avatarFallback}>
                    <Text style={s.avatarInitial}>{avatarInitial}</Text>
                  </LinearGradient>
                )}
              </View>
            </LinearGradient>
          </Pressable>
          {profile?.guild_id ? (
            <View style={s.guildBadge}>
              <Shield size={9} color="#34D399" strokeWidth={2.5} />
              <Text style={s.guildBadgeText}>Guild</Text>
            </View>
          ) : (
            <View style={[s.guildBadge, s.guildBadgePending]}>
              <Text style={s.guildBadgeText}>⏳</Text>
            </View>
          )}
        </View>

        <View style={s.bioCol}>
          <Text style={s.displayName}>{profile?.username ?? '…'}</Text>
          <Text style={s.bio} numberOfLines={2}>
            {profile?.bio ?? 'Noch keine Bio.'}
          </Text>
          {followCounts && (
            <View style={s.followRow}>
              <Text style={s.followNum}>{followCounts.followers}</Text>
              <Text style={s.followLabel}> Follower</Text>
              <Text style={s.followDot}> · </Text>
              <Text style={s.followNum}>{followCounts.following}</Text>
              <Text style={s.followLabel}> Following</Text>
            </View>
          )}
          <Pressable onPress={onEditProfile} style={s.editPill}>
            <Edit3 size={11} color="rgba(255,255,255,0.45)" strokeWidth={2} />
            <Text style={s.editPillText}>Bearbeiten</Text>
          </Pressable>
        </View>

        <View style={s.scoreCol}>
          <VibeScoreRing score={avgDwell} />
        </View>
      </View>

      <View style={s.metricsRow}>
        <StatKachel
          icon={Timer}
          value={loadingPosts ? '–' : `${avgDwell}%`}
          label="Resonanz"
          accent="#A78BFA"
        />
        <View style={s.metricDivider} />
        <StatKachel
          icon={Zap}
          value={loadingPosts ? '–' : String(postCount)}
          label="Vibes"
          accent="#60A5FA"
        />
        <View style={s.metricDivider} />
        <StatKachel
          icon={Shield}
          value={profile?.guild_id ? '✓' : '–'}
          label="Guild"
          accent="#34D399"
        />
      </View>

      <View style={s.tabRow}>
        {(['vibes', 'saved'] as const).map((tab) => {
          const active = activeTab === tab;
          const accent = tab === 'vibes' ? '#A78BFA' : '#FBBF24';
          return (
            <Pressable
              key={tab}
              onPress={() => {
                impactAsync(ImpactFeedbackStyle.Light);
                onTabChange(tab);
              }}
              style={[s.tabBtn, active && { borderBottomColor: accent }]}
            >
              {tab === 'vibes' ? (
                <Grid3X3
                  size={17}
                  color={active ? accent : 'rgba(255,255,255,0.2)'}
                  strokeWidth={1.8}
                />
              ) : (
                <Bookmark
                  size={17}
                  color={active ? accent : 'rgba(255,255,255,0.2)'}
                  strokeWidth={1.8}
                  fill={active ? accent : 'transparent'}
                />
              )}
              <Text style={[s.tabLabel, active && { color: accent }]}>
                {tab === 'vibes' ? 'Vibes' : 'Gespeichert'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
