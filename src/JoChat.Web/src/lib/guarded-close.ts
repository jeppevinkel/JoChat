/**
 * Wraps a dialog's onOpenChange so an editor can't be dismissed with unsaved changes without
 * confirmation. Pair with `disablePointerDismissal` so stray outside clicks never close it.
 */
export function guardedClose(isDirty: () => boolean, onOpenChange: (open: boolean) => void) {
  return (open: boolean) => {
    if (!open && isDirty() && !confirm('Discard unsaved changes?')) return
    onOpenChange(open)
  }
}
