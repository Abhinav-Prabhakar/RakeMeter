"""The page against the backend.

The page plays the day itself while it is scrubbed (player.js), so its sum has to be the
backend's sum (timeline.at). This runs the page's own script under Node and compares the
two at every few minutes of the day, before and after the day is re-planned.
Also checks the page still hangs together: every script it loads exists, and nothing
refers to the mock files that the backend replaced.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from backend import timeline
from backend.service import Service
from backend.store import open_store

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")

RUNNER = r"""
const fs = require("fs"), vm = require("vm");
vm.runInThisContext(fs.readFileSync(process.argv[process.argv.length - 1], "utf8") + "\nglobalThis.Player = Player; globalThis.Yard = Yard;");
const camel = (v) => Array.isArray(v) ? v.map(camel)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(x)])) : v;
const { tracks, times } = JSON.parse(fs.readFileSync(0, "utf8"));
const page = camel(tracks);
process.stdout.write(JSON.stringify(times.map((t) => page.map((track) => Player.at(track, t)))));
"""


def camel(name):
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), name)


def play(tracks, times):
    out = subprocess.run([NODE, "-e", RUNNER, str(ROOT / "player.js")], input=json.dumps({"tracks": tracks, "times": times}),
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def days():
    plain = Service(open_store(None))
    replanned = Service(open_store(None))
    replanned.set_rake("S620", {"tippler": 1}, 564)
    replanned.set_rake("S619", {"hold": 60}, 564)
    replanned.set_rake("S617", {"claim": "applied"}, 564)
    replanned.set_rake("S618", {"owed": "Tarpaulin"}, 564)
    return {"the seeded day": plain.day()["rakes"], "a re-planned day": replanned.day()["rakes"]}


@pytest.mark.skipif(NODE is None, reason="needs Node to run the page's script")
@pytest.mark.parametrize("name", ["the seeded day", "a re-planned day"])
def test_the_page_plays_the_day_exactly_as_the_backend_does(name):
    tracks = days()[name]
    edges = sorted({e["at"] for t in tracks for e in t["events"]} | {s["at"] for t in tracks for s in t["steps"] + t["steps_if_claimed"]})
    times = [t / 4 for t in range(-800, 5200, 7)]                              # every 1.75 minutes, 20:40 the evening before to 21:40
    times += [e + d for e in edges for d in (-0.01, 0, 0.01)]                  # and either side of every event and meter step
    played = play(tracks, times)
    checked = 0
    for t, row in zip(times, played):
        for track, mine in zip(tracks, row):
            want = {camel(k): v for k, v in timeline.at(track, t).items()}
            assert set(mine) == set(want)
            for key, value in want.items():
                assert mine[key] == pytest.approx(value, abs=1e-9), (name, track["slot"], t, key)
                checked += 1
    assert checked > 80_000


# ---------------------------------------------------------------- the page hangs together
PAGE_SCRIPTS = ["art.js", "art-stock.js", "motion.js", "api.js", "player.js", "boot.js", "meter.js", "train.js", "board.js", "app.js", "bills.js"]


def test_every_script_the_page_loads_exists():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    boot = (ROOT / "boot.js").read_text(encoding="utf-8")
    loaded = re.findall(r'<script src="([^"]+)"', html) + re.findall(r'"([a-z-]+\.js)"', boot)
    assert loaded == PAGE_SCRIPTS
    for name in loaded:
        assert (ROOT / name).is_file(), name


def test_the_mock_files_are_gone_and_nothing_asks_for_them():
    for gone in ("sim.js", "ledger.js", "savings.js"):
        assert not (ROOT / gone).exists()
    for name in PAGE_SCRIPTS + ["index.html"]:
        text = (ROOT / name).read_text(encoding="utf-8")
        assert not re.search(r"\b(Sim|Ledger|Savings)\.", text), name
        assert "screenSavings" not in text, name


@pytest.mark.skipif(NODE is None, reason="needs Node to check the scripts parse")
@pytest.mark.parametrize("name", PAGE_SCRIPTS)
def test_every_script_parses(name):
    out = subprocess.run([NODE, "--check", str(ROOT / name)], capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stderr


def test_the_page_knows_no_tariff_of_its_own():
    # rates, slabs and allowances live in the rulebook; the page only ever reads what the backend sends
    for name in ("app.js", "bills.js", "board.js", "meter.js", "player.js", "api.js"):
        text = (ROOT / name).read_text(encoding="utf-8")
        assert not re.search(r"\b8700\b|\b1\.25\b|SLABS|RATE\s*=", text), name


def test_the_page_starts_only_when_every_script_is_in():
    # app.js must not start itself: with the fonts already cached it would run before bills.js had loaded
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    boot = (ROOT / "boot.js").read_text(encoding="utf-8")
    assert not re.search(r"^start\(\);", app, flags=re.M)
    assert boot.rstrip().endswith("start();\n})();")


def test_the_header_sits_above_the_screens():
    # each screen covers the whole artboard; without this the nav is drawn but cannot be clicked
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert re.search(r"\.topbar \{[^}]*z-index: \d+", css)
