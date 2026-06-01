import { useEffect, useRef } from "react";

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
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
