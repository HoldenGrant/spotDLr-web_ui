import re
import unittest

from app import BASE_DIR, root

# The loading screen lives in the page itself so it paints before any other file arrives, and boot() lifts it.


class SplashTests(unittest.TestCase):
    def setUp(self):
        self.page = root().body.decode()

    def test_page_carries_the_loading_screen_first_and_a_way_to_lift_it(self):
        self.assertLess(self.page.index('id="splash"'), self.page.index('class="app"'))
        self.assertIn("window.hideSplash", self.page)
        self.assertIn("window.hideSplash?.()", (BASE_DIR / "static" / "app.js").read_text())

    def test_fonts_do_not_hold_back_the_first_paint(self):
        link = re.search(r'<link[^>]*fonts\.googleapis\.com[^>]*rel="stylesheet"[^>]*>', self.page).group(0)
        self.assertIn('media="print"', link)  # swapped to "all" when it arrives, so a slow or missing font never blocks drawing


if __name__ == "__main__":
    unittest.main()
