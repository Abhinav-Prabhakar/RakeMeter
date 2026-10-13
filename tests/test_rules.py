"""The rulebook: how demurrage is counted and charged.

Contract for backend/rules.py. Pure functions; no clock, no disk.
"""
import math

import pytest

from backend import rules


# ---------------------------------------------------------------- constants
def test_constants():
    assert rules.RATE == 150
    assert rules.CLAIM_DAYS == 10
    assert rules.ALLOWANCES == {"Bunching": 180, "Shunting": 120, "Tarpaulin": 60}
    assert [tuple(s) for s in rules.SLABS] == [(6, 1), (12, 1.1), (24, 1.25), (48, 1.5), (72, 2), (math.inf, 3)]


# ---------------------------------------------------------------- hours_over
@pytest.mark.parametrize("minutes, hours", [
    (-500, 0), (-0.01, 0), (0, 0),
    (0.5, 1), (1, 1), (59, 1), (60, 1),          # any part of an hour is a whole hour
    (60.5, 2), (61, 2), (119.9, 2), (120, 2), (121, 3),
    (600, 10), (601, 11), (1440, 24), (4320, 72), (4321, 73),
])
def test_hours_over(minutes, hours):
    assert rules.hours_over(minutes) == hours


def test_hours_over_returns_int():
    assert type(rules.hours_over(90.0)) is int
    assert type(rules.hours_over(-3.5)) is int


def test_hours_over_forgives_float_dust():
    # 163.15789 - 43.15789 is 120.00000000000001 in floating point: still two hours
    assert rules.hours_over(120 + 1e-11) == 2
    assert rules.hours_over(60 * (0.1 + 0.2) / 0.3) == 1


# ---------------------------------------------------------------- charge
@pytest.mark.parametrize("hours, rupees", [
    (0, 0), (1, 8700), (2, 17400), (3, 26100), (6, 52200),
    (7, 61770), (10, 90480), (12, 109620),
    (13, 120495), (24, 240120),
    (25, 253170), (48, 553320),
    (49, 570720), (72, 970920),
    (73, 997020), (100, 1701720),
])
def test_charge_for_a_58_wagon_rake(hours, rupees):
    assert rules.charge(hours) == rupees
    assert rules.charge(hours, 58) == rupees


def test_charge_is_int_and_never_negative():
    for h in range(0, 120):
        c = rules.charge(h)
        assert type(c) is int and c >= 0
    assert rules.charge(-4) == 0


def test_charge_scales_with_wagons():
    assert rules.charge(1, 1) == 150
    assert rules.charge(6, 10) == 9000
    assert rules.charge(7, 10) == 9000 + 1650
    assert rules.charge(3, 0) == 0


def test_each_hour_is_rounded_half_up():
    # 150 x 59 x 1.25 = 11062.5 a hour in the third slab: that is 11063, not 11062
    assert rules.charge(13, 59) == 6 * 8850 + 6 * 9735 + 11063
    assert rules.charge(14, 59) == 6 * 8850 + 6 * 9735 + 2 * 11063
    # 150 x 1 x 1.1 = 165.00000000000003: no float dust in the sum
    assert rules.charge(12, 1) == 6 * 150 + 6 * 165


def test_charge_grows_strictly_and_faster_in_later_slabs():
    prev, prev_step = 0, 0
    for h in range(1, 100):
        c = rules.charge(h)
        assert c > prev
        assert c - prev >= prev_step          # a later hour never costs less than an earlier one
        prev_step, prev = c - prev, c


# ---------------------------------------------------------------- breakdown
def test_breakdown_of_nothing_is_empty():
    assert rules.breakdown(0) == []
    assert rules.breakdown(-2) == []


def test_breakdown_within_first_slab():
    assert rules.breakdown(4) == [{"from": 1, "to": 4, "multiplier": 1, "hours": 4, "amount": 34800}]


def test_breakdown_across_slabs():
    assert rules.breakdown(14) == [
        {"from": 1, "to": 6, "multiplier": 1, "hours": 6, "amount": 52200},
        {"from": 7, "to": 12, "multiplier": 1.1, "hours": 6, "amount": 57420},
        {"from": 13, "to": 14, "multiplier": 1.25, "hours": 2, "amount": 21750},
    ]


def test_breakdown_reaches_the_last_slab():
    parts = rules.breakdown(80)
    assert [p["multiplier"] for p in parts] == [1, 1.1, 1.25, 1.5, 2, 3]
    assert parts[-1] == {"from": 73, "to": 80, "multiplier": 3, "hours": 8, "amount": 8 * 26100}


@pytest.mark.parametrize("wagons", [1, 42, 58, 59])
def test_breakdown_always_sums_to_charge(wagons):
    for h in range(0, 90):
        parts = rules.breakdown(h, wagons)
        assert sum(p["amount"] for p in parts) == rules.charge(h, wagons)
        assert sum(p["hours"] for p in parts) == h
        assert all(type(p["amount"]) is int for p in parts)
        assert all(p["to"] - p["from"] + 1 == p["hours"] for p in parts)


# ---------------------------------------------------------------- steps
def test_no_steps_inside_free_time():
    assert rules.steps(475, 400) == []
    assert rules.steps(475, 475) == []


def test_first_step_lands_the_moment_free_time_ends():
    assert rules.steps(475, 475.5) == [{"at": 475, "hours": 1, "total": 8700}]
    assert rules.steps(475, 535) == [{"at": 475, "hours": 1, "total": 8700}]


def test_steps_are_an_hour_apart():
    assert rules.steps(475, 617.16) == [
        {"at": 475, "hours": 1, "total": 8700},
        {"at": 535, "hours": 2, "total": 17400},
        {"at": 595, "hours": 3, "total": 26100},
    ]


def test_steps_follow_the_slabs():
    s = rules.steps(0, 8 * 60)
    assert [x["total"] for x in s] == [8700, 17400, 26100, 34800, 43500, 52200, 61770, 71340]
    assert [x["hours"] for x in s] == [1, 2, 3, 4, 5, 6, 7, 8]


@pytest.mark.parametrize("free_until, until", [(0, 1), (310, 163.2), (475, 617.1579), (649, 702.6579), (-150.5, 944.25), (12.25, 4400)])
def test_steps_agree_with_hours_over(free_until, until):
    s = rules.steps(free_until, until)
    assert len(s) == rules.hours_over(until - free_until)
    for k, step in enumerate(s, start=1):
        assert step == {"at": free_until + (k - 1) * 60, "hours": k, "total": rules.charge(k)}
        assert step["at"] < until


def test_steps_take_wagons():
    assert rules.steps(0, 61, 10) == [{"at": 0, "hours": 1, "total": 1500}, {"at": 60, "hours": 2, "total": 3000}]


# ---------------------------------------------------------------- next_step
def test_next_step_before_free_time_ends():
    assert rules.next_step(100, 475) == {"at": 475, "hours": 1, "amount": 8700, "total": 8700}
    assert rules.next_step(475, 475) == {"at": 475, "hours": 1, "amount": 8700, "total": 8700}


def test_next_step_once_the_meter_is_running():
    assert rules.next_step(476, 475) == {"at": 535, "hours": 2, "amount": 8700, "total": 17400}
    assert rules.next_step(535, 475) == {"at": 535, "hours": 2, "amount": 8700, "total": 17400}
    assert rules.next_step(535.5, 475) == {"at": 595, "hours": 3, "amount": 8700, "total": 26100}


def test_next_step_crossing_into_a_dearer_slab():
    # six hours charged; the seventh is the first at +10%
    assert rules.next_step(6 * 60 - 1, 0) == {"at": 360, "hours": 7, "amount": 9570, "total": 61770}


def test_next_step_is_the_step_after_now():
    for now in [0, 10, 475, 500, 535, 900.5, 2000]:
        n = rules.next_step(now, 475)
        assert n["at"] >= now
        assert n["hours"] == rules.hours_over(now - 475) + 1
        assert n["total"] == rules.charge(n["hours"])
        assert n["amount"] == rules.charge(n["hours"]) - rules.charge(n["hours"] - 1)


# ---------------------------------------------------------------- allowances and dates
def test_allowance():
    assert rules.allowance("Bunching") == 180
    assert rules.allowance("Shunting") == 120
    assert rules.allowance("Tarpaulin") == 60


@pytest.mark.parametrize("bad", ["bunching", "", "Fog", None])
def test_unknown_allowance(bad):
    with pytest.raises(ValueError):
        rules.allowance(bad)


def test_add_days():
    assert rules.add_days("2026-10-07", 10) == "2026-10-17"
    assert rules.add_days("2026-09-28", 10) == "2026-10-08"
    assert rules.add_days("2026-12-25", 10) == "2027-01-04"
    assert rules.add_days("2026-10-07", 0) == "2026-10-07"
    assert rules.add_days("2026-03-01", -1) == "2026-02-28"


def test_days_between():
    assert rules.days_between("2026-10-13", "2026-10-17") == 4
    assert rules.days_between("2026-10-13", "2026-10-13") == 0
    assert rules.days_between("2026-10-13", "2026-10-08") == -5
    assert rules.days_between("2026-05-01", "2026-10-13") == 165


def test_deadline_is_ten_days_on():
    assert rules.deadline("2026-10-07") == "2026-10-17"
    assert rules.deadline("2026-10-01") == "2026-10-11"
    assert rules.deadline("2026-02-20") == "2026-03-02"
