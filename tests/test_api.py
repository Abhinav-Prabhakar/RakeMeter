"""The JSON API over the service.

Contract for backend/api.py.

    create_app(service) -> a FastAPI app
    app                 -> the module-level app uvicorn runs: a Service on the store at the
                           path in $TRAIN_STATE (default backend/data/state.json)

    GET   /api/health                    {"ok": true}
    GET   /api/rules                     service.rules()
    GET   /api/day?at=                   service.day(at)
    GET   /api/day/state?t=              {"t": t, "rakes": service.state(t)}
    GET   /api/rakes/{slot}/options?at=  service.options(slot, at)
    PATCH /api/rakes/{slot}              body: the patch, plus an optional "at"  -> service.set_rake(...)
    GET   /api/months                    {"months": service.months()}
    GET   /api/months/{id}/bills         {"month": that month, "bills": service.bills(id)}
    PATCH /api/bills/{id}                body: the patch  -> service.set_bill(...)
    POST  /api/reset                     service.reset()

Every error, whatever raised it, is {"error": {"code": ..., "message": ...}}:
    400 invalid     404 not_found     409 conflict     405 method_not_allowed
The page is served from another port, so the API answers CORS for localhost origins.
"""
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from backend import world
from backend.api import create_app
from backend.service import Service
from backend.store import open_store

NOW = 564
PAGE = "http://localhost:5178"


@pytest.fixture
def service():
    return Service(open_store(None))


@pytest.fixture
def client(service):
    return TestClient(create_app(service))


def error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def by_slot(rakes):
    return {r["slot"]: r for r in rakes}


# ================================================================ reading
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_rules(client, service):
    r = client.get("/api/rules")
    assert r.status_code == 200 and r.json() == json.loads(json.dumps(service.rules()))
    assert r.json()["charges"][10] == 90480 and r.json()["slabs"][-1] == {"upto": None, "multiplier": 3}


def test_day(client, service):
    r = client.get("/api/day")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert r.json() == json.loads(json.dumps(service.day()))
    assert r.json()["cost"] == 34800 and len(r.json()["rakes"]) == 8


def test_day_at(client, service):
    assert client.get("/api/day", params={"at": 564.5}).json() == json.loads(json.dumps(service.day(564.5)))
    assert client.get("/api/day?at=-100").json()["best"] == json.loads(json.dumps(service.day(-100)["best"]))


def test_state(client, service):
    r = client.get("/api/day/state", params={"t": NOW})
    assert r.status_code == 200
    assert r.json() == {"t": NOW, "rakes": json.loads(json.dumps(service.state(NOW)))}
    assert by_slot(r.json()["rakes"])["S617"]["cost"] == 17400
    assert client.get("/api/day/state?t=700.5").json()["t"] == 700.5


def test_options(client, service):
    r = client.get("/api/rakes/S619/options", params={"at": NOW})
    assert r.status_code == 200 and r.json() == json.loads(json.dumps(service.options("S619", NOW)))
    assert client.get("/api/rakes/S617/options", params={"at": NOW}).json()["locked"] is True
    assert client.get("/api/rakes/S617/options").json()["locked"] is False       # no `at`: before the day begins


def test_months(client, service):
    r = client.get("/api/months")
    assert r.status_code == 200 and r.json() == {"months": json.loads(json.dumps(service.months()))}
    assert [m["id"] for m in r.json()["months"]] == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]


def test_bills(client, service):
    r = client.get("/api/months/2026-10/bills")
    assert r.status_code == 200
    assert r.json() == {"month": json.loads(json.dumps(service.months()[-1])), "bills": json.loads(json.dumps(service.bills("2026-10")))}
    assert len(r.json()["bills"]) == 8
    assert client.get("/api/months/2026-07/bills").json()["month"]["id"] == "2026-07"


# ================================================================ writing
def test_patch_rake(client, service):
    r = client.patch("/api/rakes/S617", json={"claim": "applied", "at": NOW})
    assert r.status_code == 200
    assert r.json() == json.loads(json.dumps(service.day(NOW)))
    assert r.json()["cost"] == 8700
    assert client.get("/api/day").json()["cost"] == 8700


def test_patch_rake_uses_at(client):
    r = client.patch("/api/rakes/S619", json={"tippler": 2, "at": 602.1})        # ready at 602, a moment before it starts
    assert r.status_code == 200 and by_slot(r.json()["rakes"])["S619"]["ready"] == 603
    error(client.patch("/api/rakes/S617", json={"tippler": 2, "at": NOW}), 409, "conflict")
    assert client.patch("/api/rakes/S617", json={"tippler": 2}).status_code == 200            # no `at`: before the day begins


def test_patch_rake_several_fields_and_null(client):
    r = client.patch("/api/rakes/S621", json={"hold": 30, "livery": "cobalt", "owed": None, "at": NOW})
    assert r.status_code == 200
    rake = by_slot(r.json()["rakes"])["S621"]
    assert (rake["hold"], rake["livery"], rake["owed"], rake["claim"]) == (30, "cobalt", None, "none")
    r = client.patch("/api/rakes/S621", json={"owed": "Shunting", "at": NOW})
    assert by_slot(r.json()["rakes"])["S621"]["owed"] == {"rule": "Shunting", "minutes": 120}


def test_patch_bill(client, service):
    bill = next(b for b in service.bills("2026-10") if b["rake"] == "BNSF270638")
    r = client.patch(f"/api/bills/{bill['id']}", json={"claim": "won"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"bill", "month"}
    assert body["bill"]["audit"]["state"] == "won" and body["month"]["id"] == "2026-10"
    assert body["month"] == client.get("/api/months").json()["months"][-1]
    shown = client.get("/api/months/2026-10/bills").json()["bills"]
    assert next(b for b in shown if b["id"] == bill["id"])["claim"] == "won"


def test_reset(client, service):
    client.patch("/api/rakes/S617", json={"claim": "applied"})
    bill = next(b for b in service.bills("2026-10") if b["rake"] == "BNSF270638")
    client.patch(f"/api/bills/{bill['id']}", json={"claim": "filed"})
    r = client.post("/api/reset")
    assert r.status_code == 200 and r.json()["cost"] == 34800
    assert r.json() == json.loads(json.dumps(Service(open_store(None)).day()))
    assert client.get("/api/months").json() == {"months": json.loads(json.dumps(Service(open_store(None)).months()))}


# ================================================================ errors
def test_not_found(client):
    error(client.patch("/api/rakes/S999", json={"hold": 30}), 404, "not_found")
    error(client.get("/api/rakes/S999/options"), 404, "not_found")
    error(client.patch("/api/bills/9999", json={"claim": "filed"}), 404, "not_found")
    error(client.get("/api/months/2026-04/bills"), 404, "not_found")
    error(client.get("/api/nothing/here"), 404, "not_found")
    error(client.get("/somewhere/else"), 404, "not_found")


def test_invalid(client):
    error(client.patch("/api/rakes/S621", json={"hold": 45}), 400, "invalid")
    error(client.patch("/api/rakes/S621", json={"tippler": "2"}), 400, "invalid")
    error(client.patch("/api/rakes/S621", json={"hold": 30, "extra": 1}), 400, "invalid")
    error(client.patch("/api/rakes/S621", json={}), 400, "invalid")
    error(client.patch("/api/rakes/S621", json={"at": NOW}), 400, "invalid")                 # `at` alone is no patch
    error(client.patch("/api/bills/0001", json={"claim": "applied"}), 400, "invalid")
    error(client.get("/api/months/banana/bills"), 400, "invalid")


def test_conflict(client, service):
    error(client.patch("/api/rakes/S618", json={"hold": 30, "at": NOW}), 409, "conflict")
    missed = next(b for b in service.bills("2026-10") if b["rake"] == "BNSF270598")
    error(client.patch(f"/api/bills/{missed['id']}", json={"claim": "filed"}), 409, "conflict")


@pytest.mark.parametrize("body", ["", "{", "not json", "[1, 2]", '"hold"', "42", "null", '{"hold": NaN}'])
def test_bodies_that_are_not_a_json_object(client, body):
    headers = {"content-type": "application/json"}
    error(client.patch("/api/rakes/S621", content=body, headers=headers), 400, "invalid")
    error(client.patch("/api/bills/0001", content=body, headers=headers), 400, "invalid")


@pytest.mark.parametrize("value", ["soon", "", "nan", "inf", "-inf", "1e999", "12:30"])
def test_times_that_are_not_numbers(client, value):
    error(client.get("/api/day", params={"at": value}), 400, "invalid")
    error(client.get("/api/day/state", params={"t": value}), 400, "invalid")
    error(client.get("/api/rakes/S619/options", params={"at": value}), 400, "invalid")


def test_at_in_a_body_must_be_a_number(client):
    for bad in ("564", None, True, [564]):
        error(client.patch("/api/rakes/S621", json={"hold": 30, "at": bad}), 400, "invalid")
    assert by_slot(client.get("/api/day").json()["rakes"])["S621"]["hold"] == 0


def test_state_needs_t(client):
    error(client.get("/api/day/state"), 400, "invalid")


def test_wrong_method(client):
    error(client.post("/api/day"), 405, "method_not_allowed")
    error(client.get("/api/reset"), 405, "method_not_allowed")
    error(client.delete("/api/rakes/S617"), 405, "method_not_allowed")
    error(client.put("/api/bills/0001", json={"claim": "filed"}), 405, "method_not_allowed")


def test_a_refused_write_changes_nothing(client):
    before = client.get("/api/day").json()
    client.patch("/api/rakes/S621", json={"hold": 30, "livery": "pink"})
    client.patch("/api/rakes/S617", json={"claim": "applied", "tippler": 2, "at": NOW})
    assert client.get("/api/day").json() == before


def test_a_crash_inside_the_service_is_a_clean_500():
    class Broken(Service):
        def months(self):
            raise RuntimeError("the books fell off the shelf")

    quiet = TestClient(create_app(Broken(open_store(None))), raise_server_exceptions=False)
    r = quiet.get("/api/months")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal"
    assert "shelf" not in r.text                                     # what went wrong inside is not the caller's business


# ================================================================ the page is on another port
def test_cors_for_the_page(client):
    r = client.get("/api/day", headers={"Origin": PAGE})
    assert r.headers["access-control-allow-origin"] == PAGE
    for origin in ("http://127.0.0.1:5178", "http://localhost:3000", "http://localhost"):
        assert client.get("/api/health", headers={"Origin": origin}).headers["access-control-allow-origin"] == origin


def test_cors_preflight_for_a_patch(client):
    r = client.options("/api/rakes/S617", headers={"Origin": PAGE, "Access-Control-Request-Method": "PATCH",
                                                   "Access-Control-Request-Headers": "content-type"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == PAGE
    assert "PATCH" in r.headers["access-control-allow-methods"]
    assert "content-type" in r.headers["access-control-allow-headers"].lower()


def test_cors_on_errors_too(client):
    r = client.patch("/api/rakes/S999", json={"hold": 30}, headers={"Origin": PAGE})
    assert r.status_code == 404 and r.headers["access-control-allow-origin"] == PAGE


def test_no_cors_for_strangers(client):
    for origin in ("https://example.com", "http://localhost.evil.example", "http://evil.example:5178", "null"):
        r = client.get("/api/day", headers={"Origin": origin})
        assert "access-control-allow-origin" not in r.headers, origin


# ================================================================ over the wire, end to end
def test_a_session(client):
    day = client.get("/api/day", params={"at": NOW}).json()
    assert day["cost"] == 34800
    options = client.get("/api/rakes/S619/options", params={"at": NOW}).json()
    assert [o["value"] for o in options["hold"]] == [0, 30, 60, 120]
    day = client.patch("/api/rakes/S619", json={"hold": 60, "at": NOW}).json()
    assert by_slot(day["rakes"])["S619"]["hold"] == 60
    assert by_slot(client.get("/api/day/state", params={"t": 700}).json()["rakes"])["S619"]["status"] == "unloading"
    months = client.get("/api/months").json()["months"]
    bills = client.get(f"/api/months/{months[-1]['id']}/bills").json()["bills"]
    target = next(b for b in bills if b["audit"]["state"] == "open")
    out = client.patch(f"/api/bills/{target['id']}", json={"claim": "filed"}).json()
    assert out["month"]["claims"]["filed"]["count"] == months[-1]["claims"]["filed"]["count"] + 1
    assert client.post("/api/reset").json()["cost"] == 34800


def test_the_store_outlives_the_app(tmp_path):
    path = tmp_path / "state.json"
    first = TestClient(create_app(Service(open_store(path))))
    first.patch("/api/rakes/S617", json={"claim": "applied", "at": NOW})
    second = TestClient(create_app(Service(open_store(path))))
    assert second.get("/api/day").json()["cost"] == 8700


def test_the_module_level_app_uses_train_state(tmp_path, monkeypatch):
    path = tmp_path / "elsewhere" / "state.json"
    monkeypatch.setenv("TRAIN_STATE", str(path))
    import backend.api
    module = importlib.reload(backend.api)
    try:
        client = TestClient(module.app)
        assert client.get("/api/health").json() == {"ok": True}
        assert client.patch("/api/rakes/S617", json={"claim": "applied"}).status_code == 200
        assert json.loads(path.read_text(encoding="utf-8"))["rakes"]["S617"]["claim"] == "applied"
    finally:
        monkeypatch.delenv("TRAIN_STATE")
        importlib.reload(backend.api)


def test_importing_the_api_writes_nothing(tmp_path, monkeypatch):
    path = tmp_path / "state.json"
    monkeypatch.setenv("TRAIN_STATE", str(path))
    import backend.api
    try:
        importlib.reload(backend.api)
        assert not path.exists()
    finally:
        monkeypatch.delenv("TRAIN_STATE")
        importlib.reload(backend.api)
