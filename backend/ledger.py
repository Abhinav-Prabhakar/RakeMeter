"""The books for a month: totals, causes, claims, and the bills worth showing.

Pure: stays go in (see tests/test_world.py), new dicts come out, nothing is changed.
"""
from __future__ import annotations

import calendar
import copy

from backend.audit import audit

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]
SHORT_NAMES = [name[:3] for name in MONTH_NAMES]
CLAIM_STATES = ("open", "filed", "won", "missed")


def _in_month(stay: dict, month_id: str) -> bool:
    """A stay belongs to the month of its `released` date."""
    return stay["released"][:7] == month_id


def _partial(month_id: str, today: str) -> str | None:
    """"to 13 Oct" while the month is still running, else None."""
    if today[:7] != month_id:
        return None
    year, month, day = int(today[:4]), int(today[5:7]), int(today[8:10])
    if day >= calendar.monthrange(year, month)[1]:
        return None
    return f"to {day} {SHORT_NAMES[month - 1]}"


def month(stays: list[dict], month_id: str, today: str, plant: dict) -> dict:
    """The totals for one month ("2026-10")."""
    rows = [(s, audit(s, today, plant)) for s in stays if _in_month(s, month_id)]
    audits = [a for _, a in rows]

    baseline = sum(a["would"] for a in audits)
    billed = sum(a["billed"] for a in audits)
    recovered = sum(a["back"] for a in audits if a["state"] == "won")
    avoided = baseline - billed

    # Where the billed money came from; a bill with no cause of its own is "Other".
    by_cause: dict[str, dict] = {}
    for s, a in rows:
        if a["billed"]:
            name = s["cause"] or "Other"
            entry = by_cause.setdefault(name, {"name": name, "rakes": 0, "amount": 0})
            entry["rakes"] += 1
            entry["amount"] += a["billed"]
    causes = sorted(by_cause.values(), key=lambda c: (-c["amount"], c["name"]))

    claims = {state: {"count": 0, "amount": 0} for state in CLAIM_STATES}
    for a in audits:
        if a["state"] in claims:
            claims[a["state"]]["count"] += 1
            claims[a["state"]]["amount"] += a["back"]

    return {
        "id": month_id, "name": MONTH_NAMES[int(month_id[5:7]) - 1], "partial": _partial(month_id, today),
        "rakes": len(audits), "charged": sum(1 for a in audits if a["billed"]),
        "baseline": baseline, "billed": billed, "recovered": recovered, "paid": billed - recovered,
        "avoided": avoided, "saved": avoided + recovered,
        "causes": causes, "claims": claims,
    }


def months(stays: list[dict], today: str, plant: dict) -> list[dict]:
    """Every month from the first stay to today's, oldest first (empty ones included)."""
    last = today[:7]
    first = min([s["released"][:7] for s in stays] + [last])
    year, mon = int(first[:4]), int(first[5:7])
    ids = []
    while f"{year:04d}-{mon:02d}" <= last:
        ids.append(f"{year:04d}-{mon:02d}")
        year, mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
    return [month(stays, month_id, today, plant) for month_id in ids]


def _date(iso: str) -> str:
    """"2026-10-07" -> "07 Oct"."""
    return f"{iso[8:10]} {SHORT_NAMES[int(iso[5:7]) - 1]}"


def notable(stays: list[dict], month_id: str, today: str, plant: dict, limit: int = 8) -> list[dict]:
    """The bills worth showing: all pinned ones, then the biggest money-back ones up to `limit`.

    Each is a copy of the stay with its "audit" and "date" added, in date-then-id order.
    """
    rows = [(s, audit(s, today, plant)) for s in stays if _in_month(s, month_id)]
    pinned = [row for row in rows if row[0]["pinned"]]
    others = [row for row in rows if not row[0]["pinned"] and row[1]["back"] > 0]
    others.sort(key=lambda row: (row[0]["released"], row[0]["id"]), reverse=True)    # most recent first...
    others.sort(key=lambda row: -row[1]["back"])                                     # ...within the largest money back
    chosen = pinned + others[:max(0, limit - len(pinned))]
    chosen.sort(key=lambda row: (row[0]["released"], row[0]["id"]))

    out = []
    for s, a in chosen:
        bill = copy.deepcopy(s)
        bill["audit"] = a
        bill["date"] = _date(s["released"])
        out.append(bill)
    return out
