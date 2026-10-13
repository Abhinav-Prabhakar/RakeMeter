"""The timeline: a planned rake as a track, and a track read at one minute of the day.

Pure functions only: no clock, no disk, no randomness.

`track` is the only place the rulebook is consulted. `at` reads nothing but the
track, so the web page can do the very same sum while the day is scrubbed.
"""
from __future__ import annotations

import copy
import math

from backend import rules

EPSILON = 1e-9      # forgives float dust, so a wagon counts the instant it is done


# ------------------------------------------------------------------ track
def track(planned: dict, plant: dict) -> dict:
    """A planned rake, plus what `at` needs: wagons, tip, events and the meter's steps."""
    rake = copy.deepcopy(planned)
    wagons = plant["wagons"]
    owed = rake.get("owed")
    unapplied = owed["minutes"] if owed and rake.get("claim") != "applied" else 0
    rake["wagons"] = wagons
    rake["tip"] = plant["tip_minutes"]
    rake["events"] = [
        {"at": rake["eta"], "status": "placing"},
        {"at": rake["placed"], "status": "waiting"},
        {"at": rake["start"], "status": "unloading"},
        {"at": rake["done"], "status": "forming"},
        {"at": rake["released"], "status": "released"},
    ]
    rake["steps"] = rules.steps(rake["free_until"], rake["released"], wagons)
    rake["steps_if_claimed"] = rules.steps(rake["free_until"] + unapplied, rake["released"], wagons)
    return rake


# ------------------------------------------------------------------ at
def _status(track: dict, t: float) -> str:
    """Where the rake is in its stay at minute `t`."""
    if t < track["eta"]:
        return "enroute"
    if t < track["placed"]:
        return "placing"
    if t < track["start"]:
        return "waiting"
    if t < track["done"]:
        return "unloading"
    if t < track["released"]:
        return "forming"
    return "released"


def _meter(steps: list[dict], until: float) -> tuple[int, int]:
    """(hours, total) of the last step that began strictly before `until`; (0, 0) if none."""
    reached = [s for s in steps if s["at"] < until]
    return (reached[-1]["hours"], reached[-1]["total"]) if reached else (0, 0)


def at(track: dict, t: float) -> dict:
    """The state of a track at minute `t`: status, wagons tipped, the vehicle on stage, and the meter."""
    status = _status(track, t)
    here = status != "enroute"
    wagons = track["wagons"]
    tipped = max(0, min(wagons, math.floor((t - track["start"]) / track["tip"] + EPSILON)))

    until = min(t, track["released"])               # the meter stops at release
    over = max(0, until - track["free_until"]) if here else 0
    hours, cost = _meter(track["steps"], until) if here else (0, 0)
    _, cost_if_claimed = _meter(track["steps_if_claimed"], until) if here else (0, 0)

    if status in ("enroute", "placing"):
        view = -1                                   # the locomotive
    elif status in ("forming", "released"):
        view = wagons                               # the brake van
    else:
        view = min(tipped, wagons - 1)              # the wagon being tipped

    return {
        "status": status,
        "here": here,
        "tipped": tipped,
        "loaded": tipped < wagons,
        "view": view,
        "over": over,
        "hours": hours,
        "cost": cost,
        "left": track["free_until"] - t,
        "due": cost > 0 and status != "released",
        "cost_if_claimed": cost_if_claimed,
    }
