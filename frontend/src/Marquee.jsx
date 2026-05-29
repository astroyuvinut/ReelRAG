export default function Marquee({ items, reverse = false, className = "" }) {
  // duplicate the list so the infinite loop seam is invisible
  const doubled = [...items, ...items];
  return (
    <div className={`relative overflow-hidden border-y border-bone/10 py-6 ${className}`}>
      <div className={`marquee-track ${reverse ? "animate-marquee-rev" : "animate-marquee"}`}>
        {doubled.map((it, i) => (
          <div key={i} className="flex items-center gap-16 shrink-0">
            <span className="text-display text-4xl md:text-6xl font-bold tracking-tightest uppercase text-bone/90">
              {it}
            </span>
            <span className="text-red text-5xl leading-none">/</span>
          </div>
        ))}
      </div>
    </div>
  );
}
