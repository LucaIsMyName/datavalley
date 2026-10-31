import { create } from 'zustand'

export type FormulaCell = {
  tableId: string
  rowId: string
  columnId: string
  columnName: string
}

type Frame = { x: number; y: number; width: number; height: number }

type FormulaWindowState = Frame & {
  cell: FormulaCell | null
  open: (cell: FormulaCell) => void
  close: () => void
  move: (x: number, y: number) => void
  resize: (width: number, height: number) => void
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 240

function viewport() {
  if (typeof window === 'undefined') return { width: 1280, height: 800 }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function clampFrame(x: number, y: number, width: number, height: number): Frame {
  const view = viewport()
  const nextWidth = Math.min(Math.max(MIN_WIDTH, width), view.width)
  const nextHeight = Math.min(Math.max(MIN_HEIGHT, height), view.height)
  const maxX = Math.max(0, view.width - nextWidth)
  const maxY = Math.max(0, view.height - nextHeight)
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
    width: nextWidth,
    height: nextHeight,
  }
}

function initialFrame(): Frame {
  const view = viewport()
  return clampFrame(view.width - 484, 72, 460, 380)
}

export const useFormulaWindow = create<FormulaWindowState>((set) => ({
  cell: null,
  ...initialFrame(),
  open: (cell) => set((state) => {
    if (
      state.cell
      && state.cell.tableId === cell.tableId
      && state.cell.rowId === cell.rowId
      && state.cell.columnId === cell.columnId
    ) return state
    return { cell }
  }),
  close: () => set({ cell: null }),
  move: (x, y) => set((state) => {
    const next = clampFrame(x, y, state.width, state.height)
    return { x: next.x, y: next.y }
  }),
  resize: (width, height) => set((state) => {
    const next = clampFrame(state.x, state.y, width, height)
    return next
  }),
}))
