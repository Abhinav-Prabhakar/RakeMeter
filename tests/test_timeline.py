"""The timeline: a planned rake as a track, and a track read at one minute of the day.

Contract for backend/timeline.py.

    track(planned, plant) -> the planned rake, plus
        wagons, tip                         from the plant (wagons, tip_minutes)
        events: [{at, status}, ...]         the five moments its status changes, in order
        steps                               rules.steps(free_until, released, wagons)
        steps_if_claimed                    the same, had the allowance it is owed been applied

    at(track, t) -> {status, here, tipped, loaded, view, over, hours, cost, left, due, cost_if_claimed}

`at` reads only the track (never the rulebook), so the page can do the same sum.
"""
import copy

import pytest

from backend import rules, timeline

TIP = 60 / 19
UNLOAD = 58 * TIP
PLANT = {"tipplers": 2, "wagons": 58, "tip_minutes": TIP, "form_minutes": 25, "gap_minutes": 10, "free_minutes": 420}
BUNCHING = {"rule": "Bunching", "minutes": 180}


def planned(slot, eta, placed, ready, start, owed=None, claim="none"):
    extra = owed["minutes"] if owed and claim == "applied" else 0
    return {"slot": slot, "id": "BNSF2706" + slot[2:], "from": "Gevra", "tonnes": 4100, "eta": eta, "placed": placed, "ready": ready,
            "tippler": 1, "line": 1, "owed": copy.deepcopy(owed), "hold": 0, "claim": claim, "livery": "orange",
            "start": start, "done": start + UNLOAD, "released": start + UNLOAD + 25, "free_until": placed + 420 + extra}


def day():
    """The seeded day, already planned (numbers as in test_schedule)."""
    return [
        planned("S615", -155, -110, -45, -45),
        planned("S616", 0, 30, 104, 104),
        planned("S617", 20, 55, 409, 409, BUNCHING),
        planned("S618", 195, 229, 494.5, 494.5),
        planned("S619", 360, 394, 602, 409 + UNLOAD + 10),
        planned("S620", 505, 539, 688, 688, BUNCHING),
        planned("S621", 700, 730, 795, 409 + 2 * (UNLOAD + 10), BUNCHING),
        planned("S622", 785, 815, 881, 688 + UNLOAD + 10, BUNCHING),
    ]


def tracks():
    return [timeline.track(r, PLANT) for r in day()]


def one(slot, **kw):
    r = next(r for r in day() if r["slot"] == slot)
    if kw:
        r = planned(r["slot"], r["eta"], r["placed"], r["ready"], r["start"], kw.get("owed", r["owed"]), kw.get("claim", r["claim"]))
    return timeline.track(r, PLANT)


# ---------------------------------------------------------------- track
def test_track_keeps_the_rake_and_adds_to_it():
    for before in day():
        t = timeline.track(before, PLANT)
        for key, value in before.items():
            assert t[key] == value
        assert t["wagons"] == 58 and t["tip"] == TIP


def test_track_does_not_touch_its_input():
    r = day()[2]
    snapshot = copy.deepcopy(r)
    t = timeline.track(r, PLANT)
    assert r == snapshot and t is not r
    t["owed"]["minutes"] = 1
    assert r == snapshot


def test_events_are_the_five_changes_of_status():
    t = one("S617")
    assert t["events"] == [
        {"at": 20, "status": "placing"},
        {"at": 55, "status": "waiting"},
        {"at": 409, "status": "unloading"},
        {"at": 409 + UNLOAD, "status": "forming"},
        {"at": 409 + UNLOAD + 25, "status": "released"},
    ]


def test_steps_come_from_the_rulebook():
    for r in day():
        t = timeline.track(r, PLANT)
        assert t["steps"] == rules.steps(r["free_until"], r["released"], 58)
    assert one("S615")["steps"] == []
    assert [s["total"] for s in one("S617")["steps"]] == [8700, 17400, 26100]
    assert [s["at"] for s in one("S617")["steps"]] == [475, 535, 595]
    assert [s["total"] for s in one("S618")["steps"]] == [8700]


def test_steps_if_claimed_push_the_meter_back_by_the_allowance():
    t = one("S617")                                                  # owed three hours, not applied
    assert t["steps_if_claimed"] == rules.steps(475 + 180, t["released"], 58) == []
    assert one("S618")["steps_if_claimed"] == one("S618")["steps"]   # owed nothing
    applied = one("S617", claim="applied")                           # already applied: nothing more to gain
    assert applied["free_until"] == 655
    assert applied["steps"] == [] and applied["steps_if_claimed"] == []


def test_steps_if_claimed_when_the_allowance_only_covers_part():
    r = planned("X", 0, 10, 20, 20, {"rule": "Tarpaulin", "minutes": 60})        # released 228.16, free until 430
    r.update(start=400, done=400 + UNLOAD, released=400 + UNLOAD + 25)           # now released 608.16: 178 over
    t = timeline.track(r, PLANT)
    assert [s["total"] for s in t["steps"]] == [8700, 17400, 26100]
    assert t["steps_if_claimed"] == [{"at": 490, "hours": 1, "total": 8700}, {"at": 550, "hours": 2, "total": 17400}]


def test_track_uses_the_plant():
    plant = {**PLANT, "wagons": 10, "tip_minutes": 2}
    r = planned("X", 0, 10, 20, 400)
    t = timeline.track(r, plant)
    assert t["wagons"] == 10 and t["tip"] == 2
    assert [s["total"] for s in t["steps"]] == [1500, 3000, 4500]


# ---------------------------------------------------------------- at: the whole day, as the page has always shown it
#       minute: one row per rake (status, tipped, hours, cost, view, cost_if_claimed)
GOLDEN = {
    -200: [("enroute", 0, 0, 0, -1, 0)] * 8,
    -140: [("placing", 0, 0, 0, -1, 0)] + [("enroute", 0, 0, 0, -1, 0)] * 7,
    -100: [("waiting", 0, 0, 0, 0, 0)] + [("enroute", 0, 0, 0, -1, 0)] * 7,
    0: [("unloading", 14, 0, 0, 14, 0), ("placing", 0, 0, 0, -1, 0)] + [("enroute", 0, 0, 0, -1, 0)] * 6,
    300: [("released", 58, 0, 0, 58, 0), ("forming", 58, 0, 0, 58, 0), ("waiting", 0, 0, 0, 0, 0), ("waiting", 0, 0, 0, 0, 0)]
         + [("enroute", 0, 0, 0, -1, 0)] * 4,
    564: [("released", 58, 0, 0, 58, 0), ("released", 58, 0, 0, 58, 0), ("unloading", 49, 2, 17400, 49, 0), ("unloading", 22, 0, 0, 22, 0),
          ("waiting", 0, 0, 0, 0, 0), ("waiting", 0, 0, 0, 0, 0), ("enroute", 0, 0, 0, -1, 0), ("enroute", 0, 0, 0, -1, 0)],
    700: [("released", 58, 0, 0, 58, 0), ("released", 58, 0, 0, 58, 0), ("released", 58, 3, 26100, 58, 0), ("forming", 58, 1, 8700, 58, 8700),
          ("unloading", 30, 0, 0, 30, 0), ("unloading", 3, 0, 0, 3, 0), ("placing", 0, 0, 0, -1, 0), ("enroute", 0, 0, 0, -1, 0)],
    900: [("released", 58, 0, 0, 58, 0), ("released", 58, 0, 0, 58, 0), ("released", 58, 3, 26100, 58, 0), ("released", 58, 1, 8700, 58, 8700),
          ("released", 58, 0, 0, 58, 0), ("released", 58, 0, 0, 58, 0), ("unloading", 33, 0, 0, 33, 0), ("unloading", 5, 0, 0, 5, 0)],
    1100: [("released", 58, 0, 0, 58, 0), ("released", 58, 0, 0, 58, 0), ("released", 58, 3, 26100, 58, 0), ("released", 58, 1, 8700, 58, 8700)]
          + [("released", 58, 0, 0, 58, 0)] * 4,
}


@pytest.mark.parametrize("minute", sorted(GOLDEN))
def test_the_seeded_day(minute):
    for track, want in zip(tracks(), GOLDEN[minute]):
        s = timeline.at(track, minute)
        got = (s["status"], s["tipped"], s["hours"], s["cost"], s["view"], s["cost_if_claimed"])
        assert got == want, track["slot"]


# ---------------------------------------------------------------- at: status
def test_status_changes_exactly_on_each_event():
    t = one("S617")
    edges = [(20, "enroute", "placing"), (55, "placing", "waiting"), (409, "waiting", "unloading"),
             (t["done"], "unloading", "forming"), (t["released"], "forming", "released")]
    for when, before, after in edges:
        assert timeline.at(t, when - 0.01)["status"] == before
        assert timeline.at(t, when)["status"] == after


def test_here_means_past_the_gate():
    t = one("S617")
    assert timeline.at(t, 19)["here"] is False
    for minute in (20, 60, 500, 600, 5000):
        assert timeline.at(t, minute)["here"] is True


# ---------------------------------------------------------------- at: tipping
def test_tipped_counts_whole_wagons():
    t = one("S617")
    assert timeline.at(t, 408)["tipped"] == 0
    assert timeline.at(t, 409)["tipped"] == 0
    assert timeline.at(t, 409 + TIP - 0.01)["tipped"] == 0
    assert timeline.at(t, 409 + TIP + 0.01)["tipped"] == 1
    assert timeline.at(t, 409 + 57.5 * TIP)["tipped"] == 57
    assert timeline.at(t, 409 + 58.5 * TIP)["tipped"] == 58
    assert timeline.at(t, 99999)["tipped"] == 58


def test_a_wagon_counts_the_instant_it_is_done():
    t = one("S616")                                                  # starts at 104
    for n in range(1, 59):
        assert timeline.at(t, 104 + n * TIP)["tipped"] == n          # float dust must not lose a wagon


def test_tipped_is_an_int():
    assert type(timeline.at(one("S617"), 500)["tipped"]) is int


def test_loaded_until_the_last_wagon():
    t = one("S617")
    assert timeline.at(t, 0)["loaded"] is True
    assert timeline.at(t, 409 + 57.5 * TIP)["loaded"] is True
    assert timeline.at(t, 409 + 58.01 * TIP)["loaded"] is False
    assert timeline.at(t, 2000)["loaded"] is False


def test_view_is_the_vehicle_on_the_stage():
    t = one("S617")
    assert timeline.at(t, 0)["view"] == -1                           # on its way: the locomotive
    assert timeline.at(t, 30)["view"] == -1                          # being placed: still the locomotive
    assert timeline.at(t, 100)["view"] == 0                          # waiting: the first wagon
    assert timeline.at(t, 409 + 10.5 * TIP)["view"] == 10            # the wagon being tipped
    assert timeline.at(t, 409 + 57.9 * TIP)["view"] == 57            # never past the last wagon while unloading
    assert timeline.at(t, t["done"] + 1)["view"] == 58               # forming up: the brake van
    assert timeline.at(t, t["released"] + 1)["view"] == 58


# ---------------------------------------------------------------- at: the meter
def test_the_meter_steps_just_after_each_hour_begins():
    t = one("S617")                                                  # free until 475
    for minute, hours, cost in [(474, 0, 0), (475, 0, 0), (475.01, 1, 8700), (535, 1, 8700), (535.01, 2, 17400),
                                (595, 2, 17400), (595.01, 3, 26100), (617, 3, 26100)]:
        s = timeline.at(t, minute)
        assert (s["hours"], s["cost"]) == (hours, cost), minute


def test_the_meter_stops_at_release():
    t = one("S617")                                                  # released 617.16, three hours charged
    for minute in (618, 700, 5000):
        s = timeline.at(t, minute)
        assert (s["hours"], s["cost"]) == (3, 26100)
        assert s["over"] == pytest.approx(t["released"] - 475)


def test_over_and_left():
    t = one("S617")
    assert timeline.at(t, 400)["over"] == 0 and timeline.at(t, 400)["left"] == 75
    assert timeline.at(t, 475)["over"] == 0 and timeline.at(t, 475)["left"] == 0
    assert timeline.at(t, 564)["over"] == 89 and timeline.at(t, 564)["left"] == -89
    assert timeline.at(t, 700)["left"] == -225                       # left keeps counting; over stopped at release


def test_nothing_is_charged_before_it_arrives():
    t = one("S617")
    s = timeline.at(t, 10)
    assert (s["over"], s["hours"], s["cost"], s["cost_if_claimed"], s["due"]) == (0, 0, 0, 0, False)
    assert s["left"] == 465


def test_due_while_the_meter_is_running():
    t = one("S617")
    assert timeline.at(t, 470)["due"] is False                       # nothing charged yet
    assert timeline.at(t, 500)["due"] is True
    assert timeline.at(t, 610)["due"] is True                        # forming up, still on the clock
    assert timeline.at(t, 700)["due"] is False                       # released: a bill now, not a meter
    assert timeline.at(one("S616"), 300)["due"] is False


def test_cost_if_claimed():
    t = one("S617")                                                  # three hours owed and not applied
    assert timeline.at(t, 564)["cost"] == 17400 and timeline.at(t, 564)["cost_if_claimed"] == 0
    applied = one("S617", claim="applied")
    assert timeline.at(applied, 564)["cost"] == 0 and timeline.at(applied, 564)["cost_if_claimed"] == 0
    plain = one("S618")                                              # nothing owed: the two are the same
    assert timeline.at(plain, 700)["cost"] == 8700 and timeline.at(plain, 700)["cost_if_claimed"] == 8700


def test_cost_if_claimed_part_way():
    r = planned("X", 0, 10, 20, 400, {"rule": "Tarpaulin", "minutes": 60})       # free until 430; an hour more if claimed
    t = timeline.track(r, PLANT)
    for minute, cost, claimed in [(430, 0, 0), (431, 8700, 0), (490, 8700, 0), (491, 17400, 8700), (551, 26100, 17400), (900, 26100, 17400)]:
        s = timeline.at(t, minute)
        assert (s["cost"], s["cost_if_claimed"]) == (cost, claimed), minute


def test_money_is_int():
    s = timeline.at(one("S617"), 564.5)
    assert type(s["cost"]) is int and type(s["cost_if_claimed"]) is int and type(s["hours"]) is int


# ---------------------------------------------------------------- at: reads the track and nothing else
MINIMAL = ["eta", "placed", "start", "done", "released", "free_until", "wagons", "tip", "steps", "steps_if_claimed"]


def test_at_needs_only_these_fields():
    full = one("S617")
    bare = {k: full[k] for k in MINIMAL}
    for minute in (-50, 30, 100, 450, 564, 600, 800):
        assert timeline.at(bare, minute) == timeline.at(full, minute)


def test_at_takes_the_meter_from_the_track():
    t = one("S617")
    t["steps"] = [{"at": 475, "hours": 1, "total": 111}, {"at": 500, "hours": 5, "total": 999}]
    t["steps_if_claimed"] = [{"at": 480, "hours": 1, "total": 7}]
    assert (timeline.at(t, 490)["hours"], timeline.at(t, 490)["cost"], timeline.at(t, 490)["cost_if_claimed"]) == (1, 111, 7)
    assert (timeline.at(t, 501)["hours"], timeline.at(t, 501)["cost"]) == (5, 999)
    assert timeline.at(t, 480)["cost_if_claimed"] == 0               # a step counts only once its minute has passed


def test_at_follows_the_track_s_own_wagons_and_tip():
    t = one("S617")
    t["wagons"], t["tip"] = 10, 5
    t["done"] = 409 + 50
    assert timeline.at(t, 409 + 26)["tipped"] == 5
    assert timeline.at(t, 409 + 49)["view"] == 9
    assert timeline.at(t, 409 + 51)["tipped"] == 10
    assert timeline.at(t, 409 + 51)["view"] == 10                    # the brake van follows the last wagon
    assert timeline.at(t, 409 + 51)["loaded"] is False


def test_at_does_not_touch_the_track():
    t = one("S617")
    snapshot = copy.deepcopy(t)
    timeline.at(t, 564)
    assert t == snapshot


def test_at_returns_exactly_these_keys():
    assert set(timeline.at(one("S617"), 564)) == {"status", "here", "tipped", "loaded", "view", "over", "hours", "cost", "left", "due", "cost_if_claimed"}
