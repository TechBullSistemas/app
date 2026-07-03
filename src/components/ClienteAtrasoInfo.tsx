import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TituloAtrasoResumo } from '@/db/repositories/notas';
import { fmtMoney } from '@/utils/format';

interface Props {
  resumo: TituloAtrasoResumo | null | undefined;
  variant?: 'row' | 'inline';
}

export function ClienteAtrasoInfo({ resumo, variant = 'row' }: Props) {
  if (!resumo || resumo.maxDiasAtraso <= 0) return null;

  const texto = `${resumo.maxDiasAtraso} dia${resumo.maxDiasAtraso !== 1 ? 's' : ''} em atraso • ${fmtMoney(resumo.vlTotalAtraso)}`;

  if (variant === 'inline') {
    return (
      <View style={styles.chip}>
        <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
        <Text style={styles.chipText} numberOfLines={2}>
          {texto}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Ionicons name="alert-circle-outline" size={13} color="#dc2626" />
      <Text style={styles.rowText}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rowText: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    flexShrink: 1,
    maxWidth: '100%',
  },
  chipText: { color: '#dc2626', fontSize: 11, fontWeight: '700', flexShrink: 1 },
});
