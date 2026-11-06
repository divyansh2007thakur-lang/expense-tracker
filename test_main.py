import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import main


class StaticAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), main.AppHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def test_serves_app_and_relative_assets(self):
        for path, content_type in (
            ("/", "text/html"),
            ("/styles.css", "text/css"),
            ("/app.js", "text/javascript"),
        ):
            with self.subTest(path=path):
                with urlopen(self.base_url + path) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn(content_type, response.headers["Content-Type"])
                    self.assertTrue(response.read())

    def test_unknown_paths_return_not_found(self):
        for path in ("/api/expenses", "/main.py"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    try:
                        response = urlopen(Request(self.base_url + path, method=method))
                    except HTTPError as error:
                        self.assertEqual(error.code, 404)
                        error.close()
                    else:
                        response.close()
                        self.fail(f"{method} {path} should return 404")


if __name__ == "__main__":
    unittest.main()
