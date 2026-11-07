import { describe, expect, it } from 'vitest'
import { breadcrumbHidden, topLevelCrumbKey } from './breadcrumbs'

describe('breadcrumbHidden', () => {
  it('hides breadcrumbs on top-level sidebar routes', () => {
    expect(breadcrumbHidden('/')).toBe(true)
    expect(breadcrumbHidden('/projects')).toBe(true)
    expect(breadcrumbHidden('/recent')).toBe(true)
    expect(breadcrumbHidden('/favorites')).toBe(true)
    expect(breadcrumbHidden('/media')).toBe(true)
    expect(breadcrumbHidden('/integrations')).toBe(true)
  })

  it('names the media page instead of falling back to the dashboard', () => {
    expect(topLevelCrumbKey('/media')).toBe('media')
    expect(topLevelCrumbKey('/unknown')).toBe('dashboard')
  })

  it('shows breadcrumbs on nested routes', () => {
    expect(breadcrumbHidden('/projects/p1')).toBe(false)
    expect(breadcrumbHidden('/settings/users')).toBe(false)
    expect(breadcrumbHidden('/doc/use')).toBe(false)
  })
})
