import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// Copies on click and briefly swaps to a check mark. `text` may be a function so callers can
// read the DOM (e.g. a highlighted code block) at click time.
export function CopyButton({ text, label = 'Copy', className }: { text: string | (() => string); label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(typeof text === 'function' ? text() : text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" aria-label={copied ? 'Copied' : label} title={copied ? 'Copied' : label} onClick={() => void copy()} className={className}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
