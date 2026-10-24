// Heuristics for wrapping pasted code in a Markdown fence, so it keeps its line breaks and
// indentation and gets syntax-highlighted instead of collapsing into one paragraph.

const KEYWORD_LINE =
  /^\s*(import|from|export|def|class|function|const|let|var|public|private|protected|static|return|if|else|for|foreach|while|switch|case|try|catch|async|await|using|namespace|package|fn|func|impl|struct|enum|interface|type|#include|#!|SELECT|INSERT|UPDATE|DELETE|CREATE)\b/
const SYNTAX = /=>|::|->|\)\s*\{|<\/?[A-Za-z][\w-]*[\s/>]|^\s*[}\])]/
const TRAILING = /[;{}(,[]\s*$/
// Indented lines count, except indented Markdown list items (nested bullets in prose).
const INDENTED = /^(?: {2,}|\t)(?![-*+]\s|\d+[.)]\s)\S/

/** True for multi-line text where most lines look like source code, logs or markup. */
export function looksLikeCode(text: string): boolean {
  if (text.includes('```')) return false
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 3) return false
  const codeLike = lines.filter((l) => INDENTED.test(l) || TRAILING.test(l) || KEYWORD_LINE.test(l) || SYNTAX.test(l))
  return codeLike.length / lines.length >= 0.5
}

/** Whether `offset` in `text` sits inside an open ``` fence (so a paste there needs no new one). */
export function insideFence(text: string, offset: number): boolean {
  return ((text.slice(0, offset).match(/^\s*```/gm) ?? []).length) % 2 === 1
}

/** The pasted code wrapped in a fence, each fence line on its own line relative to the cursor. */
export function fenced(code: string, before: string, after: string): string {
  const body = code.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  const lead = before && !before.endsWith('\n') ? '\n' : ''
  const trail = after.startsWith('\n') ? '' : '\n'
  return `${lead}\`\`\`\n${body}\n\`\`\`${trail}`
}
