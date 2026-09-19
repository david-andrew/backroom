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
        A record of bills that were designed to help ordinary people, and what Congress did with them. Most were never allowed a vote.
        The site does not argue motives. It shows who proposed each bill, who it would have helped, who would have paid, and the recorded decisions that determined the outcome, with a link to every source.
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

      <h2>How bills are found</h2>
      <p>
        Every bill introduced in a Congress is scored from its title by a fast, inexpensive model on two questions: how much it would help ordinary people, and how much it would cost a concentrated interest. The highest-scoring bills get the full treatment above.
      </p>

      <h2>How the ranking works</h2>
      <p>Each analyzed bill receives four scores from 0 to 10:</p>
      <ul>
        <li><b>Public benefit</b>: breadth and directness of benefit to ordinary people.</li>
        <li><b>Cost to concentrated interests</b>: how much a specific industry, the wealthiest households, or incumbent officeholders would lose.</li>
        <li><b>Buried</b>: 10 means the bill had real support and was never allowed a vote. 0 means it got a fair up-or-down vote on the merits and lost.</li>
        <li><b>Support vs. result</b>: the gap between apparent support (cosponsors, bipartisan sponsorship, passing one chamber) and what happened.</li>
      </ul>
      {w && (
        <p>
          The rank score is a weighted sum: {Object.entries(w).map(([k, v]) => `${k.replace(/_/g, ' ')} × ${v}`).join(', ')}, scaled by the model's stated confidence in its own sourcing.
          The weights live in the build step, so the ordering can be re-tuned without re-running any model.
        </p>
      )}

      <h2>What this site is not</h2>
      <p>
        It is not a list of every bill, and it is not neutral about which bills matter: the selection criterion is bills that would take something from a powerful group and give it to everyone else.
        Within that selection, the aim is to be accurate and fair, including about the drawbacks of each bill.
      </p>
    </article>
  )
}
