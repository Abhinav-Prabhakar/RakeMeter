"""One command for development: `uv run dev`.

Starts two things and stops them together:

    the API    uvicorn, backend.api:app, reloading when backend code changes   http://localhost:8000
    the page   the static files in the project root, reloading the browser     http://localhost:5178
               when any of them changes

Ports can be moved with API_PORT and PAGE_PORT; LIVE=0 turns the browser reload off.
"""
from __future__ import annotations

import functools
import json
import os
import signal
import subprocess
import sys
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# What the page is made of. Nothing else in the project is served.
PAGE_TYPES = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2"}
PRIVATE = {"backend", "tests", "docs", "references", "node_modules"}

# Polls for a newer page and reloads when there is one. A dropped connection (the server
# restarting) is simply tried again.
LIVE_SNIPPET = """<script>(() => {
  let seen = null;
  setInterval(async () => {
    try {
      const { stamp } = await (await fetch("/__live", { cache: "no-store" })).json();
      if (seen !== null && stamp !== seen) location.reload();
      seen = stamp;
    } catch (e) {}
  }, 1000);
})();</script>"""


def page_files(root: Path):
    """Every file the page server would serve."""
    for path in root.rglob("*"):
        if path.is_file() and is_public(root, path):
            yield path


def is_public(root: Path, path: Path) -> bool:
    """A page file inside the root: right type, not hidden, not in a private folder."""
    try:
        parts = path.resolve().relative_to(root.resolve()).parts
    except ValueError:
        return False
    if not parts or any(p.startswith(".") for p in parts) or parts[0] in PRIVATE:
        return False
    return path.suffix.lower() in PAGE_TYPES


def stamp(root: Path) -> str:
    """Changes whenever a page file is added, removed or saved."""
    latest, count = 0, 0
    for path in page_files(root):
        try:
            latest = max(latest, path.stat().st_mtime_ns)
            count += 1
        except OSError:
            pass
    return f"{latest}-{count}"


class PageHandler(SimpleHTTPRequestHandler):
    """Static files for the page, with the API's address and the reload script added to HTML."""

    api_url = "http://localhost:8000"
    live = True

    def log_message(self, format, *args):       # one quiet line per error is enough
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            sys.stderr.write("page  %s\n" % (format % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send(self, body: bytes, content_type: str, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        root = Path(self.directory)
        route = self.path.split("?", 1)[0].split("#", 1)[0]
        if route == "/__live":
            return self._send(json.dumps({"stamp": stamp(root)}).encode(), "application/json")
        target = Path(self.translate_path(self.path))
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file() or not is_public(root, target):
            return self.send_error(HTTPStatus.NOT_FOUND, "Not found")
        if target.suffix.lower() == ".html":
            return self._send(self.dress(target.read_text(encoding="utf-8")).encode("utf-8"), "text/html; charset=utf-8")
        self.path = "/" + target.resolve().relative_to(root.resolve()).as_posix()
        return super().do_GET()

    do_HEAD = do_GET

    def dress(self, html: str) -> str:
        """Tell the page where the API is, and (when live) how to reload itself."""
        head = f"<script>window.TRAIN_API = {json.dumps(self.api_url)};</script>"
        tail = LIVE_SNIPPET if self.live else ""
        html = html.replace("<head>", "<head>" + head, 1) if "<head>" in html else head + html
        return html.replace("</body>", tail + "</body>", 1) if "</body>" in html else html + tail


def page_server(root: Path, port: int, api_url: str, live: bool = True, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    handler = type("Handler", (PageHandler,), {"api_url": api_url, "live": live})
    return ThreadingHTTPServer((host, port), functools.partial(handler, directory=str(root)))


def main() -> int:
    api_port = int(os.environ.get("API_PORT", "8000"))
    page_port = int(os.environ.get("PAGE_PORT", "5178"))
    live = os.environ.get("LIVE", "1") != "0"
    api_url = f"http://localhost:{api_port}"

    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.api:app", "--port", str(api_port), "--reload", "--reload-dir", str(ROOT / "backend")],
        cwd=ROOT,
    )
    page = page_server(ROOT, page_port, api_url, live)
    threading.Thread(target=page.serve_forever, daemon=True).start()
    print(f"\n  page  http://localhost:{page_port}   (reloads when a page file changes)" if live else f"\n  page  http://localhost:{page_port}")
    print(f"  api   {api_url}   (reloads when backend code changes)\n", flush=True)

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        return api.wait()                       # if the API dies, so does the command
    except KeyboardInterrupt:
        return 0
    finally:
        page.shutdown()
        if api.poll() is None:
            api.terminate()
            try:
                api.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api.kill()


if __name__ == "__main__":
    sys.exit(main())
