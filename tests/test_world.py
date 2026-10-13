"""The world: one seeded plant, the day on the Yard screen, and six months of stays.

Contract for backend/world.py. Everything is deterministic: the same seed always gives
the same world, and nothing here reads the clock or unseeded randomness.

A stay is one rake's visit and the railway's bill for it:

    id        "0412"            unique; ascending with `released`
    no        "DC/0412"
    rake      "BNSF270598"      unique
    from      "Dipka" | "Gevra" | "Kusmunda" | "Korba"
    released  "2026-10-07"      the day the stay ended; the ten-day claim window starts here
    ours      [placed, released]   minutes after midnight on the day it was placed, from our logs
    billed    [placed, released]   what the railway charged on
    wrong     None | "placed" | "released"     which of the bill's two times is wrong
    proof     None | "Gate log" | "Tippler log"
    owed      None | {"rule", "minutes"}       an allowance the bill ignored
    old       minutes the stay would have run handled the old way (never less than it did)
    cause     None | one of CAUSES             why it overran free time, if it did
    claim     "none" | "filed" | "won"
    pinned    True for the eight hand-written October stays
"""
import copy
import re
from collections import Counter

import pytest

from backend import rules, world

FREE = 420
SINCE = "2026-07-01"
MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
FULL = MONTHS[:-1]
DAYS_IN = {"2026-05": 31, "2026-06": 30, "2026-07": 31, "2026-08": 31, "2026-09": 30, "2026-10": 13}
SEEDS = [1, 2, 3]


def at(h, m):
    return h * 60 + m


# ---------------------------------------------------------------- the plant
def test_plant():
    assert world.PLANT == {
        "name": "Kalinga Thermal, Siding A", "tipplers": 2, "tips_per_hour": 19, "tip_minutes": 60 / 19, "wagons": 58,
        "free_minutes": 420, "form_minutes": 25, "gap_minutes": 10, "capacity_per_day": 4, "since": "2026-07-01",
    }
    assert world.TODAY == "2026-10-13"
    assert world.CAUSES == ["Bunching", "Tippler down", "Late crew", "Other"]
    assert world.LIVERIES == ["orange", "oxide", "cobalt", "forest", "ochre"]


# ---------------------------------------------------------------- today
def test_the_day():
    bunching = {"rule": "Bunching", "minutes": 180}
    rows = [
        ("S615", "BNSF270663", "Dipka", 4104, at(-3, 25), at(-2, 10), at(-1, 15), 1, 1, None, "oxide"),
        ("S616", "BNSF270664", "Gevra", 4121, at(0, 0), at(0, 30), at(1, 44), 2, 2, None, "cobalt"),
        ("S617", "BNSF270665", "Kusmunda", 4096, at(0, 20), at(0, 55), at(6, 49), 1, 3, bunching, "orange"),
        ("S618", "BNSF270666", "Gevra", 4118, at(3, 15), at(3, 49), at(8, 14.5), 2, 4, None, "orange"),
        ("S619", "BNSF270667", "Dipka", 4109, at(6, 0), at(6, 34), at(10, 2), 1, 3, None, "orange"),
        ("S620", "BNSF270668", "Korba", 4127, at(8, 25), at(8, 59), at(11, 28), 2, 4, bunching, "orange"),
        ("S621", "BNSF270669", "Gevra", 4113, at(11, 40), at(12, 10), at(13, 15), 1, 3, bunching, "orange"),
        ("S622", "BNSF270670", "Kusmunda", 4102, at(13, 5), at(13, 35), at(14, 41), 2, 4, bunching, "orange"),
    ]
    want = [{"slot": s, "id": i, "from": f, "tonnes": t, "eta": eta, "placed": placed, "ready": ready, "tippler": tip, "line": line,
             "owed": owed, "hold": 0, "claim": "none", "livery": livery}
            for s, i, f, t, eta, placed, ready, tip, line, owed, livery in rows]
    assert world.day() == want


def test_the_day_is_a_fresh_copy_each_time():
    a = world.day()
    a[2]["owed"]["minutes"] = 1
    a[0]["tippler"] = 9
    a.pop()
    b = world.day()
    assert len(b) == 8 and b[2]["owed"] == {"rule": "Bunching", "minutes": 180} and b[0]["tippler"] == 1


# ---------------------------------------------------------------- history: the same every time
def test_history_is_deterministic():
    assert world.history() == world.history()
    assert world.history() == world.history(1)
    assert world.history(seed=2) == world.history(seed=2)


def test_another_seed_is_another_history():
    a, b = world.history(1), world.history(2)
    assert a != b
    assert [s["ours"] for s in a if not s["pinned"]] != [s["ours"] for s in b if not s["pinned"]]


def test_history_is_a_fresh_copy_each_time():
    a = world.history()
    snapshot = copy.deepcopy(a)
    a[0]["ours"][0] = -1
    a[-1]["claim"] = "x"
    for s in a:
        if s["owed"]:
            s["owed"]["minutes"] = 1
    assert world.history() == snapshot


# ---------------------------------------------------------------- history: every stay is well formed
KEYS = {"id", "no", "rake", "from", "released", "ours", "billed", "wrong", "proof", "owed", "old", "cause", "claim", "pinned"}


@pytest.fixture(scope="module", params=SEEDS)
def stays(request):
    return world.history(request.param)


def money(s):
    """What one stay comes to (the same sums as the audit, written out again here)."""
    stay, billed_stay = s["ours"][1] - s["ours"][0], s["billed"][1] - s["billed"][0]
    fair = rules.charge(rules.hours_over(stay - FREE))
    billed = rules.charge(rules.hours_over(billed_stay - FREE))
    with_allowance = rules.charge(rules.hours_over(stay - FREE - s["owed"]["minutes"])) if s["owed"] else fair
    would = rules.charge(rules.hours_over(s["old"] + (billed_stay - stay) - FREE))
    return {"stay": stay, "fair": fair, "billed": billed, "back": billed - with_allowance, "would": would}


def test_shape(stays):
    for s in stays:
        assert set(s) == KEYS
        assert re.fullmatch(r"\d{4}", s["id"]) and s["no"] == "DC/" + s["id"]
        assert re.fullmatch(r"BNSF\d{6}", s["rake"])
        assert s["from"] in {"Dipka", "Gevra", "Kusmunda", "Korba"}
        assert re.fullmatch(r"2026-\d\d-\d\d", s["released"])
        assert s["wrong"] in (None, "placed", "released")
        assert s["claim"] in ("none", "filed", "won")
        assert type(s["pinned"]) is bool
        assert len(s["ours"]) == 2 and len(s["billed"]) == 2
        for v in (*s["ours"], *s["billed"], s["old"]):
            assert type(v) is int                                    # whole minutes


def test_ids_are_unique_and_in_date_order(stays):
    ids = [s["id"] for s in stays]
    assert len(set(ids)) == len(ids)
    assert ids == sorted(ids)
    assert [s["released"] for s in stays] == sorted(s["released"] for s in stays)


def test_rake_numbers_are_unique_and_not_todays(stays):
    rakes = [s["rake"] for s in stays]
    assert len(set(rakes)) == len(rakes)
    assert not set(rakes) & {r["id"] for r in world.day()}


def test_span_is_the_first_of_may_to_today(stays):
    assert stays[0]["released"] == "2026-05-01"
    assert stays[-1]["released"] <= world.TODAY
    assert {s["released"][:7] for s in stays} == set(MONTHS)


def test_about_four_rakes_a_day(stays):
    per_month = Counter(s["released"][:7] for s in stays)
    for m in FULL:
        assert 110 <= per_month[m] <= 130, m
    assert 45 <= per_month["2026-10"] <= 56
    per_day = Counter(s["released"] for s in stays)
    for m, days in DAYS_IN.items():
        for d in range(1, days + 1):
            assert 2 <= per_day[f"{m}-{d:02d}"] <= 6, f"{m}-{d:02d}"


def test_times_are_plausible(stays):
    for s in stays:
        placed, released = s["ours"]
        assert 0 <= placed < 1440
        assert 240 <= released - placed <= 1800                      # four to thirty hours on site
        assert released - placed <= s["old"] <= 2400


def test_the_bill_differs_from_our_record_only_where_it_is_wrong(stays):
    for s in stays:
        ours, billed = s["ours"], s["billed"]
        if s["wrong"] is None:
            assert billed == ours and s["proof"] is None
        elif s["wrong"] == "placed":                                 # the clock started early on the bill
            assert 15 <= ours[0] - billed[0] <= 90 and billed[1] == ours[1] and s["proof"] == "Gate log"
        else:                                                        # the clock stopped late on the bill
            assert 15 <= billed[1] - ours[1] <= 90 and billed[0] == ours[0] and s["proof"] == "Tippler log"


def test_allowances_come_from_the_rulebook(stays):
    for s in stays:
        if s["owed"] is not None:
            assert set(s["owed"]) == {"rule", "minutes"}
            assert rules.ALLOWANCES[s["owed"]["rule"]] == s["owed"]["minutes"]


def test_a_cause_exactly_when_it_overran(stays):
    for s in stays:
        if s["ours"][1] - s["ours"][0] > FREE:
            assert s["cause"] in world.CAUSES
        else:
            assert s["cause"] is None


def test_bunching_is_the_commonest_cause(stays):
    causes = Counter(s["cause"] for s in stays if s["cause"])
    assert causes.most_common(1)[0][0] == "Bunching"
    assert set(causes) == set(world.CAUSES)


# ---------------------------------------------------------------- history: before and after the product
def test_before_the_product_nothing_was_planned_or_claimed(stays):
    for s in stays:
        if s["released"] < SINCE:
            assert s["old"] == s["ours"][1] - s["ours"][0]
            assert s["claim"] == "none"


def test_a_claim_is_only_ever_made_for_money(stays):
    for s in stays:
        if s["claim"] != "none":
            assert money(s)["back"] > 0
            assert s["released"] >= SINCE


def test_every_month_has_its_mistakes(stays):
    for m in FULL:
        month = [s for s in stays if s["released"].startswith(m)]
        assert sum(1 for s in month if s["wrong"] and money(s)["back"] > 0) >= 2, m
        assert sum(1 for s in month if s["owed"] and not s["wrong"] and money(s)["back"] > 0) >= 5, m


def test_inside_the_claim_window_only_the_pinned_stays_need_attention(stays):
    # anything released in the last ten days could still be claimed; the demo keeps that set hand-written
    for s in stays:
        if s["released"] >= "2026-10-03" and not s["pinned"]:
            assert money(s)["back"] == 0
            assert s["claim"] == "none"


# ---------------------------------------------------------------- history: the pinned stays
BUNCHING = {"rule": "Bunching", "minutes": 180}
PINNED = {
    "BNSF270598": {"from": "Dipka", "released": "2026-10-01", "ours": [at(1, 10), at(11, 5)], "billed": [at(1, 10), at(11, 5)],
                   "wrong": None, "proof": None, "owed": BUNCHING, "old": 595, "cause": "Bunching", "claim": "none"},
    "BNSF270611": {"from": "Gevra", "released": "2026-10-02", "ours": [at(2, 15), at(8, 25)], "billed": [at(2, 15), at(8, 25)],
                   "wrong": None, "proof": None, "owed": None, "old": 520, "cause": None, "claim": "none"},
    "BNSF270624": {"from": "Korba", "released": "2026-10-04", "ours": [at(5, 40), at(15, 2)], "billed": [at(5, 40), at(15, 2)],
                   "wrong": None, "proof": None, "owed": None, "old": 562, "cause": "Tippler down", "claim": "none"},
    "BNSF270630": {"from": "Gevra", "released": "2026-10-05", "ours": [at(3, 49), at(11, 42)], "billed": [at(3, 15), at(11, 42)],
                   "wrong": "placed", "proof": "Gate log", "owed": None, "old": 473, "cause": "Late crew", "claim": "filed"},
    "BNSF270638": {"from": "Kusmunda", "released": "2026-10-07", "ours": [at(0, 55), at(11, 35)], "billed": [at(0, 55), at(11, 35)],
                   "wrong": None, "proof": None, "owed": BUNCHING, "old": 640, "cause": "Bunching", "claim": "none"},
    "BNSF270641": {"from": "Dipka", "released": "2026-10-08", "ours": [at(9, 5), at(15, 40)], "billed": [at(9, 5), at(15, 40)],
                   "wrong": None, "proof": None, "owed": None, "old": 560, "cause": None, "claim": "none"},
    "BNSF270645": {"from": "Gevra", "released": "2026-10-09", "ours": [at(5, 15), at(13, 5)], "billed": [at(5, 15), at(14, 10)],
                   "wrong": "released", "proof": "Tippler log", "owed": None, "old": 470, "cause": "Other", "claim": "none"},
    "BNSF270652": {"from": "Korba", "released": "2026-10-11", "ours": [at(4, 20), at(12, 10)], "billed": [at(3, 30), at(12, 10)],
                   "wrong": "placed", "proof": "Gate log", "owed": None, "old": 470, "cause": "Late crew", "claim": "won"},
}


def test_the_eight_pinned_stays(stays):
    pinned = {s["rake"]: s for s in stays if s["pinned"]}
    assert set(pinned) == set(PINNED)
    for rake, want in PINNED.items():
        got = {k: pinned[rake][k] for k in want}
        assert got == want, rake


def test_the_pinned_stays_tell_the_demo_story():
    pinned = {s["rake"]: money(s) for s in world.history() if s["pinned"]}
    assert pinned["BNSF270598"]["back"] == 26100          # bunching never allowed, and now too late
    assert pinned["BNSF270611"]["billed"] == 0 and pinned["BNSF270611"]["would"] == 17400
    assert pinned["BNSF270624"]["back"] == 0 and pinned["BNSF270624"]["billed"] == 26100
    assert pinned["BNSF270630"]["back"] == 8700           # placed 34 minutes early on the bill
    assert pinned["BNSF270638"]["back"] == 26100 and pinned["BNSF270638"]["billed"] == 34800
    assert pinned["BNSF270641"]["billed"] == 0 and pinned["BNSF270641"]["would"] == 26100
    assert pinned["BNSF270645"]["back"] == 8700
    assert pinned["BNSF270652"]["back"] == 8700


# ---------------------------------------------------------------- history: the story the months tell
def totals(stays, month):
    rows = [(s, money(s)) for s in stays if s["released"].startswith(month)]
    baseline = sum(m["would"] for _, m in rows)
    billed = sum(m["billed"] for _, m in rows)
    recovered = sum(m["back"] for s, m in rows if s["claim"] == "won")
    return {"rakes": len(rows), "baseline": baseline, "billed": billed, "recovered": recovered,
            "avoided": baseline - billed, "saved": baseline - billed + recovered,
            "share": (baseline - billed + recovered) / baseline, "charged": sum(1 for _, m in rows if m["billed"] > 0)}


def test_a_month_of_demurrage_is_tens_of_lakhs(stays):
    for m in FULL:
        t = totals(stays, m)
        assert 1_500_000 <= t["baseline"] <= 4_500_000, m
    for m in ("2026-05", "2026-06"):                                 # the old way: most rakes ran over
        t = totals(stays, m)
        assert 0.40 <= t["charged"] / t["rakes"] <= 0.90, m


def test_nothing_was_saved_before_the_product(stays):
    for m in ("2026-05", "2026-06"):
        t = totals(stays, m)
        assert t["avoided"] == 0 and t["recovered"] == 0 and t["saved"] == 0


def test_the_saving_grows_month_on_month(stays):
    july, august, september, october = (totals(stays, m) for m in MONTHS[2:])
    assert 0.08 <= july["share"] <= 0.30
    assert 0.25 <= august["share"] <= 0.50
    assert 0.40 <= september["share"] <= 0.70
    assert july["share"] < august["share"] < september["share"]
    assert october["share"] >= 0.40
    for t in (july, august, september):
        assert t["avoided"] > 0 and t["recovered"] > 0
        assert t["avoided"] > t["recovered"]                         # planning saves more than paperwork
    assert october["avoided"] > 0 and october["recovered"] >= 8700


def test_fewer_claims_are_missed_as_the_months_go_by(stays):
    def missed(month):                                               # money that could have come back and never will
        return sum(money(s)["back"] for s in stays
                   if s["released"].startswith(month) and s["claim"] == "none" and rules.deadline(s["released"]) < world.TODAY)
    assert missed("2026-05") > 0 and missed("2026-06") > 0
    assert missed("2026-09") < missed("2026-07") < missed("2026-05")
