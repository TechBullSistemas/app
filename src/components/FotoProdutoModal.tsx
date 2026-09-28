import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface Props {
  visible: boolean;
  uri: string | null;
  descricao?: string | null;
  onClose: () => void;
}

/**
 * Visualizador de foto do produto em tela cheia. Fecha ao tocar em qualquer
 * lugar (backdrop, imagem ou botão "X").
 */
export function FotoProdutoModal({ visible, uri, descricao, onClose }: Props) {
  if (!uri) return null;

  async function compartilhar() {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          'Compartilhamento',
          'O compartilhamento não está disponível neste aparelho.',
        );
        return;
      }
      let arquivo = uri!;
      if (/^https?:\/\//i.test(uri!)) {
        const destino = `${FileSystem.cacheDirectory}produto-${Date.now()}.jpg`;
        arquivo = (await FileSystem.downloadAsync(uri!, destino)).uri;
      }
      await Sharing.shareAsync(arquivo, {
        dialogTitle: descricao || 'Compartilhar foto do produto',
        mimeType: 'image/jpeg',
      });
    } catch {
      Alert.alert(
        'Compartilhamento',
        'Não foi possível compartilhar esta foto.',
      );
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              void compartilhar();
            }}
            hitSlop={12}
            style={styles.actionBtn}
            accessibilityLabel="Compartilhar foto"
          >
            <Ionicons name="share-outline" size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onClose();
            }}
            hitSlop={12}
            style={styles.actionBtn}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        {descricao ? (
          <Text style={styles.caption} numberOfLines={2}>
            {descricao}
          </Text>
        ) : (
          <View style={styles.captionSpacer} />
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
  },
  actionsRow: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 6,
  },
  image: { flex: 1, width: '100%' },
  caption: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  captionSpacer: { height: 24 },
});
