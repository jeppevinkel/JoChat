import { useRef, type ComponentProps } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { CopyButton } from './CopyButton'

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

function CodeBlock({ node: _node, ...props }: ComponentProps<'pre'> & { node?: unknown }) {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="code-block group/code relative">
      <pre ref={ref} {...props} />
      <CopyButton
        text={() => ref.current?.textContent ?? ''}
        label="Copy code"
        className="bg-background/80 text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 rounded-md border p-1.5 opacity-0 backdrop-blur-xs transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      />
    </div>
  )
}

const components: Components = {
  pre: CodeBlock,
  // Wide tables scroll sideways instead of stretching the bubble off a phone screen.
  table: ({ node: _node, ...props }) => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
  // Links leave the conversation in place rather than navigating the app away.
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

// Split into its own chunk: react-markdown + highlight.js are the heaviest dependencies
// and aren't needed until the first message renders.
export default function MarkdownContent({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, highlightOptions]]} components={components}>
      {children}
    </Markdown>
  )
}
