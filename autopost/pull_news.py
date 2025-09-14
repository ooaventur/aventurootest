#!/usr/bin/env python3
import json, re, hashlib, time
from datetime import datetime, timezone
from pathlib import Path

try:
    import feedparser
except ImportError:
    print("Please install: pip install feedparser")
    raise

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

CATEGORY = "News"
FEEDS_FILE = ROOT / "autopost" / "feeds_news.txt"
OUTPUT_FILE = DATA_DIR / "posts.json"
SEEN_DB = ROOT / "autopost" / f"seen_{CATEGORY.lower()}.json"

def load_json(p, default):
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return default

def save_json(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def slugify(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = s.strip().lower()
    s = re.sub(r"[^\w\s-]+", "", s)
    s = re.sub(r"[\s]+", "-", s)
    return s[:90].strip("-") or hashlib.md5((s or str(time.time())).encode()).hexdigest()[:10]

def clean_text(html):
    txt = re.sub(r"<[^>]+>", "", html or "")
    return re.sub(r"\s+", " ", txt).strip()

def find_cover(entry):
    # media:content / media:thumbnail
    media = getattr(entry, "media_content", None) or getattr(entry, "media_thumbnail", None)
    if media and isinstance(media, list) and media:
        u = media[0].get("url")
        if u: return u
    # enclosures
    for ln in entry.get("links", []):
        if str(ln.get("type","")).startswith("image/") and ln.get("href"):
            return ln["href"]
    # fallback: nothing
    return ""

def iso_now():
    return datetime.now(timezone.utc).isoformat()

# load existing data
posts = load_json(OUTPUT_FILE, [])
seen = load_json(SEEN_DB, {})

# build a set of known sources to avoid duplicates
known_sources = { (p.get("source") or "") for p in posts }

with FEEDS_FILE.open(encoding="utf-8") as fh:
    for raw in fh:
        raw = raw.strip()
        if not raw or raw.startswith("#") or "|" not in raw:
            continue

        cat_raw, url = raw.split("|", 1)
        parts = [p.strip() for p in cat_raw.split("/", 1)]
        cat_main = (parts[0] or "").title()           # "News"
        subcat  = (parts[1].lower() if len(parts) > 1 else "")  # "politics" ose ""
        feed_url = (url or "").strip()
        if cat_main != CATEGORY or not feed_url:
            continue

        d = feedparser.parse(feed_url)
        for e in d.entries:
            link = getattr(e, "link", "") or ""
            title = getattr(e, "title", "") or (link[:70])
            if not title or not link:
                continue

            # skip seen
            if link in seen or link in known_sources:
                continue

            published = getattr(e, "published_parsed", None)
            if published:
                dt = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            else:
                dt = iso_now()

            sum_html = getattr(e, "summary", "") or getattr(e, "description", "")
            excerpt = clean_text(sum_html)[:240]

            cover = find_cover(e)
            body_final = ""  # mund ta pasurosh më vonë me extractor

            base_slug = slugify(title)
            # guarantee uniqueness
            unique = hashlib.md5(link.encode("utf-8")).hexdigest()[:6]
            slug = f"{base_slug}-{unique}"

            entry = {
                "slug": slug,
                "title": title,
                "category": cat_main,       # "News"
                "subcategory": subcat,      # "politics"
                "date": dt,
                "excerpt": excerpt,
                "cover": cover,
                "source": link,
                "author": "AventurOO",
                "body": body_final
            }

            posts.append(entry)
            seen[link] = dt

# sort desc by date
def key_dt(p):
    try:
        return datetime.fromisoformat((p.get("date") or "").replace("Z","+00:00"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)

posts.sort(key=key_dt, reverse=True)

# optional: kufizo totalin, p.sh. 1500
posts = posts[:1500]

save_json(OUTPUT_FILE, posts)
save_json(SEEN_DB, seen)

print(f"Collected posts: {len(posts)} → {OUTPUT_FILE}")

