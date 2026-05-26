import { colors } from "../styles";

interface Props {
  onClick: () => void;
  /** Hide when the chat panel is already open (avoids visual collision). */
  hidden?: boolean;
  /** Show a small pulse dot to hint there's new activity / unread reply. */
  hasUnread?: boolean;
  label?: string;
}

export default function FloatingChatButton({ onClick, hidden, hasUnread, label = "Hablar con el agente" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      className="fab"
      style={{
        position: "fixed",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        width: 60,
        height: 60,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentStrong})`,
        border: `1px solid ${colors.accentBorder}`,
        color: colors.textOnAccent,
        boxShadow: `0 10px 28px rgba(0,0,0,0.28), 0 0 0 6px ${colors.accentSoft}`,
        cursor: hidden ? "default" : "pointer",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        opacity: hidden ? 0 : 1,
        transform: hidden ? "scale(0.7) translateY(20px)" : "scale(1) translateY(0)",
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity 0.25s ease, transform 0.25s ease, box-shadow 0.2s ease",
      }}
    >
      <RobotIcon />
      {hasUnread && !hidden && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: colors.danger,
            border: `2px solid ${colors.bg}`,
            animation: "pulse 1.6s ease-in-out infinite",
          }}
        />
      )}
    </button>
  );
}

function RobotIcon() {
  // Friendly minimal AI agent: rounded head + antenna + glowing eyes + chat dots
  return (
    <svg width={30} height={30} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* Antenna */}
      <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="3" r="1.6" fill="currentColor" />
      {/* Head */}
      <rect x="5" y="7" width="22" height="18" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
      {/* Eyes */}
      <circle cx="12" cy="15" r="1.8" fill="currentColor" />
      <circle cx="20" cy="15" r="1.8" fill="currentColor" />
      {/* Mouth — small chat-like dots */}
      <circle cx="13" cy="20.5" r="0.9" fill="currentColor" />
      <circle cx="16" cy="20.5" r="0.9" fill="currentColor" />
      <circle cx="19" cy="20.5" r="0.9" fill="currentColor" />
      {/* Side "ears" */}
      <line x1="3" y1="14" x2="3" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="29" y1="14" x2="29" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
