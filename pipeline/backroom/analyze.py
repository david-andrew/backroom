"""Turn a BillRecord into an Analysis with the analysis model."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import caucus, config
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
    sizes = caucus.load().get(str(rec.congress), {})
    if sizes:
        lines.append("Party sizes in this Congress (use these as denominators when you name a bloc, e.g. '86 of 213 House Democrats'): "
                     + "; ".join(f"{ch}: " + ", ".join(f"{p} {n}" for p, n in ps.items()) for ch, ps in sizes.items()))
    origin = "House" if rec.type.startswith("h") else "Senate"
    denom = sizes.get(origin, {})
    lines.append(f"Cosponsors: {len(rec.cosponsors)} " + ", ".join(
        f"{p}: {n}" + (f" of {denom[p]} {origin} {p}" if p in denom else "") for p, n in rec.cosponsor_party_counts.items()))
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
            parties = ""
            if rv.by_party:
                from collections import Counter
                total = Counter(m.party for m in rv.members)
                parties = " " + "; ".join(
                    f"{p}: {c.get('yea', 0)} yea, {c.get('nay', 0)} nay" + (f" of {total[p]}" if total.get(p) else "")
                    for p, c in rv.by_party.items())
            v += f" [{rv.chamber} roll {rv.roll_number}{tally}: {parties}]"
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
    # Models sometimes write "[S3]" or "s3"; normalize before checking.
    for c in _all_claim_objs(analysis):
        c.sources = [re.sub(r"[^A-Za-z0-9]", "", x).upper() for x in c.sources]
    bad = sorted({sid for c in _all_claims(analysis) for sid in c if sid not in valid_ids})
    analysis.categories = [c for c in analysis.categories if c in CATEGORIES] or ["other"]
    # A sitting Congress cannot have killed a bill yet; the model sometimes reaches for a final status anyway.
    if not rec.congress_ended and analysis.outcome.status in ("never_got_a_vote", "passed_one_chamber_then_stalled", "blocked_from_a_vote", "voted_down"):
        analysis.outcome.status = "pending"
    # Party blocs are named as a share of the caucus, deterministically, whatever the model wrote.
    sizes = caucus.load().get(str(rec.congress), {})
    for k in analysis.sides.for_ + analysis.sides.against:
        k.name = bloc_with_denominator(k.name, sizes)
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


_PARTY = {"democrat": "D", "democratic": "D", "republican": "R", "independent": "I"}
_BLOC = re.compile(r"(?<!of )\b(\d+)\s+(House|Senate)\s+(Democrat(?:ic|s)?|Republican(?:s)?|Independent(?:s)?)\b", re.I)
_BLOC_OF = re.compile(r"\b(\d+) of (\d+)\s+(House|Senate)\s+(Democrat(?:ic|s)?|Republican(?:s)?|Independent(?:s)?)\b", re.I)


def bloc_with_denominator(name: str, sizes: dict[str, dict[str, int]]) -> str:
    """'114 House Democrats' -> '114 of 216 House Democrats' using the caucus sizes derived from roll calls."""
    def sub(m: re.Match) -> str:
        n, chamber, party = m.group(1), m.group(2), m.group(3)
        code = _PARTY.get(party.lower().rstrip("s"), None) or _PARTY.get(party.lower(), None)
        total = sizes.get(chamber.title(), {}).get(code) if code else None
        return f"{n} of {total} {chamber} {party}" if total and int(n) <= total else m.group(0)
    def fix_of(m: re.Match) -> str:
        n, given, chamber, party = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        code = _PARTY.get(party.lower().rstrip("s"), None) or _PARTY.get(party.lower(), None)
        total = sizes.get(chamber.title(), {}).get(code) if code else None
        # The model's denominator is usually from memory; snap to the record when it is within a few seats.
        if total and abs(total - given) <= 8 and n <= total:
            return f"{n} of {total} {chamber} {party}"
        return m.group(0)
    return _BLOC.sub(sub, _BLOC_OF.sub(fix_of, name))


def _all_claim_objs(a: Analysis):
    yield from a.how_it_helps + a.drawbacks + a.outcome.narrative
    yield from a.sides.for_ + a.sides.against
    yield from a.industries


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
    """Analyze many bills concurrently, each in its own subprocess with a hard wall-clock limit.

    Twice a long run froze with no open sockets and no timeout firing, somewhere inside the HTTP client. A
    subprocess can be killed no matter where it is stuck, so the batch always finishes. Returns failed slugs."""
    import os
    import subprocess
    import sys
    from concurrent.futures import ThreadPoolExecutor, as_completed
    workers = workers or int(os.environ.get("BACKROOM_CONCURRENCY", "8"))
    limit = int(os.environ.get("BACKROOM_BILL_TIMEOUT", "900"))
    if os.environ.get("BACKROOM_CHILD"):  # already isolated; run in-process
        for slug in slugs:
            run(slug, force, model_id)
        return []

    def one(slug: str) -> tuple[str, str | None]:
        cmd = [sys.executable, "-m", "backroom.cli", "analyze", slug, "--model", model_id] + (["--force"] if force else [])
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=limit, env={**os.environ, "BACKROOM_CHILD": "1"})
        except subprocess.TimeoutExpired:
            return slug, f"killed after {limit}s"
        out = r.stdout + r.stderr
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        for ln in lines:
            if ln.startswith(("=", ">")):
                print("  " + ln, flush=True)
        err = next((ln for ln in lines if ln.startswith("!")), None)
        if r.returncode != 0 or err:
            return slug, (err or f"exit {r.returncode}: {out[-300:]}")
        return slug, None

    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for fut in as_completed({pool.submit(one, s): s for s in slugs}):
            slug, err = fut.result()
            if err:
                print(f"  ! {slug} failed: {err[:300]}", flush=True)
                failed.append(slug)
    if failed:
        print(f"  ! {len(failed)} bill(s) failed: {', '.join(failed)}")
    return failed
