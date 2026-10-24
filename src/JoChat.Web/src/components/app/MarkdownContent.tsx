import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

// `detect` highlights fenced blocks with no language tag; aliases map tags people commonly
// write to the grammar highlight.js knows them by (an unknown tag is left unhighlighted).
const highlightOptions = {
  detect: true,
  aliases: {
    javascript: ['node', 'nodejs', 'mjs', 'cjs'],
    typescript: ['tsx'],
    csharp: ['c#', 'dotnet'],
    bash: ['shell', 'zsh', 'fish', 'console', 'terminal'],
    plaintext: ['text', 'txt', 'plain', 'log'],
  },
}

// Split into its own chunk: react-markdown + highlight.js are the heaviest dependencies
// and aren't needed until the first message renders.
export default function MarkdownContent({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, highlightOptions]]}>
      {children}
    </Markdown>
  )
}
