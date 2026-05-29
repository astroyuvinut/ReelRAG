import { useEffect, useRef } from "react";

// per-character reveal with motion blur. each char animates in on its own delay.
export default function KineticText({ text, className = "", delay = 0, stagger = 35 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chars = el.querySelectorAll(".char");
    chars.forEach((c, i) => {
      setTimeout(() => c.classList.add("in"), delay + i * stagger);
    });
  }, [text, delay, stagger]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="char" aria-hidden>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
