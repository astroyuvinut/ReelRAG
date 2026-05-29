import { useEffect, useRef } from "react";

export default function Cursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx, ry = my;
    let dx = mx, dy = my;
    let hovering = false;
    let isRed = false;
    let raf = 0;

    const updateSpotlight = (x, y) => {
      document.documentElement.style.setProperty("--mx", x + "px");
      document.documentElement.style.setProperty("--my", y + "px");
    };

    const onMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
      updateSpotlight(mx, my);
    };

    const setRed = (on) => {
      if (on === isRed) return;
      isRed = on;
      if (on) {
        ring.style.borderColor = "#ff2200";
        ring.style.transform += " scale(1.4)";
        dot.style.background = "#ff2200";
      } else {
        ring.style.borderColor = "rgba(245,245,240,0.45)";
        dot.style.background = "#f5f5f0";
      }
    };

    const onOver = (e) => {
      const el = e.target.closest("a, button, [data-magnetic], input, textarea");
      hovering = !!el;
      setRed(!!el && !el.matches("input, textarea"));
    };

    const tick = () => {
      // dot follows the mouse near-exactly
      dx += (mx - dx) * 0.35;
      dy += (my - dy) * 0.35;
      dot.style.transform = `translate3d(${dx - 4}px, ${dy - 4}px, 0)`;
      // ring lags behind for that filmic feel
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      const scale = hovering ? 1.6 : 1;
      ring.style.transform = `translate3d(${rx - 20}px, ${ry - 20}px, 0) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        className="custom-cursor pointer-events-none fixed top-0 left-0 z-[9999] w-10 h-10 border rounded-full"
        style={{
          borderColor: "rgba(245,245,240,0.45)",
          mixBlendMode: "difference",
          transition: "border-color .2s ease, transform .12s linear",
        }}
      />
      <div
        ref={dotRef}
        className="custom-cursor pointer-events-none fixed top-0 left-0 z-[9999] w-2 h-2 rounded-full"
        style={{
          background: "#f5f5f0",
          mixBlendMode: "difference",
        }}
      />
    </>
  );
}
