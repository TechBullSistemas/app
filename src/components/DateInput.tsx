import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { brToDate, dateToBr, maskDateBR } from '@/utils/format';

interface Props {
  label: string;
  value: string;
  onChange: (brDate: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDisabled(day: Date, minimumDate?: Date, maximumDate?: Date): boolean {
  const d = startOfDay(day).getTime();
  if (minimumDate && d < startOfDay(minimumDate).getTime()) return true;
  if (maximumDate && d > startOfDay(maximumDate).getTime()) return true;
  return false;
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay(); // 0 = Sunday
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateInput({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = brToDate(value) ?? new Date();
  const [cursor, setCursor] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  function openPicker() {
    const base = brToDate(value) ?? new Date();
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  }

  function applyDate(d: Date) {
    onChange(dateToBr(d));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const cells = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());
  const today = startOfDay(new Date());

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

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{label}</Text>

            <View style={styles.monthNav}>
              <Pressable
                onPress={() => shiftMonth(-1)}
                hitSlop={8}
                style={styles.navBtn}
              >
                <Ionicons name="chevron-back" size={22} color="#1e3a8a" />
              </Pressable>
              <Text style={styles.monthLabel}>
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable
                onPress={() => shiftMonth(1)}
                hitSlop={8}
                style={styles.navBtn}
              >
                <Ionicons name="chevron-forward" size={22} color="#1e3a8a" />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={`${w}-${i}`} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (!day) {
                  return <View key={`e-${idx}`} style={styles.dayCell} />;
                }
                const disabled = isDisabled(day, minimumDate, maximumDate);
                const selectedDay = sameDay(day, selected);
                const isToday = sameDay(day, today);
                return (
                  <Pressable
                    key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                    style={[
                      styles.dayCell,
                      selectedDay && styles.daySelected,
                      isToday && !selectedDay && styles.dayToday,
                    ]}
                    disabled={disabled}
                    onPress={() => applyDate(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selectedDay && styles.dayTextSelected,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.doneBtn} onPress={() => setOpen(false)}>
              <Text style={styles.doneText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  navBtn: { padding: 6 },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  daySelected: {
    backgroundColor: '#1e3a8a',
  },
  dayToday: {
    borderWidth: 1,
    borderColor: '#1e3a8a',
  },
  dayText: {
    fontSize: 15,
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#cbd5e1',
  },
  doneBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
  },
  doneText: { color: '#1e3a8a', fontWeight: '700', fontSize: 16 },
});
