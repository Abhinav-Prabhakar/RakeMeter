"""The scheduler: who is tipped where and when, and what the day costs.

Contract for backend/schedule.py. Pure functions over plain dicts.
A rake here is "raw" (what is known about it) or "planned" (raw plus start, done,
released, free_until). Nothing given to these functions may be changed by them.
"""
import copy
import itertools
import math

import pytest

from backend import rules, schedule

TIP = 60 / 19
PLANT = {"tipplers": 2, "wagons": 58, "tip_minutes": TIP, "form_minutes": 25, "gap_minutes": 10, "free_minutes": 420}
UNLOAD = 58 * TIP                       # 183.158 minutes to tip a whole rake
BUNCHING = {"rule": "Bunching", "minutes": 180}


def at(h, m):
    return h * 60 + m


def raw_day():
    rows = [
        ("S615", at(-3, 25), at(-2, 10), at(-1, 15), 1, 1, None),
        ("S616", at(0, 0), at(0, 30), at(1, 44), 2, 2, None),
        ("S617", at(0, 20), at(0, 55), at(6, 49), 1, 3, BUNCHING),
        ("S618", at(3, 15), at(3, 49), at(8, 14.5), 2, 4, None),
        ("S619", at(6, 0), at(6, 34), at(10, 2), 1, 3, None),
        ("S620", at(8, 25), at(8, 59), at(11, 28), 2, 4, BUNCHING),
        ("S621", at(11, 40), at(12, 10), at(13, 15), 1, 3, BUNCHING),
        ("S622", at(13, 5), at(13, 35), at(14, 41), 2, 4, BUNCHING),
    ]
    return [{"slot": s, "id": "BNSF2706" + s[2:], "from": "Gevra", "tonnes": 4100, "eta": eta, "placed": placed, "ready": ready,
             "tippler": tippler, "line": line, "owed": copy.deepcopy(owed), "hold": 0, "claim": "none", "livery": "orange"}
            for s, eta, placed, ready, tippler, line, owed in rows]


def by_slot(rakes):
    return {r["slot"]: r for r in rakes}


def simple(slot, ready, tippler=1, placed=0, **more):
    return {"slot": slot, "eta": placed - 30, "placed": placed, "ready": ready, "tippler": tippler, "owed": None, **more}


# ---------------------------------------------------------------- plan
def test_plan_of_the_seeded_day():
    p = by_slot(schedule.plan(raw_day(), PLANT))
    starts = {"S615": -45, "S616": 104, "S617": 409, "S618": 494.5, "S619": 409 + UNLOAD + 10, "S620": 688,
              "S621": 409 + 2 * (UNLOAD + 10), "S622": 688 + UNLOAD + 10}
    free = {"S615": 310, "S616": 450, "S617": 475, "S618": 649, "S619": 814, "S620": 959, "S621": 1150, "S622": 1235}
    for slot, start in starts.items():
        r = p[slot]
        assert r["start"] == pytest.approx(start, abs=1e-6)
        assert r["done"] == pytest.approx(start + UNLOAD, abs=1e-6)
        assert r["released"] == pytest.approx(start + UNLOAD + 25, abs=1e-6)
        assert r["free_until"] == free[slot]


def test_plan_keeps_everything_it_was_given():
    raw = raw_day()
    for before, after in zip(raw, schedule.plan(raw, PLANT)):
        for key, value in before.items():
            assert after[key] == value
        assert {"start", "done", "released", "free_until", "hold", "claim"} <= set(after)


def test_plan_does_not_touch_its_input():
    raw = raw_day()
    snapshot = copy.deepcopy(raw)
    out = schedule.plan(raw, PLANT)
    assert raw == snapshot
    assert all(a is not b for a, b in zip(raw, out))
    out[2]["owed"]["minutes"] = 1                        # nor is anything shared with the result
    assert raw == snapshot


def test_plan_returns_the_input_order_whatever_it_is():
    raw = raw_day()
    shuffled = [raw[i] for i in (5, 2, 7, 0, 3, 6, 1, 4)]
    out = schedule.plan(shuffled, PLANT)
    assert [r["slot"] for r in out] == [r["slot"] for r in shuffled]
    straight = by_slot(schedule.plan(raw, PLANT))
    for r in out:
        assert r["start"] == pytest.approx(straight[r["slot"]]["start"])


def test_plan_of_nothing():
    assert schedule.plan([], PLANT) == []


def test_defaults_for_hold_and_claim():
    out = schedule.plan([simple("A", 0), simple("B", 5, owed=dict(BUNCHING))], PLANT)
    assert out[0]["hold"] == 0 and out[0]["claim"] == "none"
    assert out[1]["hold"] == 0 and out[1]["claim"] == "none"


def test_claim_means_nothing_without_an_allowance():
    out = schedule.plan([simple("A", 0, claim="applied"), simple("B", 5, claim="filed")], PLANT)
    assert [r["claim"] for r in out] == ["none", "none"]
    assert out[0]["free_until"] == 420


def test_rakes_on_one_tippler_wait_for_each_other():
    out = schedule.plan([simple("A", 0), simple("B", 5), simple("C", 1000)], PLANT)
    assert out[0]["start"] == 0
    assert out[1]["start"] == pytest.approx(UNLOAD + 10)             # A's last wagon, then ten minutes to clear
    assert out[2]["start"] == 1000                                   # the tippler has long been free


def test_tipplers_do_not_wait_for_each_other():
    out = schedule.plan([simple("A", 0, 1), simple("B", 5, 2), simple("C", 6, 3)], {**PLANT, "tipplers": 3})
    assert [r["start"] for r in out] == [0, 5, 6]


def test_order_on_a_tippler_is_by_ready_not_by_input():
    out = by_slot(schedule.plan([simple("late", 50), simple("early", 10)], PLANT))
    assert out["early"]["start"] == 10
    assert out["late"]["start"] == pytest.approx(10 + UNLOAD + 10)


def test_ties_in_ready_go_in_input_order():
    out = schedule.plan([simple("first", 20), simple("second", 20), simple("third", 20)], PLANT)
    assert out[0]["start"] == 20
    assert out[1]["start"] == pytest.approx(20 + UNLOAD + 10)
    assert out[2]["start"] == pytest.approx(20 + 2 * (UNLOAD + 10))


def test_hold_counts_from_the_earliest_possible_start():
    raw = raw_day()
    by_slot(raw)["S617"]["hold"] = 30
    p = by_slot(schedule.plan(raw, PLANT))
    assert p["S617"]["start"] == 439
    assert p["S619"]["start"] == pytest.approx(439 + UNLOAD + 10)    # and everything behind it moves back
    assert p["S621"]["start"] == pytest.approx(439 + 2 * (UNLOAD + 10))
    assert p["S618"]["start"] == 494.5                               # the other tippler is unaffected


def test_hold_on_a_rake_that_is_already_waiting_for_the_tippler():
    out = schedule.plan([simple("A", 0), simple("B", 5, hold=60)], PLANT)
    assert out[1]["start"] == pytest.approx(UNLOAD + 10 + 60)


def test_free_time_is_extended_only_when_the_claim_is_applied():
    for claim, free in [("none", 475), ("filed", 475), ("applied", 655)]:
        raw = raw_day()
        by_slot(raw)["S617"]["claim"] = claim
        p = by_slot(schedule.plan(raw, PLANT))
        assert p["S617"]["free_until"] == free
        assert p["S617"]["claim"] == claim
        assert p["S617"]["start"] == 409                             # paperwork never moves a train


def test_plan_uses_the_plant_it_is_given():
    plant = {"tipplers": 2, "wagons": 30, "tip_minutes": 2, "form_minutes": 40, "gap_minutes": 15, "free_minutes": 300}
    out = schedule.plan([simple("A", 100, placed=20), simple("B", 100, placed=30)], plant)
    assert out[0]["start"] == 100 and out[0]["done"] == 160 and out[0]["released"] == 200 and out[0]["free_until"] == 320
    assert out[1]["start"] == 175 and out[1]["done"] == 235 and out[1]["released"] == 275 and out[1]["free_until"] == 330


def test_moving_a_rake_retimes_both_tipplers():
    raw = raw_day()
    by_slot(raw)["S618"]["tippler"] = 1
    p = by_slot(schedule.plan(raw, PLANT))
    assert p["S617"]["start"] == 409
    assert p["S618"]["start"] == pytest.approx(409 + UNLOAD + 10)            # behind S617 now
    assert p["S619"]["start"] == pytest.approx(409 + 2 * (UNLOAD + 10))
    assert p["S620"]["start"] == 688                                         # tippler 2 is free when it is ready


# ---------------------------------------------------------------- queue and cost
def test_queue_is_one_tippler_in_tipping_order():
    planned = schedule.plan(raw_day(), PLANT)
    assert [r["slot"] for r in schedule.queue(planned, 1)] == ["S615", "S617", "S619", "S621"]
    assert [r["slot"] for r in schedule.queue(planned, 2)] == ["S616", "S618", "S620", "S622"]
    assert schedule.queue(planned, 3) == []
    mixed = [planned[i] for i in (7, 5, 3, 1, 6, 4, 2, 0)]
    assert [r["slot"] for r in schedule.queue(mixed, 2)] == ["S616", "S618", "S620", "S622"]


def test_cost_of_the_seeded_day():
    planned = schedule.plan(raw_day(), PLANT)
    assert schedule.cost(planned, PLANT) == 34800                    # S617 three hours over, S618 one
    assert type(schedule.cost(planned, PLANT)) is int


def test_cost_falls_when_the_allowance_is_applied():
    raw = raw_day()
    by_slot(raw)["S617"]["claim"] = "applied"
    assert schedule.cost(schedule.plan(raw, PLANT), PLANT) == 8700


def test_cost_counts_wagons_from_the_plant():
    plant = {**PLANT, "wagons": 10, "free_minutes": 60}
    planned = schedule.plan([simple("A", 0)], plant)                 # released at 31.58 + 25, inside the hour
    assert schedule.cost(planned, plant) == 0
    planned = schedule.plan([simple("A", 100)], plant)               # released at 156.58: 96.58 over, two hours
    assert schedule.cost(planned, plant) == 3000


def test_cost_of_nothing():
    assert schedule.cost([], PLANT) == 0


# ---------------------------------------------------------------- change
def test_change_returns_new_rakes_and_leaves_the_old():
    raw = raw_day()
    snapshot = copy.deepcopy(raw)
    out = schedule.change(raw, "S619", {"hold": 60}, 564)
    assert raw == snapshot
    assert by_slot(out)["S619"]["hold"] == 60
    assert [r["slot"] for r in out] == [r["slot"] for r in raw]
    for a, b in zip(raw, out):
        if a["slot"] != "S619":
            assert a == b


def test_change_of_tippler_cannot_start_before_now():
    out = by_slot(schedule.change(raw_day(), "S620", {"tippler": 1}, 700.2))
    assert out["S620"]["tippler"] == 1
    assert out["S620"]["ready"] == 701                               # was 688; it is being moved at 11:40 and a bit
    out = by_slot(schedule.change(raw_day(), "S620", {"tippler": 1}, 564))
    assert out["S620"]["ready"] == 688                               # moved well before it was ready anyway


def test_change_to_the_same_tippler_changes_nothing():
    raw = raw_day()
    assert schedule.change(raw, "S620", {"tippler": 2}, 900) == raw


def test_change_several_things_at_once():
    out = by_slot(schedule.change(raw_day(), "S621", {"tippler": 2, "hold": 30, "claim": "filed", "livery": "cobalt"}, 600))
    r = out["S621"]
    assert (r["tippler"], r["hold"], r["claim"], r["livery"], r["ready"]) == (2, 30, "filed", "cobalt", 795)


def test_change_of_allowance():
    out = by_slot(schedule.change(raw_day(), "S618", {"owed": {"rule": "Shunting", "minutes": 120}}, 0))
    assert out["S618"]["owed"] == {"rule": "Shunting", "minutes": 120}
    raw = raw_day()
    by_slot(raw)["S617"]["claim"] = "applied"
    out = by_slot(schedule.change(raw, "S617", {"owed": None}, 0))
    assert out["S617"]["owed"] is None
    assert out["S617"]["claim"] == "none"                            # nothing left to claim


def test_change_does_not_keep_hold_of_the_patch():
    owed = {"rule": "Shunting", "minutes": 120}
    out = schedule.change(raw_day(), "S618", {"owed": owed}, 0)
    owed["minutes"] = 1
    assert by_slot(out)["S618"]["owed"] == {"rule": "Shunting", "minutes": 120}


def test_change_of_an_unknown_rake():
    with pytest.raises(KeyError):
        schedule.change(raw_day(), "S999", {"hold": 30}, 0)


@pytest.mark.parametrize("patch", [{"start": 5}, {"ready": 0}, {"hold": 30, "slot": "X"}, {"colour": "red"}])
def test_change_refuses_fields_that_are_not_choices(patch):
    with pytest.raises(ValueError):
        schedule.change(raw_day(), "S619", patch, 0)


def test_an_empty_change():
    raw = raw_day()
    assert schedule.change(raw, "S619", {}, 0) == raw


# ---------------------------------------------------------------- best
def brute_force(rakes, now):
    """The cheapest cost reachable by re-assigning rakes that have not started."""
    planned = schedule.plan(rakes, PLANT)
    movable = [r["slot"] for r in planned if r["start"] > now]
    cheapest = schedule.cost(planned, PLANT)
    for choice in itertools.product([1, 2], repeat=len(movable)):
        trial = rakes
        for slot, tippler in zip(movable, choice):
            trial = schedule.change(trial, slot, {"tippler": tippler}, now)
        cheapest = min(cheapest, schedule.cost(schedule.plan(trial, PLANT), PLANT))
    return cheapest, set(movable)


@pytest.mark.parametrize("now", [-200, 0, 300, 410, 564, 700, 900, 1200])
def test_best_is_the_cheapest_assignment(now):
    raw = raw_day()
    result = schedule.best(raw, PLANT, now)
    cheapest, movable = brute_force(raw, now)
    assert result["current"] == schedule.cost(schedule.plan(raw, PLANT), PLANT) == 34800
    assert result["cost"] == cheapest
    assert result["saving"] == result["current"] - result["cost"] >= 0
    assert schedule.cost(schedule.plan(result["rakes"], PLANT), PLANT) == result["cost"]
    assert [r["slot"] for r in result["rakes"]] == [r["slot"] for r in raw]
    assert {m["slot"] for m in result["moves"]} <= movable           # a rake that has started is never moved
    before, after = by_slot(raw), by_slot(result["rakes"])
    for m in result["moves"]:
        assert m["from"] == before[m["slot"]]["tippler"] != m["to"] == after[m["slot"]]["tippler"]
    moved = {m["slot"] for m in result["moves"]}
    for slot in before:
        if slot not in moved:
            assert after[slot] == before[slot]


def test_best_does_not_touch_its_input():
    raw = raw_day()
    snapshot = copy.deepcopy(raw)
    schedule.best(raw, PLANT, 0)
    assert raw == snapshot


def test_best_spreads_a_pile_up():
    # three rakes ready together on one tippler: the third overruns unless one is moved across
    rakes = [simple("A", 0), simple("B", 0), simple("C", 0)]
    assert schedule.cost(schedule.plan(rakes, PLANT), PLANT) == 26100
    result = schedule.best(rakes, PLANT, -10)
    assert result["current"] == 26100 and result["cost"] == 0 and result["saving"] == 26100
    assert len(result["moves"]) == 1                                 # one move is enough, so only one is made
    assert result["moves"][0]["from"] == 1 and result["moves"][0]["to"] == 2


def test_best_leaves_a_good_day_alone():
    rakes = [simple("A", 0, 1), simple("B", 0, 2)]
    result = schedule.best(rakes, PLANT, -10)
    assert result == {"current": 0, "cost": 0, "saving": 0, "moves": [], "rakes": rakes}


def test_best_cannot_move_what_has_started():
    rakes = [simple("A", 0), simple("B", 0), simple("C", 0)]
    # by 400 all three have started on tippler 1 (C at 386.3): nothing can be done any more
    result = schedule.best(rakes, PLANT, 400)
    assert result["moves"] == [] and result["cost"] == result["current"] == 26100


def test_a_late_move_is_costed_from_now():
    # moving C at minute 300 means it cannot start on the other tippler before 300
    rakes = [simple("A", 0), simple("B", 0), simple("C", 0)]
    result = schedule.best(rakes, PLANT, 300)
    moved = by_slot(result["rakes"])["C"]
    assert result["moves"] == [{"slot": "C", "from": 1, "to": 2}]
    assert moved["ready"] == 300
    planned = by_slot(schedule.plan(result["rakes"], PLANT))["C"]
    assert planned["released"] == pytest.approx(300 + UNLOAD + 25)   # 508.2: 88 minutes over, two hours
    assert result["cost"] == 17400 and result["saving"] == 8700


def test_best_of_nothing():
    assert schedule.best([], PLANT, 0) == {"current": 0, "cost": 0, "saving": 0, "moves": [], "rakes": []}


def test_best_handles_three_tipplers():
    plant = {**PLANT, "tipplers": 3}
    rakes = [simple(s, 0) for s in "ABCDE"]
    result = schedule.best(rakes, plant, -10)
    counts = [sum(1 for r in result["rakes"] if r["tippler"] == t) for t in (1, 2, 3)]
    assert result["cost"] == 0 and sorted(counts) == [1, 2, 2]
    assert math.isclose(result["saving"], result["current"])
