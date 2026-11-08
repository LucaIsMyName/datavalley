import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

const toastSurface = 'var(--muted)'
const toastInk = 'var(--foreground)'

const toastVars = {
  '--border-radius': '0',
  '--normal-bg': toastSurface,
  '--normal-text': toastInk,
  '--normal-border': 'var(--border)',
  '--success-bg': toastSurface,
  '--success-border': toastInk,
  '--success-text': toastInk,
  '--info-bg': toastSurface,
  '--info-border': 'var(--border)',
  '--info-text': toastInk,
  '--warning-bg': toastSurface,
  '--warning-border': 'var(--border)',
  '--warning-text': toastInk,
  '--error-bg': toastSurface,
  '--error-border': 'var(--border)',
  '--error-text': toastInk,
} as CSSProperties

const iconClass = 'size-4 shrink-0'

function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  useEffect(() => {
    const sync = () =>
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export function Toaster() {
  const theme = useResolvedTheme()
  return (
    <Sonner
      position="bottom-right"
      theme={theme}
      style={toastVars}
      offset={{ bottom: 16, right: 16 }}
      mobileOffset={{ bottom: 72, left: 16, right: 16 }}
      toastOptions={{ className: 'rounded-none w-[min(24rem,calc(100vw-2rem))]' }}
      icons={{
        success: <CircleCheck className={iconClass} style={{ color: 'var(--swatch-green-fg)' }} />,
        error: <CircleX className={iconClass} style={{ color: 'var(--danger)' }} />,
        warning: (
          <TriangleAlert className={iconClass} style={{ color: 'var(--swatch-amber-fg)' }} />
        ),
        info: <Info className={iconClass} style={{ color: 'var(--swatch-blue-fg)' }} />,
        loading: <LoaderCircle className={`${iconClass} animate-spin`} />,
      }}
    />
  )
}
