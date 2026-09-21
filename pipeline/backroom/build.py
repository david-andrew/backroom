"""Merge records + analyses into the JSON the site reads."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import config
from . import caucus, groups, lint
from .analyze import bloc_with_denominator
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


def publish_prompts(hashes_in_use: set[str]) -> None:
    """Write the exact text of every prompt version an analysis references, recovered from git history."""
    import hashlib, subprocess
    out = config.SITE_DATA_DIR / "prompts"
    out.mkdir(parents=True, exist_ok=True)
    rel = "pipeline/prompts/analyze.md"
    found: dict[str, tuple[str, str, str]] = {}  # hash -> (text, commit, date)
    cur = (config.PROMPTS_DIR / "analyze.md").read_text()
    found[hashlib.sha256(cur.encode()).hexdigest()[:10]] = (cur, "working-tree", "")
    try:
        log = subprocess.run(["git", "log", "--format=%H %cs", "--", rel], cwd=config.REPO_ROOT, capture_output=True, text=True, check=True).stdout.split()
        for sha, date in zip(log[0::2], log[1::2]):
            text = subprocess.run(["git", "show", f"{sha}:{rel}"], cwd=config.REPO_ROOT, capture_output=True, text=True).stdout
            h = hashlib.sha256(text.encode()).hexdigest()[:10]
            if h in hashes_in_use and (h not in found or found[h][1] == "working-tree"):
                found[h] = (text, sha, date)
    except Exception as e:
        print(f"  ! could not read prompt history from git: {e}")
    missing = hashes_in_use - set(found)
    for h, (text, sha, date) in found.items():
        if h in hashes_in_use:
            (out / f"{h}.json").write_text(json.dumps({"hash": h, "file": rel, "commit": sha, "date": date, "text": text}))
    print(f"  prompts published: {len(hashes_in_use & set(found))} version(s)" + (f"; not recoverable: {sorted(missing)}" if missing else ""))


def run() -> None:
    out_bills = config.SITE_DATA_DIR / "bills"
    out_bills.mkdir(parents=True, exist_ok=True)
    sizes = caucus.write()
    print(f"  caucus sizes for {len(sizes)} Congress(es)")
    # Load everything first so companion/lineage groups can be computed across the whole set.
    loaded: list[tuple[AnalysisFile, BillRecord]] = []
    for af_path in sorted(config.ANALYSES_DIR.glob("*.json")):
        af = AnalysisFile.model_validate_json(af_path.read_text())
        rec_path = config.RAW_DIR / af.bill_id / "record.json"
        if not rec_path.exists():
            print(f"  ! {af.bill_id}: analysis without record, skipping")
            continue
        loaded.append((af, BillRecord.model_validate_json(rec_path.read_text())))
    companions, lineage = groups.compute({rec.id: rec for _, rec in loaded})
    warnings = lint.run(quiet=True)
    print(f"  lint: {len(warnings)} bills with warnings")
    print(f"  {sum(1 for v in companions.values() if v)} bills have companions; {sum(1 for v in lineage.values() if v)} have earlier or later versions")
    index = []
    prompt_hashes: set[str] = set()
    for af, rec in loaded:
        prompt_hashes.add(af.prompt_version)
        # Bloc denominators are normalized to the current caucus snapshot at build time, so older analyses
        # do not need regenerating when the snapshot moves by a seat or two.
        cs = sizes.get(str(rec.congress), {})
        for k in af.analysis.sides.for_ + af.analysis.sides.against:
            k.name = bloc_with_denominator(k.name, cs)
        af.analysis.sides.party_line_note = bloc_with_denominator(af.analysis.sides.party_line_note, cs)
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
            "cosponsors": [p.model_dump() for p in rec.cosponsors],
            "caucus": sizes.get(str(rec.congress), {}),
            "cosponsor_count": len(rec.cosponsors), "cosponsor_party_counts": rec.cosponsor_party_counts,
            "committees": [c.model_dump() for c in rec.committees],
            "actions": [a_.model_dump() for a_ in rec.actions],
            "votes": votes,
            "congress_gov_url": rec.congress_gov_url, "text_url": rec.text_url,
            "congress_ended": rec.congress_ended,
            "sources": [s.model_dump(exclude={"excerpt"}) for s in rec.sources],
            "companions": companions.get(rec.id, []), "lineage": lineage.get(rec.id, []),
            "analysis": a.model_dump(by_alias=True),
            "rank_score": score,
            "meta": {"model": af.model, "prompt_version": af.prompt_version, "generated_at": af.generated_at,
                     "record_fetched_at": af.record_fetched_at, "unresolved_citations": af.unresolved_citations,
                     "lint": warnings.get(rec.id, [])},
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
            "companions": companions.get(rec.id, []), "lineage": lineage.get(rec.id, []),
        })
    gl = config.DATA_DIR / "glossary.json"
    if gl.exists():
        g = json.loads(gl.read_text())
        (config.SITE_DATA_DIR / "glossary.json").write_text(json.dumps({
            "updated_at": g["updated_at"],
            "terms": [{k: e[k] for k in ("term", "aliases", "definition", "source")} for e in g["terms"]],
        }))
    publish_prompts(prompt_hashes)
    index.sort(key=lambda b: -b["rank_score"])
    # One primary per companion set: the version that got furthest, then the higher-ranked one (list is rank-sorted).
    STAGE = {"became_law": 5, "vetoed": 4, "passed_one_chamber_then_stalled": 3, "voted_down": 2, "blocked_from_a_vote": 2, "weakened": 3}
    seen: set[str] = set()
    for b in index:
        if b["id"] in seen:
            b["primary"] = False; continue
        members = [b["id"], *b["companions"]]
        best = max((x for x in index if x["id"] in members), key=lambda x: (STAGE.get(x["status"], 0), x["rank_score"]))
        for x in index:
            if x["id"] in members:
                x["primary"] = x["id"] == best["id"]; seen.add(x["id"])
    (config.SITE_DATA_DIR / "index.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weights": WEIGHTS, "caucus": sizes, "bills": index,
    }))
    print(f"  wrote {len(index)} bills to {config.SITE_DATA_DIR}")
