"""The page's live server (backend/dev.py): what it serves, what it never serves, and
how it tells the browser to reload."""
import json
import threading
import time
import urllib.error
import urllib.request

import pytest

from backend import dev


@pytest.fixture
def site(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><html><head><title>t</title></head><body><p>hi</p></body></html>", encoding="utf-8")
    (tmp_path / "app.js").write_text("const x = 1;", encoding="utf-8")
    (tmp_path / "styles.css").write_text("body{}", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "a.png").write_bytes(b"\x89PNG")
    for private in ("backend", "tests", "docs", ".git", ".venv"):
        (tmp_path / private).mkdir()
        (tmp_path / private / "secret.js").write_text("secret", encoding="utf-8")
    (tmp_path / "backend" / "data").mkdir()
    (tmp_path / "backend" / "data" / "state.json").write_text("{}", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text("[project]", encoding="utf-8")
    (tmp_path / "plan.md").write_text("# plan", encoding="utf-8")
    (tmp_path / ".env.js").write_text("hidden", encoding="utf-8")
    return tmp_path


@pytest.fixture
def server(site):
    srv = dev.page_server(site, 0, "http://localhost:8123")
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()
    srv.server_close()


def get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, r.headers, r.read()


def status_of(url):
    try:
        return get(url)[0]
    except urllib.error.HTTPError as e:
        return e.code


def test_serves_the_page_with_the_api_address_and_the_reload_script(server):
    status, headers, body = get(server + "/")
    text = body.decode()
    assert status == 200 and headers["Content-Type"].startswith("text/html")
    assert 'window.TRAIN_API = "http://localhost:8123";' in text
    assert text.index("window.TRAIN_API") < text.index("<title>")          # before any of the page's own scripts
    assert "/__live" in text and text.rstrip().endswith("</body></html>")
    assert "<p>hi</p>" in text
    assert headers["Cache-Control"] == "no-store"
    assert get(server + "/index.html?view=bills")[2] == body


def test_serves_scripts_styles_and_images_untouched(server):
    assert get(server + "/app.js")[2] == b"const x = 1;"
    assert get(server + "/styles.css")[2] == b"body{}"
    assert get(server + "/assets/a.png")[2] == b"\x89PNG"
    assert get(server + "/app.js")[1]["Cache-Control"] == "no-store"


@pytest.mark.parametrize("path", [
    "/backend/secret.js", "/backend/data/state.json", "/tests/secret.js", "/docs/secret.js", "/.git/secret.js", "/.venv/secret.js",
    "/pyproject.toml", "/plan.md", "/.env.js", "/nothing.js", "/assets/", "/assets/../backend/secret.js", "/../outside.js",
    "/%2e%2e/outside.js", "/assets/%2e%2e/%2e%2e/outside.js",
])
def test_never_serves_anything_else(server, path):
    assert status_of(server + path) == 404


def test_the_stamp_changes_when_a_page_file_changes(site):
    before = dev.stamp(site)
    assert dev.stamp(site) == before
    time.sleep(0.01)
    (site / "app.js").write_text("const x = 2;", encoding="utf-8")
    changed = dev.stamp(site)
    assert changed != before
    (site / "new.css").write_text("p{}", encoding="utf-8")
    added = dev.stamp(site)
    assert added != changed
    (site / "new.css").unlink()
    assert dev.stamp(site) not in (added, before)


def test_the_stamp_ignores_what_is_not_the_page(site):
    before = dev.stamp(site)
    time.sleep(0.01)
    (site / "backend" / "rules.py").write_text("x = 1", encoding="utf-8")
    (site / "backend" / "data" / "state.json").write_text('{"rakes": {}}', encoding="utf-8")
    (site / "plan.md").write_text("# changed", encoding="utf-8")
    (site / ".git" / "index.js").write_text("x", encoding="utf-8")
    assert dev.stamp(site) == before                 # a saved choice must not reload the page under you


def test_live_endpoint(server, site):
    status, headers, body = get(server + "/__live")
    assert status == 200 and headers["Content-Type"] == "application/json"
    assert json.loads(body) == {"stamp": dev.stamp(site)}


def test_live_can_be_turned_off(site):
    srv = dev.page_server(site, 0, "http://localhost:8000", live=False)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        text = get(f"http://127.0.0.1:{srv.server_address[1]}/")[2].decode()
        assert "window.TRAIN_API" in text and "/__live" not in text
    finally:
        srv.shutdown()
        srv.server_close()


def test_the_real_project_serves_only_page_files():
    served = {p.relative_to(dev.ROOT).as_posix() for p in dev.page_files(dev.ROOT)}
    assert "index.html" in served and "app.js" in served and "styles.css" in served
    assert not any(name.startswith(("backend/", "tests/", "docs/", ".")) for name in served)
    assert not any(name.endswith((".py", ".json", ".md", ".toml", ".lock")) for name in served)
