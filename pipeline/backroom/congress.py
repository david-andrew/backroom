"""Congress.gov API v3 client with a disk cache, plus vote tally fetchers.

Every response is cached under data/raw/<slug>/ so reruns are free and the
model never sees anything we did not store.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import httpx

from . import config
from .schema import (
    Action, BillId, BillRecord, Committee, Person, RecordedVote, RelatedBill, Source,
)

API = "https://api.congress.gov/v3"
TYPE_DISPLAY = {
    "hr": "H.R.", "s": "S.", "hjres": "H.J.Res.", "sjres": "S.J.Res.",
    "hconres": "H.Con.Res.", "sconres": "S.Con.Res.", "hres": "H.Res.", "sres": "S.Res.",
}


class CongressClient:
    def __init__(self, api_key: str | None = None, cache_dir: Path = config.RAW_DIR):
        self.api_key = api_key or config.congress_api_key()
        self.cache_dir = cache_dir
        self.http = httpx.Client(timeout=60, headers={"User-Agent": "backroom/0.1 (research)"})

    # ---- low level ---------------------------------------------------------

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict:
        params = {"format": "json", "api_key": self.api_key, **(params or {})}
        last: Exception | None = None
        for attempt in range(6):
            try:
                r = self.http.get(f"{API}/{path.lstrip('/')}", params=params)
            except (httpx.TransportError, httpx.RemoteProtocolError) as e:  # dropped connection, timeout: retry
                last = e
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                last = RuntimeError(f"HTTP {r.status_code}")
                time.sleep(15 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError(f"giving up on {path}: {last}")

    def _cached(self, slug: str, name: str, fetch, force: bool = False):
        p = self.cache_dir / slug / f"{name}.json"
        if p.exists() and not force:
            return json.loads(p.read_text())
        data = fetch()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data, indent=1))
        return data

    def _paged(self, path: str, key: str, limit: int = 250, params: dict[str, Any] | None = None) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            data = self._get(path, {"limit": limit, "offset": offset, **(params or {})})
            items = data.get(key) or []
            out.extend(items)
            nxt = (data.get("pagination") or {}).get("next")
            if not nxt or not items:
                return out
            offset += limit

    # ---- bill listing (for triage) ----------------------------------------

    def list_bills(self, congress: int, types: tuple[str, ...] = ("hr", "s"), limit: int | None = None) -> list[dict]:
        """Every bill in a Congress: number, type, title, latest action. ~40 requests per Congress."""
        out = []
        for t in types:
            items = self._paged(f"bill/{congress}/{t}", "bills")
            out.extend(items)
            if limit and len(out) >= limit:
                break
        return out[:limit] if limit else out

    def list_summaries(self, congress: int, types: tuple[str, ...] = ("hr", "s")) -> dict[str, str]:
        """slug -> first sentence or two of the latest CRS summary, for every bill in a Congress that has one.
        The summaries endpoint only returns results with a date window; one page holds 250."""
        # Window filters on the summary update date, which for older Congresses is years after they ended (CRS re-processed its archive).
        start = "1970-01-01T00:00:00Z"
        end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        out: dict[str, str] = {}
        for t in types:
            items = self._paged(f"summaries/{congress}/{t}", "summaries", params={"fromDateTime": start, "toDateTime": end, "sort": "updateDate+asc"})
            for it in items:  # ascending by update date, so later versions overwrite earlier ones
                b = it.get("bill") or {}
                slug = f"{congress}-{(b.get('type') or t).lower()}{b.get('number')}"
                text = _strip_html(it.get("text", ""))
                # Drop the bold title line CRS puts first, then keep the opening of the summary.
                lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
                if lines and (lines[0].endswith(("Act", "Act of " + str(congress)[:0])) or len(lines) > 1 and len(lines[0]) < 160):
                    lines = lines[1:]
                body = " ".join(lines)
                out[slug] = body[:280]
        return out

    # ---- one bill ----------------------------------------------------------

    def fetch_bill(self, bid: BillId, force: bool = False) -> BillRecord:
        slug = bid.slug
        base = f"bill/{bid.congress}/{bid.type}/{bid.number}"
        c = lambda name, path, key: self._cached(slug, name, lambda: {key: self._paged(f"{base}/{path}", key)}, force)  # noqa: E731

        bill = self._cached(slug, "bill", lambda: self._get(base), force)["bill"]
        actions_raw = c("actions", "actions", "actions")["actions"]
        cosponsors_raw = c("cosponsors", "cosponsors", "cosponsors")["cosponsors"]
        summaries_raw = c("summaries", "summaries", "summaries")["summaries"]
        subjects_raw = self._cached(slug, "subjects", lambda: self._get(f"{base}/subjects"), force).get("subjects", {})
        committees_raw = c("committees", "committees", "committees")["committees"]
        text_raw = c("text", "text", "textVersions")["textVersions"]
        related_raw = c("relatedbills", "relatedbills", "relatedBills")["relatedBills"]
        titles_raw = c("titles", "titles", "titles")["titles"]

        text_url, text = self._bill_text(slug, text_raw, force)

        # Congress.gov lists newest first; reverse, then a stable sort keeps same-day order sane.
        actions = [self._action(a, slug, force) for a in reversed(actions_raw)]
        actions = _dedupe_actions(actions)
        actions.sort(key=lambda a: a.date)

        sponsors = [_person(s) for s in bill.get("sponsors", [])]
        cosponsors = [_person(s) for s in cosponsors_raw]
        party_counts = dict(Counter(p.party or "?" for p in cosponsors))

        summaries = [
            {"version": s.get("actionDesc"), "date": s.get("actionDate"), "text": _strip_html(s.get("text", ""))}
            for s in summaries_raw
        ]
        summaries.sort(key=lambda s: s["date"] or "")

        display = f"{TYPE_DISPLAY[bid.type]} {bid.number}"
        url = f"https://www.congress.gov/bill/{bid.congress}th-congress/{_url_type(bid.type)}/{bid.number}"
        today = datetime.now(timezone.utc).date().isoformat()

        rec = BillRecord(
            id=slug, congress=bid.congress, type=bid.type, number=bid.number,
            display=display,
            title=_best_title(bill, titles_raw),
            short_title=_short_title(bill),
            origin_chamber=bill.get("originChamber"),
            introduced=bill.get("introducedDate"),
            policy_area=(bill.get("policyArea") or {}).get("name"),
            subjects=[s["name"] for s in subjects_raw.get("legislativeSubjects", [])],
            sponsors=sponsors, cosponsors=cosponsors, cosponsor_party_counts=party_counts,
            committees=[Committee(name=cm["name"], chamber=cm.get("chamber", ""), activities=[a["name"] for a in cm.get("activities", [])]) for cm in committees_raw],
            actions=actions,
            latest_action=actions[-1] if actions else None,
            summaries=summaries,
            text_url=text_url, text_chars=len(text),
            congress_gov_url=url,
            congress_ended=config.congress_end_date(bid.congress) <= today,
            related=[RelatedBill(id=f"{r['congress']}-{r['type'].lower()}{r['number']}", title=r.get("title", ""),
                                 relationship="; ".join(d.get("type", "") for d in r.get("relationshipDetails", [])))
                     for r in related_raw if r.get("congress") and r.get("type") and r.get("number")],
            fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        rec.sources = build_sources(rec)
        rec.content_hash = hashlib.sha256(rec.model_dump_json(exclude={"fetched_at", "content_hash", "related"}).encode()).hexdigest()[:16]
        (self.cache_dir / slug / "record.json").write_text(rec.model_dump_json(indent=1))
        return rec

    def bill_text(self, slug: str) -> str:
        p = self.cache_dir / slug / "text.txt"
        return p.read_text() if p.exists() else ""

    # ---- helpers -----------------------------------------------------------

    def _bill_text(self, slug: str, versions: list[dict], force: bool) -> tuple[str | None, str]:
        p = self.cache_dir / slug / "text.txt"
        if not versions:
            return None, ""
        # Newest version first; prefer the plain "Formatted Text" htm.
        versions = sorted(versions, key=lambda v: v.get("date") or "", reverse=True)
        fmt = next((f for f in versions[0].get("formats", []) if f["type"] == "Formatted Text"), None)
        if not fmt:
            return None, ""
        if p.exists() and not force:
            return fmt["url"], p.read_text()
        r = self.http.get(fmt["url"])
        r.raise_for_status()
        text = _strip_html(r.text)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return fmt["url"], text

    def _action(self, a: dict, slug: str, force: bool) -> Action:
        votes = []
        for v in a.get("recordedVotes", []) or []:
            rv = RecordedVote(
                chamber=v.get("chamber", ""), date=v.get("date", "")[:10],
                roll_number=int(v.get("rollNumber", 0)), session=v.get("sessionNumber"),
                url=v.get("url", ""),
            )
            try:
                tally = self._cached(slug, f"vote-{rv.chamber.lower()}-{rv.roll_number}", lambda: fetch_tally(self.http, rv), force)
                for k, val in tally.items():
                    setattr(rv, k, val)
            except Exception as e:  # tallies are nice-to-have
                print(f"  ! vote tally failed for {rv.url}: {e}")
            votes.append(rv)
        src = (a.get("sourceSystem") or {}).get("name", "")
        chamber = "Senate" if "Senate" in src else "House" if "House" in src else None
        return Action(date=a.get("actionDate", ""), text=a.get("text", ""), chamber=chamber, action_code=a.get("actionCode"), votes=votes)


def _dedupe_actions(actions: list[Action]) -> list[Action]:
    """Congress.gov reports floor votes twice (Senate system + Library of Congress). Keep the chamber-tagged one."""
    out: list[Action] = []
    norm = lambda t: re.sub(r"\s+", "", t)  # noqa: E731  (LOC and Senate copies differ by whitespace)
    rolls = lambda x: {(v.chamber, v.roll_number) for v in x.votes}  # noqa: E731
    for a in actions:
        dup = next((o for o in out if o.date == a.date and (norm(o.text) == norm(a.text) or (rolls(o) and rolls(o) & rolls(a)))), None)
        if dup is None:
            out.append(a)
        elif a.chamber and not dup.chamber:
            out[out.index(dup)] = a
    return out


def build_sources(rec: BillRecord) -> list[Source]:
    """The numbered list the model is allowed to cite."""
    srcs: list[Source] = [Source(id="S1", kind="bill_page", label=f"{rec.display} on Congress.gov", url=rec.congress_gov_url)]
    n = 2
    for s in rec.summaries:
        srcs.append(Source(id=f"S{n}", kind="summary", label=f"CRS summary ({s['version']})", url=rec.congress_gov_url + "/summary", date=s["date"], excerpt=s["text"]))
        n += 1
    if rec.text_url:
        srcs.append(Source(id=f"S{n}", kind="text", label="Bill text (latest version)", url=rec.text_url))
        n += 1
    srcs.append(Source(id=f"S{n}", kind="cosponsors", label=f"Cosponsors ({len(rec.cosponsors)})", url=rec.congress_gov_url + "/cosponsors"))
    n += 1
    srcs.append(Source(id=f"S{n}", kind="action", label="Full action history", url=rec.congress_gov_url + "/all-actions"))
    n += 1
    for a in rec.actions:
        for v in a.votes:
            tally = f"{v.yea}-{v.nay}" if v.yea is not None else ""
            srcs.append(Source(id=f"S{n}", kind="vote", label=f"{v.chamber} roll call {v.roll_number} {tally}".strip(), url=v.url, date=v.date, excerpt=a.text))
            n += 1
    return srcs


def fetch_tally(http: httpx.Client, v: RecordedVote) -> dict:
    """Senate publishes vote XML at the recorded URL; House at clerk.house.gov."""
    if v.chamber.lower() == "senate":
        r = http.get(v.url)
        r.raise_for_status()
        root = ET.fromstring(r.text)
        by_party: dict[str, dict[str, int]] = {}
        members = []
        for m in root.iter("member"):
            party = (m.findtext("party") or "?").strip()
            cast = (m.findtext("vote_cast") or "").strip().lower()
            if cast in ("yea", "nay"):
                by_party.setdefault(party, {"yea": 0, "nay": 0})[cast] += 1
            members.append({"name": f"{m.findtext('first_name', '').strip()} {m.findtext('last_name', '').strip()}".strip(),
                            "party": party, "state": (m.findtext("state") or "").strip(), "cast": _cast(cast)})
        yea, nay = int(root.findtext("count/yeas") or 0), int(root.findtext("count/nays") or 0)
        # The Vice President breaks ties; count/yeas and the member list exclude that vote.
        tb = (root.findtext("tie_breaker/tie_breaker_vote") or "").strip().lower()
        if tb in ("yea", "nay"):
            by_party["VP"] = {"yea": int(tb == "yea"), "nay": int(tb == "nay")}
            yea += int(tb == "yea"); nay += int(tb == "nay")
        return {
            "question": (root.findtext("question") or root.findtext("vote_question_text") or "").strip() or None,
            "result": (root.findtext("vote_result") or "").strip() or None,
            "yea": yea, "nay": nay,
            "by_party": by_party, "members": members,
        }
    # House
    year = v.date[:4]
    r = http.get(f"https://clerk.house.gov/evs/{year}/roll{v.roll_number:03d}.xml")
    r.raise_for_status()
    root = ET.fromstring(r.text)
    by_party = {}
    members = []
    for m in root.iter("recorded-vote"):
        leg = m.find("legislator")
        party = (leg.get("party") if leg is not None else "?") or "?"
        cast = (m.findtext("vote") or "").strip().lower()
        if cast in ("yea", "nay", "aye", "no"):
            k = "yea" if cast in ("yea", "aye") else "nay"
            by_party.setdefault(party, {"yea": 0, "nay": 0})[k] += 1
        if leg is not None:
            members.append({"name": (leg.get("unaccented-name") or leg.text or "").strip(), "party": party,
                            "state": leg.get("state") or "", "cast": _cast(cast), "bioguide_id": leg.get("name-id")})
    yea = sum(p["yea"] for p in by_party.values())
    nay = sum(p["nay"] for p in by_party.values())
    return {
        "question": (root.findtext(".//vote-question") or "").strip() or None,
        "result": (root.findtext(".//vote-result") or "").strip() or None,
        "yea": yea, "nay": nay, "by_party": by_party, "members": members,
    }


def _cast(c: str) -> str:
    c = c.lower()
    if c in ("yea", "aye"): return "yea"
    if c in ("nay", "no"): return "nay"
    if c == "present": return "present"
    return "not_voting"


def _person(s: dict) -> Person:
    """Congress.gov fullName looks like 'Sen. Brown, Sherrod [D-OH]'; keep party/state as fields."""
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", s.get("fullName", ""))
    return Person(bioguide_id=s["bioguideId"], name=name, party=s.get("party"), state=s.get("state"))


def _strip_html(s: str) -> str:
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</h\d>|</li>|</tr>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return s.strip()


STAGE_RANK = ["enacted", "passed senate", "passed house", "placed on senate calendar", "reported", "introduced"]


def _best_title(bill: dict, titles: list[dict]) -> str:
    """Prefer the whole-bill short title from the latest legislative stage; the popular title is the tiebreak.

    'Display Title' is the formal 'An act to...' form for enacted bills, so it is only a fallback."""
    official = bill.get("title", "")
    whole = [t for t in titles if t.get("title") and "portion" not in (t.get("titleType") or "").lower()]
    shorts = [t for t in whole if "short title" in (t.get("titleType") or "").lower()]

    def stage(t: dict) -> int:
        tt = (t.get("titleType") or "").lower()
        return next((i for i, k in enumerate(STAGE_RANK) if k in tt), len(STAGE_RANK))

    if shorts:
        shorts.sort(key=lambda t: (stage(t), len(t["title"])))
        return shorts[0]["title"]
    popular = next((t["title"] for t in whole if (t.get("titleType") or "") == "Popular Titles"), None)
    display = next((t["title"] for t in whole if (t.get("titleType") or "") == "Display Title"), None)
    for cand in (popular, display):
        if cand and len(cand) <= 90:
            return cand
    return official


def _short_title(bill: dict) -> str | None:
    t = bill.get("title", "")
    # "Stock Buyback Accountability Act of 2023" style titles are already short.
    return t if len(t) <= 90 else None


def _url_type(t: str) -> str:
    return {
        "hr": "house-bill", "s": "senate-bill", "hjres": "house-joint-resolution", "sjres": "senate-joint-resolution",
        "hconres": "house-concurrent-resolution", "sconres": "senate-concurrent-resolution",
        "hres": "house-resolution", "sres": "senate-resolution",
    }[t]
