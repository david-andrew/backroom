"""`backroom` command line.

  backroom fetch [bill ...]      fetch + cache Congress.gov data (default: seeds.json)
  backroom analyze [bill ...]    run the analysis model (default: every fetched bill)
  backroom triage CONGRESS       score every bill in a Congress with the triage model
  backroom glossary              list uncommon terms, define them from Wikipedia
  backroom members             fetch current members, index their roles on tracked bills
  backroom lint                  free consistency checks of every analysis against its record
  backroom audit [--n 15]        stronger model spot-checks analyses (lint-flagged first); --fix re-analyzes majors
  backroom build                 write site/public/data (also rebuilds the members index)
  backroom all                   fetch + analyze + build for the seeds
"""
from __future__ import annotations

import argparse
import json

from . import analyze, audit, build, config, glossary, lint, members, triage
from .congress import CongressClient
from .schema import BillId


def seeds() -> list[str]:
    return json.loads(config.SEEDS_FILE.read_text())["bills"]


def fetched_slugs() -> list[str]:
    return sorted(p.parent.name for p in config.RAW_DIR.glob("*/record.json"))


def main() -> None:
    ap = argparse.ArgumentParser(prog="backroom", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch"); f.add_argument("bills", nargs="*"); f.add_argument("--force", action="store_true")
    a = sub.add_parser("analyze"); a.add_argument("bills", nargs="*"); a.add_argument("--force", action="store_true")
    a.add_argument("--model", default=config.ANALYSIS_MODEL)
    t = sub.add_parser("triage"); t.add_argument("congress", type=int); t.add_argument("--limit", type=int)
    t.add_argument("--min-score", type=int, default=12, help="cutoff for the helpful pair (public_benefit + concentrated_cost)")
    t.add_argument("--min-harm", type=int, default=None, help="cutoff for the harmful pair (concentrated_gain + public_harm); defaults to --min-score"); t.add_argument("--model", default=config.TRIAGE_MODEL)
    t.add_argument("--fetch", action="store_true", help="also fetch + analyze the shortlist")
    t.add_argument("--top", type=int, default=30, help="how many shortlisted bills to print")
    g = sub.add_parser("glossary"); g.add_argument("--force", action="store_true"); g.add_argument("--model", default=config.TRIAGE_MODEL)
    mm = sub.add_parser("members"); mm.add_argument("--force", action="store_true", help="refetch the member roster")
    sub.add_parser("lint")
    au = sub.add_parser("audit"); au.add_argument("bills", nargs="*"); au.add_argument("--n", type=int, default=15)
    au.add_argument("--model", default=audit.DEFAULT_MODEL); au.add_argument("--fix", action="store_true", help="re-analyze bills judged 'major' with the audit model")
    au.add_argument("--seed", type=int)
    sub.add_parser("build")
    al = sub.add_parser("all"); al.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.cmd in ("fetch", "all"):
        client = CongressClient()
        # Default: every seed plus every bill triage has already pulled in, so the weekly refresh keeps them current.
        for s in (getattr(args, "bills", None) or sorted(set(seeds()) | set(fetched_slugs()))):
            bid = BillId.parse(s)
            print(f"fetch {bid.slug}")
            rec = client.fetch_bill(bid, force=args.force)
            print(f"  {rec.display}: {rec.title[:80]} | {len(rec.actions)} actions, {len(rec.cosponsors)} cosponsors, {rec.text_chars} chars")
    if args.cmd in ("analyze", "all"):
        model = getattr(args, "model", config.ANALYSIS_MODEL)
        analyze.run_all([BillId.parse(s).slug for s in (getattr(args, "bills", None) or fetched_slugs())], force=args.force, model_id=model)
    if args.cmd == "triage":
        shortlist = triage.run(args.congress, limit=args.limit, min_score=args.min_score, model_id=args.model, min_harm=args.min_harm)
        for s in shortlist[:args.top]:
            print(f"  help {triage.helps(s):>2} harm {triage.harms(s):>2}  {s['bill']:<12} {s['title'][:70]}")
        triage.threshold_table(args.congress)
        if args.fetch:
            client = CongressClient()
            slugs = []
            for i, s in enumerate(shortlist, 1):
                bid = BillId.parse(s["bill"])
                try:
                    client.fetch_bill(bid)
                    slugs.append(bid.slug)
                except Exception as e:
                    print(f"  ! fetch {bid.slug} failed: {str(e)[:200]}")
                if i % 25 == 0:
                    print(f"  fetched {i}/{len(shortlist)}")
            analyze.run_all(slugs)
    if args.cmd == "glossary":
        glossary.run(model_id=args.model, force=args.force)
    if args.cmd == "lint":
        lint.run()
    if args.cmd == "audit":
        audit.run(n=args.n, model_id=args.model, bills=args.bills or None, fix=args.fix, seed=args.seed)
    if args.cmd in ("build", "all"):
        build.run()
        members.run()
    if args.cmd == "members":
        members.run(force=args.force)


if __name__ == "__main__":
    main()
