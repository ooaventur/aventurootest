import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from autopost.pull_news import link_hash, normalize_link


@pytest.mark.parametrize(
    "with_tracking,without_tracking",
    [
        (
            "https://example.com/article?utm_source=newsletter&id=123&utm_medium=email",
            "https://example.com/article?id=123",
        ),
        (
            "https://Example.com/article/?fbclid=abc123&id=123&utm_campaign=spring",
            "https://example.com/article?id=123",
        ),
    ],
)
def test_link_hash_ignores_tracking_params(with_tracking, without_tracking):
    assert normalize_link(with_tracking) == normalize_link(without_tracking)
    assert link_hash(with_tracking) == link_hash(without_tracking)
