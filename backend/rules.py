"""The rulebook: how demurrage is counted and charged.

Pure functions only: no clock, no disk, no randomness.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from fractions import Fraction

RATE = 150                      # rupees per wagon per hour, or part of an hour
CLAIM_DAYS = 10                 # days after a stay in which a claim can be made
ALLOWANCES = {"Bunching": 180, "Shunting": 120, "Tarpaulin": 60}   # minutes of relief
SLABS = [(6, 1), (12, 1.1), (24, 1.25), (48, 1.5), (72, 2), (math.inf, 3)]   # (hours over up to, multiplier)

DEFAULT_WAGONS = 58


# ------------------------------------------------------------------ hours
def hours_over(minutes: float) -> int:
    """Whole hours charged for a stay `minutes` past free time; any part of an hour counts."""
    if minutes <= 0:
        return 0
    return math.ceil(minutes / 60 - 1e-9)   # the epsilon forgives float dust such as 120.00000000000001


# ------------------------------------------------------------------ charge
def _hour_amount(multiplier: float, wagons: int) -> int:
    """One hour's charge, rounded half up. Exact arithmetic avoids float dust (150 x 1.1)."""
    exact = RATE * wagons * Fraction(str(multiplier))
    return math.floor(exact + Fraction(1, 2))


def _multiplier(hour: int) -> float:
    """The multiplier of the slab that the given (1-based) hour falls in."""
    return next(m for up_to, m in SLABS if hour <= up_to)


def charge(hours: int, wagons: int = DEFAULT_WAGONS) -> int:
    """Demurrage for `hours` past free time: each hour at its slab's rate, rounded, summed."""
    return sum(part["amount"] for part in breakdown(hours, wagons))


def breakdown(hours: int, wagons: int = DEFAULT_WAGONS) -> list[dict]:
    """The charge split by slab, touched slabs only: [{from, to, multiplier, hours, amount}]."""
    parts = []
    first = 1
    for up_to, multiplier in SLABS:
        last = min(hours, up_to)
        if last < first:
            break
        count = last - first + 1
        parts.append({
            "from": first,
            "to": last,
            "multiplier": multiplier,
            "hours": count,
            "amount": count * _hour_amount(multiplier, wagons),
        })
        first = last + 1
    return parts


# ------------------------------------------------------------------ meter steps
def steps(free_until: float, until: float, wagons: int = DEFAULT_WAGONS) -> list[dict]:
    """Every time the meter ticks up between `free_until` and `until`.

    Step k lands at free_until + (k - 1) * 60 and carries the running total.
    """
    return [
        {"at": free_until + (k - 1) * 60, "hours": k, "total": charge(k, wagons)}
        for k in range(1, hours_over(until - free_until) + 1)
    ]


def next_step(now: float, free_until: float, wagons: int = DEFAULT_WAGONS) -> dict:
    """The next moment (now or later) at which the meter goes up."""
    hours = hours_over(now - free_until) + 1
    total = charge(hours, wagons)
    return {
        "at": free_until + (hours - 1) * 60,
        "hours": hours,
        "amount": total - charge(hours - 1, wagons),
        "total": total,
    }


# ------------------------------------------------------------------ allowances and dates
def allowance(rule: str) -> int:
    """Minutes of relief a rule grants; ValueError if the rule is unknown."""
    try:
        return ALLOWANCES[rule]
    except (KeyError, TypeError):
        raise ValueError(f"unknown allowance: {rule!r}") from None


def add_days(iso: str, n: int) -> str:
    """An ISO date `n` days on (or back, if negative)."""
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


def days_between(a: str, b: str) -> int:
    """Whole days from date `a` to date `b`; negative if `b` is earlier."""
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def deadline(iso: str) -> str:
    """The last day a claim for a stay on `iso` can be made."""
    return add_days(iso, CLAIM_DAYS)
