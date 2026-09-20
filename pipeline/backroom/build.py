"""Merge records + analyses into the JSON the site reads."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import config
from .schema import AnalysisFile, BillRecord

# Deterministic ranking so the ordering can be re-tuned without re-running models.
WEIGHTS = {"public_stakes": 0.3, "concentrated_stakes": 0.3, "outcome_against_public": 0.2, "support_mismatch": 0.1, "corruption_relevance": 0.1}


_CITE = re.compile(r"\s*\[S\d+\]")


def clean(text: str) -> str:
    """Card-sized fields should not carry inline citation markers."""
    return _CITE.sub("", text).strip()


def rank_score(s) -> float:
    raw = sum(getattr(s, k) * w for k, w in WEIGHTS.items())  # 0..10
    return round(raw * (0.5 + 0.5 * s.confidence), 2)


def run() -> None:
    out_bills = config.SITE_DATA_DIR / "bills"
    out_bills.mkdir(parents=True, exist_ok=True)
    index = []
    for af_path in sorted(config.ANALYSES_DIR.glob("*.json")):
        af = AnalysisFile.model_validate_json(af_path.read_text())
        rec_path = config.RAW_DIR / af.bill_id / "record.json"
        if not rec_path.exists():
            print(f"  ! {af.bill_id}: analysis without record, skipping")
            continue
        rec = BillRecord.model_validate_json(rec_path.read_text())
        a = af.analysis
        score = rank_score(a.scores)
        seen: set[tuple[str, int]] = set()
        votes = []
        for act in rec.actions:
            for v in act.votes:
                if (v.chamber, v.roll_number) not in seen:
                    seen.add((v.chamber, v.roll_number))
                    votes.append(v.model_dump())
        page = {
            "id": rec.id, "display": rec.display, "congress": rec.congress, "title": rec.title,
            "introduced": rec.introduced, "origin_chamber": rec.origin_chamber,
            "policy_area": rec.policy_area, "subjects": rec.subjects,
            "sponsors": [p.model_dump() for p in rec.sponsors],
            "cosponsor_count": len(rec.cosponsors), "cosponsor_party_counts": rec.cosponsor_party_counts,
            "committees": [c.model_dump() for c in rec.committees],
            "actions": [a_.model_dump() for a_ in rec.actions],
            "votes": votes,
            "congress_gov_url": rec.congress_gov_url, "text_url": rec.text_url,
            "congress_ended": rec.congress_ended,
            "sources": [s.model_dump(exclude={"excerpt"}) for s in rec.sources],
            "analysis": a.model_dump(by_alias=True),
            "rank_score": score,
            "meta": {"model": af.model, "prompt_version": af.prompt_version, "generated_at": af.generated_at,
                     "record_fetched_at": af.record_fetched_at, "unresolved_citations": af.unresolved_citations},
        }
        (out_bills / f"{rec.id}.json").write_text(json.dumps(page))
        index.append({
            "id": rec.id, "display": rec.display, "congress": rec.congress, "title": rec.title,
            "introduced": rec.introduced, "origin_chamber": rec.origin_chamber,
            "sponsors": [f"{p.name} ({p.party}-{p.state})" for p in rec.sponsors],
            "cosponsor_count": len(rec.cosponsors), "cosponsor_party_counts": rec.cosponsor_party_counts,
            "one_liner": clean(a.one_liner), "headline": clean(a.headline), "direction": a.direction,
            "who_benefits_short": clean(a.who_benefits_short), "who_pays_short": clean(a.who_pays_short),
            "who_came_out_ahead_short": clean(a.who_came_out_ahead_short), "party_line": a.sides.party_line,
            "industries": [{"industry": i.industry, "effect": i.effect, "stance": i.stance_toward_public} for i in a.industries[:4]],
            "status": a.outcome.status, "categories": a.categories,
            "scores": a.scores.model_dump(), "rank_score": score, "congress_ended": rec.congress_ended,
        })
    gl = config.DATA_DIR / "glossary.json"
    if gl.exists():
        g = json.loads(gl.read_text())
        (config.SITE_DATA_DIR / "glossary.json").write_text(json.dumps({
            "updated_at": g["updated_at"],
            "terms": [{k: e[k] for k in ("term", "aliases", "definition", "source")} for e in g["terms"]],
        }))
    index.sort(key=lambda b: -b["rank_score"])
    (config.SITE_DATA_DIR / "index.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weights": WEIGHTS, "bills": index,
    }))
    print(f"  wrote {len(index)} bills to {config.SITE_DATA_DIR}")
