import os
import json
import logging
from dataclasses import dataclass, field

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from embedder import query_similar

load_dotenv()
log = logging.getLogger(__name__)

MAX_TURNS = 8


@dataclass
class SessionMemory:
    messages: list = field(default_factory=list)

    def add_user(self, text):
        self.messages.append(HumanMessage(content=text))

    def add_ai(self, text):
        self.messages.append(AIMessage(content=text))

    def recent(self, max_turns=MAX_TURNS):
        return self.messages[-(max_turns * 2):]


SYSTEM_PROMPT = """You are ReelRAG, a social media analyst.
You have transcript chunks from two videos: Video A and Video B.
Your job is to help creators compare and understand them.

Rules:
- Always say which video (A or B) you're pulling from.
- Mention engagement rate when talking about performance.
- Engagement rate needs views, and Instagram doesn't give us views, so it shows
  "N/A". Don't call that 0% or say the videos are "equal" because both read 0 --
  that's just missing data. When the rate is N/A, compare total interactions
  (likes + comments) instead and mention views aren't available.
- Be specific and actionable, not vague.
- If the chunks don't really answer the question, say so. Don't make stuff up.
- Keep it readable: short paragraphs or bullets.
"""

sessions = {}


def get_memory(session_id):
    if session_id not in sessions:
        sessions[session_id] = SessionMemory()
    return sessions[session_id]


def _eng_label(meta):
    eng = meta.get("engagement_rate", -1)
    ti = meta.get("total_interactions", 0)
    if eng is not None and eng >= 0:
        return f"Engagement: {eng:.2f}%"
    return f"Engagement: N/A (views unavailable) | {ti:,} total interactions"


def build_context(hits):
    parts = []
    for h in hits:
        label = h["video_label"]
        idx = h["chunk_index"]
        title = h["metadata"].get("title", "")
        parts.append(
            f"[Video {label} | Chunk {idx} | \"{title}\" | {_eng_label(h['metadata'])}]\n{h['text']}"
        )
    return "\n\n---\n\n".join(parts)


def format_citations(hits):
    out = []
    for h in hits:
        eng = h["metadata"].get("engagement_rate", -1)
        out.append({
            "video_label": h["video_label"],
            "chunk_index": h["chunk_index"],
            "title": h["metadata"].get("title", ""),
            "creator": h["metadata"].get("creator", ""),
            "engagement_rate": eng if (eng is not None and eng >= 0) else None,
            "total_interactions": h["metadata"].get("total_interactions", 0),
            "distance": round(h["distance"], 4),
        })
    return out


def get_llm():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise EnvironmentError("GEMINI_API_KEY not set in .env")
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=key,
        streaming=True,
        temperature=0.3,
        max_output_tokens=1024,
    )


async def stream_answer(question, session_id):
    hits = query_similar(question, session_id, n_results=4)
    context = build_context(hits)
    citations = format_citations(hits)

    mem = get_memory(session_id)

    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    msgs.extend(mem.recent())
    msgs.append(HumanMessage(content=(
        f"Relevant transcript excerpts:\n\n{context}\n\n"
        f"---\n\nCreator question: {question}"
    )))

    llm = get_llm()
    full = ""

    try:
        async for chunk in llm.astream(msgs):
            tok = chunk.content
            if tok:
                full += tok
                yield tok
    except Exception as e:
        log.error("llm stream failed: %s", e)
        yield f"\n[Error: {e}]"
        return

    mem.add_user(question)
    mem.add_ai(full)

    yield f"\n__CITATIONS__:{json.dumps(citations)}"


def clear_session(session_id):
    sessions.pop(session_id, None)
