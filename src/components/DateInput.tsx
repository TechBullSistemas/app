import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { brToDate, dateToBr, maskDateBR } from '@/utils/format';

interface Props {
  label: string;
  value: string;
  onChange: (brDate: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DateInput({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: Props) {
  const [showIosPicker, setShowIosPicker] = useState(false);
  const pickerDate = brToDate(value) ?? new Date();

  function applyDate(d: Date) {
    onChange(dateToBr(d));
  }

  function openPicker() {
    if (Platform.OS === 'web') return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerDate,
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) applyDate(selected);
        },
      });
      return;
    }
    setShowIosPicker(true);
  }

  function onIosChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'ios') {
      if (event.type === 'dismissed') {
        setShowIosPicker(false);
        return;
      }
      if (selected) applyDate(selected);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <Pressable onPress={openPicker} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="calendar-outline" size={20} color="#1e3a8a" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => onChange(maskDateBR(t))}
          placeholder="dd/mm/aaaa"
          placeholderTextColor="#94a3b8"
          keyboardType="number-pad"
          maxLength={10}
          returnKeyType="done"
          selectionColor="#1e3a8a"
          underlineColorAndroid="transparent"
        />
        <Pressable onPress={openPicker} hitSlop={8} style={styles.chevronBtn}>
          <Ionicons name="chevron-down" size={16} color="#94a3b8" />
        </Pressable>
      </View>
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showIosPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowIosPicker(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowIosPicker(false)}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>{label}</Text>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                locale="pt-BR"
                themeVariant="light"
                textColor="#0f172a"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={onIosChange}
                style={styles.iosPicker}
              />
              <Pressable
                style={styles.iosDoneBtn}
                onPress={() => setShowIosPicker(false)}
              >
                <Text style={styles.iosDoneText}>OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  label: { color: '#334155', fontSize: 12, fontWeight: '700' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    minHeight: 44,
  },
  iconBtn: {
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 2,
    fontVariant: ['tabular-nums'],
  },
  chevronBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  iosPicker: {
    width: '100%',
    height: 216,
  },
  iosDoneBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
  },
  iosDoneText: { color: '#1e3a8a', fontWeight: '700', fontSize: 16 },
});
