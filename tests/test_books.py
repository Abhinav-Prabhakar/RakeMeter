"""The books: one bill against our own record (audit.py), and a month of them (ledger.py).

Contract for backend/audit.py and backend/ledger.py. Pure functions over stays as
described in test_world.py; neither module imports world.py, and neither changes what
it is given.

    audit(stay, today, plant) ->
        stay, billed_stay     minutes on site by our record, and by the bill
        hours, billed_hours   hours past the standard free time, ours and the bill's
        fair, billed          what those hours cost
        overcharged           billed - fair: money charged on a wrong time
        claimable             what the ignored allowance is worth
        back                  overcharged + claimable: what should come back
        due, due_hours        what the stay should cost once everything owed is counted
        free                  free minutes it was entitled to (standard + allowance owed)
        would                 what it would have cost handled the old way (`old`), on the bill's terms
        deadline, left        last day to apply (released + 10 days), and days from today to it
        kind                  "clean" (nothing billed) | "overcharged" | "allowance" | "matches"
        state                 "none" (nothing to claim) | "won" | "filed" | "open" | "missed"

    month(stays, month_id, today, plant) -> totals for one month ("2026-10")
    months(stays, today, plant)          -> every month from the first stay to today's, oldest first
    notable(stays, month_id, today, plant, limit=8) -> the bills worth showing, each with "audit" and "date"
"""
import copy

import pytest

from backend import audit as audit_module
from backend import ledger

audit = audit_module.audit

TODAY = "2026-10-13"
PLANT = {"tipplers": 2, "wagons": 58, "tip_minutes": 60 / 19, "form_minutes": 25, "gap_minutes": 10, "free_minutes": 420}
BUNCHING = {"rule": "Bunching", "minutes": 180}


def at(h, m):
    return h * 60 + m


def stay(n, rake, released, ours, billed=None, wrong=None, proof=None, owed=None, old=None, cause=None, claim="none", pinned=False):
    return {"id": f"{n:04d}", "no": f"DC/{n:04d}", "rake": rake, "from": "Gevra", "released": released, "ours": list(ours),
            "billed": list(billed or ours), "wrong": wrong, "proof": proof, "owed": copy.deepcopy(owed),
            "old": old if old is not None else ours[1] - ours[0], "cause": cause, "claim": claim, "pinned": pinned}


def october():
    """The eight hand-written stays of the demo."""
    return [
        stay(501, "BNSF270598", "2026-10-01", [at(1, 10), at(11, 5)], owed=BUNCHING, cause="Bunching", pinned=True),
        stay(505, "BNSF270611", "2026-10-02", [at(2, 15), at(8, 25)], old=520, pinned=True),
        stay(512, "BNSF270624", "2026-10-04", [at(5, 40), at(15, 2)], cause="Tippler down", pinned=True),
        stay(516, "BNSF270630", "2026-10-05", [at(3, 49), at(11, 42)], [at(3, 15), at(11, 42)], "placed", "Gate log", cause="Late crew", claim="filed", pinned=True),
        stay(523, "BNSF270638", "2026-10-07", [at(0, 55), at(11, 35)], owed=BUNCHING, cause="Bunching", pinned=True),
        stay(527, "BNSF270641", "2026-10-08", [at(9, 5), at(15, 40)], old=560, pinned=True),
        stay(531, "BNSF270645", "2026-10-09", [at(5, 15), at(13, 5)], [at(5, 15), at(14, 10)], "released", "Tippler log", cause="Other", pinned=True),
        stay(538, "BNSF270652", "2026-10-11", [at(4, 20), at(12, 10)], [at(3, 30), at(12, 10)], "placed", "Gate log", cause="Late crew", claim="won", pinned=True),
    ]


def by_rake(rows):
    return {s["rake"]: s for s in rows}


# ================================================================ audit
def test_allowance_never_given_and_now_too_late():
    a = audit(by_rake(october())["BNSF270598"], TODAY, PLANT)
    assert a == {"stay": 595, "billed_stay": 595, "hours": 3, "billed_hours": 3, "fair": 26100, "billed": 26100,
                 "overcharged": 0, "claimable": 26100, "back": 26100, "due": 0, "due_hours": 0, "free": 600, "would": 26100,
                 "deadline": "2026-10-11", "left": -2, "kind": "allowance", "state": "missed"}


def test_inside_free_time_nothing_billed():
    a = audit(by_rake(october())["BNSF270611"], TODAY, PLANT)
    assert a == {"stay": 370, "billed_stay": 370, "hours": 0, "billed_hours": 0, "fair": 0, "billed": 0,
                 "overcharged": 0, "claimable": 0, "back": 0, "due": 0, "due_hours": 0, "free": 420, "would": 17400,
                 "deadline": "2026-10-12", "left": -1, "kind": "clean", "state": "none"}


def test_a_bill_that_is_right():
    a = audit(by_rake(october())["BNSF270624"], TODAY, PLANT)
    assert a == {"stay": 562, "billed_stay": 562, "hours": 3, "billed_hours": 3, "fair": 26100, "billed": 26100,
                 "overcharged": 0, "claimable": 0, "back": 0, "due": 26100, "due_hours": 3, "free": 420, "would": 26100,
                 "deadline": "2026-10-14", "left": 1, "kind": "matches", "state": "none"}


def test_clock_started_early_on_the_bill():
    a = audit(by_rake(october())["BNSF270630"], TODAY, PLANT)
    assert a == {"stay": 473, "billed_stay": 507, "hours": 1, "billed_hours": 2, "fair": 8700, "billed": 17400,
                 "overcharged": 8700, "claimable": 0, "back": 8700, "due": 8700, "due_hours": 1, "free": 420, "would": 17400,
                 "deadline": "2026-10-15", "left": 2, "kind": "overcharged", "state": "filed"}


def test_allowance_still_open():
    a = audit(by_rake(october())["BNSF270638"], TODAY, PLANT)
    assert a == {"stay": 640, "billed_stay": 640, "hours": 4, "billed_hours": 4, "fair": 34800, "billed": 34800,
                 "overcharged": 0, "claimable": 26100, "back": 26100, "due": 8700, "due_hours": 1, "free": 600, "would": 34800,
                 "deadline": "2026-10-17", "left": 4, "kind": "allowance", "state": "open"}


def test_clock_stopped_late_on_the_bill():
    a = audit(by_rake(october())["BNSF270645"], TODAY, PLANT)
    assert (a["stay"], a["billed_stay"], a["hours"], a["billed_hours"]) == (470, 535, 1, 2)
    assert (a["overcharged"], a["back"], a["due"], a["would"]) == (8700, 8700, 8700, 17400)
    assert (a["deadline"], a["left"], a["kind"], a["state"]) == ("2026-10-19", 6, "overcharged", "open")


def test_a_claim_that_was_won():
    a = audit(by_rake(october())["BNSF270652"], TODAY, PLANT)
    assert (a["back"], a["kind"], a["state"], a["due"]) == (8700, "overcharged", "won", 8700)


def test_wrong_time_and_ignored_allowance_together():
    s = stay(1, "R", "2026-10-10", [0, 640], [-40, 640], "placed", "Gate log", owed=BUNCHING)
    a = audit(s, TODAY, PLANT)
    # ours: 220 over, four hours. The bill: 260 over, five hours. With the allowance: 40 over, one hour.
    assert (a["fair"], a["billed"], a["overcharged"], a["claimable"], a["back"]) == (34800, 43500, 8700, 26100, 34800)
    assert (a["due"], a["due_hours"], a["free"], a["kind"]) == (8700, 1, 600, "overcharged")


def test_an_allowance_that_changes_nothing_is_nothing_to_claim():
    s = stay(1, "R", "2026-10-10", [0, 400], owed=BUNCHING)          # inside free time anyway
    a = audit(s, TODAY, PLANT)
    assert (a["back"], a["claimable"], a["kind"], a["state"], a["free"]) == (0, 0, "clean", "none", 600)


def test_an_allowance_bigger_than_the_overrun():
    s = stay(1, "R", "2026-10-10", [0, 500], owed=BUNCHING)          # 80 over, two hours; the allowance wipes it out
    a = audit(s, TODAY, PLANT)
    assert (a["fair"], a["claimable"], a["back"], a["due"], a["due_hours"]) == (17400, 17400, 17400, 0, 0)


def test_a_wrong_time_that_does_not_cross_an_hour_costs_nothing():
    s = stay(1, "R", "2026-10-10", [0, 440], [0, 470], "released", "Tippler log")   # 20 over, 50 over: one hour either way
    a = audit(s, TODAY, PLANT)
    assert (a["fair"], a["billed"], a["overcharged"], a["back"], a["kind"], a["state"]) == (8700, 8700, 0, 0, "matches", "none")


def test_a_claim_on_nothing_is_still_nothing():
    s = stay(1, "R", "2026-10-10", [0, 562], claim="filed")
    assert audit(s, TODAY, PLANT)["state"] == "none"


@pytest.mark.parametrize("today, left, state", [
    ("2026-10-07", 10, "open"), ("2026-10-16", 1, "open"), ("2026-10-17", 0, "open"),      # the last day still counts
    ("2026-10-18", -1, "missed"), ("2026-11-30", -44, "missed"),
])
def test_the_window_is_ten_days(today, left, state):
    a = audit(by_rake(october())["BNSF270638"], today, PLANT)
    assert (a["deadline"], a["left"], a["state"]) == ("2026-10-17", left, state)


def test_filed_and_won_do_not_expire():
    late = "2027-01-01"
    assert audit(by_rake(october())["BNSF270630"], late, PLANT)["state"] == "filed"
    assert audit(by_rake(october())["BNSF270652"], late, PLANT)["state"] == "won"


def test_would_is_the_old_way_on_the_bills_terms():
    s = stay(1, "R", "2026-10-10", [100, 500], [70, 500], "placed", "Gate log", old=700)
    a = audit(s, TODAY, PLANT)
    # the old way it would have stood 700 minutes, and the bill would still have started 30 early: 310 over
    assert (a["billed"], a["would"]) == (8700, 52200)


def test_old_defaults_to_the_stay_itself():
    s = stay(1, "R", "2026-10-10", [0, 562])
    del s["old"]
    assert audit(s, TODAY, PLANT)["would"] == 26100


def test_audit_follows_the_plant():
    s = stay(1, "R", "2026-10-10", [0, 400])
    a = audit(s, TODAY, {**PLANT, "free_minutes": 300, "wagons": 10})
    assert (a["hours"], a["fair"], a["billed"], a["free"], a["kind"]) == (2, 3000, 3000, 300, "matches")


def test_audit_returns_ints_and_leaves_the_stay_alone():
    s = by_rake(october())["BNSF270630"]
    snapshot = copy.deepcopy(s)
    a = audit(s, TODAY, PLANT)
    assert s == snapshot
    for key in ("stay", "billed_stay", "hours", "billed_hours", "fair", "billed", "overcharged", "claimable", "back", "due", "due_hours", "free", "would", "left"):
        assert type(a[key]) is int, key


def test_the_parts_always_add_up():
    for s in october():
        a = audit(s, TODAY, PLANT)
        assert a["back"] == a["overcharged"] + a["claimable"]
        assert a["due"] == a["billed"] - a["back"]
        assert a["would"] >= a["billed"] >= a["due"] >= 0


# ================================================================ ledger.month
def september():
    return [
        stay(480, "BNSF270501", "2026-09-29", [0, 700], owed=BUNCHING, cause="Bunching", claim="won"),               # 5 h billed, 3 h back
        stay(481, "BNSF270502", "2026-09-30", [60, 400], old=600),                                                   # clean; 3 h avoided
        stay(482, "BNSF270503", "2026-09-30", [0, 400], [0, 485], "released", "Tippler log"),                        # billed 2 h on a wrong time
    ]


def books():
    return september() + october()


def test_october():
    m = ledger.month(books(), "2026-10", TODAY, PLANT)
    assert m == {
        "id": "2026-10", "name": "October", "partial": "to 13 Oct",
        "rakes": 8, "charged": 6,
        "baseline": 182700, "billed": 139200, "recovered": 8700, "paid": 130500, "avoided": 43500, "saved": 52200,
        "causes": [
            {"name": "Bunching", "rakes": 2, "amount": 60900},
            {"name": "Late crew", "rakes": 2, "amount": 34800},
            {"name": "Tippler down", "rakes": 1, "amount": 26100},
            {"name": "Other", "rakes": 1, "amount": 17400},
        ],
        "claims": {"open": {"count": 2, "amount": 34800}, "filed": {"count": 1, "amount": 8700},
                   "won": {"count": 1, "amount": 8700}, "missed": {"count": 1, "amount": 26100}},
    }


def test_september():
    m = ledger.month(books(), "2026-09", TODAY, PLANT)
    assert (m["id"], m["name"], m["partial"]) == ("2026-09", "September", None)
    assert (m["rakes"], m["charged"]) == (3, 2)
    # baseline: 43500 + 26100 + 17400. billed: 43500 + 0 + 17400. won back: 26100.
    assert (m["baseline"], m["billed"], m["recovered"], m["paid"], m["avoided"], m["saved"]) == (87000, 60900, 26100, 34800, 26100, 52200)
    # a bill with no cause of its own (it only exists because of the wrong time) is counted under Other
    assert m["causes"] == [{"name": "Bunching", "rakes": 1, "amount": 43500}, {"name": "Other", "rakes": 1, "amount": 17400}]
    assert m["claims"] == {"open": {"count": 0, "amount": 0}, "filed": {"count": 0, "amount": 0},
                           "won": {"count": 1, "amount": 26100}, "missed": {"count": 1, "amount": 17400}}


def test_a_month_with_nothing_in_it():
    m = ledger.month(books(), "2026-08", TODAY, PLANT)
    assert m == {"id": "2026-08", "name": "August", "partial": None, "rakes": 0, "charged": 0,
                 "baseline": 0, "billed": 0, "recovered": 0, "paid": 0, "avoided": 0, "saved": 0, "causes": [],
                 "claims": {k: {"count": 0, "amount": 0} for k in ("open", "filed", "won", "missed")}}


def test_partial_only_for_the_month_today_is_in():
    assert ledger.month(books(), "2026-10", "2026-10-13", PLANT)["partial"] == "to 13 Oct"
    assert ledger.month(books(), "2026-10", "2026-10-05", PLANT)["partial"] == "to 5 Oct"
    assert ledger.month(books(), "2026-10", "2026-10-31", PLANT)["partial"] is None       # the month is complete
    assert ledger.month(books(), "2026-10", "2026-11-02", PLANT)["partial"] is None
    assert ledger.month(books(), "2026-09", "2026-10-13", PLANT)["partial"] is None
    assert ledger.month([], "2026-02", "2026-02-27", PLANT)["partial"] == "to 27 Feb"
    assert ledger.month([], "2026-02", "2026-02-28", PLANT)["partial"] is None


def test_month_names():
    names = [ledger.month([], f"2026-{n:02d}", TODAY, PLANT)["name"] for n in range(1, 13)]
    assert names == ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def test_winning_a_claim_moves_money_from_paid_to_recovered():
    rows = books()
    before = ledger.month(rows, "2026-10", TODAY, PLANT)
    by_rake(rows)["BNSF270638"]["claim"] = "won"
    after = ledger.month(rows, "2026-10", TODAY, PLANT)
    assert after["recovered"] == before["recovered"] + 26100
    assert after["paid"] == before["paid"] - 26100
    assert after["saved"] == before["saved"] + 26100
    assert (after["baseline"], after["billed"], after["avoided"]) == (before["baseline"], before["billed"], before["avoided"])
    assert after["claims"]["open"] == {"count": 1, "amount": 8700}
    assert after["claims"]["won"] == {"count": 2, "amount": 34800}


def test_filing_a_claim_changes_no_money():
    rows = books()
    before = ledger.month(rows, "2026-10", TODAY, PLANT)
    by_rake(rows)["BNSF270638"]["claim"] = "filed"
    after = ledger.month(rows, "2026-10", TODAY, PLANT)
    assert {k: after[k] for k in ("paid", "recovered", "saved")} == {k: before[k] for k in ("paid", "recovered", "saved")}
    assert after["claims"]["open"] == {"count": 1, "amount": 8700}
    assert after["claims"]["filed"] == {"count": 2, "amount": 34800}


def test_the_month_always_balances():
    rows = books()
    for month_id in ("2026-08", "2026-09", "2026-10"):
        m = ledger.month(rows, month_id, TODAY, PLANT)
        assert m["baseline"] - m["paid"] == m["avoided"] + m["recovered"] == m["saved"]
        assert m["billed"] - m["recovered"] == m["paid"]
        assert sum(c["amount"] for c in m["causes"]) == m["billed"]
        assert sum(c["rakes"] for c in m["causes"]) == m["charged"]


def test_causes_are_ordered_by_amount_then_name():
    rows = [stay(1, "A", "2026-08-03", [0, 480], cause="Tippler down"), stay(2, "B", "2026-08-04", [0, 480], cause="Late crew"),
            stay(3, "C", "2026-08-05", [0, 600], cause="Other")]
    m = ledger.month(rows, "2026-08", TODAY, PLANT)
    assert [c["name"] for c in m["causes"]] == ["Other", "Late crew", "Tippler down"]


def test_month_leaves_the_stays_alone():
    rows = books()
    snapshot = copy.deepcopy(rows)
    ledger.month(rows, "2026-10", TODAY, PLANT)
    ledger.months(rows, TODAY, PLANT)
    ledger.notable(rows, "2026-10", TODAY, PLANT)
    assert rows == snapshot


# ================================================================ ledger.months
def test_months_run_from_the_first_stay_to_today():
    rows = [stay(1, "A", "2026-07-03", [0, 480], cause="Other")] + books()
    out = ledger.months(rows, TODAY, PLANT)
    assert [m["id"] for m in out] == ["2026-07", "2026-08", "2026-09", "2026-10"]     # August is empty but present
    assert out[1]["rakes"] == 0
    assert out[3] == ledger.month(rows, "2026-10", TODAY, PLANT)
    assert out[0] == ledger.month(rows, "2026-07", TODAY, PLANT)


def test_months_across_a_year_end():
    rows = [stay(1, "A", "2025-11-20", [0, 480], cause="Other")]
    assert [m["id"] for m in ledger.months(rows, "2026-02-10", PLANT)] == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_months_of_nothing():
    out = ledger.months([], TODAY, PLANT)
    assert [m["id"] for m in out] == ["2026-10"] and out[0]["rakes"] == 0


def test_months_do_not_depend_on_the_order_of_stays():
    rows = books()
    assert ledger.months(list(reversed(rows)), TODAY, PLANT) == ledger.months(rows, TODAY, PLANT)


# ================================================================ ledger.notable
def test_notable_shows_the_pinned_bills_audited():
    out = ledger.notable(books(), "2026-10", TODAY, PLANT)
    assert [b["rake"] for b in out] == [s["rake"] for s in october()]
    for b, s in zip(out, october()):
        assert b["audit"] == audit(s, TODAY, PLANT)
        assert {k: b[k] for k in s} == s
    assert [b["date"] for b in out] == ["01 Oct", "02 Oct", "04 Oct", "05 Oct", "07 Oct", "08 Oct", "09 Oct", "11 Oct"]


def test_notable_is_only_that_month():
    out = ledger.notable(books(), "2026-09", TODAY, PLANT)
    assert [b["id"] for b in out] == ["0480", "0482"]                # the clean one has nothing to show
    assert [b["date"] for b in out] == ["29 Sep", "30 Sep"]
    assert ledger.notable(books(), "2026-08", TODAY, PLANT) == []


def many():
    """Twelve August bills with money in them, worth 1 to 12 hours each, in date order."""
    return [stay(100 + n, f"R{n:02d}", f"2026-08-{n:02d}", [0, 420 + 60 * n], owed={"rule": "Bunching", "minutes": 60 * n}, cause="Bunching")
            for n in range(1, 13)]


def test_notable_keeps_the_biggest_and_shows_them_in_date_order():
    out = ledger.notable(many(), "2026-08", TODAY, PLANT)
    assert len(out) == 8
    assert [b["id"] for b in out] == [f"{100 + n:04d}" for n in range(5, 13)]
    assert ledger.notable(many(), "2026-08", TODAY, PLANT, limit=3) == out[-3:]
    assert [b["id"] for b in ledger.notable(many(), "2026-08", TODAY, PLANT, 20)] == [f"{100 + n:04d}" for n in range(1, 13)]


def test_notable_pinned_come_first_whatever_they_are_worth():
    rows = many() + [stay(90, "PIN", "2026-08-01", [0, 300], pinned=True)]       # a pinned bill with nothing in it
    out = ledger.notable(rows, "2026-08", TODAY, PLANT, limit=4)
    assert [b["rake"] for b in out] == ["PIN", "R10", "R11", "R12"]


def test_notable_never_drops_a_pinned_bill():
    out = ledger.notable(october() + many(), "2026-10", TODAY, PLANT, limit=3)
    assert len(out) == 8


def test_notable_breaks_ties_by_the_most_recent():
    rows = [stay(n, f"R{n}", f"2026-08-{n:02d}", [0, 480], owed=BUNCHING, cause="Bunching") for n in range(1, 6)]   # all worth the same
    out = ledger.notable(rows, "2026-08", TODAY, PLANT, limit=2)
    assert [b["rake"] for b in out] == ["R4", "R5"]


def test_notable_sorts_by_date_then_number():
    rows = [stay(7, "B", "2026-08-02", [0, 480], owed=BUNCHING, cause="Bunching"), stay(3, "C", "2026-08-09", [0, 480], owed=BUNCHING, cause="Bunching"),
            stay(5, "A", "2026-08-02", [0, 480], owed=BUNCHING, cause="Bunching")]
    assert [b["rake"] for b in ledger.notable(rows, "2026-08", TODAY, PLANT)] == ["A", "B", "C"]


def test_notable_returns_copies():
    rows = books()
    out = ledger.notable(rows, "2026-10", TODAY, PLANT)
    out[0]["ours"][0] = -5
    out[0]["claim"] = "x"
    assert rows == books()
