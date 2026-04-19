import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';

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
const TICK_MAJOR = '#334155';
const TICK_MINOR = '#94a3b8';
const TICK_LABEL = '#475569';

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
  const height = size * 0.95;
  const cx = size / 2;
  const cy = size * 0.55;
  const stroke = size * 0.09;
  const r = size / 2 - stroke / 2 - 6;

  const safePercent = Math.max(0, Math.min(100, value));
  const needleAngle = valueToAngle(value);

  const needleLen = r - stroke / 2 - size * 0.04;
  const needleTip = polar(cx, cy, needleLen, needleAngle);
  const needleBaseLeft = polar(
    cx,
    cy,
    size * 0.025,
    needleAngle + 90,
  );
  const needleBaseRight = polar(
    cx,
    cy,
    size * 0.025,
    needleAngle - 90,
  );
  const needlePoints = `${needleTip.x},${needleTip.y} ${needleBaseLeft.x},${needleBaseLeft.y} ${needleBaseRight.x},${needleBaseRight.y}`;

  const majorTicks = [0, 50, 100];
  const minorTicks = [25, 75];

  const displayPercent = Number.isFinite(value)
    ? Math.round(value)
    : 0;

  return (
    <View style={[styles.container, { width: size, height }]}>
      <Svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
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
          if (safePercent <= seg.from) return null;
          const a2Final =
            safePercent >= seg.to
              ? valueToAngle(seg.to)
              : valueToAngle(safePercent);
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

        {/* Ticks menores (25 e 75) - dentro do arco */}
        {minorTicks.map((t) => {
          const a = valueToAngle(t);
          const inner = polar(cx, cy, r - stroke / 2 + 2, a);
          const outer = polar(cx, cy, r - stroke / 2 + stroke * 0.45, a);
          return (
            <Line
              key={`mn-${t}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={TICK_MINOR}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Ticks maiores (0, 50, 100) - dentro do arco */}
        {majorTicks.map((t) => {
          const a = valueToAngle(t);
          const inner = polar(cx, cy, r - stroke / 2 + 2, a);
          const outer = polar(cx, cy, r + stroke / 2 - 2, a);
          return (
            <Line
              key={`mj-${t}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={TICK_MAJOR}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {/* Labels: maiores apenas em 0, 50 e 100 */}
        {majorTicks.map((t) => {
          const a = valueToAngle(t);
          const pos = polar(cx, cy, r + stroke / 2 + 14, a);
          return (
            <SvgText
              key={`l-${t}`}
              x={pos.x}
              y={pos.y + 4}
              fontSize={12}
              fontWeight="700"
              fill={TICK_LABEL}
              textAnchor="middle"
            >
              {`${t}%`}
            </SvgText>
          );
        })}

        {/* Labels menores em 25 e 75 */}
        {minorTicks.map((t) => {
          const a = valueToAngle(t);
          const pos = polar(cx, cy, r + stroke / 2 + 12, a);
          return (
            <SvgText
              key={`lm-${t}`}
              x={pos.x}
              y={pos.y + 3}
              fontSize={10}
              fill={TICK_MINOR}
              textAnchor="middle"
            >
              {`${t}`}
            </SvgText>
          );
        })}

        {/* Ponteiro (forma triangular) */}
        <Polygon points={needlePoints} fill={NEEDLE_COLOR} />

        {/* Pivô central */}
        <Circle cx={cx} cy={cy} r={size * 0.028} fill={NEEDLE_COLOR} />
        <Circle cx={cx} cy={cy} r={size * 0.012} fill="#fff" />
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
    fontSize: 26,
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
