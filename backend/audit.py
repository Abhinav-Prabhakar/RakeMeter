"""One bill against our own record.

Pure: takes a stay (see tests/test_world.py), today's date and the plant; returns a new dict.
"""
from __future__ import annotations

from backend import rules


def _over(minutes: int, free: int) -> int:
    """Minutes past `free` (never negative)."""
    return max(0, minutes - free)


def audit(stay: dict, today: str, plant: dict) -> dict:
    """Everything that follows from one bill: both sums, the gap, and what can still be done."""
    free_time = plant["free_minutes"]
    wagons = plant["wagons"]
    owed = stay.get("owed")
    allowance = owed["minutes"] if owed else 0

    ours = stay["ours"][1] - stay["ours"][0]
    billed_stay = stay["billed"][1] - stay["billed"][0]
    old = stay.get("old", ours)

    hours = rules.hours_over(_over(ours, free_time))
    billed_hours = rules.hours_over(_over(billed_stay, free_time))
    fair = rules.charge(hours, wagons)
    billed = rules.charge(billed_hours, wagons)

    # What the bill gets wrong, and what it ignored.
    with_allowance = rules.charge(rules.hours_over(_over(ours, free_time + allowance)), wagons)
    overcharged = billed - fair
    claimable = fair - with_allowance
    back = overcharged + claimable

    # What the stay should cost once everything owed is counted.
    free = free_time + allowance
    due_hours = rules.hours_over(_over(ours, free))

    # The old way, with the bill's own error carried over.
    would_stay = old + (billed_stay - ours)
    would = rules.charge(rules.hours_over(_over(would_stay, free_time)), wagons)

    last_day = rules.deadline(stay["released"])
    left = rules.days_between(today, last_day)

    if not billed:
        kind = "clean"
    elif overcharged:
        kind = "overcharged"
    elif claimable:
        kind = "allowance"
    else:
        kind = "matches"

    if not back:
        state = "none"
    elif stay.get("claim") in ("won", "filed"):
        state = stay["claim"]
    elif left < 0:
        state = "missed"
    else:
        state = "open"

    return {
        "stay": ours, "billed_stay": billed_stay,
        "hours": hours, "billed_hours": billed_hours,
        "fair": fair, "billed": billed,
        "overcharged": overcharged, "claimable": claimable, "back": back,
        "due": billed - back, "due_hours": due_hours, "free": free, "would": would,
        "deadline": last_day, "left": left, "kind": kind, "state": state,
    }
