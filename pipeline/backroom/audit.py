"""Paid spot-check: a stronger model reads the record and the analysis and reports factual problems.

Selection: every bill the lint flagged (up to half the budget), then a random sample of the rest, weighted
toward bills nobody has audited yet. Results go to data/audit/<date>.json and a rolling summary in data/audit/index.json."""
from __future__ import annotations

import json
import random
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from . import config, lint
from .analyze import render_context
from .llm import load_prompt, run_many, astructured_call
from .schema import AnalysisFile, BillRecord

AUDIT_DIR = config.DATA_DIR / "audit"
DEFAULT_MODEL = "anthropic/claude-sonnet-5"


class Issue(BaseModel):
    field: str = Field(description="Which part of the analysis, e.g. 'outcome.status', 'headline', 'sides.against[0]'")
    severity: Literal["major", "minor"]
    problem: str = Field(description="What is wrong, quoting the analysis")
    record_shows: str = Field(description="What the record actually shows")


class Verdict(BaseModel):
    verdict: Literal["pass", "minor", "major"]
    issues: list[Issue]
    note: str = Field(description="One sentence overall")


def _audited_before() -> set[str]:
    idx = AUDIT_DIR / "index.json"
    if not idx.exists():
        return set()
    return {b for run in json.loads(idx.read_text())["runs"] for b in run["bills"]}


def select(n: int, seed: int | None = None) -> list[str]:
    flagged = list(lint.run(quiet=True).keys())
    all_bills = sorted(p.stem for p in config.ANALYSES_DIR.glob("*.json"))
    rng = random.Random(seed)
    rng.shuffle(flagged)
    picks = flagged[: max(1, n // 2)]
    seen = _audited_before() | set(picks)
    pool = [b for b in all_bills if b not in seen] or [b for b in all_bills if b not in picks]
    rng.shuffle(pool)
    picks += pool[: n - len(picks)]
    return picks


def run(n: int = 15, model_id: str = DEFAULT_MODEL, bills: list[str] | None = None, fix: bool = False, seed: int | None = None) -> dict:
    bills = bills or select(n, seed)
    system = load_prompt("audit")
    calls = []
    for slug in bills:
        rec = BillRecord.model_validate_json((config.RAW_DIR / slug / "record.json").read_text())
        af = AnalysisFile.model_validate_json((config.ANALYSES_DIR / f"{slug}.json").read_text())
        text_path = config.RAW_DIR / slug / "text.txt"
        ctx = render_context(rec, text_path.read_text() if text_path.exists() else "")
        user = f"{ctx}\n\n# THE ANALYSIS TO CHECK\n{af.analysis.model_dump_json(by_alias=True, indent=1)}"
        calls.append((slug, af.model, af.prompt_version, lambda u=user: astructured_call(model_id, system, u, Verdict)))
    print(f"  auditing {len(bills)} bills with {model_id}")
    results = run_many([c[3] for c in calls], concurrency=4, timeout=600)
    out = []
    for (slug, amodel, pv, _), r in zip(calls, results):
        if isinstance(r, Exception):
            out.append({"bill": slug, "error": str(r)[:300]}); print(f"  ! {slug}: {str(r)[:120]}"); continue
        out.append({"bill": slug, "analysis_model": amodel, "prompt_version": pv, **r.model_dump()})
        flag = {"pass": "ok", "minor": "minor", "major": "MAJOR"}[r.verdict]
        print(f"  {flag:<6} {slug:<12} {r.note[:110]}")
        for i in r.issues:
            if i.severity == "major":
                print(f"         - {i.field}: {i.problem[:90]} | record: {i.record_shows[:70]}")
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    report = {"run_at": stamp, "judge": model_id, "results": out}
    (AUDIT_DIR / f"{stamp}.json").write_text(json.dumps(report, indent=1))
    idx_path = AUDIT_DIR / "index.json"
    idx = json.loads(idx_path.read_text()) if idx_path.exists() else {"runs": []}
    counts = {k: sum(1 for x in out if x.get("verdict") == k) for k in ("pass", "minor", "major")}
    idx["runs"].append({"run_at": stamp, "judge": model_id, "bills": bills, **counts, "errors": sum(1 for x in out if "error" in x)})
    idx_path.write_text(json.dumps(idx, indent=1))
    print(f"  audit: {counts['pass']} pass, {counts['minor']} minor, {counts['major']} major")
    majors = [x["bill"] for x in out if x.get("verdict") == "major"]
    if fix and majors:
        from . import analyze
        print(f"  re-analyzing {len(majors)} bill(s) with {model_id}")
        analyze.run_all(majors, force=True, model_id=model_id)
    return report
