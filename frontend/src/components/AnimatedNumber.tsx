import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;       // ms
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** "es-CO" locale separator (puntos miles, coma decimal). */
  locale?: string;
}

/**
 * Animates a number from its previous value to the new one with easeOutQuart.
 * Honors prefers-reduced-motion (jumps directly to value).
 */
export default function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  prefix = "",
  suffix = "",
  locale = "es-CO",
}: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted = display.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <>{prefix}{formatted}{suffix}</>;
}
