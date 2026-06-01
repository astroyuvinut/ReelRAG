import { useEffect, useRef } from "react";

export default function ParticleNetwork({
  count = 75,
  connectDist = 140,
  mouseRadius = 180,
  mousePush = 0.06,
  baseDrift = 0.25,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    const mouse = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let visible = !document.hidden;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = () => {
      const target = Math.round(count * Math.min(1.4, Math.max(0.5, (w * h) / (1440 * 900))));
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * baseDrift,
        vy: (Math.random() - 0.5) * baseDrift,
        r: Math.random() * 1.1 + 0.4,
        accent: Math.random() < 0.06,
      }));
    };

    const onMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; };
    const onVis  = () => { visible = !document.hidden; };

    const tick = () => {
      if (!visible) { raf = requestAnimationFrame(tick); return; }

      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          const r2 = mouseRadius * mouseRadius;
          if (d2 < r2 && d2 > 0.5) {
            const d = Math.sqrt(d2);
            const force = (1 - d / mouseRadius) * mousePush;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }

        p.vx *= 0.985;
        p.vy *= 0.985;

        p.vx += (Math.random() - 0.5) * 0.008;
        p.vy += (Math.random() - 0.5) * 0.008;

        const speed = Math.hypot(p.vx, p.vy);
        const max = 0.9;
        if (speed > max) { p.vx = (p.vx / speed) * max; p.vy = (p.vy / speed) * max; }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -5)    p.x = w + 4;
        if (p.x > w + 5) p.x = -4;
        if (p.y < -5)    p.y = h + 4;
        if (p.y > h + 5) p.y = -4;
      }

      ctx.lineWidth = 0.45;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          const r2 = connectDist * connectDist;
          if (d2 < r2) {
            const d = Math.sqrt(d2);
            const t = 1 - d / connectDist;
            const alpha = t * 0.18;
            if (a.accent || b.accent) {
              ctx.strokeStyle = `rgba(255, 34, 0, ${alpha * 1.2})`;
            } else {
              ctx.strokeStyle = `rgba(245, 245, 240, ${alpha})`;
            }
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = p.accent
          ? "rgba(255, 34, 0, 0.85)"
          : "rgba(245, 245, 240, 0.55)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    resize();
    spawn();
    window.addEventListener("resize", () => { resize(); spawn(); });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [count, connectDist, mouseRadius, mousePush, baseDrift]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
    />
  );
}
