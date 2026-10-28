"""Network-free regression checks for local experiment verification."""

import unittest
from unittest import mock
import urllib.error

import experiment


class VerifySiteTests(unittest.TestCase):
    def setUp(self):
        self.site = {
            "url": "http://localhost:2468",
            "key": "unused-test-key",
            "owner_id": "expected-author",
            "post": {
                "id": "test-post",
                "url": "http://localhost:2468/test-post/",
                "marker": "expected-content-marker",
                "fixture_sha256": "synthetic-fixture-digest",
            },
        }
        self.other_url = "http://localhost:2469"
        self.post = {"status": "published", "authors": [{"id": "expected-author"}]}
        self.html = ('<html lang="en"><h2>expected-content-marker</h2>'
                     '<table><tr><td>value</td></tr></table><code>value</code></html>')
        self.cross_site_status = 404

    def verify(self):
        def response(opener, origin, path):
            if origin == self.other_url:
                raise urllib.error.HTTPError(
                    origin + path, self.cross_site_status, "Synthetic response", None, None)
            return 200, self.html.encode()

        with mock.patch.object(experiment, "json_request", return_value={"posts": [self.post]}), \
                mock.patch.object(experiment, "request", side_effect=response):
            return experiment.verify_site(object(), self.site, "en", self.other_url)

    def test_published_fixture_passes(self):
        result = self.verify()
        for field in ("published", "author_verified", "html_language_verified",
                      "code_and_table_rendered", "sitemap_accessible", "other_site_returns_404"):
            with self.subTest(field=field):
                self.assertIs(result[field], True)

    def test_unpublished_post_is_rejected(self):
        self.post["status"] = "draft"
        with self.assertRaises(AssertionError):
            self.verify()

    def test_wrong_author_is_rejected(self):
        self.post["authors"][0]["id"] = "different-author"
        with self.assertRaises(AssertionError):
            self.verify()

    def test_missing_rendered_marker_is_rejected(self):
        complete_html = self.html
        for marker in (self.site["post"]["marker"], "<table", "<code", 'lang="en"'):
            with self.subTest(marker=marker):
                self.html = complete_html.replace(marker, "")
                with self.assertRaises(AssertionError):
                    self.verify()

    def test_wrong_cross_site_http_status_is_rejected(self):
        for status in (401, 403, 500):
            with self.subTest(status=status):
                self.cross_site_status = status
                with self.assertRaises(AssertionError):
                    self.verify()


if __name__ == "__main__":
    unittest.main()
