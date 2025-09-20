"""Helpers for writing trimmed posts into on-disk archives."""

from __future__ import annotations

import datetime
import hashlib
import json
import pathlib
import re
from typing import Callable, Iterable, Mapping

_MONTH_PATTERN = re.compile(r"^(\d{4}-\d{2})\.json$")


def _utc_timestamp() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _sanitize_month(value: str) -> str:
    if value is None:
        return ""
    candidate = re.sub(r"[^0-9-]", "", str(value)).strip()[:7]
    return candidate if re.fullmatch(r"\d{4}-\d{2}", candidate) else ""


def _load_existing(path: pathlib.Path) -> list[dict]:
    try:
        payload = path.read_text(encoding="utf-8")
    except OSError:
        return []
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, Mapping)]


def _entry_identity(entry: Mapping, normalize_date: Callable[[str], str]) -> str:
    slug = str(entry.get("slug") or "").strip()
    raw_date = str(entry.get("date") or "").strip()
    normalized_date = normalize_date(raw_date) or raw_date
    if slug and normalized_date:
        return f"{slug}|{normalized_date}"
    if slug:
        return slug
    source = str(entry.get("source") or entry.get("url") or "").strip()
    if source and normalized_date:
        return f"{source}|{normalized_date}"
    if source:
        return source
    title = str(entry.get("title") or "").strip()
    if title and normalized_date:
        return f"{title}|{normalized_date}"
    payload = json.dumps(entry, ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _sort_entries(entries: list[dict], normalize_date: Callable[[str], str]) -> None:
    def _key(item: Mapping) -> tuple[str, str]:
        raw = str(item.get("date") or "").strip()
        normalized = normalize_date(raw) or raw
        secondary = str(item.get("title") or item.get("slug") or "").strip()
        return normalized, secondary

    entries.sort(key=_key, reverse=True)


def _write_month_file(path: pathlib.Path, entries: list[dict], normalize_date: Callable[[str], str]) -> None:
    existing = _load_existing(path)
    combined: list[dict] = []
    seen: set[str] = set()

    for item in existing + entries:
        if not isinstance(item, Mapping):
            continue
        key = _entry_identity(item, normalize_date)
        if key in seen:
            continue
        seen.add(key)
        combined.append(dict(item))

    _sort_entries(combined, normalize_date)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")


def _update_manifest(directory: pathlib.Path, timestamp: str) -> None:
    months: list[tuple[str, int]] = []
    total = 0

    for path in directory.glob("*.json"):
        if not path.is_file():
            continue
        if path.name == "index.json":
            continue
        match = _MONTH_PATTERN.match(path.name)
        if not match:
            continue
        month_key = match.group(1)
        entries = _load_existing(path)
        months.append((month_key, len(entries)))
        total += len(entries)

    months.sort(key=lambda item: item[0], reverse=True)
    manifest = {
        "generated_at": timestamp,
        "months": [
            {"key": key, "count": count}
            for key, count in months
        ],
        "total_entries": total,
    }
    manifest_path = directory / "index.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def append_entries_to_archive(
    archive_root: pathlib.Path,
    entries: Iterable[Mapping],
    *,
    normalize_date: Callable[[str], str],
    default_month: str,
) -> None:
    sanitized_default = _sanitize_month(default_month)
    if not sanitized_default:
        sanitized_default = datetime.datetime.utcnow().strftime("%Y-%m")

    prepared: dict[str, list[dict]] = {}
    timestamp = _utc_timestamp()

    for entry in entries or []:
        if not isinstance(entry, Mapping):
            continue
        raw_date = str(entry.get("date") or "").strip()
        normalized = normalize_date(raw_date) or raw_date
        month_key = _sanitize_month(normalized[:7]) or sanitized_default
        archive_entry = dict(entry)
        archive_entry.setdefault("archived_at", timestamp)
        prepared.setdefault(month_key, []).append(archive_entry)

    if not prepared:
        return

    archive_root.mkdir(parents=True, exist_ok=True)

    for month_key, month_entries in prepared.items():
        month_path = archive_root / f"{month_key}.json"
        _write_month_file(month_path, month_entries, normalize_date)

    _update_manifest(archive_root, timestamp)


__all__ = ["append_entries_to_archive"]
