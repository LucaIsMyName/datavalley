import { create } from 'zustand'
import { clampFrame } from '../../stores/formula-window'

const FRAME_KEY = 'datavalley.ai.frame'

type Frame = { x: number; y: number; width: number; height: number }

function viewport() {
  if (typeof window === 'undefined') return { width: 1280, height: 800 }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function defaultAiFrame(): Frame {
  const view = viewport()
  return clampFrame(view.width - 400, view.height - 528, 384, 512)
}

export function frameFromStorage(value: unknown, fallback: Frame): Frame {
  if (!value || typeof value !== 'object') return fallback
  const record = value as Record<string, unknown>
  const numbers = [record.x, record.y, record.width, record.height]
  if (numbers.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return fallback
  return clampFrame(record.x as number, record.y as number, record.width as number, record.height as number)
}

function loadFrame(): Frame {
  const fallback = defaultAiFrame()
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(FRAME_KEY)
    if (!raw) return fallback
    return frameFromStorage(JSON.parse(raw) as unknown, fallback)
  } catch {
    return fallback
  }
}

function saveFrame(frame: Frame) {
  try {
    localStorage.setItem(FRAME_KEY, JSON.stringify(frame))
  } catch {
    // The window still moves for this visit when storage is unavailable.
  }
}

type AiFrameState = Frame & {
  move: (x: number, y: number) => void
  resize: (width: number, height: number) => void
}

export const useAiFrame = create<AiFrameState>((set) => ({
  ...loadFrame(),
  move: (x, y) => set((state) => {
    const next = clampFrame(x, y, state.width, state.height)
    const frame = { x: next.x, y: next.y, width: state.width, height: state.height }
    saveFrame(frame)
    return { x: frame.x, y: frame.y }
  }),
  resize: (width, height) => set((state) => {
    const next = clampFrame(state.x, state.y, width, height)
    saveFrame(next)
    return next
  }),
}))
