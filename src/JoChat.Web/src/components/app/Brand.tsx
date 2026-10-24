import { cn } from '@/lib/utils'

// The JoChat seal: an ochre stamp with a serif "J", set slightly askew like a hand-pressed mark.
export function Seal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-accent-ink text-accent-ink-foreground font-heading inline-flex size-7 shrink-0 -rotate-3 items-center justify-center rounded-[3px] text-base leading-none font-bold shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,currentColor_22%,transparent)]',
        className,
      )}
    >
      J
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Seal />
      <span className="font-heading text-xl font-semibold tracking-tight">
        Jo<span className="font-normal italic">Chat</span>
      </span>
    </span>
  )
}

// A persona's initial in an outlined square: the speaker mark beside each reply.
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'border-accent-ink text-foreground font-heading inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] border text-[0.7rem] leading-none font-semibold uppercase',
        className,
      )}
    >
      {name.trim().slice(0, 1) || '?'}
    </span>
  )
}
