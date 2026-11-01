import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AnchoredLayer } from '../../components/anchored-layer'
import type { ViewportAnchor } from '../../lib/place-in-viewport'

export function ColumnTitle({
  name,
  type,
  onClick,
  className = 'min-w-0 flex-1 truncate text-left',
}: {
  name: string
  type: string
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  className?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState<ViewportAnchor | null>(null)
  function show() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
        onClick={onClick}
      >
        {name}
      </button>
      {tip ? (
        <AnchoredLayer
          anchor={tip}
          prefer="above"
          align="start"
          role="tooltip"
          zIndex={100}
          className="pointer-events-none w-max max-w-56 border border-border bg-card px-2 py-1 text-left text-xs font-normal leading-4 text-foreground shadow-md"
        >
          {t(`type_${type}`)}
        </AnchoredLayer>
      ) : null}
    </>
  )
}
