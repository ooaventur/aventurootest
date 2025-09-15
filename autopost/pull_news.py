#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AventurOO – Autopost

Reads feeds in the form:
    category|subcategory|url
(also supports legacy cat|url or cat/sub|url)

• Extracts and sanitizes article HTML (trafilatura → readability → fallback text).
• Keeps roughly TARGET_WORDS words by whole paragraph/heading/blockquote/list blocks.
• Strips ads/widgets (scripts, iframes, common ad/related/newsletter blocks).
• Picks a clear cover image (largest media/proper https/proxy/fallback).
• Writes data/posts.json items with:
  {slug,title,category,subcategory,date,excerpt,cover,source,source_domain,source_name,author,rights,body}
• Applies per-(Category/Subcategory) limits.

Run:
  python3 "autopost/pull_news.py"
Env knobs (optional):
  MAX_PER_CAT, MAX_TOTAL, MAX_POSTS_PERSIST, HTTP_TIMEOUT, FALLBACK_COVER, DEFAULT_AUTHOR,
  IMG_TARGET_WIDTH, IMG_PROXY, FORCE_PROXY, TARGET_WORDS
"""

import os, re, json, hashlib, datetime, pathlib, urllib.request, urllib.error, socket, sys
from html import unescape
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse, urljoin, urlunparse, parse_qsl, urlencode
from xml.etree import ElementTree as ET

if __package__ in (None, ""):
    sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from autopost import SEEN_DB_FILENAME
from autopost.common import limit_words_html

from autopost import SEEN_DB_FILENAME
from autopost.common import limit_words_html


def _env_int(name: str, default: int) -> int:
    """Return an integer from the environment or ``default`` on failure."""

    raw = os.getenv(name)
    if raw is None:
        return default
    raw = raw.strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"[WARN] Invalid {name}={raw!r}; falling back to {default}")
        return default

# ------------------ Config ------------------
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
POSTS_JSON = DATA_DIR / "posts.json"
# Use your uploaded feeds file:
FEEDS = pathlib.Path(
    os.getenv("FEEDS_FILE") or (ROOT / "autopost" / "feeds_news.txt")
)

# Accept all categories by default (set CATEGORY env if you want to filter)
CATEGORY = os.getenv("CATEGORY", "").strip()
SEEN_DB = ROOT / "autopost" / SEEN_DB_FILENAME
# All autopost runs share the same "seen" store to prevent duplicates across jobs.

MAX_PER_CAT = _env_int("MAX_PER_CAT", 15)
MAX_TOTAL   = _env_int("MAX_TOTAL", 0)
SUMMARY_WORDS = _env_int("SUMMARY_WORDS", 1500)  # kept for compatibility
TARGET_WORDS = _env_int("TARGET_WORDS", SUMMARY_WORDS)
MAX_POSTS_PERSIST = _env_int("MAX_POSTS_PERSIST", 3000)
HTTP_TIMEOUT = _env_int("HTTP_TIMEOUT", 18)
UA = os.getenv("AP_USER_AGENT", "Mozilla/5.0 (AventurOO Autoposter)")
FALLBACK_COVER = os.getenv("FALLBACK_COVER", "assets/img/cover-fallback.jpg")
DEFAULT_AUTHOR = os.getenv("DEFAULT_AUTHOR", "AventurOO Editorial")


TRACKING_PARAM_PREFIXES = ("utm_",)
TRACKING_PARAM_NAMES = {
    "fbclid",
    "gclid",
    "dclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "mkt_tok",
    "oly_anon_id",
    "oly_enc_id",
    "vero_conv",
    "vero_id",
    "yclid",
    "gbraid",
    "wbraid",
}

# Image options (for cover only)
IMG_TARGET_WIDTH = int(os.getenv("IMG_TARGET_WIDTH", "1600"))
IMG_PROXY = os.getenv("IMG_PROXY", "https://images.weserv.nl/?url=")  # "" if you don’t want a proxy
FORCE_PROXY = os.getenv("FORCE_PROXY", "0")  # "1" => route every cover via proxy

try:
    import trafilatura
except Exception:
    trafilatura = None

try:
    from readability import Document
except Exception:
    Document = None

# ------------------ HTTP/HTML utils ------------------
def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
        raw = r.read()
    for enc in ("utf-8", "utf-16", "iso-8859-1"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", "ignore")

def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            return r.read()
    except (urllib.error.HTTPError, urllib.error.URLError, socket.timeout) as e:
        print("Fetch error:", url, "->", e)
        return b""

def strip_text(s: str) -> str:
    s = unescape(s or "")
    s = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<!--.*?-->", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def parse_feed(xml_bytes: bytes):
    if not xml_bytes:
        return []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    items = []
    # RSS 2.0
    for it in root.findall(".//item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        desc = (it.findtext("description") or "").strip()
        if title and link:
            items.append({"title": title, "link": link, "summary": desc, "element": it})
    # Atom
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for e in root.findall(".//atom:entry", ns):
        title = (e.findtext("atom:title", default="") or "").strip()
        link_el = e.find("atom:link[@rel='alternate']", ns) or e.find("atom:link", ns)
        link = (link_el.attrib.get("href") if link_el is not None else "").strip()
        summary = (e.findtext("atom:summary", default="") or e.findtext("atom:content", default="") or "").strip()
        if title and link:
            items.append({"title": title, "link": link, "summary": summary, "element": e})
    return items

def find_cover_from_item(it_elem, page_url: str = "") -> str:
    if it_elem is not None:
        enc = it_elem.find("enclosure")
        if enc is not None and str(enc.attrib.get("type","")).startswith("image"):
            u = enc.attrib.get("url", "")
            if u: return u
        ns = {"media":"http://search.yahoo.com/mrss/"}
        m = it_elem.find("media:content", ns) or it_elem.find("media:thumbnail", ns)
        if m is not None and m.attrib.get("url"):
            return m.attrib.get("url")
    # og:image as fallback
    if page_url:
        try:
            html = http_get(page_url)
            m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if m: return m.group(1)
        except Exception:
            pass
    return ""

def absolutize(html: str, base: str) -> str:
    def rep_href(m):
        url = m.group(1)
        if url.startswith(("http://", "https://", "mailto:", "#", "//")):
            return f'href="{url}"'
        return f'href="{urljoin(base, url)}"'
    def rep_src(m):
        url = m.group(1)
        if url.startswith(("http://", "https://", "data:", "//")):
            return f'src="{url}"'
        return f'src="{urljoin(base, url)}"'
    html = re.sub(r'href=["\']([^"\']+)["\']', rep_href, html, flags=re.I)
    html = re.sub(r'src=["\']([^"\']+)["\']', rep_src, html, flags=re.I)
    return html

def sanitize_article_html(html: str) -> str:
    if not html:
        return ""
    # Remove scripts/styles/iframes/noscript
    html = re.sub(r"(?is)<script.*?</script>", "", html)
    html = re.sub(r"(?is)<style.*?</style>", "", html)
    html = re.sub(r"(?is)<noscript.*?</noscript>", "", html)
    html = re.sub(r"(?is)<iframe.*?</iframe>", "", html)
    # Remove common ad/sponsored/related/newsletter blocks
    BAD = r"(share|related|promo|newsletter|advert|ads?|sponsor(ed)?|outbrain|taboola|recirculation|recommend(ed)?)"
    html = re.sub(rf'(?is)<(aside|figure|div|section)[^>]*class="[^"]*{BAD}[^"]*"[^>]*>.*?</\1>', "", html)
    html = re.sub(rf'(?is)<(div|section)[^>]*(id|data-)[^>]*{BAD}[^>]*>.*?</\1>', "", html)
    return html.strip()

# ---- Link normalization helpers ----

def is_tracking_param(name: str) -> bool:
    if not name:
        return False
    lower = name.lower()
    if any(lower.startswith(prefix) for prefix in TRACKING_PARAM_PREFIXES):
        return True
    return lower in TRACKING_PARAM_NAMES


def _normalized_netloc(parsed) -> str:
    if not parsed.netloc:
        return ""
    host = (parsed.hostname or "").lower()
    if not host:
        return parsed.netloc.lower()
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    userinfo = ""
    if parsed.username:
        userinfo = parsed.username
        if parsed.password:
            userinfo += f":{parsed.password}"
        userinfo += "@"
    try:
        port = parsed.port
    except ValueError:
        port = None
    port_str = f":{port}" if port else ""
    return f"{userinfo}{host}{port_str}"


def normalize_link(link: str) -> str:
    link = (link or "").strip()
    if not link:
        return ""
    parsed = urlparse(link)
    scheme = parsed.scheme.lower()
    netloc = _normalized_netloc(parsed)
    path = (parsed.path or "").rstrip("/")
    query_params = parse_qsl(parsed.query, keep_blank_values=True)
    filtered_params = [
        (k, v) for k, v in query_params if not is_tracking_param(k)
    ]
    query = urlencode(filtered_params, doseq=True)
    normalized = urlunparse(
        parsed._replace(scheme=scheme, netloc=netloc, path=path, query=query)
    )
    return normalized


def link_hash(link: str) -> str:
    normalized = normalize_link(link)
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()

# ---- Image helpers for 'cover' ----
def guardian_upscale_url(u: str, target=IMG_TARGET_WIDTH) -> str:
    try:
        from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
        pr = urlparse(u)
        if "i.guim.co.uk" not in pr.netloc:
            return u
        q = dict(parse_qsl(pr.query, keep_blank_values=True))
        q["width"] = str(max(int(q.get("width", "0") or 0), target))
        q.setdefault("quality", "85")
        q.setdefault("auto", "format")
        q.setdefault("fit", "max")
        pr = pr._replace(query=urlencode(q))
        return urlunparse(pr)
    except Exception:
        return u
def _remove_wp_size_suffix(u: str) -> str:
    """
    Heq sufiksin WordPress -{w}x{h} para prapashtesës, p.sh.
    example-800x600.jpg -> example.jpg
    """
    m = re.search(r'(?i)(.+?)-\d{2,4}x\d{2,4}(\.[a-z]{3,4})(\?.*)?$', u)
    if m:
        return (m.group(1) + m.group(2) + (m.group(3) or ''))
    return u

def _bump_width_query(u: str, target: int) -> str:
    """
    Nëse URL ka parametra si w, width, maxwidth, px, sz, i çon ≥ target.
    """
    try:
        pr = urlparse(u)
        q = dict(parse_qsl(pr.query, keep_blank_values=True))
        updated = False
        for k in ('w', 'width', 'maxwidth', 'px', 'sz', 's'):
            if k in q:
                try:
                    # kap numrin e parë në vlerë (p.sh. '800', '800px', etj.)
                    import re as _re
                    m = _re.search(r'\d+', str(q[k]))
                    v = int(m.group(0)) if m else 0
                except Exception:
                    v = 0
                if v < target:
                    val = str(q[k])
                    if m:
                        start, end = m.span()
                        q[k] = f"{val[:start]}{target}{val[end:]}"
                    else:
                        q[k] = str(target)
                    updated = True
        if updated:
            pr = pr._replace(query=urlencode(q))
            u = urlunparse(pr)
        return u
    except Exception:
        return u


def pick_largest_media_url(it_elem) -> str:
    if it_elem is None:
        return ""
    best_url, best_score = "", -1
    ns = {"media":"http://search.yahoo.com/mrss/"}
    for tag in it_elem.findall(".//media:content", ns) + it_elem.findall(".//media:thumbnail", ns):
        u = (tag.attrib.get("url") or "").strip()
        if not u:
            continue
        w = int(tag.attrib.get("width", "0") or 0)
        h = int(tag.attrib.get("height", "0") or 0)
        score = (w*h) if (w and h) else w or h or 0
        if score > best_score:
            best_url, best_score = u, score
    enc = it_elem.find("enclosure")
    if enc is not None and str(enc.attrib.get("type","")).startswith("image"):
        u = (enc.attrib.get("url") or "").strip()
        if u and best_score < 0:
            best_url = u
    return best_url or ""

def _to_https(u: str) -> str:
    if not u:
        return u
    u = u.strip()
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("http://"):
        return "https://" + u[len("http://"):]
    return u

def _proxy_if_mixed(u: str) -> str:
    if not u:
        return u
    if u.startswith("http://") and IMG_PROXY:
        base = u[len("http://"):]
        return f"{IMG_PROXY}{base}"
    return u
def _bump_path_width(u: str, target: int) -> str:
    """Upgrade numeric path segments that likely encode the image width."""
    try:
        parsed = urlparse(u)
    except Exception:
        return u

    path = parsed.path or ""
    if not path:
        return u

    segments = path.split("/")
    size_keywords = {
        "img",
        "image",
        "images",
        "media",
        "thumb",
        "thumbnail",
        "resize",
        "resized",
        "size",
        "sizes",
        "standard",
        "width",
        "w",
        "crop",
        "quality",
    }
    changed = False

    for idx, seg in enumerate(segments):
        if not re.fullmatch(r"\d{2,4}", seg or ""):
            continue
        try:
            value = int(seg)
        except ValueError:
            continue
        if value >= target or value == 0:
            continue

        prev_seg = segments[idx - 1].lower() if idx > 0 else ""
        next_seg = segments[idx + 1].lower() if idx + 1 < len(segments) else ""
        next_next = segments[idx + 2].lower() if idx + 2 < len(segments) else ""

        looks_like_size = False
        if any(key in prev_seg for key in size_keywords) or any(
            key in next_seg for key in size_keywords
        ):
            looks_like_size = True
        image_pattern = r"\.(?:jpe?g|png|gif|webp|avif)(?:\?.*)?$"
        if re.search(image_pattern, next_seg) or re.search(image_pattern, next_next):
            looks_like_size = True

        if not looks_like_size:
            continue

        segments[idx] = str(target)
        changed = True

    if not changed:
        return u

    new_path = "/".join(segments)
    if path.startswith("/") and not new_path.startswith("/"):
        new_path = "/" + new_path

    parsed = parsed._replace(path=new_path)
    return urlunparse(parsed)


def sanitize_img_url(u: str) -> str:
    """Sanitize cover URL: https → (opt.) proxy → upscale (Guardian & common CMS)."""
    u = (u or "").strip()
    if not u:
        return u
    if FORCE_PROXY == "1" and IMG_PROXY:
        u2 = u.replace("https://", "").replace("http://", "")
        return f"{IMG_PROXY}{u2}"
    u = _to_https(u)
    # Rregullime specifike
    u = guardian_upscale_url(u, target=IMG_TARGET_WIDTH)
    # Rregullime të përgjithshme (WP/Shopify/Cloudinary query width)
    u = _remove_wp_size_suffix(u)
    u = _bump_path_width(u, IMG_TARGET_WIDTH)
    u = _bump_width_query(u, IMG_TARGET_WIDTH)
    if u.startswith("http://"):
        u = _proxy_if_mixed(u)
    return u


# ---- Body extractors ----
def extract_body_html(url: str) -> tuple[str, str]:
    """Return (body_html, first_img_in_body) trying trafilatura → readability → fallback text."""
    body_html = ""
    first_img = ""
    # 1) trafilatura
    if trafilatura is not None:
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                th = trafilatura.extract(
                    downloaded,
                    output_format="html",
                    include_images=True,
                    include_links=True,
                    include_formatting=True
                )
                if th:
                    body_html = th
                    m = re.search(r'<img[^>]+src=["\'](http[^"\']+)["\']', th, flags=re.I)
                    if m:
                        first_img = m.group(1)
        except Exception as e:
            print("trafilatura error:", e)
    # 2) readability-lxml
    if not body_html and Document is not None:
        try:
            raw = http_get(url)
            doc = Document(raw)
            body_html = doc.summary(html_partial=True)
            if body_html and not first_img:
                m = re.search(r'<img[^>]+src=["\'](http[^"\']+)["\']', body_html, flags=re.I)
                if m:
                    first_img = m.group(1)
        except Exception as e:
            print("readability error:", e)
    # 3) Fallback total
    if not body_html:
        try:
            raw = http_get(url)
            txt = strip_text(raw)
            return f"<p>{txt}</p>", ""
        except Exception:
            return "", ""
    return body_html, first_img

def slugify(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "post"

def _normalize_date_string(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value)

    dt = None

    iso_candidate = value
    if iso_candidate.endswith("Z"):
        iso_candidate = iso_candidate[:-1] + "+00:00"
    try:
        dt = datetime.datetime.fromisoformat(iso_candidate)
    except ValueError:
        dt = None

    if dt is None:
        try:
            dt = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError):
            dt = None

    if dt is None:
        for fmt in (
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%d %b %Y",
            "%d %B %Y",
            "%b %d, %Y",
            "%B %d, %Y",
        ):
            try:
                dt = datetime.datetime.strptime(value, fmt)
                break
            except ValueError:
                continue

    if dt is None:
        return ""

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)

    return dt.astimezone(datetime.timezone.utc).date().isoformat()


def parse_item_date(it_elem) -> str:
    if it_elem is None:
        return today_iso()

    candidates = []
    def _append_candidate(value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                candidates.append(stripped)

    for tag in ("pubDate", "published", "updated"):
        _append_candidate(it_elem.findtext(tag))

    ns_atom = {"atom": "http://www.w3.org/2005/Atom"}
    for tag in ("published", "updated"):
        _append_candidate(it_elem.findtext(f"atom:{tag}", default="", namespaces=ns_atom))

    ns_dc = {"dc": "http://purl.org/dc/elements/1.1/"}
    _append_candidate(it_elem.findtext("dc:date", default="", namespaces=ns_dc))


    for candidate in candidates:
        normalized = _normalize_date_string(candidate)
        if normalized:
            return normalized

    return today_iso()


def _entry_sort_key(entry) -> str:
    if not isinstance(entry, dict):
        return ""
    raw = entry.get("date")
    raw_str = str(raw or "").strip()
    normalized = _normalize_date_string(raw_str)
    return normalized or raw_str


def today_iso() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")

# ------------------ Main ------------------
def main():
    DATA_DIR.mkdir(exist_ok=True, parents=True)
    SEEN_DB.parent.mkdir(exist_ok=True, parents=True)

    # seen
    if SEEN_DB.exists():
        try:
            seen = json.loads(SEEN_DB.read_text(encoding="utf-8"))
            if not isinstance(seen, dict):
                seen = {}
        except json.JSONDecodeError:
            seen = {}
    else:
        seen = {}

    # posts index
    if POSTS_JSON.exists():
        try:
            posts_idx = json.loads(POSTS_JSON.read_text(encoding="utf-8"))
            if not isinstance(posts_idx, list):
                posts_idx = []
        except json.JSONDecodeError:
            posts_idx = []
    else:
        posts_idx = []

    if not FEEDS.exists():
        print("ERROR: feeds file not found:", FEEDS)
        return

    added_total = 0
    target_words = globals().get("TARGET_WORDS")
    if not isinstance(target_words, int) or target_words <= 0:
        target_words = SUMMARY_WORDS
    per_cat = {}
    new_entries = []

    current_sub = ""

    for raw in FEEDS.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        if raw.startswith("#"):
            # Support comments like: # === NEWS / POLITICS ===
            m = re.search(r"#\s*===\s*[^/]+/\s*(.+?)\s*===", raw, flags=re.I)
            if m:
                current_sub = m.group(1).strip().title()
            continue

        if "|" not in raw:
            continue
        parts = [p.strip() for p in raw.split("|") if p.strip()]
        if len(parts) < 2:
            continue

        # Support: category|subcategory|url OR legacy: category|url OR category/sub|url
        if len(parts) == 3:
            category = parts[0].title()
            sub = parts[1].title()
            feed_url = parts[2]
        else:
            cat_str = parts[0]
            feed_url = parts[1]
            category_part, sub_part = (cat_str.split('/', 1) + [''])[:2]
            category = (category_part or "").strip().title()
            sub = (sub_part.strip().title() if sub_part.strip() else current_sub)
            
            sub = slugify(sub) if sub else ""

        # Optional filter by env CATEGORY (leave empty to accept all)
        if CATEGORY and category != CATEGORY:
            continue
        if not feed_url:
            continue

        print(f"[FEED] {category} / {sub or '-'} -> {feed_url}")
        xml = fetch_bytes(feed_url)
        if not xml:
            print("Feed empty:", feed_url)
            continue

        for it in parse_feed(xml):
            if MAX_TOTAL > 0 and added_total >= MAX_TOTAL:
                break

            key_limit = f"{category}/{sub or '_'}"
            if per_cat.get(key_limit, 0) >= MAX_PER_CAT:
                continue

            title = (it.get("title") or "").strip()
            link  = (it.get("link") or "").strip()
            if not title or not link:
                continue

            key = link_hash(link)
            if key in seen:
                continue

            # 1) Body HTML
            body_html, inner_img = extract_body_html(link)

            # Skip unavailable content
            body_text = strip_text(body_html).lower()
            if ("there was an error" in body_text or
                "this content is not available" in body_text):
                print(f"[SKIP] {link} -> unavailable content")
                continue

            # 2) Absolutize & sanitize
            parsed = urlparse(link)
            base = f"{parsed.scheme}://{parsed.netloc}"
            body_html = absolutize(body_html, base)
            body_html = sanitize_article_html(body_html)

            # 3) Trim to target word count while keeping whole blocks when possible
            body_html = limit_words_html(body_html, target_words)

            # 4) Cover image (cover only; images inside body removed)
            cover = (
                pick_largest_media_url(it.get("element"))
                or find_cover_from_item(it.get("element"), link)
                or inner_img
                or ""
            )
            cover = sanitize_img_url(cover)
            if not cover.startswith(("http://", "https://")):
                cover = ""


            # 5) Excerpt
            first_p = re.search(r"(?is)<p[^>]*>(.*?)</p>", body_html or "")
            excerpt = strip_text(first_p.group(1)) if first_p else (it.get("summary") or title)
            if len(excerpt) > 280:
                excerpt = excerpt[:277] + "…"

            # 6) Remove inline images from body (we show cover separately)
            body_html = re.sub(r'<img\b[^>]*>', '', body_html or "", flags=re.I)

            # 7) Footer source link
            body_final = (body_html or "") + f"""
<p class="small text-muted mt-4">
  Source: <a href="{link}" target="_blank" rel="nofollow noopener noreferrer">Read the full article</a>
</p>"""

            # 8) Metadata (author/rights)
            author = ""
            rights = "Unknown"
            it_elem = it.get("element")
            if it_elem is not None:
                a = it_elem.find("author")
                if a is not None and (a.text or "").strip():
                    author = a.text.strip()
                if not author:
                    ns_atom = {"atom": "http://www.w3.org/2005/Atom"}
                    an = it_elem.find("atom:author/atom:name", ns_atom)
                    if an is not None and (an.text or "").strip():
                        author = an.text.strip()
                ns_dc = {"dc": "http://purl.org/dc/elements/1.1/"}
                if not author:
                    c = it_elem.find("dc:creator", ns_dc)
                    if c is not None and (c.text or "").strip():
                        author = c.text.strip()
                r = it_elem.find("dc:rights", ns_dc) or it_elem.find("copyright")
                if r is not None and (r.text or "").strip():
                    rights = r.text.strip()

            if not author:
                host_fallback = (urlparse(link).hostname or "").lower().replace("www.", "")
                pretty_site = host_fallback.split(".")[0].replace("-", " ").title() if host_fallback else ""
                author = pretty_site or DEFAULT_AUTHOR
        
            date = parse_item_date(it_elem)
            slug = slugify(title)[:70]
            host = (urlparse(link).hostname or "").lower().replace("www.", "")
            source_name = host.split(".")[0].replace("-", " ").title() if host else ""

            entry = {
                "slug": slug,
                "title": title,
                "category": category,
                "subcategory": sub,
                "date": date,
                "excerpt": excerpt,
                "cover": cover,
                "source": link,
                "source_domain": host,
                "source_name": source_name,
                "author": author,
                "rights": rights,
                "body": body_final
            }
            new_entries.append(entry)

            seen[key] = {
                "title": title,
                "url": link,
                "category": category,
                "subcategory": sub,
                "created": date,
            }
            per_cat[key_limit] = per_cat.get(key_limit, 0) + 1
            added_total += 1
            print(f"[{category}/{sub or '-'}] + {title}")

    if not new_entries:
        print("New posts this run: 0")
        SEEN_DB.write_text(json.dumps(seen, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    posts_idx = new_entries + posts_idx
    posts_idx.sort(key=_entry_sort_key, reverse=True)
    if MAX_POSTS_PERSIST > 0:
        posts_idx = posts_idx[:MAX_POSTS_PERSIST]

    POSTS_JSON.write_text(json.dumps(posts_idx, ensure_ascii=False, indent=2), encoding="utf-8")
    SEEN_DB.write_text(json.dumps(seen, ensure_ascii=False, indent=2), encoding="utf-8")
    print("New posts this run:", len(new_entries))

if __name__ == "__main__":
    main()
