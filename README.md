# ReelRAG

A chatbot for comparing two videos side by side. Paste two URLs (YouTube or Instagram), give it a few seconds to grab the transcripts and metadata, then just talk to it about both videos. Every answer tells you which video and which chunk it pulled from.

I made this because most "AI video analyzers" only summarize one video at a time. But if you're a creator trying to figure out why one of your reels did 5x better than another, a summary doesn't help much. You need to actually compare the two. That's the whole point of this.

## What it does

1. You give it two video URLs.
2. It grabs the transcript (YouTube captions API if there is one, otherwise faster-whisper on the audio).
3. It pulls real metadata with yt-dlp: views, likes, comments, follower count, hashtags, upload date, duration.
4. Computes engagement rate as `(likes + comments) / views * 100`. Instagram doesn't give back view counts, so reels just show N/A there and get compared by total interactions (likes + comments) instead.
5. Splits each transcript into ~300-word chunks with a 50-word overlap.
6. Embeds the chunks locally with BGE-small. No API calls, no cost.
7. Dumps them into ChromaDB.
8. When you ask something, it retrieves the 4 most relevant chunks, sends them to Gemini 2.5 Flash, and streams the answer back. Citations show up as little badges under the response.

## Stack

- Backend: FastAPI + Python
- Frontend: React (Vite) + Tailwind
- LLM: Gemini 2.5 Flash (free tier)
- Embeddings: BGE-small via fastembed / onnxruntime (runs on CPU, no torch needed)
- Vector DB: ChromaDB, local
- Orchestration: LangChain
- Transcripts: youtube-transcript-api + yt-dlp + faster-whisper

Everything's free. No paid services to get started.

## Setup

You'll need:
- Python 3.10+ (3.13 works fine, faster-whisper runs there)
- Node 18+
- ffmpeg on your PATH for Instagram transcription (`winget install Gyan.FFmpeg` on Windows, `brew install ffmpeg` on mac, `apt install ffmpeg` on Linux). Open a fresh terminal after installing so it picks up the PATH change.
- A Gemini API key from https://aistudio.google.com/app/apikey (free tier is plenty)

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

Create a `.env` file inside `backend/` with your key:
GEMINI_API_KEY=AIza...your_key...

If you want Instagram to work, you'll also need login cookies. Instagram blocks pretty much every reel for logged-out requests now, even public ones. Export your cookies using a "Get cookies.txt LOCALLY" browser extension while you're logged into instagram.com, save the file as `backend/ig_cookies.txt`, and point `.env` at it:
IG_COOKIES_FILE=./ig_cookies.txt

YouTube doesn't need any of this. Without the cookies, Instagram ingests just come back empty and the card falls back to the post description.

Then start it:

```bash
uvicorn main:app --reload --port 8000
```

API docs get auto-generated at http://localhost:8000/docs

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
3. Hit Execute. The first run takes about 30 to 60 seconds because of the BGE model download (and faster-whisper too, if it's an Instagram reel).
4. Both video cards show up with their stats and engagement rates.
5. Use the chat panel. Stuff you can ask:
   - "Which video has better engagement and why?"
   - "Compare the hooks in the first 30 seconds"
   - "Which one is more likely to go viral?"

Every answer tags which video and which chunk it came from. Hover over the citation badges to see the source chunk.

## Project layout
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

## Some design decisions worth explaining

**Why local ChromaDB instead of a hosted vector DB?** Because the dataset for one chat session is tiny, a few hundred chunks at most. A hosted DB is overkill and costs money for no reason. If you ever wanted to run this for thousands of creators a day you'd switch to Qdrant cloud, which is basically one line in `embedder.py`. Until then, save the money.

**Why BGE-small and not OpenAI embeddings?** Same reason. BGE-small scores almost the same on the MTEB benchmark and runs on a laptop CPU in milliseconds. No cost, and you're not depending on a third party for latency.

**Why Gemini Flash over GPT-4o?** The free tier gives you around 1500 requests a day, has a massive context window, and streams cleanly. For a demo or a small user base it's an easy call.

**Why a custom SessionMemory class instead of LangChain's ConversationBufferMemory?** Honestly just because the LangChain one got deprecated in 1.x and I wanted something that wasn't going to break next month. It's 12 lines, not worth the dependency churn.

**Why not RetrievalQA / ConversationalRetrievalChain?** Same deal, those chains are on their way out in LangChain 1.x. On top of that they make token streaming and custom citation payloads a pain because they want to control the output format. So I kept the LangChain pieces that actually pull their weight (the Gemini wrapper, the message types) and just wrote the retrieve → build context → stream loop myself in `rag.py`. It's the same RAG flow (top-4 from Chroma, system prompt, memory, streamed answer), just without the chain abstraction fighting me on the citation badges.

**Why 300-word chunks?** Short enough that retrieval stays sharp, long enough to hold a complete thought. The 50-word overlap means a sentence that gets cut at a chunk boundary still shows up in full somewhere.

## Deploy (Render)

There's a `render.yaml` in the repo root that spins up both halves: the FastAPI backend as a Docker web service, and the React build as a static site on Render's CDN.

1. Push to GitHub (already done if you're reading this).
2. On Render: New → Blueprint, point it at this repo. It reads `render.yaml` and creates two services, `reelrag-api` and `reelrag-web`.
3. Add your `GEMINI_API_KEY` to the `reelrag-api` service. It's marked `sync: false` so it stays in the dashboard and never touches git.
4. The first deploy takes a few minutes since the image installs ffmpeg and the backend downloads the BGE model on the first request.

The frontend finds the backend through the `VITE_API_BASE` build variable, which is already wired up in `render.yaml` to the api service's URL. If you rename the api service, you just change that one line.

Two things to be honest about:
- Swapping sentence-transformers for fastembed (onnxruntime, no torch) is what lets this fit on Render's smaller instances instead of OOM-ing.
- Neither YouTube nor Instagram works straight from the cloud. Render runs on datacenter IPs and both sites block those. YouTube throws up a "confirm you're not a bot" wall (and kills any cookies you give it, since they're coming from a datacenter IP), and Instagram blocks logged-out reels outright. Metadata might sneak through with a proxy, but transcripts won't. The fix is the tunnel below.

### Live demo with a Cloudflare tunnel

The reliable free way to demo this is to keep the backend on your own machine (residential IP, which the sites don't block) and let the Render-hosted frontend talk to it through a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/).
winget install Cloudflare.cloudflared   # one time
videorag\start_live.bat                  # starts backend + tunnel

`start_live.bat` boots the backend on `127.0.0.1:8000`, opens a tunnel, and prints (and copies) a `https://<random>.trycloudflare.com` URL. The frontend reaches the backend through `VITE_API_BASE`, so point it at that URL and redeploy the static site.

The annoying part of a quick tunnel: the URL changes every time you restart it, and since `VITE_API_BASE` gets baked in at build time, each new URL means a fresh frontend build with the cache cleared. To avoid doing that by hand, copy `.render.example` to `.render`, drop in a Render API key and the `reelrag-web` service id, and the script will update the env var and trigger a clear-cache redeploy for you. Keep the terminal open while you demo, because if the tunnel dies you get a new URL. If you want a permanent URL instead of a random one, set up a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (needs a free Cloudflare account and a domain).

## Cost
  Running it on your laptop right now:
- Gemini Flash: free tier
- Embeddings: local, free
- ChromaDB: local, free
- faster-whisper: local, free (only runs for Instagram)

So, 0 dollars a day, capped at around 1500 Gemini calls on the free tier.

## Scaling to 1000 creators a day
Nothing here needs to change to handle a single user. The more interesting question is what breaks at ~1000 creators a day (call it ~6000 chat calls if everyone asks a handful of questions), and what you'd swap in for each piece:

- LLM: the Gemini free tier caps at ~1500 calls/day, so you'd move to paid Gemini Flash. It's cheap. A typical query here is about 2-3k input tokens (4 chunks + history + system) and a few hundred out, which works out to roughly $0.001 to $0.002 per query. 6000 calls is around $6-12/day. The model name doesn't change, just the billing.
- Vector DB: ChromaDB is local and single-process, fine for one laptop but not a fleet. Swap to Qdrant cloud (or pgvector). It's basically one line in `embedder.py` where the client gets created.
- Memory: sessions live in an in-process dict right now (`rag.py`), so they die on restart and don't share across workers. Move them to Redis keyed by `session_id` and they survive restarts and scale horizontally.
- Transcription: faster-whisper on Instagram audio is the slow bit (~30-60s per reel). At volume you'd pull it out of the request path into a background worker/queue so ingest returns fast and transcripts fill in async.

So at scale the per-query cost is basically all LLM, around $0.001 to $0.002. Everything else (embeddings, retrieval) stays effectively free since BGE-small runs on your own hardware. Comfortably a profitable SaaS at any reasonable price.

## API

| Method | Path             | What it does                              |
|--------|------------------|-------------------------------------------|
| GET    | /health          | sanity check                              |
| POST   | /ingest          | takes `{url_a, url_b}`, returns metadata  |
| GET    | /metadata        | metadata for the currently loaded pair    |
| POST   | /chat            | streams back text + citations             |
| DELETE | /session/{id}    | clears that session's memory              |

## Notes on Instagram
Instagram is the awkward one here. Three things to know:

Login is required. Instagram now blocks almost every reel for logged-out requests, even public ones, so yt-dlp needs your cookies (see setup) or the ingest comes back empty. YouTube has no such requirement.

No captions API. Unlike YouTube there's no transcript endpoint, so we download the audio and run faster-whisper on it. That adds ~30-60 seconds per reel and needs ffmpeg on PATH. If ffmpeg or the cookies are missing, the code falls back to the post description instead of just crashing.

No view counts. Instagram doesn't expose views through yt-dlp, and the engagement formula needs them, so reels show engagement as N/A and get compared by total interactions (likes + comments) instead. There's an optional instaloader fallback to try and recover the view count (flip `IG_FETCH_VIEWS=1` in `.env` to turn it on), but Instagram currently blocks instaloader's API too, so it's off by default and the honest N/A is usually what you'll see.

## License
MIT, do whatever you want with it. Just don't commit your API key.