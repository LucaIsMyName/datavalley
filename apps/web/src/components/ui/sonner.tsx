import { useEffect, useState, type CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

const toastVars = {
  '--normal-bg': 'var(--card)',
  '--normal-text': 'var(--foreground)',
  '--normal-border': 'var(--border)',
  '--error-bg': 'var(--card)',
  '--error-text': 'var(--danger)',
  '--error-border': 'var(--border)',
  '--border': 'var(--border)',
} as CSSProperties

function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
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
      richColors
      theme={theme}
      style={toastVars}
      offset={{ bottom: 16, right: 16 }}
      mobileOffset={{ bottom: 72, left: 16, right: 16 }}
      toastOptions={{ className: 'rounded-none w-[min(24rem,calc(100vw-2rem))]' }}
    />
  )
}
