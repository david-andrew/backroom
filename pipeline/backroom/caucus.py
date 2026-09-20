"""Party sizes per chamber per Congress, derived from the member lists on the roll calls we have fetched.
Written to data/caucus.json by `build`; read by `analyze` so the model can say "41 of 47 Senate Democrats"."""
from __future__ import annotations

import json

from . import config
from .schema import BillRecord

CAUCUS_FILE = config.DATA_DIR / "caucus.json"


def compute() -> dict[str, dict[str, dict[str, int]]]:
    seen: dict[tuple[int, str], dict[str, set[str]]] = {}
    for rec_path in config.RAW_DIR.glob("*/record.json"):
        rec = BillRecord.model_validate_json(rec_path.read_text())
        for act in rec.actions:
            for v in act.votes:
                bucket = seen.setdefault((rec.congress, v.chamber), {})
                for m in v.members:
                    key = m.bioguide_id or f"{m.name}|{m.state}"
                    bucket.setdefault(m.party, set()).add(key)
    out: dict[str, dict[str, dict[str, int]]] = {}
    for (congress, chamber), parties in seen.items():
        out.setdefault(str(congress), {})[chamber] = {p: len(ids) for p, ids in sorted(parties.items()) if p != "VP"}
    return out


def load() -> dict[str, dict[str, dict[str, int]]]:
    return json.loads(CAUCUS_FILE.read_text()) if CAUCUS_FILE.exists() else {}


def write() -> dict:
    c = compute()
    CAUCUS_FILE.write_text(json.dumps(c, indent=1, sort_keys=True))
    return c
