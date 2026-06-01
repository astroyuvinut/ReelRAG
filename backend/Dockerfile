# slim python base + ffmpeg for the instagram audio path
FROM python:3.12-slim

# ffmpeg is what yt-dlp/faster-whisper use to pull and decode audio
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps first so docker can cache this layer between code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# render injects $PORT at runtime; fall back to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
