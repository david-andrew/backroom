"""Turn a BillRecord into an Analysis with the analysis model."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from . import config
from .llm import load_prompt, prompt_version, structured_call
from .schema import Analysis, AnalysisFile, BillRecord, CATEGORIES

PROMPT = "analyze"


def render_context(rec: BillRecord, bill_text: str) -> str:
    """Everything the model may rely on, with every citable item numbered."""
    lines: list[str] = []
    lines.append(f"# {rec.display} ({rec.congress}th Congress): {rec.title}")
    lines.append(f"Introduced {rec.introduced} in the {rec.origin_chamber}. Policy area: {rec.policy_area}.")
    lines.append(f"Congress {'has ended' if rec.congress_ended else 'is still in session'} (ends {config.congress_end_date(rec.congress)}).")
    lines.append("Sponsor(s): " + "; ".join(f"{p.name} ({p.party}-{p.state})" for p in rec.sponsors))
    lines.append(f"Cosponsors: {len(rec.cosponsors)} " + json.dumps(rec.cosponsor_party_counts))
    if rec.subjects:
        lines.append("Subjects: " + ", ".join(rec.subjects[:25]))
    lines.append("")
    lines.append("## Committees")
    for c in rec.committees:
        lines.append(f"- {c.chamber}: {c.name} — {', '.join(c.activities)}")
    lines.append("")
    lines.append("## Sources you may cite (use the id, e.g. [S3])")
    for s in rec.sources:
        d = f" ({s.date})" if s.date else ""
        lines.append(f"- [{s.id}] {s.kind}: {s.label}{d} — {s.url}")
    lines.append("")
    lines.append("## Action history (cite as the action-history source; votes have their own ids above)")
    for a in rec.actions:
        v = ""
        for rv in a.votes:
            tally = f" {rv.yea}-{rv.nay}" if rv.yea is not None else ""
            parties = f" {json.dumps(rv.by_party)}" if rv.by_party else ""
            v += f" [{rv.chamber} roll {rv.roll_number}{tally}{parties}]"
        lines.append(f"- {a.date} ({a.chamber or '?'}): {a.text}{v}")
    lines.append("")
    for s in rec.sources:
        if s.kind == "summary" and s.excerpt:
            lines.append(f"## [{s.id}] {s.label}")
            lines.append(s.excerpt)
            lines.append("")
    text_src = next((s for s in rec.sources if s.kind == "text"), None)
    if text_src and bill_text:
        t = bill_text[: config.MAX_BILL_TEXT_CHARS]
        trunc = " (truncated)" if len(bill_text) > len(t) else ""
        lines.append(f"## [{text_src.id}] Bill text{trunc}")
        lines.append(t)
    return "\n".join(lines)


def analyze(rec: BillRecord, bill_text: str, model_id: str = config.ANALYSIS_MODEL) -> AnalysisFile:
    system = load_prompt(PROMPT).replace("{{CATEGORIES}}", ", ".join(CATEGORIES))
    user = render_context(rec, bill_text)
    analysis = structured_call(model_id, system, user, Analysis, reasoning_effort="high")

    valid_ids = {s.id for s in rec.sources}
    bad = sorted({sid for c in _all_claims(analysis) for sid in c if sid not in valid_ids})
    analysis.categories = [c for c in analysis.categories if c in CATEGORIES] or ["other"]
    # Models sometimes return the string "null"; a closed Congress has no trajectory at all.
    if rec.congress_ended or not analysis.trajectory or analysis.trajectory.strip().lower() in ("null", "none", "n/a"):
        analysis.trajectory = None
    # An actor without sources must be labeled as outside the record; enforce it.
    for k in analysis.sides.for_ + analysis.sides.against:
        if not k.sources:
            k.evidence = "widely_reported"

    return AnalysisFile(
        bill_id=rec.id, model=model_id, prompt_version=prompt_version(PROMPT),
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        record_fetched_at=rec.fetched_at, record_hash=rec.content_hash, analysis=analysis, unresolved_citations=bad,
    )


def _all_claims(a: Analysis):
    for c in a.how_it_helps + a.drawbacks + a.outcome.narrative:
        yield c.sources
    for k in a.sides.for_ + a.sides.against:
        yield k.sources
    for ind in a.industries:
        yield ind.sources


def run(slug: str, force: bool = False, model_id: str = config.ANALYSIS_MODEL) -> AnalysisFile:
    out = config.ANALYSES_DIR / f"{slug}.json"
    rec_path = config.RAW_DIR / slug / "record.json"
    if not rec_path.exists():
        raise SystemExit(f"no record for {slug}; run `backroom fetch {slug}` first")
    rec = BillRecord.model_validate_json(rec_path.read_text())
    if out.exists() and not force:
        try:
            existing = AnalysisFile.model_validate_json(out.read_text())
        except Exception:
            existing = None  # schema changed since this was written; regenerate
        if existing and existing.model == model_id and existing.prompt_version == prompt_version(PROMPT) and existing.record_hash == rec.content_hash:
            print(f"  = {slug} up to date ({model_id})")
            return existing
    text_path = config.RAW_DIR / slug / "text.txt"
    text = text_path.read_text() if text_path.exists() else ""
    print(f"  > analyzing {slug} with {model_id} ({len(text)} chars of bill text)")
    af = analyze(rec, text, model_id)
    config.ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(af.model_dump_json(indent=1, by_alias=True))
    if af.unresolved_citations:
        print(f"  ! {slug}: citations not in source list: {af.unresolved_citations}")
    return af


def run_all(slugs: list[str], force: bool = False, model_id: str = config.ANALYSIS_MODEL, workers: int | None = None) -> list[str]:
    """Analyze many bills concurrently (the model call is the slow part). Returns the slugs that failed."""
    import os
    from concurrent.futures import ThreadPoolExecutor, as_completed
    workers = workers or int(os.environ.get("BACKROOM_CONCURRENCY", "8"))
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(run, slug, force, model_id): slug for slug in slugs}
        for fut in as_completed(futures):
            slug = futures[fut]
            try:
                fut.result()
            except Exception as e:
                print(f"  ! {slug} failed: {str(e)[:300]}")
                failed.append(slug)
    if failed:
        print(f"  ! {len(failed)} bill(s) failed: {', '.join(failed)}")
    return failed
