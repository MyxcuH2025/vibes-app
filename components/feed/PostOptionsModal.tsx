import { View, Text, Modal, Pressable, Alert } from 'react-native';
import {
  SlidersHorizontal,
  UserPlus,
  UserCheck,
  EyeOff,
  Flag,
} from 'lucide-react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useReport } from '@/lib/useReport';
import { postOptionsModalStyles as pos } from './feedStyles';

export function PostOptionsModal({
  visible,
  postId,
  isFollowing,
  isOwnProfile,
  authorName,
  onToggleFollow,
  onOpenTune,
  onClose,
}: {
  visible: boolean;
  postId: string;
  isFollowing: boolean;
  isOwnProfile: boolean;
  authorName: string;
  onToggleFollow: () => void;
  onOpenTune: () => void;
  onClose: () => void;
}) {
  const OPTIONS = [
    {
      id: 'tune',
      label: 'Tune my Vibe',
      sub: 'Passe deinen Feed-Algorithmus an',
      icon: SlidersHorizontal,
      color: '#A78BFA',
      bg: 'rgba(167,139,250,0.12)',
    },
    ...(!isOwnProfile
      ? [
          {
            id: 'follow',
            label: isFollowing ? `@${authorName} entfolgen` : `@${authorName} folgen`,
            sub: isFollowing ? 'Aus deinem Netzwerk entfernen' : 'Zu deinem Netzwerk hinzufügen',
            icon: isFollowing ? UserCheck : UserPlus,
            color: isFollowing ? '#4ade80' : '#60a5fa',
            bg: isFollowing ? 'rgba(74,222,128,0.1)' : 'rgba(96,165,250,0.1)',
          },
        ]
      : []),
    {
      id: 'notinterested',
      label: 'Kein Interesse',
      sub: 'Weniger von diesem Content zeigen',
      icon: EyeOff,
      color: '#9CA3AF',
      bg: 'rgba(255,255,255,0.06)',
    },
    {
      id: 'report',
      label: 'Melden',
      sub: 'Verstoß oder Spam melden',
      icon: Flag,
      color: '#f87171',
      bg: 'rgba(248,113,113,0.1)',
    },
  ];

  const { mutate: reportPost } = useReport();

  const handlePress = (id: string) => {
    impactAsync(ImpactFeedbackStyle.Light);
    onClose();
    switch (id) {
      case 'tune':
        setTimeout(onOpenTune, 80);
        break;
      case 'follow':
        onToggleFollow();
        break;
      case 'notinterested':
        reportPost({ postId, reason: 'not_interested' });
        Alert.alert('Verstanden', 'Wir zeigen dir weniger von diesem Content.');
        break;
      case 'report':
        Alert.alert('Melden', 'Wähle einen Grund:', [
          {
            text: 'Spam',
            onPress: () => {
              reportPost({ postId, reason: 'report' });
              Alert.alert('Danke', 'Der Post wurde gemeldet.');
            },
          },
          {
            text: 'Unangemessener Inhalt',
            onPress: () => {
              reportPost({ postId, reason: 'report' });
              Alert.alert('Danke', 'Der Post wurde gemeldet.');
            },
          },
          { text: 'Abbrechen', style: 'cancel' },
        ]);
        break;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pos.overlay} onPress={onClose}>
        <Pressable style={pos.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={pos.handle} />
          <Text style={pos.title}>Optionen</Text>

          {OPTIONS.map((opt) => {
            const IconComp = opt.icon;
            return (
              <Pressable key={opt.id} style={pos.row} onPress={() => handlePress(opt.id)}>
                <View style={[pos.iconWrap, { backgroundColor: opt.bg }]}>
                  <IconComp size={20} color={opt.color} strokeWidth={1.8} />
                </View>
                <View style={pos.textWrap}>
                  <Text style={[pos.rowLabel, { color: opt.id === 'report' ? '#f87171' : '#fff' }]}>{opt.label}</Text>
                  <Text style={pos.rowSub}>{opt.sub}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable style={pos.cancelBtn} onPress={onClose}>
            <Text style={pos.cancelText}>Abbrechen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
