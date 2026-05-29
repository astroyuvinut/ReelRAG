import re
import logging

import chromadb
from sentence_transformers import SentenceTransformer

log = logging.getLogger(__name__)

CHUNK_SIZE = 300
OVERLAP = 50
COLLECTION = "videorag"

# load these once and keep them around
_model = None
_client = None
_collection = None


def get_model():
    global _model
    if _model is None:
        log.info("loading BGE-small...")
        _model = SentenceTransformer("BAAI/bge-small-en-v1.5")
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


def clear_collection():
    # wipe the store before every fresh ingest, otherwise old chunks bleed in
    global _collection
    get_collection()
    try:
        _client.delete_collection(COLLECTION)
        log.info("cleared old collection")
    except Exception:
        pass
    _collection = _client.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )


def embed_and_store(label, transcript, meta):
    if not transcript or not transcript.strip():
        log.warning("empty transcript for video %s, nothing to embed", label)
        return 0

    chunks = make_chunks(transcript)
    model = get_model()
    col = get_collection()

    docs, embs, metas, ids = [], [], [], []
    for i, chunk in enumerate(chunks):
        vec = model.encode(chunk, normalize_embeddings=True).tolist()
        docs.append(chunk)
        embs.append(vec)
        metas.append({
            "video_label": label,
            "chunk_index": i,
            "source_url": meta.get("source_url", ""),
            "creator": meta.get("creator", ""),
            "engagement_rate": float(meta.get("engagement_rate", 0.0)),
            "title": meta.get("title", ""),
            "platform": meta.get("platform", ""),
        })
        ids.append(f"video_{label}_chunk_{i}")

    col.upsert(ids=ids, documents=docs, embeddings=embs, metadatas=metas)
    log.info("stored %d chunks for video %s", len(chunks), label)
    return len(chunks)


def query_similar(question, n_results=4):
    model = get_model()
    col = get_collection()

    # BGE-small wants this prefix on queries (not on passages)
    q_vec = model.encode(
        f"Represent this sentence: {question}",
        normalize_embeddings=True,
    ).tolist()

    res = col.query(
        query_embeddings=[q_vec],
        n_results=n_results,
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
