import { ChevronRight } from 'lucide-react'
import { recentTitleParts, type RecentTitleHit } from '../lib/format'

export function SavedRowTitle({ hit }: { hit: RecentTitleHit }) {
  const parts = recentTitleParts(hit)
  if ('prefix' in parts && parts.prefix) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <span className="min-w-0 truncate">{parts.prefix}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate">{parts.title}</span>
      </span>
    )
  }
  return <span className="min-w-0 flex-1 truncate">{parts.title}</span>
}
