import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

// Split into its own chunk: react-markdown + highlight.js are the heaviest dependencies
// and aren't needed until the first message renders. `detect` highlights fenced blocks
// that carry no language tag.
export default function MarkdownContent({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
      {children}
    </Markdown>
  )
}
