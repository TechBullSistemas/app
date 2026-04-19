import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /**
   * Espaço extra (em px) acima do teclado quando ele aparece.
   * Útil quando há header customizado.
   */
  keyboardVerticalOffset?: number;
  /** Se false, não envolve em ScrollView (usa apenas View). */
  scroll?: boolean;
}

/**
 * Wrapper que evita que o teclado cubra inputs.
 *
 * - Android: usa `height` para que a área visível seja redimensionada.
 *   (precisa de `softwareKeyboardLayoutMode: "resize"` no app.json também)
 * - iOS: usa `padding` (única forma confiável já que iOS sempre sobrepõe).
 */
export function KeyboardAwareScreen({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  scroll = true,
}: Props) {
  const behavior = Platform.OS === 'ios' ? 'padding' : 'height';

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flex}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {inner}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
