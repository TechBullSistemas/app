import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

interface Props {
  value: number;
  size?: number;
  label?: string;
  formattedValue?: string;
  formattedTarget?: string;
}

interface Segment {
  from: number;
  to: number;
  color: string;
}

const SEGMENTS: Segment[] = [
  { from: 0, to: 50, color: '#ef4444' },
  { from: 50, to: 80, color: '#f59e0b' },
  { from: 80, to: 100, color: '#22c55e' },
];

const TRACK_BG = '#e5e7eb';
const NEEDLE_COLOR = '#0f172a';
const TICK_COLOR = '#475569';

const START_ANGLE = 180;
const END_ANGLE = 360;
const ANGLE_RANGE = END_ANGLE - START_ANGLE;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function valueToAngle(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return START_ANGLE + (clamped / 100) * ANGLE_RANGE;
}

export function SpeedometerGauge({
  value,
  size = 260,
  label,
  formattedValue,
  formattedTarget,
}: Props) {
  const cx = size / 2;
  const cy = size * 0.62;
  const stroke = size * 0.1;
  const r = size / 2 - stroke / 2 - 4;

  const safePercent = Math.max(0, Math.min(100, value));
  const needleAngle = valueToAngle(value);
  const needleEnd = polar(cx, cy, r - stroke / 2 - 4, needleAngle);

  const ticks = [0, 25, 50, 75, 100];

  const displayPercent = Number.isFinite(value)
    ? Math.round(value)
    : 0;

  return (
    <View style={[styles.container, { width: size, height: size * 0.78 }]}>
      <Svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
        {/* Track de fundo */}
        <Path
          d={describeArc(cx, cy, r, START_ANGLE, END_ANGLE)}
          stroke={TRACK_BG}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />

        {/* Segmentos coloridos */}
        {SEGMENTS.map((seg, i) => {
          const a1 = valueToAngle(seg.from);
          const a2 = valueToAngle(Math.min(seg.to, safePercent || 0.0001));
          if (safePercent <= seg.from) return null;
          const a2Final =
            safePercent >= seg.to ? valueToAngle(seg.to) : a2;
          return (
            <Path
              key={i}
              d={describeArc(cx, cy, r, a1, a2Final)}
              stroke={seg.color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}

        {/* Ticks */}
        {ticks.map((t) => {
          const a = valueToAngle(t);
          const inner = polar(cx, cy, r - stroke / 2 - 6, a);
          const outer = polar(cx, cy, r + stroke / 2 + 2, a);
          return (
            <G key={t}>
              <Line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={TICK_COLOR}
                strokeWidth={1.5}
              />
            </G>
          );
        })}

        {/* Labels dos ticks */}
        {ticks.map((t) => {
          const a = valueToAngle(t);
          const pos = polar(cx, cy, r + stroke / 2 + 14, a);
          return (
            <SvgText
              key={`l-${t}`}
              x={pos.x}
              y={pos.y + 4}
              fontSize={11}
              fill="#475569"
              textAnchor="middle"
            >
              {`${t}%`}
            </SvgText>
          );
        })}

        {/* Ponteiro */}
        <Line
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke={NEEDLE_COLOR}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={size * 0.04} fill={NEEDLE_COLOR} />
        <Circle cx={cx} cy={cy} r={size * 0.018} fill="#fff" />
      </Svg>

      <View style={styles.centerInfo}>
        <Text style={styles.percentText}>{displayPercent}%</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {formattedValue || formattedTarget ? (
          <Text style={styles.values}>
            {formattedValue ?? '—'}
            {formattedTarget ? `  /  ${formattedTarget}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  centerInfo: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    width: '100%',
  },
  percentText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  label: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  values: {
    marginTop: 4,
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
  },
});
