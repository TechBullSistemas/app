import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

type Props = TextInputProps & {
  mostrarBotoes: boolean;
  passo: number;
  valor: number;
  onIncrementar: (direcao: -1 | 1) => void;
};

export function PrecoUnitarioInput({
  mostrarBotoes,
  passo,
  valor,
  onIncrementar,
  style,
  ...inputProps
}: Props) {
  if (!mostrarBotoes) return <TextInput {...inputProps} style={style} />;
  const bloqueado = inputProps.editable === false;
  const passoTexto = `R$ ${passo.toFixed(2).replace('.', ',')}`;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir valor unitário em ${passoTexto}`}
        accessibilityState={{ disabled: bloqueado || valor <= 0 }}
        disabled={bloqueado || valor <= 0}
        style={[styles.button, (bloqueado || valor <= 0) && styles.disabled]}
        onPress={() => onIncrementar(-1)}
      >
        <Text style={styles.symbol}>−</Text>
      </Pressable>
      <TextInput {...inputProps} style={[style, styles.input]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar valor unitário em ${passoTexto}`}
        accessibilityState={{ disabled: bloqueado }}
        disabled={bloqueado}
        style={[styles.button, bloqueado && styles.disabled]}
        onPress={() => onIncrementar(1)}
      >
        <Text style={styles.symbol}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, minHeight: 44 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { backgroundColor: '#94a3b8' },
  symbol: { fontSize: 22, color: '#fff', fontWeight: '600' },
});
