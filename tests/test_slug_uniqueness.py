import sys
from pathlib import Path


sys.path.append(str(Path(__file__).resolve().parents[1]))

from autopost.rss_to_html import ensure_unique_slug


def test_identical_titles_generate_incremental_slugs():
    existing = set()

    slug1 = ensure_unique_slug("duplicate-title", existing)
    slug2 = ensure_unique_slug("duplicate-title", existing)
    slug3 = ensure_unique_slug("duplicate-title", existing)

    assert slug1 == "duplicate-title"
    assert slug2 == "duplicate-title-2"
    assert slug3 == "duplicate-title-3"
    assert existing == {slug1, slug2, slug3}


def test_existing_slug_conflict_is_resolved_with_suffix():
    existing = {"duplicate-title"}

    slug = ensure_unique_slug("duplicate-title", existing)

    assert slug == "duplicate-title-2"
    assert slug in existing
    assert "duplicate-title" in existing


def test_slug_suffix_respects_max_length():
    base = "a" * 70
    existing = set()

    slug1 = ensure_unique_slug(base, existing)
    slug2 = ensure_unique_slug(base, existing)

    assert slug1 == base
    assert slug2.endswith("-2")
    assert len(slug2) <= 70
