import uuid
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from dotenv import load_dotenv

from ingest import ingest_pair
from embedder import embed_and_store, clear_collection
from rag import stream_answer, clear_session

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="ReelRAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stored = {}


class IngestRequest(BaseModel):
    url_a: str
    url_b: str

    @field_validator("url_a", "url_b")
    @classmethod
    def check_url(cls, v):
        v = v.strip()
        if not v.startswith("http"):
            raise ValueError("URL must start with http or https")
        return v


class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/ingest")
async def ingest(req: IngestRequest):
    global stored
    log.info("ingest: %s | %s", req.url_a, req.url_b)

    try:
        pair = ingest_pair(req.url_a, req.url_b)
    except Exception as e:
        log.error("ingest failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Ingest error: {e}")

    va, vb = pair["video_a"], pair["video_b"]

    clear_collection()

    try:
        n_a = embed_and_store("A", va["transcript"], va["metadata"])
        n_b = embed_and_store("B", vb["transcript"], vb["metadata"])
    except Exception as e:
        log.error("embedding failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")

    stored = {
        "video_a": {**va["metadata"], "chunks_stored": n_a},
        "video_b": {**vb["metadata"], "chunks_stored": n_b},
    }

    return {"success": True, **stored}


@app.get("/metadata")
async def metadata():
    if not stored:
        raise HTTPException(status_code=404, detail="No videos ingested yet.")
    return stored


@app.post("/chat")
async def chat(req: ChatRequest):
    if not stored:
        raise HTTPException(
            status_code=400,
            detail="Please ingest two videos first via POST /ingest.",
        )

    q = req.question.strip()
    if not q:
        raise HTTPException(status_code=422, detail="Question cannot be empty.")

    sid = req.session_id or str(uuid.uuid4())

    async def gen():
        async for tok in stream_answer(q, sid):
            yield tok

    return StreamingResponse(
        gen(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Session-ID": sid},
    )


@app.delete("/session/{session_id}")
async def reset_session(session_id: str):
    clear_session(session_id)
    return {"cleared": session_id}
