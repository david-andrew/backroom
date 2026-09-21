import { index, loadIndex } from '../data'
import { useEffect } from 'preact/hooks'

export function About() {
  useEffect(() => { loadIndex() }, [])
  const w = index.value?.weights
  return (
    <article class="prose">
      <h1>How this works</h1>

      <h2>What this site is</h2>
      <p>
        A record that asks one question of Congress: whose interests is it looking out for, everyday working people or the ruling class?
        It tracks two kinds of bills. Bills that would help ordinary people at some cost to a concentrated interest, which mostly die quietly.
        And bills that serve concentrated wealth or power, which tend to find a way through.
        For each one it shows what the bill does, who gains, who pays, what Congress did with it, who was for and against it, and who came out ahead. Every claim links to its source.
        The site does not argue motives.
      </p>

      <h2>Where the facts come from</h2>
      <ul>
        <li><b>Congress.gov</b> (Library of Congress) for titles, sponsors, cosponsors, committee referrals, the complete action history, summaries by the Congressional Research Service, and bill text.</li>
        <li><b>Senate.gov and the House Clerk</b> for roll-call vote tallies, including the party breakdown.</li>
      </ul>
      <p>Nothing on a bill page is typed by a person. The pipeline is public and reruns on a schedule.</p>

      <h2>Where the interpretation comes from</h2>
      <p>
        A language model reads only the material above for a given bill and writes the plain-language sections: what it would do, who benefits, who pays, drawbacks, what happened, and who decided.
        It is instructed to cite a numbered source for every claim and to leave out anything it cannot support. Each page shows which model and prompt version produced it, and flags any citation that did not resolve to a real source.
        Because the interpretation is model-written, it can be wrong. The links are there so you can check.
      </p>
      <p>
        One deliberate exception: outside pressure on a bill, such as a president lobbying members to switch their votes, usually never appears in the congressional record.
        In the "who was for it, who was against it" block the model may name such an actor when it is widely and credibly reported. Those entries are marked <b>reported</b> and carry no citation, so you can weigh them accordingly.
      </p>

      <h2>How mistakes are caught</h2>
      <p>
        Every analysis is checked against its record by a set of automatic rules: the stated outcome must match the recorded actions, vote tallies in the headline must match a recorded vote, party blocs must fit the caucus, and every citation must resolve.
        Pages that fail a check say so in their provenance block. On top of that, a stronger model re-reads a sample of analyses each week against the full record and reports factual errors; analyses it judges wrong are regenerated.
        The audit reports are committed to the repository alongside the data.
      </p>

      <h2>How bills are found</h2>
      <p>
        Every bill introduced in a Congress is scored from its title by a fast, inexpensive model on two questions: how much it would help ordinary people, and how much it would cost a concentrated interest. The highest-scoring bills get the full treatment above.
      </p>

      <h2>How the ranking works</h2>
      <p>Each analyzed bill receives five scores from 0 to 10. They set the default order of the list and the corruption-relevance sort, and are not shown on their own; the record on each page is meant to speak for itself.</p>
      <ul>
        <li><b>Stakes for the public</b>: how much ordinary people stand to gain or lose, in either direction.</li>
        <li><b>Stakes for concentrated interests</b>: how much a specific industry, the wealthiest households, or incumbent officeholders stand to gain or lose.</li>
        <li><b>Outcome went against the public</b>: 10 means a helpful bill was buried without a vote, or a harmful bill became law. 0 means a helpful bill became law.</li>
        <li><b>Support vs. result</b>: the gap between apparent support (cosponsors, bipartisan sponsorship, passing one chamber) and what happened.</li>
        <li><b>Corruption relevance</b>: how directly the bill concerns self-dealing by officeholders, money in politics, lobbying, or ethics enforcement. This is also available as its own sort order.</li>
      </ul>
      {w && (
        <p>
          The rank score is a weighted sum: {Object.entries(w).map(([k, v]) => `${k.replace(/_/g, ' ')} × ${v}`).join(', ')}, scaled by the model's stated confidence in its own sourcing.
          The weights live in the build step, so the ordering can be re-tuned without re-running any model.
        </p>
      )}

      <h2>Where this is going</h2>
      <p>
        Congress is the start. The same approach, public record in and sourced plain-language analysis out, applies to state legislatures and city councils, where the bills that touch rent, wages, policing, and utilities are written and where far fewer people are watching.
        The pipeline is open source; see the roadmap in the <a href="https://github.com/david-andrew/backroom" target="_blank" rel="noreferrer">repository</a>.
      </p>

      <h2>What this site is not</h2>
      <p>
        It is not a list of every bill, and it is not neutral about which bills matter: the selection criterion is bills that would take something from a powerful group and give it to everyone else.
        Within that selection, the aim is to be accurate and fair, including about the drawbacks of each bill.
      </p>
    </article>
  )
}
