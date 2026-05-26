import { colors, sansFont } from "../styles";

interface Props {
  size?: number;
  showText?: boolean;
}

/** WakuAIpa wordmark — sun glyph + team name. */
export default function Logo({ size = 28, showText = true }: Props) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <SunGlyph size={size} />
      {showText && (
        <span style={{
          fontFamily: sansFont,
          fontSize: size * 0.62,
          fontWeight: 800,
          letterSpacing: "-0.5px",
          color: colors.text,
          lineHeight: 1,
        }}>
          Waku<span style={{ color: colors.accent }}>AI</span>pa
        </span>
      )}
    </div>
  );
}

function SunGlyph({ size }: { size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const coreR = size * 0.22;
  const innerR = size * 0.34;
  const outerR = size * 0.48;
  const ray = (i: number) => {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    return {
      x1: cx + Math.cos(angle) * innerR,
      y1: cy + Math.sin(angle) * innerR,
      x2: cx + Math.cos(angle) * outerR,
      y2: cy + Math.sin(angle) * outerR,
    };
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="WakuAIpa">
      <defs>
        <radialGradient id="wakuaipa-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor={colors.accent} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={coreR} fill="url(#wakuaipa-sun)" />
      <g stroke={colors.accent} strokeWidth={Math.max(1.5, size * 0.07)} strokeLinecap="round">
        {Array.from({ length: 8 }).map((_, i) => {
          const r = ray(i);
          return <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />;
        })}
      </g>
    </svg>
  );
}
