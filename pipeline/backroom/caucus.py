"""Party sizes per chamber per Congress, derived from the member lists on the roll calls we have fetched.
Written to data/caucus.json by `build`; read by `analyze` so the model can say "41 of 47 Senate Democrats"."""
from __future__ import annotations

import json

from . import config
from .schema import BillRecord

CAUCUS_FILE = config.DATA_DIR / "caucus.json"


def compute() -> dict[str, dict[str, dict[str, int]]]:
    """Party counts from the most recent roll call we hold for each (Congress, chamber). A roll call lists every
    sitting member, voting or not, so this is a clean snapshot; a union over the whole Congress would double-count
    seats that changed hands."""
    latest: dict[tuple[int, str], tuple[str, dict[str, int]]] = {}
    for rec_path in config.RAW_DIR.glob("*/record.json"):
        rec = BillRecord.model_validate_json(rec_path.read_text())
        for act in rec.actions:
            for v in act.votes:
                if not v.members:
                    continue
                key = (rec.congress, v.chamber)
                if key not in latest or v.date > latest[key][0]:
                    counts: dict[str, int] = {}
                    for m in v.members:
                        counts[m.party] = counts.get(m.party, 0) + 1
                    counts.pop("VP", None)
                    latest[key] = (v.date, counts)
    out: dict[str, dict[str, dict[str, int]]] = {}
    for (congress, chamber), (_, counts) in latest.items():
        out.setdefault(str(congress), {})[chamber] = dict(sorted(counts.items()))
    return out


def load() -> dict[str, dict[str, dict[str, int]]]:
    return json.loads(CAUCUS_FILE.read_text()) if CAUCUS_FILE.exists() else {}


def write() -> dict:
    c = compute()
    CAUCUS_FILE.write_text(json.dumps(c, indent=1, sort_keys=True))
    return c
