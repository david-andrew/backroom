"""Cheap first pass over every bill in a Congress: score titles in batches with
the triage model, keep the promising ones for full analysis."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from . import config
from .congress import CongressClient
from .llm import load_prompt, prompt_version, structured_call

PROMPT = "triage"
BATCH = 40


class TriageScore(BaseModel):
    bill: str = Field(description="The bill id exactly as given, e.g. '118-s413'")
    public_benefit: int = Field(ge=0, le=10)
    concentrated_cost: int = Field(ge=0, le=10)
    reason: str = Field(description="One short clause")


class TriageBatch(BaseModel):
    scores: list[TriageScore]


def run(congress: int, limit: int | None = None, min_score: int = 12, model_id: str = config.TRIAGE_MODEL) -> list[dict]:
    client = CongressClient()
    bills = client.list_bills(congress, limit=limit)
    print(f"  {len(bills)} bills in the {congress}th Congress")
    out_path = config.TRIAGE_DIR / f"{congress}.json"
    done: dict[str, dict] = {}
    if out_path.exists():
        prev = json.loads(out_path.read_text())
        if prev.get("model") == model_id and prev.get("prompt_version") == prompt_version(PROMPT):
            done = {s["bill"]: s for s in prev["scores"]}

    system = load_prompt(PROMPT)
    todo = []
    for b in bills:
        slug = f"{congress}-{b['type'].lower()}{b['number']}"
        if slug not in done:
            todo.append((slug, b))
    print(f"  {len(todo)} to score, {len(done)} cached")

    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        user = "\n".join(
            f"- {slug}: {b.get('title','')}  [latest: {(b.get('latestAction') or {}).get('text','')[:120]}]"
            for slug, b in chunk
        )
        res = structured_call(model_id, system, user, TriageBatch)
        wanted = {slug for slug, _ in chunk}
        for s in res.scores:
            if s.bill in wanted:
                done[s.bill] = s.model_dump() | {"title": next(b.get("title") for slug, b in chunk if slug == s.bill)}
        config.TRIAGE_DIR.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps({
            "congress": congress, "model": model_id, "prompt_version": prompt_version(PROMPT),
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "scores": sorted(done.values(), key=lambda s: -(s["public_benefit"] + s["concentrated_cost"])),
        }, indent=1))
        print(f"  scored {min(i + BATCH, len(todo))}/{len(todo)}")

    shortlist = [s for s in done.values() if s["public_benefit"] + s["concentrated_cost"] >= min_score]
    print(f"  shortlist: {len(shortlist)} bills with combined score >= {min_score}")
    return shortlist
