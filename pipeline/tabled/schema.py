"""Data shapes. `BillRecord` is machine facts; `Analysis` is model-written and
must cite `BillRecord.sources` by id."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

BillType = Literal["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"]


class BillId(BaseModel):
    congress: int
    type: BillType
    number: int

    @property
    def slug(self) -> str:
        return f"{self.congress}-{self.type}{self.number}"

    @classmethod
    def parse(cls, s: str) -> "BillId":
        """Accepts '118-s413', '118/s/413', or 'S.413 (118th)'-ish forms."""
        s = s.strip().lower().replace(".", "").replace(" ", "")
        for sep in ("-", "/"):
            if sep in s:
                parts = s.split(sep)
                if len(parts) == 2:
                    congress, rest = parts
                    t = "".join(c for c in rest if c.isalpha())
                    n = "".join(c for c in rest if c.isdigit())
                    return cls(congress=int(congress), type=t, number=int(n))  # type: ignore[arg-type]
                if len(parts) == 3:
                    return cls(congress=int(parts[0]), type=parts[1], number=int(parts[2]))  # type: ignore[arg-type]
        raise ValueError(f"cannot parse bill id {s!r}")


class Person(BaseModel):
    bioguide_id: str
    name: str
    party: str | None = None
    state: str | None = None


class RecordedVote(BaseModel):
    chamber: str
    date: str
    roll_number: int
    session: int | None = None
    url: str
    question: str | None = None
    result: str | None = None
    yea: int | None = None
    nay: int | None = None
    # party -> {"yea": n, "nay": n}
    by_party: dict[str, dict[str, int]] | None = None


class Action(BaseModel):
    date: str
    text: str
    chamber: str | None = None
    action_code: str | None = None
    votes: list[RecordedVote] = Field(default_factory=list)


class Committee(BaseModel):
    name: str
    chamber: str
    activities: list[str] = Field(default_factory=list)


class Source(BaseModel):
    """Something the model is allowed to cite. `id` is what it cites."""
    id: str
    kind: Literal["bill_page", "summary", "text", "action", "vote", "cosponsors", "committee", "other"]
    label: str
    url: str
    date: str | None = None
    excerpt: str | None = None


class BillRecord(BaseModel):
    id: str
    congress: int
    type: BillType
    number: int
    display: str                      # "S. 413"
    title: str
    short_title: str | None = None
    origin_chamber: str | None = None
    introduced: str | None = None
    policy_area: str | None = None
    subjects: list[str] = Field(default_factory=list)
    sponsors: list[Person] = Field(default_factory=list)
    cosponsors: list[Person] = Field(default_factory=list)
    cosponsor_party_counts: dict[str, int] = Field(default_factory=dict)
    committees: list[Committee] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)
    latest_action: Action | None = None
    summaries: list[dict] = Field(default_factory=list)   # {version, date, text}
    text_url: str | None = None
    text_chars: int = 0
    congress_gov_url: str
    congress_ended: bool
    sources: list[Source] = Field(default_factory=list)
    fetched_at: str
    content_hash: str = ""   # hash of everything above except fetched_at; analyses key on this


# ---- model output -----------------------------------------------------------

Status = Literal[
    "pending",                          # Congress still in session, no final outcome yet
    "never_got_a_vote",                 # sat in committee or on the calendar until the Congress ended
    "passed_one_chamber_then_stalled",  # House or Senate passed it; the other never voted
    "blocked_from_a_vote",              # a procedural vote (e.g. cloture) kept it off the floor
    "voted_down",                       # lost an up-or-down vote on the merits
    "weakened",                         # passed only after its key provisions were stripped
    "became_law",
    "vetoed",
]

CATEGORIES = [
    "wages_and_labor",
    "healthcare_and_drug_prices",
    "taxes_on_wealth_and_corporations",
    "consumer_protection_and_finance",
    "housing",
    "corruption_and_ethics",
    "voting_and_democracy",
    "antitrust_and_competition",
    "environment_and_energy",
    "education_and_student_debt",
    "social_safety_net",
    "other",
]


class Claim(BaseModel):
    text: str
    sources: list[str] = Field(description="Source ids from the provided list that support this claim")


class Actor(BaseModel):
    name: str
    role: str = Field(description="e.g. 'Senate Majority Leader', 'Chair, House Ways and Means'")
    party: str | None = None
    what_they_did: str
    sources: list[str]


class Outcome(BaseModel):
    status: Status
    mechanism: str = Field(description="One sentence: the procedural way it ended or stalled")
    narrative: list[Claim]


class Scores(BaseModel):
    public_benefit: int = Field(ge=0, le=10, description="How much, and how directly, ordinary people would gain")
    concentrated_cost: int = Field(ge=0, le=10, description="How much a specific industry, wealthy group, or officeholders would lose")
    burial: int = Field(ge=0, le=10, description="10 = never allowed a vote despite viability; 0 = got a fair up-or-down vote")
    support_mismatch: int = Field(ge=0, le=10, description="Gap between apparent public/bipartisan support and what Congress did")
    confidence: float = Field(ge=0, le=1, description="How well the provided sources support this analysis")


class Analysis(BaseModel):
    headline: str = Field(description="One factual sentence, no editorializing, e.g. 'Passed the House 231-199; never received a Senate vote.'")
    plain_summary: str = Field(description="2-4 sentences: what the bill would do, in plain language")
    who_benefits: str
    how_it_helps: list[Claim]
    who_pays: str = Field(description="Which concentrated interests bear the cost, and how")
    drawbacks: list[Claim]
    benefit_vs_cost: str = Field(description="Honest weighing. If the drawbacks are serious, say so.")
    outcome: Outcome
    key_actors: list[Actor] = Field(description="People or groups whose decisions most determined the outcome, most influential first")
    trajectory: str | None = Field(default=None, description="Only if the Congress is still in session: likely path from here")
    categories: list[str]
    scores: Scores


class AnalysisFile(BaseModel):
    """What gets written to data/analyses/<slug>.json"""
    bill_id: str
    model: str
    prompt_version: str
    generated_at: str
    record_fetched_at: str
    record_hash: str = ""
    analysis: Analysis
    unresolved_citations: list[str] = Field(default_factory=list)
