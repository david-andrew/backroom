"""`tabled` command line.

  tabled fetch [bill ...]      fetch + cache Congress.gov data (default: seeds.json)
  tabled analyze [bill ...]    run the analysis model (default: every fetched bill)
  tabled triage CONGRESS       score every bill in a Congress with the triage model
  tabled glossary              list uncommon terms, define them from Wikipedia
  tabled build                 write site/public/data
  tabled all                   fetch + analyze + build for the seeds
"""
from __future__ import annotations

import argparse
import json

from . import analyze, build, config, glossary, triage
from .congress import CongressClient
from .schema import BillId


def seeds() -> list[str]:
    return json.loads(config.SEEDS_FILE.read_text())["bills"]


def fetched_slugs() -> list[str]:
    return sorted(p.parent.name for p in config.RAW_DIR.glob("*/record.json"))


def main() -> None:
    ap = argparse.ArgumentParser(prog="tabled", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch"); f.add_argument("bills", nargs="*"); f.add_argument("--force", action="store_true")
    a = sub.add_parser("analyze"); a.add_argument("bills", nargs="*"); a.add_argument("--force", action="store_true")
    a.add_argument("--model", default=config.ANALYSIS_MODEL)
    t = sub.add_parser("triage"); t.add_argument("congress", type=int); t.add_argument("--limit", type=int)
    t.add_argument("--min-score", type=int, default=12); t.add_argument("--model", default=config.TRIAGE_MODEL)
    t.add_argument("--fetch", action="store_true", help="also fetch + analyze the shortlist")
    g = sub.add_parser("glossary"); g.add_argument("--force", action="store_true"); g.add_argument("--model", default=config.TRIAGE_MODEL)
    sub.add_parser("build")
    al = sub.add_parser("all"); al.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.cmd in ("fetch", "all"):
        client = CongressClient()
        for s in (getattr(args, "bills", None) or seeds()):
            bid = BillId.parse(s)
            print(f"fetch {bid.slug}")
            rec = client.fetch_bill(bid, force=args.force)
            print(f"  {rec.display}: {rec.title[:80]} | {len(rec.actions)} actions, {len(rec.cosponsors)} cosponsors, {rec.text_chars} chars")
    if args.cmd in ("analyze", "all"):
        model = getattr(args, "model", config.ANALYSIS_MODEL)
        failed = []
        for s in (getattr(args, "bills", None) or fetched_slugs()):
            try:
                analyze.run(BillId.parse(s).slug, force=args.force, model_id=model)
            except Exception as e:  # keep going; report at the end
                print(f"  ! {s} failed: {str(e)[:300]}")
                failed.append(s)
        if failed:
            print(f"  ! {len(failed)} bill(s) failed: {', '.join(failed)}")
    if args.cmd == "triage":
        shortlist = triage.run(args.congress, limit=args.limit, min_score=args.min_score, model_id=args.model)
        for s in shortlist[:30]:
            print(f"  {s['public_benefit']+s['concentrated_cost']:>2}  {s['bill']:<12} {s['title'][:70]}")
        if args.fetch:
            client = CongressClient()
            for s in shortlist:
                bid = BillId.parse(s["bill"])
                client.fetch_bill(bid)
                analyze.run(bid.slug)
    if args.cmd == "glossary":
        glossary.run(model_id=args.model, force=args.force)
    if args.cmd in ("build", "all"):
        build.run()


if __name__ == "__main__":
    main()
