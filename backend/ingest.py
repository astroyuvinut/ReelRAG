import os
import re
import shutil
import tempfile
import logging
from urllib.parse import urlparse
from http.cookiejar import MozillaCookieJar

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

log = logging.getLogger(__name__)


class FetchError(Exception):
    pass


def _proxy_url():
    return os.getenv("PROXY_URL", "").strip()


def _blocked_msg(url, detail):
    where = "youtube" if is_youtube(url) else "instagram" if is_instagram(url) else "this source"
    if _proxy_url():
        hint = " the proxy may be down or out of quota."
    else:
        hint = " set a residential PROXY_URL on the host so it isn't seen as a datacenter bot."
    return f"couldn't pull {where} data, likely an IP block.{hint} [{detail}]"


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
    snippets = getattr(raw, "snippets", None)
    if snippets is not None:
        return " ".join(getattr(s, "text", "") for s in snippets)
    if isinstance(raw, list):
        return " ".join(item.get("text", "") for item in raw)
    return ""


def _transcript_api():
    proxy = _proxy_url()
    if proxy:
        from youtube_transcript_api.proxies import GenericProxyConfig
        return YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(http_url=proxy, https_url=proxy)
        )
    return YouTubeTranscriptApi()


def _legacy_proxies():
    proxy = _proxy_url()
    return {"http": proxy, "https": proxy} if proxy else None


def get_youtube_transcript(video_id):
    if _NEW_API:
        try:
            api = _transcript_api()
            return _join_snippets(api.fetch(video_id, languages=["en"]))
        except (NoTranscriptFound, TranscriptsDisabled):
            pass
        except Exception as e:
            log.warning("fetch failed for %s: %s", video_id, e)

        try:
            api = _transcript_api()
            for t in api.list(video_id):
                return _join_snippets(t.fetch())
        except Exception as e:
            log.warning("list_transcripts failed: %s", e)
        return ""

    try:
        raw = YouTubeTranscriptApi.get_transcript(
            video_id, languages=["en"], proxies=_legacy_proxies()
        )
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


def _ig_cookie_opts():
    cookie_file = os.getenv("IG_COOKIES_FILE", "").strip()
    if cookie_file and os.path.exists(cookie_file):
        return {"cookiefile": cookie_file}
    browser = os.getenv("IG_COOKIES_BROWSER", "").strip()
    if browser:
        return {"cookiesfrombrowser": (browser,)}
    return {}


def _ydl_opts(url, extra=None):
    opts = {
        "quiet": True,
        "no_warnings": True,
    }
    proxy = _proxy_url()
    if proxy:
        opts["proxy"] = proxy
    if is_instagram(url):
        opts.update(_ig_cookie_opts())
    if extra:
        opts.update(extra)
    return opts


def get_metadata(url):
    opts = _ydl_opts(url, {"skip_download": True, "extract_flat": False})
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        log.warning("metadata extract failed for %s: %s", url, e)
        raise FetchError(_blocked_msg(url, e))
    if not info:
        raise FetchError(_blocked_msg(url, "empty response"))
    return info


def _instagram_shortcode(url):
    m = re.search(r"/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


def _instagram_views(url):
    if os.getenv("IG_FETCH_VIEWS", "").strip() not in ("1", "true", "yes"):
        return None
    shortcode = _instagram_shortcode(url)
    if not shortcode:
        return None
    try:
        import instaloader
    except ImportError:
        return None
    try:
        loader = instaloader.Instaloader(quiet=True, max_connection_attempts=1)
        cookie_file = os.getenv("IG_COOKIES_FILE", "").strip()
        if cookie_file and os.path.exists(cookie_file):
            jar = MozillaCookieJar(cookie_file)
            jar.load(ignore_discard=True, ignore_expires=True)
            for c in jar:
                loader.context._session.cookies.set_cookie(c)
            who = loader.test_login()
            if who:
                loader.context.username = who
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
        return post.video_view_count or post.video_play_count or None
    except Exception as e:
        log.warning("instaloader view fetch failed for %s: %s", url, e)
        return None


_FW_MODEL = None


def _get_fw_model():
    global _FW_MODEL
    if _FW_MODEL is None:
        from faster_whisper import WhisperModel
        size = os.getenv("WHISPER_MODEL", "base")
        _FW_MODEL = WhisperModel(size, device="cpu", compute_type="int8")
    return _FW_MODEL


def whisper_transcribe(url):
    if shutil.which("ffmpeg") is None:
        log.warning("ffmpeg not on PATH. skipping transcription. install ffmpeg first.")
        return ""

    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError:
        log.warning("faster-whisper not installed. skipping audio transcription.")
        return ""

    try:
        with tempfile.TemporaryDirectory() as tmp:
            opts = _ydl_opts(url, {
                "format": "bestaudio/best",
                "outtmpl": os.path.join(tmp, "audio.%(ext)s"),
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }],
            })
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            files = [f for f in os.listdir(tmp) if f.endswith(".mp3")]
            if not files:
                return ""
            model = _get_fw_model()
            segments, _ = model.transcribe(os.path.join(tmp, files[0]))
            return " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as e:
        log.warning("transcription failed for %s: %s", url, e)
        return ""


def normalize_metadata(info, url):
    views = info.get("view_count") or info.get("play_count") or 0
    likes = info.get("like_count") or 0
    comments = info.get("comment_count") or 0
    followers = info.get("channel_follower_count") or info.get("uploader_follower_count") or 0

    if views == 0 and is_instagram(url):
        views = _instagram_views(url) or 0
    duration = info.get("duration") or 0

    raw_date = info.get("upload_date") or ""
    if len(raw_date) == 8:
        upload_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
    else:
        upload_date = raw_date

    tags = info.get("tags") or []
    if isinstance(tags, list):
        tags = [str(t) for t in tags[:20]]

    total_interactions = likes + comments

    eng = round(total_interactions / views * 100, 4) if views > 0 else None

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
        "total_interactions": total_interactions,
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
        transcript = whisper_transcribe(url)

    if not transcript:
        transcript = meta.get("description") or info.get("description") or ""
        log.warning("no transcript for %s, falling back to description", url)

    return {"video_label": label, "metadata": meta, "transcript": transcript}


def ingest_pair(url_a, url_b):
    return {
        "video_a": ingest_video(url_a, "A"),
        "video_b": ingest_video(url_b, "B"),
    }
