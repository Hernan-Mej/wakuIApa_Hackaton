import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "../api/client";
import type { ChatKind, ChatMessage, SendMessageResponse } from "../api/types";
import { colors, inputStyle, monoFont } from "../styles";

interface Props {
  open: boolean;
  onClose: () => void;
  initialKind?: ChatKind;
  /** When provided, automatically send this message on open (once). */
  initialPrompt?: string | null;
  /** Reset trigger — incrementing this forces re-loading history. */
  reloadKey?: number;
}

export default function ChatPanel({ open, onClose, initialKind = "general", initialPrompt = null, reloadKey = 0 }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ChatKind>(initialKind);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch<ChatMessage[]>("/api/chat/history?limit=50")
      .then(setMessages)
      .catch(() => {
        /* ignore — empty history */
      });
  }, [open, reloadKey]);

  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);

  useEffect(() => {
    if (!open || !initialPrompt) return;
    if (autoSentRef.current === initialPrompt) return;
    autoSentRef.current = initialPrompt;
    void send(initialPrompt, initialKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string, k: ChatKind) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SendMessageResponse>("/api/chat/send", {
        method: "POST",
        body: { message: text, kind: k },
      });
      setMessages((prev) => [...prev, res.user_message, res.assistant_message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar mensaje");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    await send(trimmed, kind);
  }

  async function clearHistory() {
    if (!confirm("¿Borrar todo el historial de chat?")) return;
    try {
      await apiFetch("/api/chat/history", { method: "DELETE" });
      setMessages([]);
      autoSentRef.current = null;
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, background: colors.overlay,
            zIndex: 90, backdropFilter: "blur(2px)",
          }}
        />
      )}
      <aside
        className="r-chat-panel"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          background: colors.bgSoft, borderLeft: `1px solid ${colors.borderStrong}`,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease", zIndex: 100, display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${colors.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, color: colors.accent, fontFamily: monoFont, letterSpacing: "2px" }}>
              AGENTE SOLAR IA
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
              {kind === "blackout" ? "🚨 Modo Apagón" : kind === "prediction" ? "🔮 Predicción del día" : "Chat general"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={clearHistory} title="Borrar historial"
              style={{
                background: "transparent", color: colors.textFaint, border: `1px solid ${colors.border}`,
                borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12,
              }}>
              🗑
            </button>
            <button onClick={onClose} title="Cerrar"
              style={{
                background: "transparent", color: colors.textMuted, border: `1px solid ${colors.border}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14,
              }}>
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: 40, color: colors.textFaint, fontSize: 13 }}>
              Empieza una conversación con el agente. Pregunta sobre tu consumo, recomendaciones o
              haz click en Predicción / Apagón para generar reportes.
            </div>
          )}
          {messages.map((m) => <Bubble key={m.id} msg={m} />)}
          {loading && (
            <div style={{
              display: "inline-block", padding: "10px 14px", background: colors.surface,
              border: `1px solid ${colors.border}`, borderRadius: 14, color: colors.textMuted, fontSize: 12,
            }}>
              <span style={{ display: "inline-block", animation: "blink 1s infinite" }}>●</span>
              <span style={{ display: "inline-block", animation: "blink 1s infinite 0.2s", marginLeft: 2 }}>●</span>
              <span style={{ display: "inline-block", animation: "blink 1s infinite 0.4s", marginLeft: 2 }}>●</span>
              <span style={{ marginLeft: 10 }}>El agente está pensando...</span>
              <style>{`@keyframes blink { 50% { opacity: 0.2; } }`}</style>
            </div>
          )}
          {error && (
            <div style={{
              padding: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, color: "#f87171", fontSize: 12, marginTop: 10,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={onSubmit} style={{
          padding: 14, borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8,
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregúntale al agente..."
            disabled={loading}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              background: colors.accent, color: colors.textOnAccent, border: "none", borderRadius: 8,
              padding: "0 18px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !input.trim() ? 0.5 : 1, fontFamily: "inherit", fontSize: 14,
            }}
          >
            ➤
          </button>
        </form>
      </aside>
    </>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const accent =
    msg.kind === "blackout" ? colors.danger : msg.kind === "prediction" ? colors.info : colors.accent;
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12,
    }}>
      <div style={{
        maxWidth: "85%",
        background: isUser ? "rgba(245,158,11,0.12)" : colors.surface,
        border: `1px solid ${isUser ? colors.accentBorder : colors.border}`,
        borderLeft: isUser ? `1px solid ${colors.accentBorder}` : `3px solid ${accent}`,
        borderRadius: 12, padding: "10px 14px",
        color: colors.text, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
      }}>
        {!isUser && msg.kind !== "general" && (
          <div style={{
            fontSize: 9, color: accent, fontFamily: monoFont, letterSpacing: "1.5px",
            marginBottom: 4, textTransform: "uppercase",
          }}>
            {msg.kind === "blackout" ? "🚨 Plan de Apagón" : "🔮 Predicción"}
          </div>
        )}
        {msg.content}
      </div>
    </div>
  );
}
