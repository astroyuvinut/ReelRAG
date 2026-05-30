# ReelRAG

A chatbot that helps social media creators compare two videos side by side. Paste two URLs (YouTube or Instagram), wait for it to grab the transcripts and metadata, and then have a normal conversation about both of them. Every answer cites which video and which chunk it came from.

I built this because most "AI video analyzers" out there just summarize one video at a time. If you're a creator and you want to know *why* one of your reels did 5x better than another, summarization doesn't really help. You need to compare. That's what this does.

## What it actually does

1. You give it two video URLs.
2. It pulls the transcript (YouTube captions API if available, otherwise faster-whisper on the audio).
3. It pulls real metadata via yt-dlp: views, likes, comments, follower count, hashtags, upload date, duration.
4. Computes engagement rate `(likes + comments) / views * 100`. Instagram doesn't hand back view counts, so reels show N/A there and get compared by total interactions (likes + comments) instead.
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
- Transcripts: youtube-transcript-api + yt-dlp + faster-whisper

All free. Zero paid services to start.

## Setup

You'll need:
- Python 3.10+ (3.13 is fine, faster-whisper runs there)
- Node 18+
- ffmpeg on PATH for Instagram transcription (`winget install Gyan.FFmpeg` on Windows, `brew install ffmpeg` on mac, `apt install ffmpeg` on Linux). Open a fresh terminal after installing so PATH picks it up.
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

If you want Instagram to work, you also need login cookies — Instagram blocks
almost all reels for logged-out requests now. Export your cookies with a
"Get cookies.txt LOCALLY" browser extension while logged into instagram.com,
save the file as `backend/ig_cookies.txt`, and point `.env` at it:

```
IG_COOKIES_FILE=./ig_cookies.txt
```

YouTube needs none of this. Without the cookies, Instagram ingests will just
come back empty and the card falls back to the post description.

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

## How to use it

1. Paste a YouTube URL into Video A.
2. Paste another URL (YouTube or Instagram) into Video B.
3. Click Execute. First time takes ~30 to 60 seconds because of the BGE (and, for Instagram, faster-whisper) model download.
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
- faster-whisper: local, free (only runs for Instagram)

Total: 0 dollars per day, capped at ~1500 Gemini calls on the free tier.

## Scaling to 1000 creators a day

Nothing here has to change to handle one user. The interesting question is what
breaks at ~1000 creators a day (call it ~6000 chat calls if each person asks a
handful of questions), and what you swap in for each piece:

- **LLM** — the Gemini free tier caps at ~1500 calls/day, so you'd move to paid
  Gemini Flash. It's cheap: a typical query here is ~2-3k input tokens (4 chunks
  + history + system) and a few hundred out, which lands around **$0.001-0.002
  per query**. 6000 calls is roughly $6-12/day. The model name doesn't change,
  just the billing.
- **Vector DB** — ChromaDB is local and single-process, which is fine for one
  laptop but not a fleet. Swap to **Qdrant cloud** (or pgvector). It's basically
  one line in `embedder.py` where the client is created.
- **Memory** — sessions live in an in-process dict right now (`rag.py`), so they
  die on restart and don't share across workers. Move them to **Redis** keyed by
  `session_id` and it survives restarts and scales horizontally.
- **Transcription** — faster-whisper on Instagram audio is the slow part (~30-60s
  per reel). At volume you'd pull it out of the request path into a background
  worker / queue so ingest returns fast and transcripts fill in async.

So the per-query cost at scale is dominated by the LLM, ~$0.001-0.002. Everything
else (embeddings, retrieval) stays effectively free because BGE-small runs on
your own hardware. Comfortably a profitable SaaS at any reasonable price.

## API

| Method | Path             | What it does                              |
|--------|------------------|-------------------------------------------|
| GET    | /health          | sanity check                              |
| POST   | /ingest          | takes `{url_a, url_b}`, returns metadata  |
| GET    | /metadata        | metadata for the currently loaded pair    |
| POST   | /chat            | streams back text + citations             |
| DELETE | /session/{id}    | clears that session's memory              |

## Notes on Instagram

Instagram is the awkward one. Three things to know:

**Login is required.** Instagram now blocks almost every reel for logged-out
requests, even public ones. So yt-dlp needs your cookies (see the setup section)
or the ingest comes back empty. YouTube has no such requirement.

**No captions API.** Unlike YouTube there's no transcript endpoint, so we
download the audio and run faster-whisper on it. That adds ~30-60 seconds per
reel and needs ffmpeg on PATH. If ffmpeg or the cookies are missing, the code
falls back to the post description instead of crashing.

**No view counts.** Instagram doesn't expose views through yt-dlp, and the
engagement formula needs them, so reels show engagement as **N/A** and get
compared by total interactions (likes + comments) instead. There's an optional
instaloader fallback to try and recover the view count — flip `IG_FETCH_VIEWS=1`
in `.env` to enable it — but Instagram currently blocks instaloader's API too,
so it's off by default and the honest N/A is what you'll usually see.

## License

MIT, do what you want, just don't commit your API key.
