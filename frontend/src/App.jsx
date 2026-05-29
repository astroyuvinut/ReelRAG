import { useState, useCallback } from "react";
import { ArrowUpRight, Zap, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import Cursor from "./Cursor";
import KineticText from "./KineticText";
import Marquee from "./Marquee";
import VideoCard from "./VideoCard";
import ChatPanel from "./ChatPanel";
import ParticleNetwork from "./ParticleNetwork";
import useMagnetic from "./useMagnetic";
import useScrollReveal from "./useScrollReveal";

const API = "/api";

function detectPlatform(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YT";
  if (url.includes("instagram.com")) return "IG";
  return "-";
}

function GiantShape() {
  // oversized abstract geometric form in hero (clipped polygon + drift)
  return (
    <div className="pointer-events-none absolute -top-32 -right-40 w-[900px] h-[900px] z-0 hidden md:block">
      <div className="absolute inset-0 animate-drift">
        <div
          className="absolute inset-0 opacity-30 mix-blend-screen"
          style={{
            background: "radial-gradient(circle at 30% 30%, #ff2200 0%, transparent 60%)",
            filter: "blur(60px)",
          }}
        />
        <svg viewBox="0 0 800 800" className="w-full h-full">
          <defs>
            <linearGradient id="strokeFade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="#ff2200" stopOpacity="0.9" />
              <stop offset="50%"  stopColor="#ff2200" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#080808" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points="400,40 720,260 620,720 220,720 80,300"
            fill="none"
            stroke="url(#strokeFade)"
            strokeWidth="1.2"
          />
          <polygon
            points="400,140 640,300 560,620 280,620 180,320"
            fill="none"
            stroke="rgba(255,34,0,0.25)"
            strokeWidth="0.8"
          />
          <circle cx="400" cy="400" r="280" fill="none" stroke="rgba(245,245,240,0.05)" strokeWidth="1" />
          <line x1="400" y1="40" x2="400" y2="760" stroke="rgba(245,245,240,0.04)" strokeWidth="0.6" />
          <line x1="40"  y1="400" x2="760" y2="400" stroke="rgba(245,245,240,0.04)" strokeWidth="0.6" />
        </svg>
      </div>
      {/* the morphing blob */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] animate-blob-morph opacity-20"
        style={{ background: "radial-gradient(circle, #ff2200 0%, transparent 70%)", filter: "blur(50px)" }}
      />
    </div>
  );
}

function Alert({ type, message }) {
  if (!message) return null;
  const styles = {
    error:   "border-red text-red",
    success: "border-bone/40 text-bone",
    info:    "border-bone/20 text-bone/70",
  };
  const Icon = type === "error" ? AlertTriangle : type === "success" ? CheckCircle2 : Loader2;
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border text-mono text-[10px] uppercase tracking-widest ${styles[type]}`}>
      <Icon size={13} className={type === "info" ? "animate-spin" : ""} />
      <span>{message}</span>
    </div>
  );
}

function StatBlock({ index, label, value, sub }) {
  return (
    <div className="shrink-0 w-[460px] md:w-[560px] snap-start pl-8 md:pl-16 pr-12 py-12 border-r border-bone/10 relative">
      <div className="text-mono text-[10px] tracking-ultra text-bone/40 mb-6">
        {String(index).padStart(2, "0")} //
      </div>
      <div className="text-display font-bold text-7xl md:text-[8rem] leading-[0.85] tracking-tightest text-bone">
        {value}
      </div>
      <div className="text-mono text-[10px] tracking-widest uppercase text-red mt-6">{label}</div>
      <div className="text-serif text-bone/60 text-base mt-3 max-w-sm leading-snug">{sub}</div>
    </div>
  );
}

export default function App() {
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [videoData, setVideoData] = useState({ a: null, b: null });
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ type: null, message: "" });
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const platformA = detectPlatform(urlA);
  const platformB = detectPlatform(urlB);

  const analyzeRef = useMagnetic(0.35, 140);
  useScrollReveal();

  const handleAnalyze = useCallback(async () => {
    if (!urlA.trim() || !urlB.trim()) {
      setAlert({ type: "error", message: "Both URLs required." });
      return;
    }
    if (!urlA.startsWith("http") || !urlB.startsWith("http")) {
      setAlert({ type: "error", message: "URLs must begin with http(s)." });
      return;
    }

    setAlert({ type: "info", message: "Pulling transcripts. embedding chunks. stand by." });
    setLoading(true);
    setReady(false);
    setVideoData({ a: null, b: null });
    setSessionId(null);

    try {
      const res = await fetch(`${API}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url_a: urlA.trim(), url_b: urlB.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Ingest failed");
      }
      const data = await res.json();
      setVideoData({ a: data.video_a, b: data.video_b });
      setReady(true);
      setAlert({ type: "success", message: "Pipeline complete. Channel open." });
    } catch (err) {
      setAlert({ type: "error", message: String(err.message).toLowerCase() });
    } finally {
      setLoading(false);
    }
  }, [urlA, urlB]);

  return (
    <div className="relative min-h-screen text-bone overflow-hidden">
      {/* particle field sits at z=-1, body's bg-ink paints behind it */}
      <ParticleNetwork />

      {/* foreground overlays */}
      <Cursor />
      <div className="grain animate-grain-shift" />
      <div className="spotlight" />

      {/* NAV */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 md:px-10 py-5 flex items-center justify-between bg-ink/40 backdrop-blur-md border-b border-bone/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-red animate-pulse" />
          <span className="text-display font-bold tracking-widest text-sm">REELRAG</span>
          <span className="text-mono text-[10px] tracking-ultra text-bone/40 hidden md:inline">
            // SPEED ANALYTICS
          </span>
        </div>
        <nav className="flex items-center gap-2 md:gap-6 text-mono text-[10px] tracking-widest uppercase text-bone/60">
          <a href="#engine"   className="hover:text-bone transition-colors">Engine</a>
          <a href="#stats"    className="hover:text-bone transition-colors hidden md:inline">Telemetry</a>
          <a href="#analyze"  className="hover:text-bone transition-colors">Run</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="btn-ghost">
            <ArrowUpRight size={11} /> Repo
          </a>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative pt-44 pb-32 px-6 md:px-10 min-h-screen flex flex-col justify-center">
        <div className="lens-flare" />
        <GiantShape />

        <div className="relative z-10 max-w-6xl">
          <div className="text-mono text-[10px] tracking-ultra text-red mb-6 flex items-center gap-3 animate-fade-in">
            <span className="w-8 h-px bg-red" />
            <span>V1.0 // BUILT IN A WEEK</span>
          </div>

          <h1 className="text-display font-bold leading-[0.82] tracking-tightest text-[clamp(3.5rem,11vw,11rem)] uppercase">
            <span className="block animate-flicker glitch" data-text="REEL">
              <KineticText text="REEL" stagger={45} />
            </span>
            <span className="block text-red glow-red glitch" data-text="RAG.">
              <KineticText text="RAG." delay={400} stagger={45} />
            </span>
          </h1>

          <div className="mt-10 max-w-2xl">
            <p className="text-serif text-bone/70 text-lg md:text-xl leading-relaxed" data-reveal>
              Drop two videos. We pull transcripts, metadata, engagement signals, embed it all, retrieve the moments that matter, and stream answers that <em className="text-bone not-italic">cite the exact frame they came from</em>.
            </p>
          </div>

          <div className="mt-12 flex items-center gap-6 flex-wrap" data-reveal>
            <a href="#analyze" ref={analyzeRef} className="btn-red" data-magnetic>
              <Zap size={14} />
              <span>Run a Comparison</span>
            </a>
            <a href="#engine" className="text-mono text-[10px] tracking-ultra text-bone/50 hover:text-bone transition-colors">
              See how it works →
            </a>
          </div>

          {/* spec strip */}
          <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-px bg-bone/10" data-stagger>
            {[
              { k: "MODEL",     v: "GEMINI 2.5" },
              { k: "EMBED",     v: "BGE-SMALL" },
              { k: "STORE",     v: "CHROMADB" },
              { k: "LATENCY",   v: "STREAMING" },
            ].map((it) => (
              <div key={it.k} className="bg-ink p-5">
                <div className="text-mono text-[9px] tracking-widest text-bone/40 mb-2">{it.k}</div>
                <div className="text-display font-bold text-sm tracking-wider">{it.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* corner timestamp */}
        <div className="absolute bottom-8 right-6 md:right-10 text-mono text-[9px] tracking-ultra text-bone/30">
          TIMESTAMP // {new Date().toISOString().slice(0, 16)}Z
        </div>
      </section>

      {/* MARQUEE */}
      <Marquee
        items={["TRANSCRIPTS", "ENGAGEMENT", "VECTOR SEARCH", "GEMINI STREAM", "CITATIONS", "RETRIEVAL"]}
      />

      {/* ANALYZE / ENGINE */}
      <section id="analyze" className="relative px-6 md:px-10 py-32 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 mb-20">
          <div className="md:col-span-3" data-reveal>
            <div className="text-mono text-[10px] tracking-ultra text-red">[ 01 / RUN ]</div>
          </div>
          <div className="md:col-span-9">
            <h2 className="text-display font-bold uppercase text-5xl md:text-7xl leading-[0.9] tracking-tightest" data-reveal>
              Two URLs. <br />
              <span className="text-bone/40">One Verdict.</span>
            </h2>
          </div>
        </div>

        {/* input pane */}
        <div className="pane pane-red p-8 md:p-10 relative" data-reveal>
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {[
              { key: "A", val: urlA, set: setUrlA, plat: platformA, ph: "https://youtube.com/watch?v=…" },
              { key: "B", val: urlB, set: setUrlB, plat: platformB, ph: "https://instagram.com/p/…" },
            ].map(({ key, val, set, plat, ph }) => (
              <div key={key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-mono text-[10px] tracking-ultra text-bone/50 flex items-center gap-3">
                    <span className="text-red text-display font-bold text-3xl leading-none">{key}</span>
                    SOURCE / {key}
                  </label>
                  <span className="chip chip-red">{plat}</span>
                </div>
                <input
                  type="url"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  placeholder={ph}
                  className="input-cine"
                  disabled={loading}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <button
              onClick={handleAnalyze}
              disabled={loading || !urlA.trim() || !urlB.trim()}
              className="btn-red"
              data-magnetic
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              <span>{loading ? "Processing" : "Execute"}</span>
            </button>
            <Alert type={alert.type} message={alert.message} />
          </div>
        </div>

        {/* video cards */}
        {(videoData.a || videoData.b || loading) && (
          <div className="mt-16 grid md:grid-cols-2 gap-6" data-stagger>
            <VideoCard label="A" data={videoData.a} loading={loading} />
            <VideoCard label="B" data={videoData.b} loading={loading} />
          </div>
        )}
      </section>

      {/* stats, horizontal scroll */}
      <section id="stats" className="relative py-32 border-y border-bone/10">
        <div className="px-6 md:px-10 max-w-7xl mx-auto mb-16">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-3" data-reveal>
              <div className="text-mono text-[10px] tracking-ultra text-red">[ 02 / TELEMETRY ]</div>
            </div>
            <div className="md:col-span-9">
              <h2 className="text-display font-bold uppercase text-5xl md:text-7xl leading-[0.9] tracking-tightest" data-reveal>
                Numbers <br /><span className="text-bone/40">that lie less.</span>
              </h2>
              <p className="mt-6 text-serif text-bone/60 text-base md:text-lg max-w-2xl" data-reveal>
                Pure metadata pulled from yt-dlp & official APIs. No averages, no vanity counts. Drag the strip →
              </p>
            </div>
          </div>
        </div>

        <div className="h-snap overflow-x-auto scrollbar-none flex" data-reveal>
          <StatBlock index={1} value="0$"      label="EMBEDDING COST"      sub="BGE-small runs on your CPU. No vendor lock-in." />
          <StatBlock index={2} value="≤4s"     label="P95 STREAM LATENCY"  sub="First Gemini token reaches the UI in under four seconds." />
          <StatBlock index={3} value="300/50"  label="CHUNK / OVERLAP"     sub="Words per chunk. Tuned for retrieval signal without bleed." />
          <StatBlock index={4} value="∞"       label="SESSIONS"            sub="Each conversation is sandboxed. State doesn't leak across pairs." />
          <StatBlock index={5} value="2"       label="PLATFORMS"           sub="YouTube + Instagram. More on the roadmap." />
          <div className="shrink-0 w-32 md:w-64" />
        </div>
      </section>

      {/* CHAT PANEL */}
      <section className="relative px-6 md:px-10 py-32 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 mb-16">
          <div className="md:col-span-3" data-reveal>
            <div className="text-mono text-[10px] tracking-ultra text-red">[ 03 / CHANNEL ]</div>
          </div>
          <div className="md:col-span-9">
            <h2 className="text-display font-bold uppercase text-5xl md:text-7xl leading-[0.9] tracking-tightest" data-reveal>
              Ask. <span className="text-bone/40">It cites.</span>
            </h2>
          </div>
        </div>

        <div className="h-[640px]" data-reveal>
          <ChatPanel
            ready={ready}
            sessionId={sessionId}
            onSessionChange={setSessionId}
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-bone/10 py-16 px-6 md:px-10">
        <div className="max-w-7xl mx-auto">
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(245,245,240,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(245,245,240,0.04) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative grid md:grid-cols-12 gap-10">
            <div className="md:col-span-6">
              <div className="text-display font-bold uppercase text-6xl md:text-8xl leading-[0.85] tracking-tightest">
                Out <span className="text-red">/</span> end.
              </div>
              <div className="mt-6 text-mono text-[10px] tracking-ultra text-bone/40">
                MIT // BUILT WITH GEMINI, CHROMA, LANGCHAIN.
              </div>
            </div>
            <div className="md:col-span-3 text-mono text-[10px] tracking-widest text-bone/40 space-y-2">
              <div className="text-bone/60 mb-3 tracking-ultra">STACK</div>
              <div>FastAPI</div>
              <div>React + Vite</div>
              <div>ChromaDB</div>
              <div>BGE-small</div>
              <div>Gemini 2.5 Flash</div>
            </div>
            <div className="md:col-span-3 text-mono text-[10px] tracking-widest text-bone/40 space-y-2">
              <div className="text-bone/60 mb-3 tracking-ultra">SIGNALS</div>
              <div>Views · Likes · Comments</div>
              <div>Engagement Rate</div>
              <div>Transcript Embeddings</div>
              <div>Source Citations</div>
            </div>
          </div>

          <div className="relative mt-16 pt-8 border-t border-bone/10 flex items-center justify-between text-mono text-[9px] tracking-ultra text-bone/30">
            <span>© REELRAG // {new Date().getFullYear()}</span>
            <span>SCANNING THE FEED AT 24FPS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
