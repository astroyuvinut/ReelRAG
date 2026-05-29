import os
import re
import shutil
import tempfile
import logging
from urllib.parse import urlparse

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

log = logging.getLogger(__name__)

# the youtube-transcript-api lib changed its api at v1.0
# v0.x had static methods, v1.x needs an instance. handle both.
try:
    _NEW_API = callable(getattr(YouTubeTranscriptApi(), "fetch", None))
except TypeError:
    _NEW_API = False


def is_youtube(url):
    host = urlparse(url).netloc
    return "youtube.com" in host or "youtu.be" in host


def is_instagram(url):
    return "instagram.com" in urlparse(url).netloc


def get_youtube_id(url):
    # covers normal watch URLs, shorts, embed and youtu.be
    patterns = [
        r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})",
        r"(?:embed/)([A-Za-z0-9_-]{11})",
        r"(?:shorts/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def _join_snippets(raw):
    # v1.x returns FetchedTranscript with .snippets
    snippets = getattr(raw, "snippets", None)
    if snippets is not None:
        return " ".join(getattr(s, "text", "") for s in snippets)
    # v0.x returned plain list of dicts
    if isinstance(raw, list):
        return " ".join(item.get("text", "") for item in raw)
    return ""


def get_youtube_transcript(video_id):
    if _NEW_API:
        try:
            api = YouTubeTranscriptApi()
            return _join_snippets(api.fetch(video_id, languages=["en"]))
        except (NoTranscriptFound, TranscriptsDisabled):
            pass
        except Exception as e:
            log.warning("fetch failed for %s: %s", video_id, e)

        # try any language as last resort
        try:
            api = YouTubeTranscriptApi()
            for t in api.list(video_id):
                return _join_snippets(t.fetch())
        except Exception as e:
            log.warning("list_transcripts failed: %s", e)
        return ""

    # legacy path
    try:
        raw = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        return _join_snippets(raw)
    except (NoTranscriptFound, TranscriptsDisabled):
        pass
    except Exception as e:
        log.warning("legacy api failed: %s", e)

    try:
        for t in YouTubeTranscriptApi.list_transcripts(video_id):
            return _join_snippets(t.fetch())
    except Exception as e:
        log.warning("list_transcripts failed: %s", e)
    return ""


def get_metadata(url):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return info or {}


def whisper_transcribe(url):
    # whisper needs ffmpeg. bail out cleanly if not installed.
    if shutil.which("ffmpeg") is None:
        log.warning("ffmpeg not on PATH. skipping whisper. install with choco/brew/apt.")
        return ""

    try:
        import whisper
    except ImportError:
        log.warning("openai-whisper not installed. skipping audio transcription.")
        return ""

    with tempfile.TemporaryDirectory() as tmp:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio/best",
            "outtmpl": os.path.join(tmp, "audio.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        files = [f for f in os.listdir(tmp) if f.endswith(".mp3")]
        if not files:
            return ""
        model = whisper.load_model("base")
        result = model.transcribe(os.path.join(tmp, files[0]), fp16=False)
        return result.get("text", "")


def normalize_metadata(info, url):
    views = info.get("view_count") or 0
    likes = info.get("like_count") or 0
    comments = info.get("comment_count") or 0
    followers = info.get("channel_follower_count") or info.get("uploader_follower_count") or 0
    duration = info.get("duration") or 0

    raw_date = info.get("upload_date") or ""
    if len(raw_date) == 8:
        upload_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
    else:
        upload_date = raw_date

    tags = info.get("tags") or []
    if isinstance(tags, list):
        tags = [str(t) for t in tags[:20]]

    # engagement = (likes + comments) / views * 100
    eng = round((likes + comments) / views * 100, 4) if views > 0 else 0.0

    thumb = info.get("thumbnail") or ""
    if not thumb and isinstance(info.get("thumbnails"), list) and info["thumbnails"]:
        thumb = info["thumbnails"][-1].get("url", "")

    return {
        "source_url": url,
        "title": info.get("title") or "Untitled",
        "creator": info.get("uploader") or info.get("channel") or "Unknown",
        "thumbnail": thumb,
        "views": views,
        "likes": likes,
        "comments": comments,
        "followers": followers,
        "duration": duration,
        "upload_date": upload_date,
        "hashtags": tags,
        "engagement_rate": eng,
        "platform": "youtube" if is_youtube(url) else "instagram",
    }


def ingest_video(url, label):
    url = url.strip()
    log.info("ingesting %s: %s", label, url)

    info = get_metadata(url)
    meta = normalize_metadata(info, url)
    meta["video_label"] = label

    if is_youtube(url):
        vid = get_youtube_id(url)
        transcript = get_youtube_transcript(vid) if vid else ""
        if not transcript:
            log.info("no captions found, trying whisper")
            transcript = whisper_transcribe(url)
    else:
        # instagram has no public captions api, go straight to whisper
        transcript = whisper_transcribe(url)

    if not transcript:
        # last-resort fallback so chat still has something to work with
        transcript = meta.get("description") or info.get("description") or ""
        log.warning("no transcript for %s, falling back to description", url)

    return {"video_label": label, "metadata": meta, "transcript": transcript}


def ingest_pair(url_a, url_b):
    return {
        "video_a": ingest_video(url_a, "A"),
        "video_b": ingest_video(url_b, "B"),
    }
