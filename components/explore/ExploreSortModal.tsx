import { Modal, Pressable, View, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import {
  EXPLORE_SORT_OPTIONS,
  type ExploreSortMode,
} from '@/lib/useExplore';
import { exploreStyles as styles } from './exploreStyles';

export function ExploreSortModal({
  visible,
  sortMode,
  onClose,
  onSelectSort,
}: {
  visible: boolean;
  sortMode: ExploreSortMode;
  onClose: () => void;
  onSelectSort: (mode: ExploreSortMode) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Sortierung</Text>
          <Text style={styles.sheetSub}>Wie soll der Explore-Grid sortiert werden?</Text>
          <View style={styles.optionsList}>
            {EXPLORE_SORT_OPTIONS.map((opt) => {
              const active = sortMode === opt.id;
              const IconComp = opt.Icon;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => {
                    impactAsync(ImpactFeedbackStyle.Light);
                    onSelectSort(opt.id);
                    onClose();
                  }}
                >
                  <View style={[styles.optionIconWrap, active && styles.optionIconWrapActive]}>
                    <IconComp size={18} color={active ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={1.8} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{opt.label}</Text>
                    <Text style={styles.optionSub}>{opt.sub}</Text>
                  </View>
                  {active && <Check size={18} color="#A78BFA" strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
