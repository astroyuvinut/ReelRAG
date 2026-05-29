# ReelRAG

A chatbot that helps social media creators compare two videos side by side. Paste two URLs (YouTube or Instagram), wait for it to grab the transcripts and metadata, and then have a normal conversation about both of them. Every answer cites which video and which chunk it came from.

I built this because most "AI video analyzers" out there just summarize one video at a time. If you're a creator and you want to know *why* one of your reels did 5x better than another, summarization doesn't really help. You need to compare. That's what this does.

## What it actually does

1. You give it two video URLs.
2. It pulls the transcript (YouTube captions API if available, otherwise Whisper on the audio).
3. It pulls real metadata via yt-dlp: views, likes, comments, follower count, hashtags, upload date, duration.
4. Computes engagement rate `(likes + comments) / views * 100`.
5. Splits each transcript into ~300-word chunks with 50-word overlap.
6. Embeds the chunks locally with BGE-small (no API calls, no cost).
7. Drops them into ChromaDB.
8. When you ask a question, it retrieves the 4 most relevant chunks, hands them to Gemini 2.5 Flash, and streams the answer back. Citations show up as little badges under the response.

## Stack

- Backend: FastAPI + Python
- Frontend: React (Vite) + Tailwind
- LLM: Gemini 2.5 Flash (free tier)
- Embeddings: BGE-small via sentence-transformers (runs on your CPU)
- Vector DB: ChromaDB, local
- Orchestration: LangChain
- Transcripts: youtube-transcript-api + yt-dlp + Whisper

All free. Zero paid services to start.

## Setup

You'll need:
- Python 3.10, 3.11, or 3.12 (3.13 works but you'll skip Whisper, which only matters for Instagram videos without captions)
- Node 18+
- ffmpeg on PATH if you want Instagram support (`winget install ffmpeg` on Windows, `brew install ffmpeg` on mac, `apt install ffmpeg` on Linux)
- A Gemini API key from https://aistudio.google.com/app/apikey (free tier is enough)

### Backend

```bash
cd videorag/backend
python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# mac/linux:
source venv/bin/activate

pip install -r requirements.txt
```

Make a `.env` file in `backend/` with your key:

```
GEMINI_API_KEY=AIza...your_key...
```

Then start it:

```bash
uvicorn main:app --reload --port 8000
```

API docs auto-generated at http://localhost:8000/docs

### Frontend

In another terminal:

```bash
cd videorag/frontend
npm install
npm run dev
```

Open http://localhost:5173

### Smoke test (optional)

If you want to verify ingest + embeddings without spending tokens, run this from `backend/`:

```bash
python test_pipeline.py "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

It'll download metadata, fetch the transcript, embed it, and run a query. Doesn't touch the LLM at all.

## How to use it

1. Paste a YouTube URL into Video A.
2. Paste another URL (YouTube or Instagram) into Video B.
3. Click Analyze Videos. First time takes ~30 to 60 seconds because of the BGE model download.
4. Both video cards show up with stats and engagement rates.
5. Use the chat panel. Try things like:
   - "Which video has better engagement and why?"
   - "Compare the hooks in the first 30 seconds"
   - "Which one is more likely to go viral?"

Every answer tags which video and which chunk it pulled from. Hover over the citation badges to see the chunk's source.

## Project layout

```
videorag/
  backend/
    main.py           FastAPI routes
    ingest.py         transcript + metadata fetching
    embedder.py       chunking + ChromaDB
    rag.py            LangChain chain, memory, streaming
    test_pipeline.py  smoke test, no LLM needed
    requirements.txt
  frontend/
    src/
      App.jsx         layout + URL form
      VideoCard.jsx   the stat cards
      ChatPanel.jsx   chat UI with streaming
    package.json
  .env.example
  README.md
```

## A few design choices that took some thought

**Why local ChromaDB instead of a hosted vector DB?** Because the dataset for any single chat session is tiny (a few hundred chunks max). Hosted DBs are overkill and cost money. If you wanted to run this for thousands of creators a day, you'd swap to Qdrant cloud, which is one line of code in `embedder.py`. Until then, save the money.

**Why BGE-small over OpenAI embeddings?** Same reason. BGE-small scores almost identically on the MTEB benchmark and runs on a laptop CPU in milliseconds. Zero cost, zero latency dependency on a third party.

**Why Gemini Flash over GPT-4o?** Free tier handles around 1500 requests a day, has a huge context window, and streams cleanly. For a demo or a small user base, it's the obvious pick.

**Why a custom SessionMemory class instead of LangChain's ConversationBufferMemory?** Honestly because the LangChain one got deprecated in 1.x and I needed something that wouldn't break next month. It's 12 lines. Not worth the dep churn.

**Why 300-word chunks?** Short enough to keep retrieval signal high, long enough to capture a full thought. The 50-word overlap means sentences cut at chunk boundaries still appear in full somewhere.

## Cost

Running it on your laptop right now:
- Gemini Flash: free tier
- Embeddings: local, free
- ChromaDB: local, free
- Whisper: local, free (when needed)

Total: 0 dollars per day, capped at ~1500 LLM calls.

At ~1000 creators per day (so ~6000 LLM calls if each chats a bit), you'd move to paid Gemini and Qdrant cloud, and the math works out to roughly $0.0001 per query. Less than a tenth of a cent. Easily a profitable SaaS at any reasonable price.

## API

| Method | Path             | What it does                              |
|--------|------------------|-------------------------------------------|
| GET    | /health          | sanity check                              |
| POST   | /ingest          | takes `{url_a, url_b}`, returns metadata  |
| GET    | /metadata        | metadata for the currently loaded pair    |
| POST   | /chat            | streams back text + citations             |
| DELETE | /session/{id}    | clears that session's memory              |

## Notes on Instagram

Instagram doesn't expose a captions API the way YouTube does, so we have to download the audio and run Whisper on it. That adds 30-60 seconds per video and needs ffmpeg installed. If ffmpeg isn't on PATH the code falls back to the post description, which usually still has enough text to be useful.

For private accounts you'd need to pass cookies via `INSTAGRAM_COOKIES_FILE`. Most public reels work without that.

## License

MIT, do what you want, just don't commit your API key.
