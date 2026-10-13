"""The service: the use-cases the page needs, composed from the other modules.

Contract for backend/service.py.

    service = Service(store, seed=1)

    service.day(at=None)   -> {"plant", "today", "rakes": [track, ...], "cost", "best": {current, cost, saving, moves}}
    service.state(t)       -> [{"slot", **timeline.at(track, t)}, ...] in the day's order
    service.options(slot, at=None) -> {"slot", "locked", "tippler": [option, ...], "hold": [option, ...]}
                              option = {"value", "current", "start", "released", "cost", "delta"}
    service.set_rake(slot, patch, at=None) -> the new day
    service.months()       -> [month, ...]
    service.bills(month_id) -> [bill, ...]            (ledger.notable)
    service.set_bill(bill_id, patch) -> {"bill", "month"}
    service.reset()        -> the day, with every choice forgotten
    service.rules()        -> the rulebook as data, for the page to draw with (see test_the_rulebook_as_data)

`at` is the minute of the simulated day the choice is made at; None means before the day
begins (-1440). Choices are kept in the store, so a new Service on the same store sees them.

A rake patch may hold: tippler (1..plant tipplers), hold (0, 30, 60 or 120 minutes),
owed (an allowance name from the rulebook, or None), claim ("none" | "filed" | "applied"),
livery (one of world.LIVERIES).
A bill patch may hold: claim ("none" | "filed" | "won").

What goes wrong is raised as ServiceError with .code and .message:
    "not_found"  no such rake, bill or month
    "invalid"    the patch does not make sense
    "conflict"   the patch makes sense but can no longer be done
"""
import copy
import math

import pytest

from backend import ledger, rules, schedule, timeline, world
from backend.service import Service, ServiceError
from backend.store import open_store

PLANT = world.PLANT
UNLOAD = 58 * 60 / 19
NOW = 564                                    # 09:24, where the page opens


@pytest.fixture
def service():
    return Service(open_store(None))


def by_slot(rakes):
    return {r["slot"]: r for r in rakes}


def fails(code, call, *args, **kw):
    with pytest.raises(ServiceError) as caught:
        call(*args, **kw)
    assert caught.value.code == code
    assert isinstance(caught.value.message, str) and caught.value.message
    return caught.value


# ================================================================ the day
def test_the_untouched_day(service):
    d = service.day()
    assert set(d) == {"plant", "today", "rakes", "cost", "best"}
    assert d["plant"] == PLANT and d["today"] == "2026-10-13"
    assert d["cost"] == 34800
    planned = schedule.plan(world.day(), PLANT)
    assert d["rakes"] == [timeline.track(r, PLANT) for r in planned]
    assert [r["slot"] for r in d["rakes"]] == ["S615", "S616", "S617", "S618", "S619", "S620", "S621", "S622"]


def test_the_day_carries_the_best_plan(service):
    for now in (None, 0, NOW, 900):
        d = service.day(now)
        want = schedule.best(world.day(), PLANT, -1440 if now is None else now)
        assert set(d["best"]) == {"current", "cost", "saving", "moves"}
        assert d["best"]["current"] == d["cost"] == 34800
        assert d["best"]["cost"] == want["cost"] and d["best"]["saving"] == want["saving"]
        assert len(d["best"]["moves"]) == len(want["moves"])


def test_the_day_is_json(service):
    import json
    json.dumps(service.day(NOW), allow_nan=False)
    json.dumps(service.state(NOW), allow_nan=False)
    json.dumps(service.options("S619", NOW), allow_nan=False)
    json.dumps(service.months(), allow_nan=False)
    json.dumps(service.bills("2026-10"), allow_nan=False)


def test_what_the_service_returns_is_yours_to_change(service):
    d = service.day()
    d["rakes"][0]["tippler"] = 9
    d["plant"]["wagons"] = 1
    d["rakes"].clear()
    again = service.day()
    assert len(again["rakes"]) == 8 and again["rakes"][0]["tippler"] == 1 and again["plant"]["wagons"] == 58
    assert world.PLANT["wagons"] == 58


# ================================================================ the rulebook
def test_the_rulebook_as_data(service):
    r = service.rules()
    assert set(r) == {"rate", "wagons", "free_minutes", "slabs", "allowances", "claim_days", "holds", "claims", "liveries", "causes", "charges"}
    assert (r["rate"], r["wagons"], r["free_minutes"], r["claim_days"]) == (150, 58, 420, 10)
    assert r["slabs"] == [{"upto": 6, "multiplier": 1}, {"upto": 12, "multiplier": 1.1}, {"upto": 24, "multiplier": 1.25},
                          {"upto": 48, "multiplier": 1.5}, {"upto": 72, "multiplier": 2}, {"upto": None, "multiplier": 3}]
    assert r["allowances"] == [{"rule": "Bunching", "minutes": 180}, {"rule": "Shunting", "minutes": 120}, {"rule": "Tarpaulin", "minutes": 60}]
    assert r["holds"] == [0, 30, 60, 120]
    assert r["claims"] == {"rake": ["none", "filed", "applied"], "bill": ["none", "filed", "won"]}
    assert r["liveries"] == world.LIVERIES and r["causes"] == world.CAUSES
    # charges[h] is the bill for h hours over: what the page needs to draw a meter without knowing the slabs
    assert len(r["charges"]) == 97
    assert r["charges"] == [rules.charge(h, 58) for h in range(97)]
    assert r["charges"][:4] == [0, 8700, 17400, 26100] and r["charges"][24] == 240120


def test_the_rulebook_is_json_and_a_copy(service):
    import json
    json.dumps(service.rules(), allow_nan=False)
    r = service.rules()
    r["charges"][1] = 0
    r["allowances"].clear()
    r["liveries"].append("pink")
    assert service.rules()["charges"][1] == 8700 and len(service.rules()["allowances"]) == 3
    assert world.LIVERIES == ["orange", "oxide", "cobalt", "forest", "ochre"]


# ================================================================ state
def test_state_is_every_rake_at_that_minute(service):
    tracks = service.day()["rakes"]
    for t in (-200, 0, 300, NOW, 700.5, 1100):
        assert service.state(t) == [{"slot": tr["slot"], **timeline.at(tr, t)} for tr in tracks]


def test_state_at_opening_time(service):
    s = by_slot(service.state(NOW))
    assert (s["S617"]["status"], s["S617"]["tipped"], s["S617"]["cost"]) == ("unloading", 49, 17400)
    assert (s["S618"]["status"], s["S618"]["tipped"], s["S618"]["cost"]) == ("unloading", 22, 0)
    assert s["S621"]["status"] == "enroute"


@pytest.mark.parametrize("bad", [None, "564", math.nan, math.inf, -math.inf, True, [1]])
def test_state_needs_a_real_minute(service, bad):
    fails("invalid", service.state, bad)


# ================================================================ choices on a rake
def test_applying_an_allowance(service):
    d = service.set_rake("S617", {"claim": "applied"}, NOW)
    r = by_slot(d["rakes"])["S617"]
    assert r["claim"] == "applied" and r["free_until"] == 655 and r["steps"] == []
    assert d["cost"] == 8700
    assert service.day()["cost"] == 8700                             # and it is remembered
    assert by_slot(service.state(NOW))["S617"]["cost"] == 0


def test_filing_changes_no_money(service):
    d = service.set_rake("S617", {"claim": "filed"}, NOW)
    assert by_slot(d["rakes"])["S617"]["claim"] == "filed" and d["cost"] == 34800


def test_moving_a_rake_to_the_other_tippler(service):
    d = service.set_rake("S620", {"tippler": 1}, NOW)
    want = schedule.plan(schedule.change(world.day(), "S620", {"tippler": 1}, NOW), PLANT)
    assert d["rakes"] == [timeline.track(r, PLANT) for r in want]
    assert d["cost"] == schedule.cost(want, PLANT) == 52200          # it lands behind S619, and S621 behind it
    r = by_slot(d["rakes"])
    assert r["S620"]["tippler"] == 1
    assert r["S620"]["start"] == pytest.approx(409 + 2 * (UNLOAD + 10))
    assert r["S622"]["start"] == 881                                 # tippler 2 is clear for it now


def test_a_move_is_timed_from_when_it_was_made(service):
    service.set_rake("S621", {"hold": 120}, NOW)                     # held, so at 15:00 it is still waiting
    d = service.set_rake("S621", {"tippler": 2}, 900.4)              # it was ready at 13:15; moved at 15:00 and a bit
    r = by_slot(d["rakes"])["S621"]
    assert (r["tippler"], r["ready"], r["hold"]) == (2, 901, 120)
    assert by_slot(service.day(1000)["rakes"])["S621"]["ready"] == 901          # asking later does not move it again


def test_holding_a_rake_back(service):
    d = service.set_rake("S619", {"hold": 60}, NOW)
    r = by_slot(d["rakes"])
    assert r["S619"]["hold"] == 60
    assert r["S619"]["start"] == pytest.approx(409 + UNLOAD + 10 + 60)
    assert r["S621"]["start"] == pytest.approx(409 + 2 * (UNLOAD + 10) + 60)


def test_changing_the_allowance_owed(service):
    d = service.set_rake("S618", {"owed": "Shunting"}, NOW)
    r = by_slot(d["rakes"])["S618"]
    assert r["owed"] == {"rule": "Shunting", "minutes": 120} and r["claim"] == "none"
    assert r["steps_if_claimed"] == []                               # two more hours would cover its 53 minutes over
    d = service.set_rake("S618", {"claim": "applied"}, NOW)
    assert by_slot(d["rakes"])["S618"]["free_until"] == 649 + 120 and d["cost"] == 26100


def test_owed_and_claim_in_one_patch(service):
    d = service.set_rake("S618", {"owed": "Tarpaulin", "claim": "filed"}, NOW)
    r = by_slot(d["rakes"])["S618"]
    assert r["owed"] == {"rule": "Tarpaulin", "minutes": 60} and r["claim"] == "filed"


def test_dropping_the_allowance_drops_the_claim(service):
    service.set_rake("S617", {"claim": "applied"}, NOW)
    d = service.set_rake("S617", {"owed": None}, NOW)
    r = by_slot(d["rakes"])["S617"]
    assert r["owed"] is None and r["claim"] == "none" and r["free_until"] == 475
    assert d["cost"] == 34800


def test_a_livery(service):
    d = service.set_rake("S618", {"livery": "forest"}, NOW)
    assert by_slot(d["rakes"])["S618"]["livery"] == "forest"
    assert d["cost"] == 34800


def test_choices_add_up(service):
    service.set_rake("S619", {"hold": 30}, NOW)
    service.set_rake("S620", {"tippler": 1}, NOW)
    service.set_rake("S617", {"claim": "applied"}, NOW)
    service.set_rake("S619", {"hold": 0}, NOW)                       # a later choice replaces an earlier one
    raw = world.day()
    raw = schedule.change(raw, "S620", {"tippler": 1}, NOW)
    raw = schedule.change(raw, "S617", {"claim": "applied"}, NOW)
    want = schedule.plan(raw, PLANT)
    d = service.day(NOW)
    assert d["rakes"] == [timeline.track(r, PLANT) for r in want]
    assert d["cost"] == schedule.cost(want, PLANT)
    assert d["best"]["current"] == d["cost"]


def test_set_rake_returns_the_day_as_of_at(service):
    d = service.set_rake("S620", {"tippler": 1}, NOW)
    assert d == service.day(NOW)


# ---------------------------------------------------------------- what cannot be done
def test_a_rake_that_has_started_cannot_be_moved_or_held(service):
    # at 09:24 S617 and S618 are being tipped; S615 and S616 are gone
    for slot in ("S615", "S616", "S617", "S618"):
        other = 2 if by_slot(world.day())[slot]["tippler"] == 1 else 1
        fails("conflict", service.set_rake, slot, {"tippler": other}, NOW)
        fails("conflict", service.set_rake, slot, {"hold": 30}, NOW)
    assert service.day(NOW)["rakes"] == Service(open_store(None)).day(NOW)["rakes"]      # nothing changed


def test_a_started_rake_can_still_have_its_paperwork_done(service):
    service.set_rake("S617", {"claim": "filed", "livery": "ochre"}, NOW)
    service.set_rake("S617", {"tippler": 1, "hold": 0}, NOW)         # asking for what it already has is not a move
    r = by_slot(service.day()["rakes"])["S617"]
    assert (r["claim"], r["livery"], r["tippler"], r["hold"]) == ("filed", "ochre", 1, 0)


def test_the_moment_it_starts_is_already_too_late(service):
    start = by_slot(service.day()["rakes"])["S619"]["start"]
    fails("conflict", service.set_rake, "S619", {"hold": 30}, start)
    service.set_rake("S619", {"hold": 30}, start - 0.5)              # half a minute earlier it could still be held


def test_a_conflict_in_one_part_refuses_the_whole_patch(service):
    fails("conflict", service.set_rake, "S617", {"claim": "applied", "tippler": 2}, NOW)
    assert by_slot(service.day()["rakes"])["S617"]["claim"] == "none"


def test_unknown_rake(service):
    fails("not_found", service.set_rake, "S999", {"hold": 30}, NOW)
    fails("not_found", service.options, "S999", NOW)
    fails("not_found", service.set_rake, "", {"hold": 30}, NOW)


@pytest.mark.parametrize("patch", [
    {}, None, [], "hold", {"start": 5}, {"hold": 30, "ready": 0}, {"slot": "S1"},
    {"tippler": 3}, {"tippler": 0}, {"tippler": "2"}, {"tippler": 1.0}, {"tippler": True}, {"tippler": None},
    {"hold": 45}, {"hold": -30}, {"hold": "30"}, {"hold": 30.0}, {"hold": None}, {"hold": True},
    {"owed": "Fog"}, {"owed": "bunching"}, {"owed": {"rule": "Bunching", "minutes": 180}}, {"owed": 180},
    {"claim": "won"}, {"claim": None}, {"claim": "Applied"}, {"claim": 1},
    {"livery": "grey"}, {"livery": "pink"}, {"livery": None},
    {"hold": 30, "livery": "pink"},
])
def test_patches_that_make_no_sense(service, patch):
    fails("invalid", service.set_rake, "S621", patch, NOW)
    assert service.day(NOW) == Service(open_store(None)).day(NOW)    # and nothing was changed, not even half of it


def test_a_claim_needs_an_allowance(service):
    fails("invalid", service.set_rake, "S618", {"claim": "filed"}, NOW)          # S618 is owed nothing
    fails("invalid", service.set_rake, "S618", {"claim": "applied"}, NOW)
    service.set_rake("S618", {"claim": "none"}, NOW)                             # saying "no claim" is always fine
    fails("invalid", service.set_rake, "S617", {"owed": None, "claim": "filed"}, NOW)


@pytest.mark.parametrize("bad", ["564", math.nan, math.inf, True, [1]])
def test_at_must_be_a_real_minute(service, bad):
    fails("invalid", service.set_rake, "S621", {"hold": 30}, bad)
    fails("invalid", service.options, "S621", bad)
    fails("invalid", service.day, bad)


# ================================================================ options
def test_options_for_a_waiting_rake(service):
    o = service.options("S619", NOW)
    assert set(o) == {"slot", "locked", "tippler", "hold"}
    assert o["slot"] == "S619" and o["locked"] is False
    assert [x["value"] for x in o["tippler"]] == [1, 2]
    assert [x["value"] for x in o["hold"]] == [0, 30, 60, 120]
    assert [x["current"] for x in o["tippler"]] == [True, False]
    assert [x["current"] for x in o["hold"]] == [True, False, False, False]
    for kind, key in (("tippler", "tippler"), ("hold", "hold")):
        for x in o[kind]:
            assert set(x) == {"value", "current", "start", "released", "cost", "delta"}
            trial = schedule.plan(schedule.change(world.day(), "S619", {key: x["value"]}, NOW), PLANT)
            mine = by_slot(trial)["S619"]
            assert x["start"] == pytest.approx(mine["start"]) and x["released"] == pytest.approx(mine["released"])
            assert x["cost"] == schedule.cost(trial, PLANT)
            assert x["delta"] == x["cost"] - 34800


def test_options_say_what_a_hold_would_do(service):
    hold = {x["value"]: x for x in service.options("S619", NOW)["hold"]}
    first = 409 + UNLOAD + 10
    assert [hold[m]["start"] for m in (0, 30, 60, 120)] == pytest.approx([first, first + 30, first + 60, first + 120])
    assert hold[0]["delta"] == 0 and hold[0]["cost"] == 34800
    assert hold[120]["delta"] > 0                                    # two hours later, something runs over


def test_options_follow_earlier_choices(service):
    service.set_rake("S619", {"hold": 60}, NOW)
    o = service.options("S619", NOW)
    assert [x["current"] for x in o["hold"]] == [False, False, True, False]
    current = service.day()["cost"]
    assert [x["delta"] for x in o["hold"]][2] == 0
    assert all(x["delta"] == x["cost"] - current for x in o["hold"] + o["tippler"])


def test_options_are_locked_once_it_has_started(service):
    assert service.options("S617", NOW)["locked"] is True
    assert service.options("S617", 100)["locked"] is False
    assert service.options("S622", NOW)["locked"] is False
    assert service.options("S622", 5000)["locked"] is True


def test_options_change_nothing(service):
    before = service.day(NOW)
    service.options("S619", NOW)
    service.options("S622", NOW)
    assert service.day(NOW) == before


# ================================================================ remembering
def test_choices_survive_a_restart(tmp_path):
    path = tmp_path / "state.json"
    first = Service(open_store(path))
    first.set_rake("S620", {"tippler": 1}, NOW)
    first.set_rake("S617", {"claim": "applied", "livery": "cobalt"}, NOW)
    first.set_rake("S618", {"owed": "Shunting"}, NOW)
    second = Service(open_store(path))
    assert second.day(NOW) == first.day(NOW)
    assert second.day()["cost"] == first.day()["cost"] != 34800


def test_reset_forgets_everything(tmp_path):
    path = tmp_path / "state.json"
    s = Service(open_store(path))
    s.set_rake("S620", {"tippler": 1}, NOW)
    bill = next(b for b in s.bills("2026-10") if b["rake"] == "BNSF270638")
    s.set_bill(bill["id"], {"claim": "filed"})
    out = s.reset()
    clean = Service(open_store(None))
    assert out == clean.day()
    assert s.day(NOW) == clean.day(NOW) and s.months() == clean.months() and s.bills("2026-10") == clean.bills("2026-10")
    assert Service(open_store(path)).day(NOW) == clean.day(NOW)


def test_two_services_do_not_share_memory():
    a, b = Service(open_store(None)), Service(open_store(None))
    a.set_rake("S620", {"tippler": 1}, NOW)
    assert b.day()["cost"] == 34800


def test_a_stale_choice_in_the_store_is_ignored(tmp_path):
    store = open_store(tmp_path / "state.json")
    store.set_rake("S999", {"hold": 30})                             # a rake that is not in today's day
    store.set_rake("S619", {"hold": 30, "nonsense": 1})
    store.set_bill("9999", {"claim": "won"})
    s = Service(store)
    assert by_slot(s.day()["rakes"])["S619"]["hold"] == 30
    assert len(s.day()["rakes"]) == 8 and len(s.months()) == 6


# ================================================================ the months and their bills
def test_months(service):
    months = service.months()
    assert [m["id"] for m in months] == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
    assert months == ledger.months(world.history(1), world.TODAY, PLANT)
    assert months[-1]["partial"] == "to 13 Oct"
    for m in months:
        assert m["baseline"] - m["paid"] == m["saved"]


def test_the_seed_picks_the_history():
    assert Service(open_store(None), seed=2).months() == ledger.months(world.history(2), world.TODAY, PLANT)
    assert Service(open_store(None), seed=2).months() != Service(open_store(None)).months()


def test_octobers_bills_are_the_pinned_eight(service):
    bills = service.bills("2026-10")
    assert bills == ledger.notable(world.history(1), "2026-10", world.TODAY, PLANT)
    assert [b["rake"] for b in bills] == ["BNSF270598", "BNSF270611", "BNSF270624", "BNSF270630", "BNSF270638", "BNSF270641", "BNSF270645", "BNSF270652"]
    assert [b["audit"]["state"] for b in bills] == ["missed", "none", "none", "filed", "open", "none", "open", "won"]


def test_every_month_has_bills_to_show(service):
    for m in service.months():
        bills = service.bills(m["id"])
        assert 1 <= len(bills) <= 8
        assert all(b["released"].startswith(m["id"]) for b in bills)


def test_unknown_months(service):
    fails("not_found", service.bills, "2026-04")                     # before the books begin
    fails("not_found", service.bills, "2026-11")                     # not yet
    fails("not_found", service.bills, "2025-10")
    for bad in ("banana", "2026-13", "2026-1", "202610", "", None, 202610):
        fails("invalid", service.bills, bad)


# ---------------------------------------------------------------- claims on bills
def bill_for(service, rake, month="2026-10"):
    return next(b for b in service.bills(month) if b["rake"] == rake)


def test_filing_a_claim_on_a_bill(service):
    before = service.months()[-1]
    b = bill_for(service, "BNSF270638")
    out = service.set_bill(b["id"], {"claim": "filed"})
    assert set(out) == {"bill", "month"}
    assert out["bill"]["id"] == b["id"] and out["bill"]["claim"] == "filed" and out["bill"]["audit"]["state"] == "filed"
    assert out["bill"]["date"] == "07 Oct"
    assert out["month"] == service.months()[-1]
    assert out["month"]["claims"]["open"] == {"count": 1, "amount": 8700}
    assert out["month"]["claims"]["filed"] == {"count": 2, "amount": 34800}
    assert out["month"]["paid"] == before["paid"]
    assert bill_for(service, "BNSF270638")["audit"]["state"] == "filed"


def test_winning_a_claim_on_a_bill(service):
    before = service.months()[-1]
    b = bill_for(service, "BNSF270638")
    out = service.set_bill(b["id"], {"claim": "won"})
    assert out["bill"]["audit"]["state"] == "won"
    assert out["month"]["recovered"] == before["recovered"] + 26100
    assert out["month"]["paid"] == before["paid"] - 26100
    assert out["month"]["saved"] == before["saved"] + 26100
    assert [m for m in service.months()[:-1]] == Service(open_store(None)).months()[:-1]     # other months untouched


def test_a_claim_can_be_taken_back_while_the_window_is_open(service):
    b = bill_for(service, "BNSF270652")                              # won; released 11 Oct
    out = service.set_bill(b["id"], {"claim": "none"})
    assert out["bill"]["audit"]["state"] == "open"
    out = service.set_bill(b["id"], {"claim": "filed"})
    assert out["bill"]["audit"]["state"] == "filed"


def test_bill_claims_survive_a_restart(tmp_path):
    path = tmp_path / "state.json"
    first = Service(open_store(path))
    b = bill_for(first, "BNSF270645")
    first.set_bill(b["id"], {"claim": "won"})
    second = Service(open_store(path))
    assert bill_for(second, "BNSF270645")["audit"]["state"] == "won"
    assert second.months() == first.months()


def test_a_missed_claim_cannot_be_filed(service):
    b = bill_for(service, "BNSF270598")                              # the window closed on 11 Oct
    fails("conflict", service.set_bill, b["id"], {"claim": "filed"})
    fails("conflict", service.set_bill, b["id"], {"claim": "won"})
    service.set_bill(b["id"], {"claim": "none"})                     # it is "none" already: nothing to refuse
    assert bill_for(service, "BNSF270598")["audit"]["state"] == "missed"


def test_nothing_to_claim_on_a_bill_that_is_right(service):
    for rake in ("BNSF270611", "BNSF270624"):
        b = bill_for(service, rake)
        fails("invalid", service.set_bill, b["id"], {"claim": "filed"})
        fails("invalid", service.set_bill, b["id"], {"claim": "won"})
        service.set_bill(b["id"], {"claim": "none"})


def test_an_old_claim_cannot_be_un_made(service):
    # an August claim that was won: its window closed long ago, so it can go between filed and won, not back to none
    old = next(b for b in service.bills("2026-08") if b["audit"]["state"] == "won")
    fails("conflict", service.set_bill, old["id"], {"claim": "none"})
    assert service.set_bill(old["id"], {"claim": "filed"})["bill"]["audit"]["state"] == "filed"
    fails("conflict", service.set_bill, old["id"], {"claim": "none"})
    assert service.set_bill(old["id"], {"claim": "won"})["bill"]["audit"]["state"] == "won"


def test_set_bill_reaches_bills_that_are_not_on_show(service):
    shown = {b["id"] for m in service.months() for b in service.bills(m["id"])}
    hidden = next(s for s in world.history(1) if s["id"] not in shown and s["claim"] == "won")
    out = service.set_bill(hidden["id"], {"claim": "filed"})
    assert out["bill"]["id"] == hidden["id"] and out["bill"]["audit"]["state"] == "filed"
    assert out["month"]["id"] == hidden["released"][:7]


def test_unknown_bill(service):
    for bad in ("9999", "0000", "DC/0001", "", "1"):
        fails("not_found", service.set_bill, bad, {"claim": "filed"})


@pytest.mark.parametrize("patch", [{}, None, [], "won", {"claim": "applied"}, {"claim": None}, {"claim": "Won"}, {"claim": 1},
                                   {"state": "won"}, {"claim": "filed", "old": 5}, {"wrong": None}])
def test_bill_patches_that_make_no_sense(service, patch):
    b = bill_for(service, "BNSF270638")
    fails("invalid", service.set_bill, b["id"], patch)
    assert bill_for(service, "BNSF270638")["audit"]["state"] == "open"


def test_the_world_is_never_changed(service):
    day, history = copy.deepcopy(world.day()), copy.deepcopy(world.history(1))
    service.set_rake("S620", {"tippler": 1}, NOW)
    service.set_bill(bill_for(service, "BNSF270638")["id"], {"claim": "won"})
    service.months(), service.bills("2026-09"), service.day(NOW)
    assert world.day() == day and world.history(1) == history
