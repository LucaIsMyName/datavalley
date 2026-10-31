import { describe, expect, it } from 'vitest'
import { breadcrumbHidden } from './breadcrumbs'

describe('breadcrumbHidden', () => {
  it('hides breadcrumbs on top-level sidebar routes', () => {
    expect(breadcrumbHidden('/')).toBe(true)
    expect(breadcrumbHidden('/projects')).toBe(true)
    expect(breadcrumbHidden('/recent')).toBe(true)
    expect(breadcrumbHidden('/favorites')).toBe(true)
    expect(breadcrumbHidden('/integrations')).toBe(true)
  })

  it('shows breadcrumbs on nested routes', () => {
    expect(breadcrumbHidden('/projects/p1')).toBe(false)
    expect(breadcrumbHidden('/settings/users')).toBe(false)
    expect(breadcrumbHidden('/doc/use')).toBe(false)
  })
})
