import { Eye, Heart, MessageCircle, Clock, Calendar, Users, ExternalLink } from "lucide-react";

function fmt(n) {
  if (n == null) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtDuration(s) {
  if (!s) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function engColor(rate) {
  if (rate >= 5) return "text-bone";
  if (rate >= 2) return "text-bone/80";
  return "text-red";
}

export default function VideoCard({ label, data, loading }) {
  if (loading) {
    return (
      <div className="pane pane-red p-0 overflow-hidden animate-pulse">
        <div className="h-48 bg-coal" />
        <div className="p-6 space-y-3">
          <div className="h-3 bg-ash w-3/4" />
          <div className="h-2 bg-ash/60 w-1/2" />
          <div className="grid grid-cols-2 gap-2 mt-6">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-ash/40" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pane border border-bone/10 h-72 flex flex-col items-center justify-center">
        <div className="text-display text-9xl font-bold tracking-tightest text-bone/10">{label}</div>
        <div className="text-mono text-[10px] tracking-ultra text-bone/30 mt-4">UNINITIALIZED</div>
      </div>
    );
  }

  const {
    title, creator, thumbnail, views, likes, comments,
    followers, duration, upload_date, hashtags,
    engagement_rate, platform, source_url,
  } = data;

  return (
    <div className="pane pane-red overflow-hidden group">
      {/* thumbnail strip */}
      <div className="relative h-52 bg-coal overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-display text-9xl font-bold text-bone/5">
            {label}
          </div>
        )}

        {/* gradient veil */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, transparent 0%, transparent 50%, rgba(8,8,8,0.9) 100%)"
        }} />

        {/* corner stamps */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="bg-red text-ink text-display font-bold text-sm px-2 py-0.5 tracking-widest">
            {label}
          </span>
          {platform && (
            <span className="chip bg-ink/80 backdrop-blur uppercase">{platform}</span>
          )}
        </div>

        {duration > 0 && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-mono text-[10px] tracking-widest bg-ink/80 backdrop-blur px-2 py-1">
            <Clock size={9} />
            {fmtDuration(duration)}
          </div>
        )}

        {/* scan line on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="scan-line animate-scan" />
        </div>
      </div>

      {/* body */}
      <div className="p-6 space-y-5">
        <div>
          <h3 className="text-display font-bold text-base text-bone leading-tight line-clamp-2 tracking-tight uppercase">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-2.5 text-mono text-[10px] tracking-widest text-bone/50 uppercase">
            <span>{creator}</span>
            {source_url && (
              <a href={source_url} target="_blank" rel="noreferrer" className="ml-auto text-bone/40 hover:text-red transition-colors">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-2 gap-px bg-bone/5 border border-bone/5">
          <Stat icon={<Eye size={11} />}            label="VIEWS"     value={fmt(views)} />
          <Stat icon={<Heart size={11} />}          label="LIKES"     value={fmt(likes)} />
          <Stat icon={<MessageCircle size={11} />}  label="COMMENTS"  value={fmt(comments)} />
          <Stat icon={<Users size={11} />}          label="REACH"     value={fmt(followers)} />
        </div>

        {/* engagement, the hero metric */}
        <div className="flex items-end justify-between border-l-2 border-red pl-4 py-2">
          <div>
            <div className="text-mono text-[9px] tracking-ultra text-bone/40 uppercase">Engagement Rate</div>
            <div className={`text-display font-bold text-4xl leading-none mt-1 ${engColor(engagement_rate)}`}>
              {engagement_rate?.toFixed(2)}%
            </div>
          </div>
          <Sparkbar rate={engagement_rate} />
        </div>

        {upload_date && (
          <div className="flex items-center gap-1.5 text-mono text-[9px] tracking-widest text-bone/30 uppercase">
            <Calendar size={9} />
            {upload_date}
          </div>
        )}

        {hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.slice(0, 5).map((t) => (
              <span key={t} className="text-mono text-[9px] tracking-widest text-bone/40 border border-bone/10 px-1.5 py-0.5 uppercase">
                {t.replace(/^#/, "")}
              </span>
            ))}
            {hashtags.length > 5 && (
              <span className="text-mono text-[9px] text-bone/30">+{hashtags.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="bg-ink/60 px-3 py-3">
      <div className="flex items-center gap-1.5 text-bone/40 mb-1">
        {icon}
        <span className="text-mono text-[9px] tracking-widest uppercase">{label}</span>
      </div>
      <div className="text-display font-bold text-lg text-bone tracking-tight">{value}</div>
    </div>
  );
}

function Sparkbar({ rate }) {
  // 10-segment bar, fills based on rate
  const segs = 10;
  const filled = Math.round(Math.min(rate * 1.5, 10));
  return (
    <div className="flex gap-0.5 items-end h-8">
      {[...Array(segs)].map((_, i) => (
        <div
          key={i}
          className="w-1"
          style={{
            height: `${20 + i * 8}%`,
            background: i < filled ? "#ff2200" : "rgba(245,245,240,0.08)",
            transition: "background .3s ease",
          }}
        />
      ))}
    </div>
  );
}
