import type { CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

const toastVars = {
  '--normal-bg': 'var(--card)',
  '--normal-text': 'var(--foreground)',
  '--normal-border': 'var(--border)',
  '--error-bg': 'var(--card)',
  '--error-text': 'var(--danger)',
  '--error-border': 'var(--border)',
} as CSSProperties

export function Toaster() {
  return <Sonner position="bottom-right" richColors theme="light" style={toastVars} />
}
