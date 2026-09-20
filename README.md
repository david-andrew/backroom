# Backroom

Whose interests is Congress looking out for? A sourced record of bills that help everyday people and bills that serve concentrated power, and what Congress did with each. (Pipeline command is still `tabled`.)

Two parts, no server:

- `pipeline/` (Python, [uv](https://docs.astral.sh/uv/)) fetches facts from Congress.gov, the Senate, and the House Clerk, has a model write the sourced interpretation, and emits JSON.
- `site/` (Vite + Preact + TypeScript) is a static site that reads that JSON.

## Setup

```bash
cp .env.example .env     # add OPENROUTER_API_KEY and CONGRESS_API_KEY
cd pipeline && uv sync
cd ../site && npm install
```

Free Congress.gov key: https://api.congress.gov/sign-up/ (the public `DEMO_KEY` works for a handful of requests per hour).

## Run

```bash
cd pipeline
uv run tabled fetch             # Congress.gov -> data/raw/<bill>/   (seeds in data/seeds.json)
uv run tabled analyze           # analysis model -> data/analyses/<bill>.json
uv run tabled build             # -> site/public/data/
uv run tabled all               # the three above

uv run tabled triage 119 --limit 2000       # score bill titles with the triage model
uv run tabled triage 119 --fetch            # ...and fetch + analyze the shortlist

cd ../site && npm run dev       # http://localhost:5173
```

Bills are addressed as `<congress>-<type><number>`, e.g. `118-s413`, `116-hr582`.

## Models

Two slots, set in `.env` (OpenRouter ids):

| Slot | Env var | Default | Job |
|---|---|---|---|
| Triage | `TABLED_TRIAGE_MODEL` | `z-ai/glm-5.3-flash` | Score every bill title in a Congress |
| Analysis | `TABLED_ANALYSIS_MODEL` | `z-ai/glm-5.3-flash` | Write the sourced entry for shortlisted bills |

Every analysis records the model and a hash of the prompt that produced it. `tabled analyze` skips bills whose analysis already matches the current model, prompt, and fetched record; `--force` regenerates, `--model` overrides the slot for one run.

## How the interpretation is kept honest

- The model only sees what the pipeline fetched, with every citable item numbered (`S1`, `S2`, ...). It must cite ids per claim; citations that do not resolve are flagged on the page.
- Prompts live in `pipeline/prompts/`. No "greed", no motive speculation; facts and who-decided, sourced.
- Ranking is deterministic from five model-given scores (`pipeline/tabled/build.py`): stakes for the public, stakes for concentrated interests, how far the outcome went against the public, support-vs-result gap, and corruption relevance. Weights can be re-tuned without re-running any model.
- Each bill has a `direction`: serves working people, serves concentrated interests, or mixed. Harmful bills that became law rank alongside helpful bills that were buried.
- "Sides" (who pushed it, who stopped it) may include outside pressure that never appears in the congressional record, marked `widely_reported` with no citation. The site labels these "reported". This is the one place the model is allowed off the record; everything else must cite.

## Layout

```
data/seeds.json        hand-picked starting bills
data/raw/<bill>/       cached Congress.gov responses, bill text, vote tallies, record.json
data/analyses/         model output, one file per bill
data/triage/           per-Congress triage scores
pipeline/tabled/       congress.py (fetch), llm.py (toki/OpenRouter), analyze.py, triage.py, build.py, cli.py
site/src/              pages/Explorer, pages/Bill, pages/About, components/ui
```
