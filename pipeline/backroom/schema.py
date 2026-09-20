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


class MemberVote(BaseModel):
    name: str
    party: str
    state: str
    cast: Literal["yea", "nay", "present", "not_voting"]
    bioguide_id: str | None = None   # House XML carries it; Senate votes are matched later by name+state


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
    members: list[MemberVote] = Field(default_factory=list)


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


Evidence = Literal["record", "widely_reported"]


class Actor(BaseModel):
    name: str
    role: str = Field(description="e.g. 'Senate Majority Leader', 'Chair, House Ways and Means', 'President', '41 Senate Republicans'")
    party: str | None = Field(default=None, description="D, R, I, or null for a group/institution")
    what_they_did: str
    direct: bool = Field(description="True if they acted on the bill itself (sponsored, voted, scheduled, refused to schedule). False for outside pressure.")
    evidence: Evidence = Field(description="'record' if supported by the provided sources; 'widely_reported' if this is well-known public reporting not in the provided sources")
    sources: list[str] = Field(description="Source ids; may be empty only when evidence is 'widely_reported'")


class Sides(BaseModel):
    for_: list[Actor] = Field(alias="for", description="People and groups who pushed the bill forward, most consequential first")
    against: list[Actor] = Field(description="People and groups who stopped, stalled, or opposed it, most consequential first")
    party_line: Literal["party_line", "mostly_party_line", "bipartisan", "unclear"] = Field(description="Whether support and opposition split by party")
    party_line_note: str = Field(description="One plain sentence on the partisan shape, with numbers where the record has them")

    model_config = {"populate_by_name": True}


class Outcome(BaseModel):
    status: Status
    mechanism: str = Field(description="One plain sentence: how it ended or where it sits, the way you would tell a friend")
    narrative: list[Claim]
    who_came_out_ahead: str = Field(description="1-2 sentences: who benefits from this outcome. For a helpful bill that died, who is better off because it died. For a harmful bill that passed, who gained.")


Direction = Literal["for_working_people", "for_concentrated_interests", "mixed"]


class Scores(BaseModel):
    public_stakes: int = Field(ge=0, le=10, description="How much ordinary people stand to gain or lose from this bill, either direction")
    concentrated_stakes: int = Field(ge=0, le=10, description="How much a specific industry, the wealthiest households, or officeholders stand to gain or lose")
    outcome_against_public: int = Field(ge=0, le=10, description="How much the outcome went against ordinary people. Helpful bill buried without a vote = 10; helpful bill that got a fair vote and lost = 3; harmful bill that became law = 10; helpful bill that became law = 0")
    support_mismatch: int = Field(ge=0, le=10, description="Gap between apparent support (cosponsors, bipartisan sponsorship, passing one chamber, polling in sources) and the result")
    corruption_relevance: int = Field(ge=0, le=10, description="How directly the bill concerns corruption or self-dealing by officeholders, money in politics, lobbying, or ethics enforcement. A congressional stock-trading ban = 10; a minimum wage bill = 1")
    confidence: float = Field(ge=0, le=1, description="How well the provided sources support this analysis")


class IndustryEffect(BaseModel):
    industry: str = Field(description="A specific industry or interest, e.g. 'Health insurers', 'Brand-name drug makers', 'Farm equipment manufacturers'")
    effect: Literal["gains", "loses", "entrenched", "mixed"] = Field(description="What the bill does to this industry. 'entrenched' = the bill locks in the industry's role or revenue even while regulating it")
    stance_toward_public: Literal["aligned", "opposed", "mixed"] = Field(description="In this bill, does the industry's interest run alongside ordinary people's ('aligned': both win or both lose together) or against it ('opposed': the industry's gain is the public's cost, or vice versa)")
    note: str = Field(description="One or two plain sentences: what the bill does to this industry and why it matters for ordinary people")
    sources: list[str]


class Analysis(BaseModel):
    one_liner: str = Field(description="One sentence, under 20 words, saying what the bill does in plain language. No bill number, no dates.")
    headline: str = Field(description="One factual sentence about the outcome, with numbers where the record has them, no jargon")
    direction: Direction = Field(description="Who the bill mainly serves: ordinary working people, concentrated wealth/power, or genuinely mixed")
    plain_summary: str = Field(description="2-4 sentences: what the bill would do, in plain language")
    who_benefits: str = Field(description="Who gains if the bill passes, and how")
    who_benefits_short: str = Field(description="Under 8 words, e.g. 'Hourly workers earning under $15'")
    how_it_helps: list[Claim] = Field(description="What the bill does for the people it serves. If the bill mainly serves concentrated interests, what it does for them.")
    who_pays: str = Field(description="Who bears the cost if the bill passes, and how")
    who_pays_short: str = Field(description="Under 8 words, e.g. 'Large employers and franchise chains'")
    drawbacks: list[Claim]
    benefit_vs_cost: str = Field(description="Honest weighing. If the drawbacks are serious, say so.")
    outcome: Outcome
    who_came_out_ahead_short: str = Field(description="Under 10 words: who is better off because of what actually happened")
    sides: Sides
    industries: list[IndustryEffect] = Field(description="Each industry or concentrated interest materially affected, most affected first. Include industries the bill entrenches even while it helps people.")
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
