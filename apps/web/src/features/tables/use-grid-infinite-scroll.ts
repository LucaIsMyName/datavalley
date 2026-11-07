import { useEffect, useRef, type RefObject } from 'react'

type PageFetcher = {
  hasNext: boolean
  fetching: boolean
  fetch: () => Promise<unknown>
}

export function useGridInfiniteScroll(
  parentRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
  displayMode: string,
  rowsQuery: { hasNextPage?: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> },
) {
  const pageState = useRef<PageFetcher>({ hasNext: false, fetching: false, fetch: async () => undefined })
  pageState.current = {
    hasNext: Boolean(rowsQuery.hasNextPage),
    fetching: rowsQuery.isFetchingNextPage,
    fetch: rowsQuery.fetchNextPage,
  }
  useEffect(() => {
    const parent = parentRef.current
    if (!parent || !ready) return
    const load = () => {
      const state = pageState.current
      const nearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 288
      if (!nearBottom || !state.hasNext || state.fetching) return
      void state.fetch()
    }
    parent.addEventListener('scroll', load, { passive: true })
    return () => parent.removeEventListener('scroll', load)
  }, [displayMode, parentRef, ready])
}

export function useGridViewportWidth(
  parentRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
  displayMode: string,
  setViewportWidth: (width: number) => void,
) {
  useEffect(() => {
    const parent = parentRef.current
    if (!parent || !ready) return
    const measure = () => setViewportWidth(parent.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [displayMode, parentRef, ready, setViewportWidth])
}
