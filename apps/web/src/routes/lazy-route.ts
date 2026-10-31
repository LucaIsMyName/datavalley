import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from 'react'

export function lazyRoute<Exports extends Record<string, unknown>>(
  load: () => Promise<Exports>,
  name: keyof Exports & string,
  fallback: ReactNode,
) {
  const Page = lazy(() => load().then((module) => ({ default: module[name] as ComponentType })))
  return function LazyRoute() {
    return createElement(Suspense, { fallback }, createElement(Page))
  }
}
