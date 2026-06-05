import re
import logging

import chromadb
from fastembed import TextEmbedding

log = logging.getLogger(__name__)

CHUNK_SIZE = 300
OVERLAP = 50
COLLECTION = "videorag"

_model = None
_client = None
_collection = None


def get_model():
    global _model
    if _model is None:
        log.info("loading BGE-small...")
        _model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _model


def get_collection():
    global _client, _collection
    if _client is None:
        _client = chromadb.PersistentClient(path="./chroma_store")
    if _collection is None:
        _collection = _client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def tokenize(text):
    return re.findall(r"\S+", text)


def make_chunks(text):
    words = tokenize(text)
    chunks = []
    i = 0
    while i < len(words):
        end = min(i + CHUNK_SIZE, len(words))
        chunks.append(" ".join(words[i:end]))
        if end == len(words):
            break
        i += CHUNK_SIZE - OVERLAP
    return chunks


def clear_session_data(session_id):
    # drop just this workspace's chunks, not everyone's. two people (or two of
    # your own devices) can have their own pair of videos at the same time.
    col = get_collection()
    try:
        col.delete(where={"session_id": session_id})
        log.info("cleared chunks for session %s", session_id)
    except Exception as e:
        log.warning("clear for session %s failed: %s", session_id, e)


def embed_and_store(label, transcript, meta, session_id):
    if not transcript or not transcript.strip():
        log.warning("empty transcript for video %s, nothing to embed", label)
        return 0

    chunks = make_chunks(transcript)
    model = get_model()
    col = get_collection()

    eng = meta.get("engagement_rate")
    eng_val = float(eng) if eng is not None else -1.0

    vectors = list(model.embed(chunks))

    docs, embs, metas, ids = [], [], [], []
    for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
        docs.append(chunk)
        embs.append(vec.tolist())
        metas.append({
            "session_id": session_id,
            "video_label": label,
            "chunk_index": i,
            "source_url": meta.get("source_url", ""),
            "creator": meta.get("creator", ""),
            "engagement_rate": eng_val,
            "total_interactions": int(meta.get("total_interactions", 0)),
            "title": meta.get("title", ""),
            "platform": meta.get("platform", ""),
        })
        ids.append(f"{session_id}_video_{label}_chunk_{i}")

    col.upsert(ids=ids, documents=docs, embeddings=embs, metadatas=metas)
    log.info("stored %d chunks for video %s (session %s)", len(chunks), label, session_id)
    return len(chunks)


def query_similar(question, session_id, n_results=4):
    model = get_model()
    col = get_collection()

    q_vec = list(model.query_embed(question))[0].tolist()

    res = col.query(
        query_embeddings=[q_vec],
        n_results=n_results,
        where={"session_id": session_id},
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for doc, m, d in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        hits.append({
            "text": doc,
            "video_label": m.get("video_label", "?"),
            "chunk_index": m.get("chunk_index", -1),
            "metadata": m,
            "distance": d,
        })
    return hits
