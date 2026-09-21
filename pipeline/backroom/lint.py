"""Deterministic consistency checks between each analysis and its record. Free, runs on every build.

Warnings are advisory: they pick which bills the paid audit looks at first, and they surface on the page's
provenance block so a reader knows the model's account disagrees with something in the record."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import caucus, config
from .schema import AnalysisFile, BillRecord

LINT_FILE = config.DATA_DIR / "lint.json"

PASSAGE = re.compile(r"passed/agreed to in (house|senate)|on passage|passed (house|senate)|pass(ed)? the bill.*agreed to|suspend the rules and (pass|agree)", re.I)
LAW = re.compile(r"became public law", re.I)
VETO = re.compile(r"vetoed by president", re.I)
TALLY = re.compile(r"\b(\d{1,3})\s*[-–to]+\s*(\d{1,3})\b")
BLOC = re.compile(r"\b(\d+) of (\d+) (House|Senate) (Democrat|Republican|Independent)", re.I)
PARTY = {"democrat": "D", "republican": "R", "independent": "I"}


def check(af: AnalysisFile, rec: BillRecord, sizes: dict) -> list[str]:
    a = af.analysis
    w: list[str] = []
    texts = " ".join(x.text for x in rec.actions)
    st = a.outcome.status
    has_law, has_veto, has_pass = bool(LAW.search(texts)), bool(VETO.search(texts)), bool(PASSAGE.search(texts))

    if st == "became_law" and not has_law:
        w.append("status says became law but no 'Became Public Law' action in the record")
    if has_law and st != "became_law":
        w.append(f"record shows 'Became Public Law' but status is {st}")
    if has_veto and st != "vetoed" and not has_law:
        w.append(f"record shows a veto but status is {st}")
    if st in ("passed_one_chamber_then_stalled", "became_law") and not has_pass and not has_law:
        w.append(f"status {st} but no passage action in the record")
    if st == "never_got_a_vote" and has_pass:
        w.append("status says never got a vote but the record has a passage action")
    if rec.congress_ended and st == "pending":
        w.append("status pending but the Congress has ended")
    if not rec.congress_ended and st in ("never_got_a_vote", "passed_one_chamber_then_stalled", "voted_down"):
        w.append(f"final status {st} in a sitting Congress")

    tallies = {(v.yea, v.nay) for act in rec.actions for v in act.votes if v.yea is not None}
    for m in TALLY.finditer(a.headline):
        pair = (int(m.group(1)), int(m.group(2)))
        if tallies and pair not in tallies and (pair[1], pair[0]) not in tallies and pair[0] + pair[1] > 30:
            w.append(f"headline tally {pair[0]}-{pair[1]} matches no recorded vote")

    cs = sizes.get(str(rec.congress), {})
    for k in a.sides.for_ + a.sides.against:
        for m in BLOC.finditer(k.name):
            n, total, ch, party = int(m.group(1)), int(m.group(2)), m.group(3).title(), PARTY[m.group(4).lower()]
            actual = cs.get(ch, {}).get(party)
            if n > total:
                w.append(f"bloc '{m.group(0)}': numerator exceeds denominator")
            elif actual and abs(total - actual) > 8:
                w.append(f"bloc '{m.group(0)}': caucus size in record is {actual}")

    if af.unresolved_citations:
        w.append(f"citations not in source list: {', '.join(af.unresolved_citations)}")
    if a.scores.confidence < 0.6:
        w.append(f"model confidence {a.scores.confidence:.2f}")
    if not a.drawbacks:
        w.append("no drawbacks listed")
    return w


def run(quiet: bool = False) -> dict[str, list[str]]:
    sizes = caucus.load()
    out: dict[str, list[str]] = {}
    n = 0
    for af_path in sorted(config.ANALYSES_DIR.glob("*.json")):
        af = AnalysisFile.model_validate_json(af_path.read_text())
        rec_path = config.RAW_DIR / af.bill_id / "record.json"
        if not rec_path.exists():
            continue
        n += 1
        w = check(af, BillRecord.model_validate_json(rec_path.read_text()), sizes)
        if w:
            out[af.bill_id] = w
    LINT_FILE.write_text(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "checked": n, "warnings": out}, indent=1))
    if not quiet:
        from collections import Counter
        kinds = Counter(re.sub(r"[\d.]+", "N", x.split(":")[0]) for ws in out.values() for x in ws)
        print(f"  lint: {len(out)} of {n} bills have warnings")
        for k, c in kinds.most_common(12):
            print(f"    {c:>4}  {k}")
    return out
