import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, RotateCcw, Radio } from "lucide-react";

const API = "/api";

const SUGGESTIONS = [
  "Which video has better engagement and why?",
  "Compare the hooks in the first 30 seconds.",
  "What topics does each creator cover most?",
  "Which one is more likely to go viral?",
  "How does the tone differ between the two transcripts?",
];

function Citation({ c }) {
  const isA = c.video_label === "A";
  return (
    <span
      title={`"${c.title}" by ${c.creator} // engagement ${c.engagement_rate != null ? c.engagement_rate.toFixed(2) + "%" : "N/A"}`}
      className={`text-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 border cursor-default ${
        isA ? "border-red text-red" : "border-bone/30 text-bone/70"
      }`}
    >
      V{c.video_label} · CHUNK {c.chunk_index}
    </span>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`shrink-0 w-7 h-7 flex items-center justify-center text-display font-bold text-xs tracking-tightest ${
          isUser ? "bg-bone text-ink" : "bg-red text-ink"
        }`}
      >
        {isUser ? "U" : "RR"}
      </div>

      <div className={`max-w-[78%] flex flex-col gap-2 ${isUser ? "items-end" : ""}`}>
        <div
          className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-mono ${
            isUser
              ? "bg-bone/10 text-bone border-l-2 border-bone"
              : "bg-coal text-bone border-l-2 border-red"
          }`}
        >
          {msg.content || (
            <span className="inline-flex gap-2 items-center text-bone/40 text-mono text-xs tracking-widest uppercase">
              <Loader2 size={11} className="animate-spin" />
              receiving signal
            </span>
          )}
          {msg.isStreaming && msg.content && (
            <span className="inline-block w-1.5 h-3.5 bg-red ml-0.5 animate-pulse align-middle" />
          )}
        </div>

        {msg.citations?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.citations.map((c, i) => <Citation key={i} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel({ ready, sessionId, onSessionChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (q) => {
    if (!q.trim() || loading || !ready) return;
    setMessages((p) => [
      ...p,
      { role: "user", content: q },
      { role: "assistant", content: "", isStreaming: true, citations: [] },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, session_id: sessionId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "request failed");
      }
      const newSid = res.headers.get("X-Session-ID");
      if (newSid && newSid !== sessionId) onSessionChange(newSid);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", citations = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const sIdx = buf.indexOf("__CITATIONS__:");
        if (sIdx !== -1) {
          const text = buf.slice(0, sIdx).trimEnd();
          const json = buf.slice(sIdx + "__CITATIONS__:".length).trim();
          buf = text;
          try { citations = JSON.parse(json); } catch {}
        }
        setMessages((p) => {
          const u = [...p];
          u[u.length - 1] = { ...u[u.length - 1], content: buf, citations };
          return u;
        });
      }

      setMessages((p) => {
        const u = [...p];
        u[u.length - 1] = { ...u[u.length - 1], isStreaming: false, content: buf.trimEnd(), citations };
        return u;
      });
    } catch (e) {
      setMessages((p) => {
        const u = [...p];
        u[u.length - 1] = { ...u[u.length - 1], content: `Error: ${e.message}`, isStreaming: false };
        return u;
      });
    } finally {
      setLoading(false);
      taRef.current?.focus();
    }
  }, [loading, ready, sessionId, onSessionChange]);

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="pane pane-red h-full flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-bone/10 shrink-0">
        <div className="flex items-center gap-3">
          <Radio size={14} className="text-red animate-pulse" />
          <div>
            <div className="text-display font-bold text-sm tracking-widest uppercase">Reelrag // Channel</div>
            <div className="text-mono text-[9px] tracking-ultra text-bone/40 uppercase">
              Gemini 2.5 Flash · Streaming
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); onSessionChange(null); }}
            className="text-mono text-[9px] tracking-widest text-bone/40 hover:text-red uppercase flex items-center gap-1.5 transition-colors"
            title="Clear"
          >
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-8 py-12">
            <div className="text-center max-w-md">
              <div className="text-display font-bold text-3xl tracking-tightest uppercase mb-3">
                {ready ? "Channel open." : "Awaiting source."}
              </div>
              <div className="text-mono text-[10px] tracking-widest text-bone/40 uppercase">
                {ready ? "Ask anything. Responses cite their chunks." : "Run an analysis above to open the channel."}
              </div>
            </div>

            {ready && (
              <div className="w-full max-w-lg space-y-1.5">
                <div className="text-mono text-[9px] tracking-ultra text-bone/30 uppercase mb-2">
                  [ Prompts ]
                </div>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left px-4 py-3 bg-coal hover:bg-ash border-l-2 border-bone/10 hover:border-red text-mono text-xs text-bone/70 hover:text-bone transition-all flex items-center gap-3"
                  >
                    <span className="text-bone/30 tracking-widest">0{i + 1}</span>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => <Message key={i} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="px-5 py-4 border-t border-bone/10 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={!ready || loading}
            placeholder={ready ? "Transmit a question…" : "Channel closed."}
            className="input-cine resize-none min-h-[44px] max-h-32 overflow-y-auto leading-6"
            style={{ height: "44px" }}
            onInput={(e) => {
              e.target.style.height = "44px";
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!ready || loading || !input.trim()}
            className="btn-red h-[44px]"
            data-magnetic
            aria-label="Send"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <div className="mt-2 text-mono text-[9px] tracking-widest text-bone/30 uppercase text-center">
          Shift + Enter = Newline · Enter = Send
        </div>
      </div>
    </div>
  );
}
