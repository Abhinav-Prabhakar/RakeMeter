"""The world: one seeded plant, the day on the Yard screen, and six months of stays.

Pure and deterministic: the same seed always gives the same world; nothing here reads the
clock or the global random module. Importing this module does no work; the history is
built (once per seed) the first time it is asked for.

The story the history tells: until the product goes in (`PLANT["since"]`) nothing is
planned or claimed, so most rakes overrun free time and every billing mistake is lost.
From July the plan shortens more and more stays, and more and more claims on the mistakes
are won, so the share of money saved climbs month on month. The knobs for that story are
the tables in the "knobs" section; change them there.
"""
from __future__ import annotations

import copy
import random
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache

from backend import rules

PLANT = {
    "name": "Kalinga Thermal, Siding A", "tipplers": 2, "tips_per_hour": 19, "tip_minutes": 60 / 19, "wagons": 58,
    "free_minutes": 420, "form_minutes": 25, "gap_minutes": 10, "capacity_per_day": 4, "since": "2026-07-01",
}
TODAY = "2026-10-13"
CAUSES = ["Bunching", "Tippler down", "Late crew", "Other"]
LIVERIES = ["orange", "oxide", "cobalt", "forest", "ochre"]

FREE = PLANT["free_minutes"]
SINCE = PLANT["since"]
FIRST_DAY = "2026-05-01"
ORIGINS = ["Dipka", "Gevra", "Kusmunda", "Korba"]


def _at(hours: float, minutes: float) -> float:
    """Minutes after midnight (negative: the evening before)."""
    return hours * 60 + minutes


# ------------------------------------------------------------------ today
_BUNCHING = {"rule": "Bunching", "minutes": 180}
_DAY = [
    {"slot": slot, "id": rake, "from": origin, "tonnes": tonnes, "eta": eta, "placed": placed, "ready": ready,
     "tippler": tippler, "line": line, "owed": owed, "hold": 0, "claim": "none", "livery": livery}
    for slot, rake, origin, tonnes, eta, placed, ready, tippler, line, owed, livery in [
        ("S615", "BNSF270663", "Dipka", 4104, _at(-3, 25), _at(-2, 10), _at(-1, 15), 1, 1, None, "oxide"),
        ("S616", "BNSF270664", "Gevra", 4121, _at(0, 0), _at(0, 30), _at(1, 44), 2, 2, None, "cobalt"),
        ("S617", "BNSF270665", "Kusmunda", 4096, _at(0, 20), _at(0, 55), _at(6, 49), 1, 3, _BUNCHING, "orange"),
        ("S618", "BNSF270666", "Gevra", 4118, _at(3, 15), _at(3, 49), _at(8, 14.5), 2, 4, None, "orange"),
        ("S619", "BNSF270667", "Dipka", 4109, _at(6, 0), _at(6, 34), _at(10, 2), 1, 3, None, "orange"),
        ("S620", "BNSF270668", "Korba", 4127, _at(8, 25), _at(8, 59), _at(11, 28), 2, 4, _BUNCHING, "orange"),
        ("S621", "BNSF270669", "Gevra", 4113, _at(11, 40), _at(12, 10), _at(13, 15), 1, 3, _BUNCHING, "orange"),
        ("S622", "BNSF270670", "Kusmunda", 4102, _at(13, 5), _at(13, 35), _at(14, 41), 2, 4, _BUNCHING, "orange"),
    ]
]


def day() -> list[dict]:
    """Today's eight rakes, S615 to S622, as a fresh copy."""
    return copy.deepcopy(_DAY)


# ------------------------------------------------------------------ the eight pinned October stays
def _pinned(rake, origin, released, ours, billed, wrong, proof, owed, old, cause, claim) -> dict:
    return {"rake": rake, "from": origin, "released": released, "ours": ours, "billed": billed, "wrong": wrong,
            "proof": proof, "owed": owed, "old": old, "cause": cause, "claim": claim, "pinned": True}


_PINNED = [
    _pinned("BNSF270598", "Dipka", "2026-10-01", [_at(1, 10), _at(11, 5)], [_at(1, 10), _at(11, 5)],
            None, None, _BUNCHING, 595, "Bunching", "none"),
    _pinned("BNSF270611", "Gevra", "2026-10-02", [_at(2, 15), _at(8, 25)], [_at(2, 15), _at(8, 25)],
            None, None, None, 520, None, "none"),
    _pinned("BNSF270624", "Korba", "2026-10-04", [_at(5, 40), _at(15, 2)], [_at(5, 40), _at(15, 2)],
            None, None, None, 562, "Tippler down", "none"),
    _pinned("BNSF270630", "Gevra", "2026-10-05", [_at(3, 49), _at(11, 42)], [_at(3, 15), _at(11, 42)],
            "placed", "Gate log", None, 473, "Late crew", "filed"),
    _pinned("BNSF270638", "Kusmunda", "2026-10-07", [_at(0, 55), _at(11, 35)], [_at(0, 55), _at(11, 35)],
            None, None, _BUNCHING, 640, "Bunching", "none"),
    _pinned("BNSF270641", "Dipka", "2026-10-08", [_at(9, 5), _at(15, 40)], [_at(9, 5), _at(15, 40)],
            None, None, None, 560, None, "none"),
    _pinned("BNSF270645", "Gevra", "2026-10-09", [_at(5, 15), _at(13, 5)], [_at(5, 15), _at(14, 10)],
            "released", "Tippler log", None, 470, "Other", "none"),
    _pinned("BNSF270652", "Korba", "2026-10-11", [_at(4, 20), _at(12, 10)], [_at(3, 30), _at(12, 10)],
            "placed", "Gate log", None, 470, "Late crew", "won"),
]


# ------------------------------------------------------------------ knobs
@dataclass(frozen=True)
class Month:
    """How a month goes. All shares are of the rakes that would have overrun the old way."""

    fixed: float          # the plan brings the stay inside free time
    eased: float          # the plan shortens the stay but it still overruns
    win: float            # share of claimable mistakes whose claim is won
    mistakes: bool = True # October's recent window is kept hand-written (the pinned stays)


MONTHS = {
    "2026-05": Month(fixed=0.00, eased=0.00, win=0.00),   # the old way: nothing planned, nothing claimed
    "2026-06": Month(fixed=0.00, eased=0.00, win=0.00),
    "2026-07": Month(fixed=0.12, eased=0.07, win=0.30),   # the product goes in on the 1st
    "2026-08": Month(fixed=0.22, eased=0.10, win=0.55),
    "2026-09": Month(fixed=0.38, eased=0.12, win=0.80),
    "2026-10": Month(fixed=0.52, eased=0.12, win=0.85, mistakes=False),
}

RAKES_PER_DAY = 4                      # every month gets exactly this many a day on average
OVERRUN_ODDS = 0.65                    # share of rakes that would overrun free time the old way
OVERRUN_BANDS = [(0.80, 20, 240), (0.17, 240, 540), (0.03, 540, 1000)]   # (weight, min, max) minutes over free time
UNDER_FREE = (270, 415)                # stay, in minutes, of a rake that does not overrun
FIXED_STAY = (300, 415)                # stay of an overrunning rake once the plan fixes it
EASED_LEFT = (0.3, 0.7)                # share of the overrun an eased rake still has
CAUSE_WEIGHTS = [0.42, 0.20, 0.20, 0.18]   # in CAUSES order
OWED_SHARE = 0.65                     # of overruns caused by bunching or "other", the share owed an allowance
WRONG_PER_MONTH = 12                   # bills with a wrong time, per month
WRONG_BY = (15, 90)                    # minutes a bill's time is out by
FILED_DAYS = 30                        # claims on stays this recent may still be waiting for an answer
FILED_ODDS = 0.5                       # chance an unanswered, recent claim shows as "filed"
FIRST_RAKE = 268700                    # rake numbers climb from here by 1 to 5 a stay


# ------------------------------------------------------------------ money (the same sums the audit makes)
def _hours_charge(minutes_over: float) -> int:
    return rules.charge(rules.hours_over(minutes_over))


def _back(s: dict) -> int:
    """What the railway over-billed on this stay, after any allowance it was owed."""
    stay = s["ours"][1] - s["ours"][0]
    billed_stay = s["billed"][1] - s["billed"][0]
    relief = s["owed"]["minutes"] if s["owed"] else 0
    return _hours_charge(billed_stay - FREE) - _hours_charge(stay - FREE - relief)


# ------------------------------------------------------------------ the calendar
def _days(first: str, last: str) -> list[str]:
    d, end = date.fromisoformat(first), date.fromisoformat(last)
    return [(d + timedelta(days=i)).isoformat() for i in range((end - d).days + 1)]


def _rakes_each_day(rng: random.Random, days: list[str]) -> dict[str, int]:
    """Rakes released on each day of a month: 3, 4 or 5, summing to exactly four a day."""
    counts = [RAKES_PER_DAY] * len(days)
    swaps = len(days) // 5
    picked = rng.sample(range(len(days)), 2 * swaps)
    for i in picked[:swaps]:
        counts[i] += 1
    for i in picked[swaps:]:
        counts[i] -= 1
    return dict(zip(days, counts))


# ------------------------------------------------------------------ one month of stays
def _old_way_stay(rng: random.Random, overruns: bool) -> int:
    """Minutes a rake would stay if handled the old way."""
    if not overruns:
        return rng.randint(*UNDER_FREE)
    weights, lows, highs = zip(*OVERRUN_BANDS)
    band = rng.choices(range(len(OVERRUN_BANDS)), weights=weights)[0]
    return FREE + rng.randint(lows[band], highs[band])


def _new_stay(rng: random.Random, date_: str, old: int, actual: int) -> dict:
    """A stay that ended at a random time on `date_`, with no mistakes or claims yet."""
    released_at = rng.randrange(1440)
    days_before = max(0, -(-(actual - released_at) // 1440))       # it was placed this many days earlier
    placed = released_at - actual + 1440 * days_before
    return {"rake": None, "from": rng.choices(ORIGINS, weights=[3, 3, 2, 2])[0], "released": date_,
            "ours": [placed, placed + actual], "billed": [placed, placed + actual], "wrong": None, "proof": None,
            "owed": None, "old": old, "cause": None, "claim": "none", "pinned": False}


def _spread(rng: random.Random, items: list, share: float) -> tuple[list, list]:
    """Split an ordered list into (chosen, rest), choosing `share` of it evenly along the order.

    Taking every few-th item (from a random start) rather than random ones keeps a month's
    money from depending on whether the dear stays happened to be chosen.
    """
    chosen, rest, phase = [], [], rng.random()
    for k, item in enumerate(items):
        (chosen if int((k + 1) * share + phase) > int(k * share + phase) else rest).append(item)
    return chosen, rest


def _plan(rng: random.Random, month: Month, olds: list[int]) -> list[int]:
    """Actual stays: the old-way stays, with the plan fixing or easing some of the overruns."""
    actual = list(olds)
    overrunning = sorted((i for i, old in enumerate(olds) if old > FREE), key=lambda i: olds[i])
    fixed, rest = _spread(rng, overrunning, month.fixed)
    eased, _ = _spread(rng, rest, month.eased / (1 - month.fixed))
    for i in fixed:
        actual[i] = rng.randint(*FIXED_STAY)
    for i in eased:
        actual[i] = max(FREE + 1, FREE + round((olds[i] - FREE) * rng.uniform(*EASED_LEFT)))
    return actual


def _add_causes(rng: random.Random, stays: list[dict]) -> None:
    for s in stays:
        if s["ours"][1] - s["ours"][0] > FREE:
            s["cause"] = rng.choices(CAUSES, weights=CAUSE_WEIGHTS)[0]


def _add_allowances(rng: random.Random, stays: list[dict]) -> None:
    """Some overruns caused by bunching (or "other") were owed an allowance the bill ignored."""
    eligible = [s for s in stays if s["cause"] in ("Bunching", "Other")]
    for s in rng.sample(eligible, round(OWED_SHARE * len(eligible))):
        rule = "Bunching" if s["cause"] == "Bunching" else rng.choice(["Shunting", "Tarpaulin"])
        s["owed"] = {"rule": rule, "minutes": rules.ALLOWANCES[rule]}


def _add_wrong_times(rng: random.Random, stays: list[dict], count: int) -> None:
    """Bills whose placed or released time is out, each costing real money."""
    candidates = [s for s in stays if s["owed"] is None]
    rng.shuffle(candidates)
    made = 0
    for s in candidates:
        if made == count:
            break
        for _ in range(8):
            wrong, by = rng.choice(["placed", "released"]), rng.randint(*WRONG_BY)
            if wrong == "placed" and s["ours"][0] - by < 0:
                continue
            s["billed"] = [s["ours"][0] - by, s["ours"][1]] if wrong == "placed" else [s["ours"][0], s["ours"][1] + by]
            s["wrong"], s["proof"] = wrong, "Gate log" if wrong == "placed" else "Tippler log"
            if _back(s) > 0:
                made += 1
                break
            s["billed"], s["wrong"], s["proof"] = list(s["ours"]), None, None


def _settle_claims(rng: random.Random, month: Month, stays: list[dict]) -> None:
    """Of the mistakes worth claiming, the product wins a share and files some more."""
    claimable = sorted((s for s in stays if _back(s) > 0 and s["released"] >= SINCE), key=_back)
    won, rest = _spread(rng, claimable, month.win)
    for s in won:
        s["claim"] = "won"
    recent = rules.add_days(TODAY, -FILED_DAYS)
    for s in rest:
        if s["released"] >= recent and rng.random() < FILED_ODDS:
            s["claim"] = "filed"


def _month_of_stays(rng: random.Random, month_id: str, dates: list[str]) -> list[dict]:
    """The generated stays of one month, one per entry of `dates`."""
    month = MONTHS[month_id]
    n = len(dates)
    overruns = set(rng.sample(range(n), round(OVERRUN_ODDS * n)))
    olds = [_old_way_stay(rng, i in overruns) for i in range(n)]
    actuals = _plan(rng, month, olds)
    stays = [_new_stay(rng, d, old, actual) for d, old, actual in zip(dates, olds, actuals)]
    _add_causes(rng, stays)
    if month.mistakes:
        _add_allowances(rng, stays)
        _add_wrong_times(rng, stays, WRONG_PER_MONTH)
        _settle_claims(rng, month, stays)
    return stays


# ------------------------------------------------------------------ the history
@lru_cache(maxsize=None)
def _build(seed: int) -> list[dict]:
    rng = random.Random(seed)
    pinned_per_day: dict[str, int] = {}
    for p in _PINNED:
        pinned_per_day[p["released"]] = pinned_per_day.get(p["released"], 0) + 1
    all_days = _days(FIRST_DAY, TODAY)

    stays = [copy.deepcopy(p) for p in _PINNED]
    for month_id in MONTHS:
        days = [d for d in all_days if d.startswith(month_id)]
        per_day = _rakes_each_day(rng, days)
        dates = [d for d in days for _ in range(per_day[d] - pinned_per_day.get(d, 0))]
        stays += _month_of_stays(rng, month_id, dates)

    stays.sort(key=lambda s: (s["released"], s["ours"][1] % 1440))
    taken = {p["rake"] for p in _PINNED} | {r["id"] for r in _DAY}
    number = FIRST_RAKE
    for i, s in enumerate(stays, start=1):
        s["id"], s["no"] = f"{i:04d}", f"DC/{i:04d}"
        if s["rake"] is None:
            number += rng.randint(1, 5)
            while f"BNSF{number}" in taken:
                number += 1
            s["rake"] = f"BNSF{number}"
    return stays


def history(seed: int = 1) -> list[dict]:
    """About four stays a day from 1 May to today, oldest first, as a fresh copy."""
    return copy.deepcopy(_build(seed))
