import unittest

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

if __name__ == "__main__":
    unittest.main()
