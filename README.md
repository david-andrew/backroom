# Backroom

[![deploy](https://github.com/david-andrew/backroom/actions/workflows/deploy.yml/badge.svg)](https://github.com/david-andrew/backroom/actions/workflows/deploy.yml)
[![refresh](https://github.com/david-andrew/backroom/actions/workflows/refresh.yml/badge.svg)](https://github.com/david-andrew/backroom/actions/workflows/refresh.yml)
[![data refreshed](https://img.shields.io/github/last-commit/david-andrew/backroom/master?path=data&label=data%20refreshed)](https://github.com/david-andrew/backroom/commits/master/data)

Whose interests is Congress looking out for? A sourced record of bills that help everyday people and bills that serve concentrated power, and what Congress did with each. (Pipeline command is still `backroom`.)

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
uv run backroom fetch             # Congress.gov -> data/raw/<bill>/   (seeds in data/seeds.json)
uv run backroom analyze           # analysis model -> data/analyses/<bill>.json
uv run backroom build             # -> site/public/data/
uv run backroom all               # the three above

uv run backroom triage 119 --limit 2000       # score bill titles with the triage model
uv run backroom triage 119 --fetch            # ...and fetch + analyze the shortlist

cd ../site && npm run dev       # http://localhost:5173
```

Bills are addressed as `<congress>-<type><number>`, e.g. `118-s413`, `116-hr582`.

## Models

Two slots, set in `.env` (OpenRouter ids):

| Slot | Env var | Default | Job |
|---|---|---|---|
| Triage | `BACKROOM_TRIAGE_MODEL` | `z-ai/glm-5.3-flash` | Score every bill title in a Congress |
| Analysis | `BACKROOM_ANALYSIS_MODEL` | `z-ai/glm-5.3-flash` | Write the sourced entry for shortlisted bills |

Every analysis records the model and a hash of the prompt that produced it. `backroom analyze` skips bills whose analysis already matches the current model, prompt, and fetched record; `--force` regenerates, `--model` overrides the slot for one run.

## How the interpretation is kept honest

- The model only sees what the pipeline fetched, with every citable item numbered (`S1`, `S2`, ...). It must cite ids per claim; citations that do not resolve are flagged on the page.
- Prompts live in `pipeline/prompts/`. No "greed", no motive speculation; facts and who-decided, sourced.
- Ranking is deterministic from five model-given scores (`pipeline/backroom/build.py`): stakes for the public, stakes for concentrated interests, how far the outcome went against the public, support-vs-result gap, and corruption relevance. Weights can be re-tuned without re-running any model.
- Each bill has a `direction`: serves working people, serves concentrated interests, or mixed. Harmful bills that became law rank alongside helpful bills that were buried.
- "Sides" (who pushed it, who stopped it) may include outside pressure that never appears in the congressional record, marked `widely_reported` with no citation. The site labels these "reported". This is the one place the model is allowed off the record; everything else must cite.

## Deployment

The site is static and lives on GitHub Pages. Two workflows do everything:

| Workflow | Trigger | What it does | Needs |
|---|---|---|---|
| `deploy` | every push to `master` | `backroom build` from the committed data, `vite build`, publish to Pages | nothing |
| `refresh` | Mondays 06:17 UTC, or manually | refetch bills, triage the sitting Congress for new bills, re-analyze changed ones, refresh glossary and member roster, commit `data/`, then deploy | secrets `OPENROUTER_API_KEY`, `CONGRESS_API_KEY` |

One-time setup in the GitHub repo:

1. **Settings > Pages > Source: GitHub Actions.**
2. **Settings > Secrets and variables > Actions > Secrets:** add `OPENROUTER_API_KEY` and `CONGRESS_API_KEY`.
3. Optional **Variables:** `BACKROOM_ANALYSIS_MODEL` / `BACKROOM_TRIAGE_MODEL` to override the model slots. The deploy workflow reads the custom domain from Settings > Pages automatically; `CUSTOM_DOMAIN` only exists as an override. With no custom domain the site serves at `https://david-andrew.github.io/backroom/`.

Custom domain DNS: an `A`/`AAAA` set pointing the apex at GitHub Pages' IPs (or a `CNAME` from `www` to `david-andrew.github.io`), then enter the domain under Settings > Pages and tick "Enforce HTTPS". Re-run `deploy` once after adding the domain; it picks the domain up from Pages settings and writes the `CNAME` file itself.

`refresh` can be run by hand from the Actions tab; tick **force_analyze** after changing a prompt to regenerate every analysis. It also runs triage on the sitting Congress (variables `BACKROOM_CONGRESS`, default 119; `BACKROOM_MIN_SCORE`, default 10, for bills that help the public; `BACKROOM_MIN_HARM`, default 10, for bills that serve concentrated interests at the public's expense) so newly introduced bills are picked up. Backfilling an earlier Congress is a manual run: `backroom triage 117 --min-score 10 --min-harm 10 --fetch`.

## Roadmap

- **State and local legislatures.** The same pipeline shape (public record in, sourced plain-language analysis out) applies to state bills; the [Open States API](https://docs.openstates.org/) covers all 50 legislatures with bills, sponsors, votes, and text, and city councils increasingly publish through Legistar. The schema would gain a `jurisdiction` field and the member lookup would extend to state legislators via the same Census district layers.
- **Lobbying disclosures.** Senate LDA filings list the bills each registrant lobbied on; joining them would let "industries affected" cite who actually paid to influence a bill.

## Credits

Link-preview image: "United States Capitol west front edit2" via Wikimedia Commons, public domain (U.S. government work by the Architect of the Capitol).

## Layout

```
data/seeds.json        hand-picked starting bills
data/raw/<bill>/       cached Congress.gov responses, bill text, vote tallies, record.json
data/analyses/         model output, one file per bill
data/triage/           per-Congress triage scores
pipeline/backroom/       congress.py (fetch), llm.py (toki/OpenRouter), analyze.py, triage.py, build.py, cli.py
site/src/              pages/Explorer, pages/Bill, pages/About, components/ui
```
