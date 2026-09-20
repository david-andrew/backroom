import { useEffect, useState } from 'preact/hooks'
import { href } from '../router'

interface PromptFile { hash: string; file: string; commit: string; date: string; text: string }
const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const REPO = 'https://github.com/david-andrew/backroom'

export function PromptPage({ hash }: { hash: string }) {
  const [p, setP] = useState<PromptFile | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${base}/data/prompts/${hash}.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`No prompt with hash ${hash}`)))).then(setP, e => setErr(String(e)))
  }, [hash])
  if (err) return <p class="error">{err}</p>
  if (!p) return <p class="muted">Loading…</p>
  const gh = p.commit === 'working-tree' ? `${REPO}/blob/master/${p.file}` : `${REPO}/blob/${p.commit}/${p.file}`
  return (
    <article class="prose">
      <p class="crumbs"><a href={href.home}>← All bills</a></p>
      <h1>Analysis prompt <code>{p.hash}</code></h1>
      <p class="muted">
        This is the exact instruction the model was given for every bill page that lists this hash. Hash is the first ten hex digits of the SHA-256 of the file.
        {p.date && <> Committed {p.date}.</>} <a href={gh} target="_blank" rel="noreferrer">View on GitHub</a> · <a href={`${REPO}/commits/master/${p.file}`} target="_blank" rel="noreferrer">history of changes</a>.
      </p>
      <pre class="prompt-text">{p.text}</pre>
    </article>
  )
}
