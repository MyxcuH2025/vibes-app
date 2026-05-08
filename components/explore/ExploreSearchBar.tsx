import { useRef } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Search, X, SlidersHorizontal } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { exploreStyles as styles } from './exploreStyles';
import type { ExploreSortMode } from '@/lib/useExplore';

export function ExploreSearchBar({
  query,
  onQueryChange,
  sortMode,
  onOpenSort,
}: {
  query: string;
  onQueryChange: (t: string) => void;
  sortMode: ExploreSortMode;
  onOpenSort: () => void;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBar}>
        <BlurView intensity={60} tint="dark" style={styles.searchBlur}>
          <Search size={18} color="rgba(255,255,255,0.4)" strokeWidth={2} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Suche nach Nutzern oder Posts…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                onQueryChange('');
                inputRef.current?.blur();
              }}
              hitSlop={8}
            >
              <X size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
            </Pressable>
          )}
        </BlurView>
      </View>

      <Pressable
        onPress={() => {
          impactAsync(ImpactFeedbackStyle.Light);
          onOpenSort();
        }}
        style={[styles.filterBtn, sortMode !== 'forYou' && styles.filterBtnActive]}
        hitSlop={6}
      >
        <SlidersHorizontal
          size={18}
          color={sortMode !== 'forYou' ? '#A78BFA' : 'rgba(255,255,255,0.55)'}
          strokeWidth={2}
        />
        {sortMode !== 'forYou' && <View style={styles.filterDot} />}
      </Pressable>
    </View>
  );
}
