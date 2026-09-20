"""Glossary: the model lists uncommon terms; definitions come from Wikipedia and are
condensed for a tooltip. Every entry cites the article it came from."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import httpx
from pydantic import BaseModel, Field

from . import config
from .llm import load_prompt, prompt_version, structured_call
from .schema import AnalysisFile

GLOSSARY_FILE = config.DATA_DIR / "glossary.json"
WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/"
MAX_ANALYSIS_CHARS = 2500  # per bill, enough to see the vocabulary in use


class TermProposal(BaseModel):
    term: str
    aliases: list[str]
    wikipedia_title: str


class TermList(BaseModel):
    terms: list[TermProposal]


class Definition(BaseModel):
    definition: str = Field(description="At most 40 words, plain language")


def _corpus() -> str:
    parts = []
    for p in sorted(config.ANALYSES_DIR.glob("*.json")):
        a = AnalysisFile.model_validate_json(p.read_text()).analysis
        text = " ".join([a.plain_summary, a.who_benefits, a.who_pays, a.benefit_vs_cost, a.outcome.mechanism,
                         *[c.text for c in a.how_it_helps + a.drawbacks + a.outcome.narrative],
                         a.sides.party_line_note, *[k.what_they_did for k in a.sides.for_ + a.sides.against]])
        parts.append(f"## {a.headline}\n{text[:MAX_ANALYSIS_CHARS]}")
    return "\n\n".join(parts)


def _wiki_summary(http: httpx.Client, title: str) -> dict | None:
    r = http.get(WIKI + title.replace(" ", "_"), follow_redirects=True)
    if r.status_code != 200:
        return None
    d = r.json()
    if d.get("type") == "disambiguation" or not d.get("extract"):
        return None
    return {"title": d["title"], "extract": d["extract"], "url": d["content_urls"]["desktop"]["page"],
            "description": d.get("description")}


def run(model_id: str = config.TRIAGE_MODEL, force: bool = False) -> None:
    existing: dict[str, dict] = {}
    if GLOSSARY_FILE.exists() and not force:
        existing = {e["term"].lower(): e for e in json.loads(GLOSSARY_FILE.read_text())["terms"]}

    print(f"  proposing terms with {model_id}")
    proposals = structured_call(model_id, load_prompt("glossary"), _corpus(), TermList).terms
    print(f"  {len(proposals)} terms proposed, {len(existing)} already defined")

    http = httpx.Client(timeout=30, headers={"User-Agent": "backroom/0.1 (glossary; contact via repo)"})
    out: dict[str, dict] = dict(existing)
    for t in proposals:
        key = t.term.lower()
        if key in out:
            # keep definition, merge aliases
            out[key]["aliases"] = sorted(set(out[key]["aliases"]) | {a for a in t.aliases if a.lower() != key})
            continue
        w = _wiki_summary(http, t.wikipedia_title)
        if not w:
            print(f"  ! no Wikipedia summary for {t.term!r} ({t.wikipedia_title!r}); skipping")
            continue
        d = structured_call(model_id, load_prompt("condense"), f"Term: {t.term}\n\nWikipedia ({w['title']}): {w['extract'][:1500]}", Definition)
        out[key] = {
            "term": t.term, "aliases": sorted({a for a in t.aliases if a.lower() != key}),
            "definition": d.definition.strip(),
            "source": {"name": "Wikipedia", "title": w["title"], "url": w["url"], "excerpt": w["extract"][:400]},
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        print(f"  + {t.term}  <- {w['title']}")
        time.sleep(0.2)

    GLOSSARY_FILE.write_text(json.dumps({
        "model": model_id, "prompt_version": prompt_version("glossary"),
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "terms": sorted(out.values(), key=lambda e: e["term"].lower()),
    }, indent=1))
    print(f"  {len(out)} terms in {GLOSSARY_FILE}")
