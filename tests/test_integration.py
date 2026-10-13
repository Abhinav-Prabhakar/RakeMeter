"""Everything together: the real modules behind the real API, on a real file.

These are the checks the plan promised for after the last wave: the day the backend
serves is the day the page has always shown, the months add up to the stays behind them,
and what is chosen through the API is still there after a restart.
"""
import json

import pytest
from fastapi.testclient import TestClient

from backend import audit as audit_module
from backend import rules, schedule, timeline, world
from backend.api import create_app
from backend.service import Service
from backend.store import open_store

UNLOAD = 58 * 60 / 19


@pytest.fixture
def path(tmp_path):
    return tmp_path / "state.json"


def client_on(path):
    return TestClient(create_app(Service(open_store(path))))


def by_slot(rakes):
    return {r["slot"]: r for r in rakes}


# ---------------------------------------------------------------- the day the page has always shown
def test_the_served_day_is_the_demo_day(path):
    day = client_on(path).get("/api/day").json()
    r = by_slot(day["rakes"])
    starts = {"S615": -45, "S616": 104, "S617": 409, "S618": 494.5, "S619": 409 + UNLOAD + 10, "S620": 688,
              "S621": 409 + 2 * (UNLOAD + 10), "S622": 688 + UNLOAD + 10}
    for slot, start in starts.items():
        assert r[slot]["start"] == pytest.approx(start)
        assert r[slot]["released"] == pytest.approx(start + UNLOAD + 25)
    assert [r[s]["free_until"] for s in starts] == [310, 450, 475, 649, 814, 959, 1150, 1235]
    assert day["cost"] == 34800
    assert [len(r[s]["steps"]) for s in starts] == [0, 0, 3, 1, 0, 0, 0, 0]


def test_at_opening_time_the_yard_reads_as_it_did(path):
    state = by_slot(client_on(path).get("/api/day/state", params={"t": 564}).json()["rakes"])
    got = {s: (x["status"], x["tipped"], x["cost"]) for s, x in state.items()}
    assert got == {"S615": ("released", 58, 0), "S616": ("released", 58, 0), "S617": ("unloading", 49, 17400), "S618": ("unloading", 22, 0),
                   "S619": ("waiting", 0, 0), "S620": ("waiting", 0, 0), "S621": ("enroute", 0, 0), "S622": ("enroute", 0, 0)}


def test_the_meter_a_track_carries_is_the_rulebooks(path):
    for track in client_on(path).get("/api/day").json()["rakes"]:
        over = track["released"] - track["free_until"]
        assert len(track["steps"]) == rules.hours_over(over)
        final = track["steps"][-1]["total"] if track["steps"] else 0
        assert final == rules.charge(rules.hours_over(over), track["wagons"])
        assert timeline.at(track, 10_000)["cost"] == final


def test_the_days_cost_is_the_sum_of_its_meters(path):
    client = client_on(path)
    client.patch("/api/rakes/S620", json={"tippler": 1, "at": 564})
    client.patch("/api/rakes/S619", json={"hold": 30, "at": 564})
    day = client.get("/api/day").json()
    assert day["cost"] == sum(t["steps"][-1]["total"] for t in day["rakes"] if t["steps"])
    assert day["cost"] == schedule.cost(day["rakes"], world.PLANT)


def test_best_never_costs_more_and_its_moves_can_be_made(path):
    client = client_on(path)
    client.patch("/api/rakes/S620", json={"tippler": 1, "at": 564})          # make the day worse than it need be
    day = client.get("/api/day", params={"at": 564}).json()
    best = day["best"]
    assert best["cost"] <= best["current"] == day["cost"] and best["saving"] > 0
    for move in best["moves"]:
        day = client.patch(f"/api/rakes/{move['slot']}", json={"tippler": move["to"], "at": 564}).json()
    assert day["cost"] == best["cost"]


# ---------------------------------------------------------------- the months add up
def test_the_months_are_the_stays(path):
    months = client_on(path).get("/api/months").json()["months"]
    stays = world.history(1)
    audits = [(s, audit_module.audit(s, world.TODAY, world.PLANT)) for s in stays]
    assert sum(m["rakes"] for m in months) == len(stays)
    assert sum(m["billed"] for m in months) == sum(a["billed"] for _, a in audits)
    assert sum(m["baseline"] for m in months) == sum(a["would"] for _, a in audits)
    assert sum(m["recovered"] for m in months) == sum(a["back"] for _, a in audits if a["state"] == "won")
    for m in months:
        assert m["baseline"] - m["paid"] == m["avoided"] + m["recovered"] == m["saved"]
        assert sum(c["rakes"] for c in m["causes"]) == m["charged"] <= m["rakes"]


def test_the_story_the_months_tell(path):
    months = client_on(path).get("/api/months").json()["months"]
    share = [m["saved"] / m["baseline"] for m in months]
    assert share[0] == share[1] == 0 < share[2] < share[3] < share[4]
    assert [m["claims"]["won"]["count"] > 0 for m in months] == [False, False, True, True, True, True]
    assert months[0]["claims"]["missed"]["count"] > months[4]["claims"]["missed"]["count"]
    assert months[-1]["claims"]["open"] == {"count": 2, "amount": 34800}


def test_every_bill_on_show_can_be_read_back_and_agrees_with_its_month(path):
    client = client_on(path)
    for m in client.get("/api/months").json()["months"]:
        body = client.get(f"/api/months/{m['id']}/bills").json()
        assert body["month"] == m
        for b in body["bills"]:
            a = b["audit"]
            assert a["back"] == a["overcharged"] + a["claimable"] and a["due"] == a["billed"] - a["back"]
            assert a["deadline"] == rules.deadline(b["released"])
            assert a["left"] == rules.days_between(world.TODAY, a["deadline"])


# ---------------------------------------------------------------- remembered across a restart
def test_a_whole_session_survives_a_restart(path):
    first = client_on(path)
    first.patch("/api/rakes/S619", json={"hold": 60, "at": 564})
    first.patch("/api/rakes/S617", json={"claim": "applied", "livery": "forest", "at": 564})
    first.patch("/api/rakes/S618", json={"owed": "Shunting", "at": 564})
    bill = next(b for b in first.get("/api/months/2026-10/bills").json()["bills"] if b["audit"]["state"] == "open")
    first.patch(f"/api/bills/{bill['id']}", json={"claim": "won"})
    before = (first.get("/api/day", params={"at": 564}).json(), first.get("/api/months").json(), first.get("/api/months/2026-10/bills").json())

    second = client_on(path)                                                    # a new process on the same file
    after = (second.get("/api/day", params={"at": 564}).json(), second.get("/api/months").json(), second.get("/api/months/2026-10/bills").json())
    assert after == before
    assert by_slot(after[0]["rakes"])["S617"]["livery"] == "forest"
    assert after[1]["months"][-1]["recovered"] == 8700 + bill["audit"]["back"]

    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert set(on_disk["rakes"]) == {"S617", "S618", "S619"} and set(on_disk["bills"]) == {bill["id"]}

    assert second.post("/api/reset").json()["cost"] == 34800
    third = client_on(path)
    assert third.get("/api/day").json()["cost"] == 34800
    assert third.get("/api/months").json()["months"][-1]["recovered"] == 8700


def test_a_refused_choice_is_never_written(path):
    client = client_on(path)
    assert client.patch("/api/rakes/S617", json={"tippler": 2, "at": 564}).status_code == 409
    assert client.patch("/api/rakes/S621", json={"hold": 45}).status_code == 400
    assert client.patch("/api/bills/9999", json={"claim": "won"}).status_code == 404
    assert not path.exists() or json.loads(path.read_text(encoding="utf-8")) == {"rakes": {}, "bills": {}}
