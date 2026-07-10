import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.closeRow}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
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
  closeRow: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1,
  },
  closeBtn: {
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
