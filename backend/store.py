"""The store: the choices people have made on screen, kept in one JSON file.

The file looks like ``{"rakes": {slot: {...}}, "bills": {bill_id: {...}}}``.
Every write is saved at once and atomically (a temporary file in the same folder,
then ``os.replace``). A missing or damaged file is an empty store, never a crash.
With no path the store lives in memory only and writes nothing.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
from pathlib import Path

SECTIONS = ("rakes", "bills")


def _empty() -> dict:
    return {name: {} for name in SECTIONS}


def _clean(raw) -> dict:
    """Keep only the well-formed part of what was read: each section a dict of dicts."""
    state = _empty()
    if isinstance(raw, dict):
        for name in SECTIONS:
            entries = raw.get(name)
            if isinstance(entries, dict):
                state[name] = {k: v for k, v in entries.items() if isinstance(v, dict)}
    return state


def _as_json(patch) -> dict:
    """Validate a patch and return an independent JSON-safe copy of it.

    Raises TypeError if it is not a dict or holds something JSON cannot store,
    ValueError if it holds NaN or infinity, or refers to itself.
    """
    if not isinstance(patch, dict):
        raise TypeError(f"a patch must be a dict, not {type(patch).__name__}")
    return json.loads(json.dumps(patch, allow_nan=False))


class Store:
    """Saved choices for rakes and bills, safe to share between threads."""

    def __init__(self, path: Path | None):
        self._path = path
        self._lock = threading.Lock()
        self._state = self._load()

    # ------------------------------------------------------------ reading
    def get(self) -> dict:
        """Everything, as a deep copy."""
        with self._lock:
            return copy.deepcopy(self._state)

    def rake(self, slot: str) -> dict:
        """The saved choices for one rake, ``{}`` if none (a copy)."""
        return self._read("rakes", slot)

    def bill(self, bill_id: str) -> dict:
        """The saved choices for one bill, ``{}`` if none (a copy)."""
        return self._read("bills", bill_id)

    # ------------------------------------------------------------ writing
    def set_rake(self, slot: str, patch: dict) -> dict:
        """Merge ``patch`` into the rake's choices, save, and return the merged dict."""
        return self._merge("rakes", slot, patch)

    def set_bill(self, bill_id: str, patch: dict) -> dict:
        """Merge ``patch`` into the bill's choices, save, and return the merged dict."""
        return self._merge("bills", bill_id, patch)

    def reset(self) -> None:
        """Forget everything and save."""
        with self._lock:
            self._commit(_empty())

    # ------------------------------------------------------------ internals
    def _read(self, section: str, key: str) -> dict:
        with self._lock:
            return copy.deepcopy(self._state[section].get(key, {}))

    def _merge(self, section: str, key: str, patch: dict) -> dict:
        patch = _as_json(patch)                       # refuse before touching anything
        with self._lock:
            new = copy.deepcopy(self._state)
            merged = new[section].setdefault(key, {})
            merged.update(patch)
            self._commit(new)
            return copy.deepcopy(merged)

    def _commit(self, new_state: dict) -> None:
        """Save ``new_state`` and only then adopt it (call with the lock held)."""
        self._save(new_state)
        self._state = new_state

    def _load(self) -> dict:
        if self._path is None:
            return _empty()
        try:
            with open(self._path, encoding="utf-8") as f:
                return _clean(json.load(f))
        except (OSError, ValueError):                 # missing, unreadable or not JSON
            return _empty()

    def _save(self, state: dict) -> None:
        if self._path is None:
            return
        folder = self._path.parent
        folder.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=folder, prefix=self._path.name + ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self._path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise


def open_store(path: str | os.PathLike | None) -> Store:
    """Open the store kept at ``path``, or a memory-only store if ``path`` is None."""
    return Store(None if path is None else Path(path))
