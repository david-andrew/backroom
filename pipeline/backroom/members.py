"""Current members of Congress (Congress.gov) and an index of what each did on tracked bills."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import config
from .congress import CongressClient
from .schema import AnalysisFile, BillRecord

MEMBERS_FILE = config.DATA_DIR / "members.json"

STATE_ABBR = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC","Puerto Rico":"PR","Guam":"GU","American Samoa":"AS","Virgin Islands":"VI","Northern Mariana Islands":"MP"}
PARTY = {"Democratic": "D", "Republican": "R", "Independent": "I", "Independent Democrat": "ID", "Libertarian": "L"}


def fetch_current(force: bool = False) -> list[dict]:
    if MEMBERS_FILE.exists() and not force:
        return json.loads(MEMBERS_FILE.read_text())["members"]
    client = CongressClient()
    raw = client._paged("member", "members", params={"currentMember": "true"})
    out = []
    for m in raw:
        terms = (m.get("terms") or {}).get("item") or []
        chamber = (terms[-1].get("chamber") if terms else "") or ""
        last, _, first = m.get("name", "").partition(", ")
        out.append({
            "id": m["bioguideId"], "name": f"{first} {last}".strip(), "last": last, "first": first,
            "party": PARTY.get(m.get("partyName", ""), (m.get("partyName") or "?")[:1]),
            "state": STATE_ABBR.get(m.get("state", ""), m.get("state", "")), "state_name": m.get("state", ""),
            "district": m.get("district"), "chamber": "Senate" if "Senate" in chamber else "House",
            "image": (m.get("depiction") or {}).get("imageUrl"),
        })
    MEMBERS_FILE.write_text(json.dumps({"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "members": out}, indent=1))
    print(f"  {len(out)} current members")
    return out


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def build_index(members: list[dict]) -> dict:
    """For each current member: sponsor/cosponsor roles, recorded votes, and names in 'sides' across analyzed bills."""
    by_id = {m["id"]: m for m in members}
    # Senate votes carry no bioguide id; match on last name + state, then party as tiebreak.
    senators = [m for m in members if m["chamber"] == "Senate"]
    inv: dict[str, list[dict]] = {m["id"]: [] for m in members}

    def add(mid: str | None, item: dict):
        if mid and mid in inv:
            inv[mid].append(item)

    def match_senator(name: str, state: str, party: str) -> str | None:
        last = _norm(name.split()[-1]) if name else ""
        c = [m for m in senators if m["state"] == state and _norm(m["last"]) == last]
        if len(c) > 1:
            c = [m for m in c if m["party"] == party] or c
        return c[0]["id"] if len(c) == 1 else None

    for af_path in sorted(config.ANALYSES_DIR.glob("*.json")):
        af = AnalysisFile.model_validate_json(af_path.read_text())
        rec_path = config.RAW_DIR / af.bill_id / "record.json"
        if not rec_path.exists():
            continue
        rec = BillRecord.model_validate_json(rec_path.read_text())
        a = af.analysis
        base = {"bill": rec.id, "display": rec.display, "title": rec.title, "direction": a.direction, "status": a.outcome.status}
        for p in rec.sponsors:
            add(p.bioguide_id, {**base, "role": "sponsor"})
        for p in rec.cosponsors:
            add(p.bioguide_id, {**base, "role": "cosponsor"})
        seen_rolls = set()
        for act in rec.actions:
            for v in act.votes:
                if (v.chamber, v.roll_number) in seen_rolls:
                    continue
                seen_rolls.add((v.chamber, v.roll_number))
                for mv in v.members:
                    mid = mv.bioguide_id or match_senator(mv.name, mv.state, mv.party)
                    add(mid, {**base, "role": "vote", "cast": mv.cast, "chamber": v.chamber, "roll": v.roll_number,
                              "date": v.date, "question": v.question, "url": v.url})
        # Named actors: last-name match against current members of the right chamber (heuristic, labeled on the site).
        for side, actors in (("for", a.sides.for_), ("against", a.sides.against)):
            for k in actors:
                if not k.party or k.party not in ("D", "R", "I", "ID"):
                    continue
                words = [w for w in re.split(r"[\s,]+", k.name) if w and w[0].isupper() and w not in ("Sen.", "Rep.", "Senator", "Representative")]
                if not words:
                    continue
                last = _norm(words[-1])
                cands = [m for m in members if _norm(m["last"]) == last and m["party"] == k.party]
                if len(cands) == 1:
                    add(cands[0]["id"], {**base, "role": f"named_{side}", "what": k.what_they_did, "evidence": k.evidence})

    # Only ship members with any involvement, plus a slim roster for lookup.
    roster = [{k: m[k] for k in ("id", "name", "party", "state", "state_name", "district", "chamber", "image")} for m in members]
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "roster": roster, "involvement": {k: v for k, v in inv.items() if v}}


def run(force: bool = False) -> None:
    members = fetch_current(force)
    idx = build_index(members)
    config.SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (config.SITE_DATA_DIR / "members.json").write_text(json.dumps(idx))
    n = sum(len(v) for v in idx["involvement"].values())
    print(f"  members index: {len(idx['involvement'])} members with {n} involvements")
