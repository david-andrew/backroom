import { useState } from 'preact/hooks'
import type { Term as T } from '../glossary'

/** Dotted-underlined term with a hover/tap tooltip carrying the definition and its source. */
export function Term({ text, term }: { text: string; term: T }) {
  const [open, setOpen] = useState(false)
  return (
    <span class={`term ${open ? 'open' : ''}`} onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
      {text}
      <span class="tip" role="tooltip">
        <b>{term.term}</b>
        <span class="tip-def">{term.definition}</span>
        <a class="tip-src" href={term.source.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{term.source.name}: {term.source.title}</a>
      </span>
    </span>
  )
}
