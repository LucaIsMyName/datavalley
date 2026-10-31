import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AnchoredLayer } from './anchored-layer'
import { ResourceIcon, resourceIconNames } from './resource-icon'
import type { ViewportAnchor } from '../lib/place-in-viewport'

function anchorOf(event: ReactMouseEvent): ViewportAnchor {
  const rect = event.currentTarget.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

export function IconButton({
  name,
  onChange,
}: {
  name: string
  onChange: (icon: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<ViewportAnchor | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-popover]')) return
      setOpen(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={t('icon')}
        className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(anchorOf(event))
        }}
      >
        <ResourceIcon name={name} />
      </button>
      {open ? (
        <AnchoredLayer
          popover
          prefer="below"
          align="start"
          anchor={open}
          className="grid w-[min(20rem,calc(100vw-2rem))] grid-cols-8 gap-1 border border-border bg-card p-2 shadow-md"
        >
          {resourceIconNames.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={`${t('icon')} ${icon}`}
              className={`flex h-8 items-center justify-center hover:bg-accent ${icon === name ? 'bg-accent' : ''}`}
              onClick={() => {
                onChange(icon)
                setOpen(null)
              }}
            >
              <ResourceIcon name={icon} />
            </button>
          ))}
        </AnchoredLayer>
      ) : null}
    </>
  )
}
