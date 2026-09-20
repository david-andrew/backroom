/**
 * Redrawn from Gilens & Page (2014), "Testing Theories of American Politics", Figure 1:
 * predicted probability that a proposed policy change is adopted, by the share of a
 * group that favors it. Points are read off the published curves, so treat them as
 * an approximation of the figure, not the underlying data.
 */
const AVERAGE = [[0, 0.30], [10, 0.30], [20, 0.30], [30, 0.31], [40, 0.31], [50, 0.31], [60, 0.31], [70, 0.32], [80, 0.32], [90, 0.32], [100, 0.32]]
const ELITES = [[0, 0.04], [10, 0.08], [20, 0.13], [30, 0.18], [40, 0.24], [50, 0.31], [60, 0.38], [70, 0.45], [80, 0.52], [90, 0.58], [100, 0.62]]

const W = 640, H = 330, L = 52, R = 130, T = 24, B = 48
const x = (p: number) => L + (p / 100) * (W - L - R)
const y = (v: number) => T + (1 - v / 0.7) * (H - T - B)
const path = (pts: number[][]) => pts.map(([p, v], i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

export function GilensPageChart() {
  return (
    <figure class="gp-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="gp-title gp-desc">
        <title id="gp-title">Chance a policy is adopted, by how many people want it</title>
        <desc id="gp-desc">When support among average citizens rises from 0 to 100 percent, the chance of adoption stays flat near 30 percent. When support among the wealthiest tenth rises from 0 to 100 percent, the chance climbs from about 4 percent to about 62 percent.</desc>
        {[0, 0.2, 0.4, 0.6].map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="gp-grid" />
            <text x={L - 8} y={y(v) + 4} class="gp-tick" text-anchor="end">{Math.round(v * 100)}%</text>
          </g>
        ))}
        {[0, 50, 100].map(p => (
          <text key={p} x={x(p)} y={H - B + 18} class="gp-tick" text-anchor="middle">{p}%</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} class="gp-axis" text-anchor="middle">Share of the group that wants the policy</text>
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} class="gp-axis" text-anchor="middle">Chance it becomes law</text>
        <path d={path(AVERAGE)} class="gp-line gp-people" />
        <path d={path(ELITES)} class="gp-line gp-elite" />
        <circle cx={x(100)} cy={y(0.32)} r="4" class="gp-dot gp-people" />
        <circle cx={x(100)} cy={y(0.62)} r="4" class="gp-dot gp-elite" />
        <text x={x(100) + 10} y={y(0.32) + 4} class="gp-label gp-people-ink">Average citizens</text>
        <text x={x(100) + 10} y={y(0.62) + 4} class="gp-label gp-elite-ink">Wealthiest 10%</text>
      </svg>
      <figcaption>
        What people want barely moves Congress unless they are rich. Redrawn from Gilens and Page,{' '}
        <a href="https://doi.org/10.1017/S1537592714001595" target="_blank" rel="noreferrer">“Testing Theories of American Politics” (2014)</a>, Figure 1,
        which modeled 1,779 policy questions from 1981 to 2002. A{' '}
        <a href="https://doi.org/10.1017/S1537592721002188" target="_blank" rel="noreferrer">2024 systematic review of 25 studies</a> found the same pattern across the literature.
      </figcaption>
    </figure>
  )
}
