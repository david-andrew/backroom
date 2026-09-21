"""Companion bills (same Congress, other chamber) and lineage (same bill reintroduced in other Congresses).

Congress.gov's related-bills data is authoritative when present but sparse for the sitting Congress, so it is
combined with exact short-title matches. Same-chamber same-title bills are NOT merged: acronyms collide."""
from __future__ import annotations

import re

from .schema import BillRecord

_YEAR = re.compile(r"\b(of|for fiscal year)?\s*(19|20)\d{2}\b", re.I)
_NOISE = re.compile(r"[^a-z0-9 ]+")


def title_key(title: str) -> str:
    t = title.lower()
    t = _YEAR.sub(" ", t)
    t = _NOISE.sub(" ", t)
    t = re.sub(r"\b(the|a|an|act)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def chamber(slug: str) -> str:
    return "Senate" if re.match(r"\d+-s", slug) else "House"


class _UF:
    def __init__(self):
        self.p: dict[str, str] = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def compute(records: dict[str, BillRecord]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Returns (companions, lineage): slug -> other tracked slugs. Companions share a Congress; lineage spans them."""
    keys = {slug: title_key(rec.title) for slug, rec in records.items()}
    comp = _UF(); line = _UF()
    # 1. Congress.gov relations, restricted to tracked bills
    for slug, rec in records.items():
        for r in rec.related:
            if r.id not in records:
                continue
            rel = r.relationship.lower()
            same_congress = r.id.split("-")[0] == slug.split("-")[0]
            if "identical" in rel or (same_congress and "related" in rel and keys[r.id] == keys[slug] and chamber(r.id) != chamber(slug)):
                comp.union(slug, r.id)
            if "reintroduction" in rel or (not same_congress and keys[r.id] == keys[slug]):
                line.union(slug, r.id)
    # 2. exact title match: other chamber same Congress -> companion; other Congress -> lineage
    by_key: dict[str, list[str]] = {}
    for slug, k in keys.items():
        if len(k) >= 8:
            by_key.setdefault(k, []).append(slug)
    for k, slugs in by_key.items():
        for a in slugs:
            for b in slugs:
                if a >= b:
                    continue
                if a.split("-")[0] == b.split("-")[0]:
                    if chamber(a) != chamber(b):
                        comp.union(a, b)
                else:
                    line.union(a, b)
    # companions imply shared lineage
    for slug in records:
        line.union(slug, comp.find(slug))

    def groups(uf: _UF) -> dict[str, list[str]]:
        g: dict[str, list[str]] = {}
        for slug in records:
            g.setdefault(uf.find(slug), []).append(slug)
        return {slug: sorted(x for x in members if x != slug) for members in g.values() for slug in members if len(members) > 1}

    return groups(comp), groups(line)
