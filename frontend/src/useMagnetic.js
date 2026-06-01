import { useEffect, useRef } from "react";

export default function useMagnetic(strength = 0.3, radius = 100) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let tx = 0, ty = 0;
    let cx = 0, cy = 0;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const ex = rect.left + rect.width / 2;
      const ey = rect.top + rect.height / 2;
      const dx = e.clientX - ex;
      const dy = e.clientY - ey;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        tx = dx * strength;
        ty = dy * strength;
      } else {
        tx = 0; ty = 0;
      }
    };

    const onLeave = () => { tx = 0; ty = 0; };

    const tick = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength, radius]);

  return ref;
}
