"""The scheduler: who is tipped where and when, and what the day costs.

Pure functions over plain dicts. A "raw" rake is what is known about it; a "planned"
rake is the raw one plus start, done, released and free_until. Nothing passed in is
changed, and nothing in a result is shared with an argument.
"""
from __future__ import annotations

import copy
import itertools
import math

from backend import rules

CHOICES = {"tippler", "hold", "owed", "claim", "livery"}   # the fields a person may change


# ------------------------------------------------------------------ plan
def plan(rakes: list[dict], plant: dict) -> list[dict]:
    """Time every rake: new dicts, in the input order.

    A tippler takes its rakes one at a time in order of `ready` (ties: input order). A rake
    starts when it is ready and the tippler is clear, plus its `hold`.
    """
    planned = [copy.deepcopy(r) for r in rakes]
    for r in planned:
        r["hold"] = r.get("hold") or 0
        r["claim"] = (r.get("claim") or "none") if r.get("owed") else "none"
        extra = r["owed"]["minutes"] if r["claim"] == "applied" else 0
        r["free_until"] = r["placed"] + plant["free_minutes"] + extra

    for tippler in {r["tippler"] for r in planned}:
        clear = -math.inf
        for r in sorted((x for x in planned if x["tippler"] == tippler), key=lambda x: x["ready"]):
            r["start"] = max(r["ready"], clear) + r["hold"]       # a hold counts from the earliest possible start
            r["done"] = r["start"] + plant["wagons"] * plant["tip_minutes"]
            r["released"] = r["done"] + plant["form_minutes"]
            clear = r["done"] + plant["gap_minutes"]
    return planned


def queue(planned: list[dict], tippler: int) -> list[dict]:
    """The planned rakes on one tippler, in the order they are tipped."""
    return sorted((r for r in planned if r["tippler"] == tippler), key=lambda r: r["start"])


def cost(planned: list[dict], plant: dict) -> int:
    """Demurrage for the whole day: each rake's meter runs from free_until until release."""
    return sum(rules.charge(rules.hours_over(r["released"] - r["free_until"]), plant["wagons"]) for r in planned)


# ------------------------------------------------------------------ change
def change(rakes: list[dict], slot: str, patch: dict, at: float) -> list[dict]:
    """New raw rakes with `patch` applied to the rake in `slot`.

    Only tippler, hold, owed, claim and livery may be patched (ValueError otherwise); an
    unknown slot is a KeyError. Moving a rake to another tippler means it cannot start
    before `at`, so its `ready` becomes max(ready, ceil(at)). Dropping `owed` drops the claim.
    """
    out = copy.deepcopy(rakes)
    rake = next((r for r in out if r["slot"] == slot), None)
    if rake is None:
        raise KeyError(slot)
    unknown = set(patch) - CHOICES
    if unknown:
        raise ValueError(f"not a choice: {', '.join(sorted(unknown))}")

    patch = copy.deepcopy(patch)
    if "tippler" in patch and patch["tippler"] != rake["tippler"]:
        rake["ready"] = max(rake["ready"], math.ceil(at))
    rake.update(patch)
    if "owed" in patch and patch["owed"] is None and rake.get("claim", "none") != "none":
        rake["claim"] = "none"                                    # nothing left to claim
    return out


# ------------------------------------------------------------------ best
def best(rakes: list[dict], plant: dict, at: float) -> dict:
    """The cheapest way to spread the rakes that have not started over the tipplers.

    Tries every assignment of rakes whose planned start is after `at`; the lowest cost
    wins, and on a tie the one that moves the fewest rakes.
    Returns {current, cost, saving, moves: [{slot, from, to}], rakes}.
    """
    current = cost(plan(rakes, plant), plant)
    movable = [r for r in plan(rakes, plant) if r["start"] > at]
    tipplers = range(1, plant["tipplers"] + 1)

    winner = (current, 0, ())                                     # (cost, moves, assignment)
    for choice in itertools.product(tipplers, repeat=len(movable)):
        moves = sum(1 for r, t in zip(movable, choice) if r["tippler"] != t)
        if moves == 0:
            continue                                              # that is the current day
        trial = _reassign(rakes, {r["slot"]: t for r, t in zip(movable, choice)}, at)
        score = (cost(plan(trial, plant), plant), moves, choice)
        if score[:2] < winner[:2]:
            winner = score

    moves = []
    result = copy.deepcopy(rakes)
    for r, tippler in zip(movable, winner[2]):
        if r["tippler"] != tippler:
            moves.append({"slot": r["slot"], "from": r["tippler"], "to": tippler})
            result = change(result, r["slot"], {"tippler": tippler}, at)
    return {"current": current, "cost": winner[0], "saving": current - winner[0], "moves": moves, "rakes": result}


def _reassign(rakes: list[dict], tipplers: dict[str, int], at: float) -> list[dict]:
    """Raw rakes with the given slots moved to the given tipplers (as `change` would, cheaper)."""
    out = []
    for r in rakes:
        t = tipplers.get(r["slot"], r["tippler"])
        if t != r["tippler"]:
            r = {**r, "tippler": t, "ready": max(r["ready"], math.ceil(at))}
        out.append(r)
    return out
