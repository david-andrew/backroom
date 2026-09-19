"""Paths, env, and the two model slots."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"            # cached Congress.gov responses + bill text
ANALYSES_DIR = DATA_DIR / "analyses"  # one JSON per bill, model-written
TRIAGE_DIR = DATA_DIR / "triage"      # per-congress triage scores
SEEDS_FILE = DATA_DIR / "seeds.json"
PROMPTS_DIR = REPO_ROOT / "pipeline" / "prompts"
SITE_DATA_DIR = REPO_ROOT / "site" / "public" / "data"

TRIAGE_MODEL = os.environ.get("TABLED_TRIAGE_MODEL", "z-ai/glm-5.3-flash")
ANALYSIS_MODEL = os.environ.get("TABLED_ANALYSIS_MODEL", "anthropic/claude-opus-5")

# Bill text fed to the analysis model is capped so a 900-page omnibus does not
# blow the budget. Most of the bills we care about are far shorter.
MAX_BILL_TEXT_CHARS = int(os.environ.get("TABLED_MAX_BILL_TEXT_CHARS", "80000"))


def congress_api_key() -> str:
    key = os.environ.get("CONGRESS_API_KEY")
    if not key:
        raise SystemExit("CONGRESS_API_KEY is not set (see .env.example)")
    return key


def openrouter_api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY is not set (see .env.example)")
    return key


def congress_end_date(congress: int) -> str:
    """Each Congress ends at noon on Jan 3 of the odd year after it began."""
    return f"{1789 + 2 * congress}-01-03"
