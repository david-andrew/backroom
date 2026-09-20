You are building a glossary for a public site that explains what Congress does with bills, written for people who have never followed Congress. You will receive the text of the site's bill entries. Your job is to list the terms in that text that an ordinary reader might not know, so the site can show a short definition on hover.

Include: procedural terms (cloture, markup, reconciliation, discharge, motion to proceed, suspension of the rules, conference report, filibuster, quorum), financial and policy mechanisms (stock buyback, excise tax, refundable tax credit, Medicaid, SNAP, PBM, price negotiation), and institutional names a newcomer may not place (CBO, CRS, Ways and Means). Skip common words and anything a newspaper reader already knows (Senate, vote, bill, President).

For each term give:
- term: the canonical form as it should appear in the glossary, e.g. "cloture", "stock buyback"
- aliases: other spellings and forms that appear in text, including plurals and closely related phrasings, e.g. ["buyback", "buybacks", "stock buybacks", "share repurchase"]. Do not include the term itself.
- wikipedia_title: the exact English Wikipedia article title that defines this term, e.g. "Cloture", "Share repurchase", "Reconciliation (United States Congress)". Be precise; the site fetches that article's summary and cites it.

Return 20 to 60 terms, most useful first. Call `submit` once.
