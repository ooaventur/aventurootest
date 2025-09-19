import contextlib
import json
import pathlib
import tempfile
import unittest
from unittest import mock

from autopost import pull_news


class ResolveCoverUrlTests(unittest.TestCase):
    def test_empty_cover_uses_fallback(self):
        fallback = pull_news.sanitize_img_url(pull_news.FALLBACK_COVER)
        self.assertTrue(fallback)
        self.assertEqual(pull_news.resolve_cover_url(""), fallback)

    def test_data_url_uses_fallback(self):
        fallback = pull_news.sanitize_img_url(pull_news.FALLBACK_COVER)
        self.assertEqual(
            pull_news.resolve_cover_url("data:image/png;base64,AAAA"),
            fallback,
        )

    def test_https_cover_kept(self):
        cover = "https://example.com/image.jpg"
        self.assertEqual(
            pull_news.resolve_cover_url(cover),
            pull_news.sanitize_img_url(cover),
        )
    def test_wordpress_date_path_unchanged(self):
        url = "https://example.com/2023/09/01/photo.jpg"
        self.assertEqual(pull_news.sanitize_img_url(url), url)


class FeedUrlParsingTests(unittest.TestCase):
    def test_inline_comment_in_feed_url_stripped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            feed_file = tmp_path / "feeds.txt"
            feed_file.write_text(
                "Test|Sub|https://example.com/feed/   # comment\n",
                encoding="utf-8",
            )

            config = pull_news.PullNewsConfig(
                feeds=feed_file,
                data_dir=tmp_path,
                posts_json=tmp_path / "posts.json",
                seen_db=tmp_path / "seen.json",
            )

            fetched_urls = []

            def fake_fetch_bytes(url):
                fetched_urls.append(url)
                return b"<xml>"

            patchers = [
                mock.patch.object(pull_news, "fetch_bytes", side_effect=fake_fetch_bytes),
                mock.patch.object(pull_news, "parse_feed", return_value=[]),
            ]

            with contextlib.ExitStack() as stack:
                for patcher in patchers:
                    stack.enter_context(patcher)
                pull_news.run_pull_news(config)

            self.assertEqual(fetched_urls, ["https://example.com/feed/"])


class MaxPerFeedLimitTests(unittest.TestCase):
    def test_max_per_feed_limit(self):
        items = [
            {"title": f"Item {idx}", "link": f"https://example.com/article-{idx}", "summary": "", "element": None}
            for idx in range(3)
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            feed_file = tmp_path / "feeds.txt"
            feed_file.write_text("Test|Sub|https://example.com/feed\n", encoding="utf-8")

            config = pull_news.PullNewsConfig(
                feeds=feed_file,
                data_dir=tmp_path,
                posts_json=tmp_path / "posts.json",
                seen_db=tmp_path / "seen.json",
                max_per_feed=2,
            )

            patchers = [
                mock.patch.object(pull_news, "fetch_bytes", return_value=b"<xml>"),
                mock.patch.object(pull_news, "parse_feed", return_value=items),
                mock.patch.object(pull_news, "extract_body_html", return_value=("<p>Body</p>", "")),
                mock.patch.object(pull_news, "find_cover_from_item", return_value=""),
            ]
            with contextlib.ExitStack() as stack:
                for patcher in patchers:
                    stack.enter_context(patcher)
                pull_news.run_pull_news(config)

            data = json.loads(config.posts_json.read_text(encoding="utf-8"))
            self.assertEqual(len(data), 2)


class MaxPerCategoryLimitTests(unittest.TestCase):
    def test_top_level_category_limit_shared_across_subcategories(self):
        politics_items = [
            {
                "title": f"Politics {idx}",
                "link": f"https://example.com/politics-{idx}",
                "summary": "",
                "element": None,
            }
            for idx in range(2)
        ]
        world_items = [
            {
                "title": f"World {idx}",
                "link": f"https://example.com/world-{idx}",
                "summary": "",
                "element": None,
            }
            for idx in range(2)
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            feed_file = tmp_path / "feeds.txt"
            feed_file.write_text(
                "News|Politics|https://example.com/politics-feed\n"
                "News|World|https://example.com/world-feed\n",
                encoding="utf-8",
            )

            config = pull_news.PullNewsConfig(
                feeds=feed_file,
                data_dir=tmp_path,
                posts_json=tmp_path / "posts.json",
                seen_db=tmp_path / "seen.json",
                max_per_feed=10,
                max_per_category=2,
                max_total=0,
            )

            patchers = [
                mock.patch.object(pull_news, "fetch_bytes", return_value=b"<xml>"),
                mock.patch.object(
                    pull_news,
                    "parse_feed",
                    side_effect=[politics_items, world_items],
                ),
                mock.patch.object(
                    pull_news,
                    "extract_body_html",
                    return_value=("<p>Body</p>", ""),
                ),
                mock.patch.object(pull_news, "find_cover_from_item", return_value=""),
            ]

            with contextlib.ExitStack() as stack:
                for patcher in patchers:
                    stack.enter_context(patcher)
                pull_news.run_pull_news(config)

            data = json.loads(config.posts_json.read_text(encoding="utf-8"))
            self.assertEqual(len(data), 2)
            self.assertFalse(any(entry.get("subcategory") == "World" for entry in data))

if __name__ == "__main__":
    unittest.main()
