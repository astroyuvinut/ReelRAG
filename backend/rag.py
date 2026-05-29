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

MAX_TURNS = 8  # keep last 8 exchanges, otherwise context blows up


@dataclass
class SessionMemory:
    messages: list = field(default_factory=list)

    def add_user(self, text):
        self.messages.append(HumanMessage(content=text))

    def add_ai(self, text):
        self.messages.append(AIMessage(content=text))

    def recent(self, max_turns=MAX_TURNS):
        # one turn = 1 user msg + 1 ai msg
        return self.messages[-(max_turns * 2):]


SYSTEM_PROMPT = """You are ReelRAG, a social media analyst.
You have transcript chunks from two videos: Video A and Video B.
Your job is to help creators compare and understand them.

Rules:
- Always say which video (A or B) you're pulling from.
- Mention engagement rate when talking about performance.
- Be specific and actionable, not vague.
- If the chunks don't really answer the question, say so. Don't make stuff up.
- Keep it readable: short paragraphs or bullets.
"""

# {session_id: SessionMemory}
sessions = {}


def get_memory(session_id):
    if session_id not in sessions:
        sessions[session_id] = SessionMemory()
    return sessions[session_id]


def build_context(hits):
    parts = []
    for h in hits:
        label = h["video_label"]
        idx = h["chunk_index"]
        eng = h["metadata"].get("engagement_rate", 0)
        title = h["metadata"].get("title", "")
        parts.append(
            f"[Video {label} | Chunk {idx} | \"{title}\" | Engagement: {eng:.2f}%]\n{h['text']}"
        )
    return "\n\n---\n\n".join(parts)


def format_citations(hits):
    return [
        {
            "video_label": h["video_label"],
            "chunk_index": h["chunk_index"],
            "title": h["metadata"].get("title", ""),
            "creator": h["metadata"].get("creator", ""),
            "engagement_rate": h["metadata"].get("engagement_rate", 0),
            "distance": round(h["distance"], 4),
        }
        for h in hits
    ]


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
    hits = query_similar(question, n_results=4)
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

    # citations come last so the frontend can split them off
    yield f"\n__CITATIONS__:{json.dumps(citations)}"


def clear_session(session_id):
    sessions.pop(session_id, None)
