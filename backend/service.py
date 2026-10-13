"""The service: the use-cases the page needs, composed from the pure modules.

Today's rakes are the seeded day with the saved choices laid over them; the books are the
seeded history with the saved bill claims laid over it. Nothing here does sums of its own:
timing is `schedule`, the meter is `timeline`, the money is `rules`, `audit` and `ledger`.

What goes wrong is raised as `ServiceError` with a `code`:
    "not_found"  no such rake, bill or month
    "invalid"    the patch does not make sense
    "conflict"   the patch makes sense but can no longer be done
"""
from __future__ import annotations

import copy
import math
import re
import threading
from functools import cached_property

from backend import ledger, rules, schedule, timeline, world
from backend.audit import audit
from backend.store import Store

PLANT = world.PLANT
TODAY = world.TODAY
BEFORE_THE_DAY = -1440                    # the minute used when no `at` is given
HOLDS = [0, 30, 60, 120]
RAKE_CLAIMS = ["none", "filed", "applied"]
BILL_CLAIMS = ["none", "filed", "won"]
MONTH_ID = re.compile(r"\d{4}-(0[1-9]|1[0-2])")


class ServiceError(Exception):
    """A refused request: `code` is "not_found", "invalid" or "conflict"; `message` says why."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value) -> bool:
    """A real, finite number (not a bool, not a string, not NaN or infinity)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:                 # an int too big for a float
        return False


def _minute(value, default=BEFORE_THE_DAY):
    """`value` as a minute of the day; None means `default`. Anything else that is not a number is invalid."""
    if value is None:
        return default
    if not _is_number(value):
        raise ServiceError("invalid", "the time must be a finite number of minutes")
    return value


# What each field of a rake patch may hold (owed is an allowance name in a patch).
RAKE_FIELDS = {
    "tippler": lambda v: _is_int(v) and 1 <= v <= PLANT["tipplers"],
    "hold": lambda v: _is_int(v) and v in HOLDS,
    "owed": lambda v: v is None or (isinstance(v, str) and v in rules.ALLOWANCES),
    "claim": lambda v: isinstance(v, str) and v in RAKE_CLAIMS,
    "livery": lambda v: isinstance(v, str) and v in world.LIVERIES,
}


def _owed(name):
    """The stored form of an allowance owed: {"rule", "minutes"}, or None."""
    return None if name is None else {"rule": name, "minutes": rules.allowance(name)}


def _saved_choice(key: str, value):
    """A saved rake choice made usable, or `KeyError` if it is unknown or no longer sensible."""
    if key == "owed":
        name = value.get("rule") if isinstance(value, dict) else value
        if RAKE_FIELDS["owed"](name):
            return _owed(name)
    elif key == "ready":
        if _is_number(value):
            return value
    elif key in RAKE_FIELDS and RAKE_FIELDS[key](value):
        return value
    raise KeyError(key)


class Service:
    """The use-cases. Choices live in the store, so a new Service on the same store sees them."""

    def __init__(self, store: Store, seed: int = 1):
        self._store = store
        self._seed = seed
        self._lock = threading.RLock()

    @cached_property
    def _history(self) -> list[dict]:
        """The seeded stays, generated once (never handed out; the ledger copies what it returns)."""
        return world.history(self._seed)

    # ============================================================ the day
    def _raw(self) -> list[dict]:
        """Today's rakes with the saved choices applied; unknown slots, keys and values are ignored."""
        saved = self._store.get()["rakes"]
        rakes = world.day()
        for rake in rakes:
            for key, value in saved.get(rake["slot"], {}).items():
                try:
                    rake[key] = _saved_choice(key, value)
                except KeyError:
                    continue
        return rakes

    def _day(self, at: float) -> dict:
        raw = self._raw()
        planned = schedule.plan(raw, PLANT)
        best = schedule.best(raw, PLANT, at)
        return {
            "plant": copy.deepcopy(PLANT),
            "today": TODAY,
            "rakes": [timeline.track(r, PLANT) for r in planned],
            "cost": schedule.cost(planned, PLANT),
            "best": {key: best[key] for key in ("current", "cost", "saving", "moves")},
        }

    def day(self, at=None) -> dict:
        """The day as it stands, with the best plan from minute `at` on."""
        at = _minute(at)
        with self._lock:
            return self._day(at)

    def state(self, t) -> list[dict]:
        """Every rake's state at minute `t`, in the day's order."""
        if not _is_number(t):
            raise ServiceError("invalid", "t must be a finite number of minutes")
        with self._lock:
            planned = schedule.plan(self._raw(), PLANT)
        return [{"slot": r["slot"], **timeline.at(timeline.track(r, PLANT), t)} for r in planned]

    def rules(self) -> dict:
        """The rulebook as plain data, for the page to draw with."""
        return {
            "rate": rules.RATE,
            "wagons": PLANT["wagons"],
            "free_minutes": PLANT["free_minutes"],
            "slabs": [{"upto": None if math.isinf(upto) else upto, "multiplier": multiplier}
                      for upto, multiplier in rules.SLABS],
            "allowances": [{"rule": rule, "minutes": minutes} for rule, minutes in rules.ALLOWANCES.items()],
            "claim_days": rules.CLAIM_DAYS,
            "holds": list(HOLDS),
            "claims": {"rake": list(RAKE_CLAIMS), "bill": list(BILL_CLAIMS)},
            "liveries": list(world.LIVERIES),
            "causes": list(world.CAUSES),
            "charges": [rules.charge(hours, PLANT["wagons"]) for hours in range(97)],
        }

    # ============================================================ one rake
    @staticmethod
    def _find(rakes: list[dict], slot) -> dict:
        rake = next((r for r in rakes if r["slot"] == slot), None)
        if rake is None:
            raise ServiceError("not_found", f"no rake in slot {slot!r}")
        return rake

    def options(self, slot, at=None) -> dict:
        """What moving the rake to each tippler, or holding it for each hold, would do to the day."""
        with self._lock:
            raw = self._raw()
            self._find(raw, slot)
            at = _minute(at)
            planned = schedule.plan(raw, PLANT)
            here = self._find(planned, slot)
            current = schedule.cost(planned, PLANT)

            def trial(key, value, is_current):
                after = schedule.plan(schedule.change(raw, slot, {key: value}, at), PLANT)
                mine = self._find(after, slot)
                total = schedule.cost(after, PLANT)
                return {"value": value, "current": is_current, "start": mine["start"],
                        "released": mine["released"], "cost": total, "delta": total - current}

            return {
                "slot": slot,
                "locked": here["start"] <= at,
                "tippler": [trial("tippler", n, n == here["tippler"]) for n in range(1, PLANT["tipplers"] + 1)],
                "hold": [trial("hold", m, m == here["hold"]) for m in HOLDS],
            }

    def set_rake(self, slot, patch, at=None) -> dict:
        """Apply a patch of choices to a rake, remember them, and return the new day as of `at`."""
        with self._lock:
            raw = self._raw()
            rake = self._find(raw, slot)
            at = _minute(at)
            self._check_rake_patch(patch, rake)
            planned = self._find(schedule.plan(raw, PLANT), slot)
            moves = ("tippler" in patch and patch["tippler"] != planned["tippler"]) or \
                    ("hold" in patch and patch["hold"] != planned["hold"])
            if moves and planned["start"] <= at:
                raise ServiceError("conflict", f"rake {slot} has already started; it can no longer be moved or held")

            choices = {key: _owed(value) if key == "owed" else value for key, value in patch.items()}
            after = self._find(schedule.change(raw, slot, choices, at), slot)
            saved = {key: after[key] for key in patch}
            if "owed" in patch:
                saved["claim"] = after["claim"]               # dropping the allowance drops the claim
            if after["ready"] != rake["ready"]:
                saved["ready"] = after["ready"]               # a move stays timed from when it was made
            self._store.set_rake(slot, saved)
            return self._day(at)

    @staticmethod
    def _check_rake_patch(patch, rake: dict) -> None:
        """Raise "invalid" unless the whole patch makes sense for this rake."""
        if not isinstance(patch, dict) or not patch:
            raise ServiceError("invalid", "the patch must be an object with at least one field")
        for key, value in patch.items():
            if key not in RAKE_FIELDS:
                raise ServiceError("invalid", f"{key!r} is not something that can be changed on a rake")
            if not RAKE_FIELDS[key](value):
                raise ServiceError("invalid", f"{value!r} is not allowed for {key}")
        owed = patch["owed"] if "owed" in patch else (rake.get("owed") or {}).get("rule")
        if patch.get("claim", "none") != "none" and owed is None:
            raise ServiceError("invalid", "a claim needs an allowance that is owed")

    # ============================================================ the books
    def _stays(self) -> list[dict]:
        """The seeded history with the saved bill claims applied."""
        saved = self._store.get()["bills"]
        stays = []
        for stay in self._history:
            claim = saved.get(stay["id"], {}).get("claim")
            stays.append({**stay, "claim": claim} if claim in BILL_CLAIMS else stay)
        return stays

    def months(self) -> list[dict]:
        """Every month's books, oldest first."""
        with self._lock:
            return ledger.months(self._stays(), TODAY, PLANT)

    def bills(self, month_id) -> list[dict]:
        """The bills worth showing for a month."""
        if not isinstance(month_id, str) or not MONTH_ID.fullmatch(month_id):
            raise ServiceError("invalid", "a month looks like 2026-10")
        with self._lock:
            stays = self._stays()
            if month_id not in {m["id"] for m in ledger.months(stays, TODAY, PLANT)}:
                raise ServiceError("not_found", f"no books for {month_id}")
            return ledger.notable(stays, month_id, TODAY, PLANT)

    def set_bill(self, bill_id, patch) -> dict:
        """Change the claim on a bill (any stay, shown or not); return the bill and its month."""
        with self._lock:
            stays = self._stays()
            stay = next((s for s in stays if s["id"] == bill_id), None)
            if stay is None:
                raise ServiceError("not_found", f"no bill {bill_id!r}")
            if not isinstance(patch, dict) or set(patch) != {"claim"}:
                raise ServiceError("invalid", "the patch must be an object with just a claim")
            claim = patch["claim"]
            if not isinstance(claim, str) or claim not in BILL_CLAIMS:
                raise ServiceError("invalid", f"claim must be one of {', '.join(BILL_CLAIMS)}")

            if claim != stay["claim"]:                        # asking for what it already is changes nothing
                record = audit(stay, TODAY, PLANT)
                if claim != "none" and record["back"] == 0:
                    raise ServiceError("invalid", "there is nothing to claim on this bill")
                if claim != "none" and record["state"] == "missed":
                    raise ServiceError("conflict", "the window for claiming on this bill has closed")
                if claim == "none" and record["left"] < 0:
                    raise ServiceError("conflict", "the window has closed, so the claim can no longer be taken back")
                self._store.set_bill(bill_id, {"claim": claim})
                stay = {**stay, "claim": claim}
                stays = [stay if s["id"] == bill_id else s for s in stays]

            bill = copy.deepcopy(stay)
            bill["audit"] = audit(stay, TODAY, PLANT)
            bill["date"] = ledger._date(stay["released"])
            return {"bill": bill, "month": ledger.month(stays, stay["released"][:7], TODAY, PLANT)}

    def reset(self) -> dict:
        """Forget every choice and return the untouched day."""
        with self._lock:
            self._store.reset()
            return self._day(BEFORE_THE_DAY)
