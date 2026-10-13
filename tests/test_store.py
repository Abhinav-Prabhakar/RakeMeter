"""The store: the choices people have made on screen, kept in one JSON file.

Contract for backend/store.py.

    store = open_store(path)      path: str | os.PathLike | None  (None keeps it in memory only)
    store.get()                   -> {"rakes": {slot: {...}}, "bills": {bill_id: {...}}}, a deep copy
    store.rake(slot)              -> that rake's saved choices, {} if none (a copy)
    store.set_rake(slot, patch)   -> merges patch into the rake's choices, saves, returns the merged dict
    store.bill(bill_id)           -> {} if none (a copy)
    store.set_bill(bill_id, patch)
    store.reset()                 -> forgets everything, saves

A patch value of None is stored as None (it is a real choice: "no allowance").
"""
import json
import os
import threading

import pytest

from backend.store import open_store

EMPTY = {"rakes": {}, "bills": {}}


@pytest.fixture
def path(tmp_path):
    return tmp_path / "data" / "state.json"          # note: the folder does not exist yet


# ---------------------------------------------------------------- an empty store
def test_new_store_is_empty(path):
    s = open_store(path)
    assert s.get() == EMPTY
    assert s.rake("S617") == {}
    assert s.bill("0412") == {}


def test_opening_does_not_need_the_folder_to_exist(path):
    s = open_store(path)
    s.set_rake("S617", {"hold": 30})
    assert path.exists()


def test_accepts_str_and_pathlike(tmp_path):
    a = open_store(str(tmp_path / "a.json"))
    a.set_bill("0001", {"claim": "filed"})
    assert open_store(tmp_path / "a.json").bill("0001") == {"claim": "filed"}


# ---------------------------------------------------------------- reading and writing
def test_set_rake_merges_and_returns(path):
    s = open_store(path)
    assert s.set_rake("S617", {"tippler": 2}) == {"tippler": 2}
    assert s.set_rake("S617", {"hold": 60}) == {"tippler": 2, "hold": 60}
    assert s.set_rake("S617", {"tippler": 1}) == {"tippler": 1, "hold": 60}
    assert s.rake("S617") == {"tippler": 1, "hold": 60}
    assert s.rake("S618") == {}


def test_set_bill_merges_and_returns(path):
    s = open_store(path)
    assert s.set_bill("0412", {"claim": "filed"}) == {"claim": "filed"}
    assert s.set_bill("0412", {"claim": "won"}) == {"claim": "won"}
    assert s.get() == {"rakes": {}, "bills": {"0412": {"claim": "won"}}}


def test_none_is_a_value(path):
    s = open_store(path)
    s.set_rake("S620", {"owed": {"rule": "Bunching", "minutes": 180}})
    s.set_rake("S620", {"owed": None})
    assert s.rake("S620") == {"owed": None}
    assert open_store(path).rake("S620") == {"owed": None}


def test_rakes_and_bills_are_separate(path):
    s = open_store(path)
    s.set_rake("X", {"hold": 30})
    s.set_bill("X", {"claim": "filed"})
    assert s.get() == {"rakes": {"X": {"hold": 30}}, "bills": {"X": {"claim": "filed"}}}


def test_what_you_get_is_a_copy(path):
    s = open_store(path)
    s.set_rake("S617", {"owed": {"rule": "Bunching", "minutes": 180}})
    got = s.get()
    got["rakes"]["S617"]["owed"]["minutes"] = 1
    got["rakes"]["S999"] = {}
    r = s.rake("S617")
    r["owed"]["rule"] = "x"
    assert s.get() == {"rakes": {"S617": {"owed": {"rule": "Bunching", "minutes": 180}}}, "bills": {}}


def test_the_patch_is_copied_in(path):
    s = open_store(path)
    owed = {"rule": "Bunching", "minutes": 180}
    patch = {"owed": owed}
    s.set_rake("S617", patch)
    owed["minutes"] = 5
    patch["hold"] = 99
    assert s.rake("S617") == {"owed": {"rule": "Bunching", "minutes": 180}}


def test_returned_merge_is_a_copy(path):
    s = open_store(path)
    out = s.set_rake("S617", {"hold": 30})
    out["hold"] = 0
    assert s.rake("S617") == {"hold": 30}


# ---------------------------------------------------------------- persistence
def test_survives_reopening(path):
    s = open_store(path)
    s.set_rake("S617", {"tippler": 2, "hold": 30})
    s.set_bill("0412", {"claim": "filed"})
    again = open_store(path)
    assert again.get() == {"rakes": {"S617": {"tippler": 2, "hold": 30}}, "bills": {"0412": {"claim": "filed"}}}


def test_file_is_plain_json(path):
    s = open_store(path)
    s.set_rake("S617", {"livery": "cobalt"})
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert on_disk["rakes"] == {"S617": {"livery": "cobalt"}}
    assert on_disk["bills"] == {}


def test_every_write_is_saved_at_once(path):
    s = open_store(path)
    for n in range(5):
        s.set_rake("S617", {"hold": n * 30})
        assert json.loads(path.read_text(encoding="utf-8"))["rakes"]["S617"]["hold"] == n * 30


def test_reset(path):
    s = open_store(path)
    s.set_rake("S617", {"hold": 30})
    s.set_bill("0412", {"claim": "filed"})
    s.reset()
    assert s.get() == EMPTY
    assert open_store(path).get() == EMPTY


def test_no_temporary_files_left_behind(path):
    s = open_store(path)
    for n in range(20):
        s.set_bill(f"{n:04d}", {"claim": "filed"})
    assert sorted(os.listdir(path.parent)) == ["state.json"]


# ---------------------------------------------------------------- nothing on disk
def test_memory_store(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    s = open_store(None)
    s.set_rake("S617", {"hold": 30})
    s.set_bill("0412", {"claim": "won"})
    assert s.get() == {"rakes": {"S617": {"hold": 30}}, "bills": {"0412": {"claim": "won"}}}
    s.reset()
    assert s.get() == EMPTY
    assert list(tmp_path.iterdir()) == []            # it wrote nothing anywhere
    assert open_store(None).get() == EMPTY           # and two memory stores share nothing


# ---------------------------------------------------------------- damage
@pytest.mark.parametrize("junk", ["", "{", "not json at all", "[1, 2, 3]", "null", '"text"', "42",
                                  '{"rakes": []}', '{"rakes": {"S617": 5}, "bills": {}}', '{"bills": {"0001": "won"}}'])
def test_a_damaged_file_is_an_empty_store(path, junk):
    path.parent.mkdir(parents=True)
    path.write_text(junk, encoding="utf-8")
    s = open_store(path)
    assert s.get() == EMPTY
    s.set_rake("S617", {"hold": 30})                 # and it can be written over
    assert open_store(path).rake("S617") == {"hold": 30}


def test_half_a_file_is_tolerated(path):
    path.parent.mkdir(parents=True)
    path.write_text('{"rakes": {"S617": {"hold": 30}}}', encoding="utf-8")       # no "bills" key
    s = open_store(path)
    assert s.get() == {"rakes": {"S617": {"hold": 30}}, "bills": {}}


def test_unknown_keys_in_the_file_do_not_break_it(path):
    path.parent.mkdir(parents=True)
    path.write_text('{"version": 7, "rakes": {}, "bills": {"0001": {"claim": "won"}}, "extra": true}', encoding="utf-8")
    assert open_store(path).bill("0001") == {"claim": "won"}


# ---------------------------------------------------------------- bad input
@pytest.mark.parametrize("patch", [None, [], "hold", 3, [("hold", 30)]])
def test_patch_must_be_a_dict(path, patch):
    s = open_store(path)
    with pytest.raises(TypeError):
        s.set_rake("S617", patch)
    with pytest.raises(TypeError):
        s.set_bill("0412", patch)
    assert s.get() == EMPTY


def test_patch_must_be_json(path):
    s = open_store(path)
    with pytest.raises((TypeError, ValueError)):
        s.set_rake("S617", {"when": object()})
    assert s.get() == EMPTY                          # a refused write changes nothing
    assert open_store(path).get() == EMPTY


# ---------------------------------------------------------------- many writers
def test_writes_from_several_threads_all_land(path):
    s = open_store(path)

    def work(k):
        for n in range(25):
            s.set_rake(f"R{k}", {f"k{n}": n})
            s.set_bill(f"{k}{n:03d}", {"claim": "filed"})

    threads = [threading.Thread(target=work, args=(k,)) for k in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    state = open_store(path).get()
    assert len(state["rakes"]) == 6 and all(len(v) == 25 for v in state["rakes"].values())
    assert len(state["bills"]) == 150
