import { describe, it, expect, beforeEach } from 'vitest'
import { useUrlSearchParams, useUrlSearchParam } from './url-search-params.ts'

// happy-dom provides window / history / location. Reset to a clean URL between
// tests so history/search state does not leak across cases.
beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useUrlSearchParams — init from URL', () => {
  it('seeds the signal from location.search', () => {
    window.history.replaceState(null, '', '/?q=shoes&page=2')
    const params = useUrlSearchParams()
    expect(params.get()).toEqual({ q: 'shoes', page: '2' })
    params.destroy()
  })

  it('collapses a single key to a scalar and repeats to an array', () => {
    window.history.replaceState(null, '', '/?k=a&k=b&solo=x')
    const params = useUrlSearchParams()
    expect(params.get()).toEqual({ k: ['a', 'b'], solo: 'x' })
    params.destroy()
  })

  it('is empty for a bare URL', () => {
    const params = useUrlSearchParams()
    expect(params.get()).toEqual({})
    params.destroy()
  })
})

describe('useUrlSearchParams — set writes history', () => {
  it('replace mode (default) updates location.search without growing history', () => {
    const params = useUrlSearchParams()
    const before = window.history.length
    params.set({ q: 'boots' })
    expect(window.location.search).toBe('?q=boots')
    expect(params.get()).toEqual({ q: 'boots' })
    expect(window.history.length).toBe(before)
    params.destroy()
  })

  it('push mode grows history', () => {
    const params = useUrlSearchParams({ replace: false })
    const before = window.history.length
    params.set({ q: 'boots' })
    expect(window.location.search).toBe('?q=boots')
    expect(window.history.length).toBe(before + 1)
    params.destroy()
  })

  it('array values round-trip through the URL', () => {
    const params = useUrlSearchParams()
    params.set({ tag: ['a', 'b'] })
    expect(window.location.search).toBe('?tag=a&tag=b')
    // A fresh binding re-parses the same URL back to an array.
    const reread = useUrlSearchParams()
    expect(reread.get()).toEqual({ tag: ['a', 'b'] })
    params.destroy()
    reread.destroy()
  })

  it('serializes deterministically (sorted keys)', () => {
    const params = useUrlSearchParams()
    params.set({ z: '1', a: '2' })
    expect(window.location.search).toBe('?a=2&z=1')
    params.destroy()
  })
})

describe('useUrlSearchParams — external navigation updates the signal', () => {
  it('popstate re-parses the URL (history mode)', () => {
    const params = useUrlSearchParams()
    let seen: unknown = null
    params.subscribe((v) => { seen = v })

    window.history.replaceState(null, '', '/?from=back')
    window.dispatchEvent(new Event('popstate'))

    expect(params.get()).toEqual({ from: 'back' })
    expect(seen).toEqual({ from: 'back' })
    params.destroy()
  })
})

describe('useUrlSearchParams — hash mode', () => {
  it('reads the query portion of the hash', () => {
    window.history.replaceState(null, '', '/#/page?q=hi&n=2')
    const params = useUrlSearchParams({ mode: 'hash' })
    expect(params.get()).toEqual({ q: 'hi', n: '2' })
    params.destroy()
  })

  it('set rewrites the hash query, preserving the hash path', () => {
    window.history.replaceState(null, '', '/#/page?old=1')
    const params = useUrlSearchParams({ mode: 'hash' })
    params.set({ new: '2' })
    expect(window.location.hash).toBe('#/page?new=2')
    params.destroy()
  })

  it('hashchange updates the signal', () => {
    window.history.replaceState(null, '', '/#/page?q=one')
    const params = useUrlSearchParams({ mode: 'hash' })
    window.history.replaceState(null, '', '/#/page?q=two')
    window.dispatchEvent(new Event('hashchange'))
    expect(params.get()).toEqual({ q: 'two' })
    params.destroy()
  })
})

describe('useUrlSearchParams — listener cleanup', () => {
  it('destroy stops responding to events', () => {
    const params = useUrlSearchParams()
    params.destroy()
    window.history.replaceState(null, '', '/?after=destroy')
    window.dispatchEvent(new Event('popstate'))
    expect(params.get()).toEqual({})
  })
})

describe('useUrlSearchParams — no-window guard', () => {
  it('returns an inert signal when window is absent', () => {
    const params = useUrlSearchParams({ window: null })
    expect(params.get()).toEqual({})
    // set must not throw without a window.
    params.set({ q: 'x' })
    expect(params.get()).toEqual({ q: 'x' })
    params.destroy()
  })
})

describe('useUrlSearchParam — focused single key', () => {
  it('reads the first value, defaults to empty string', () => {
    window.history.replaceState(null, '', '/?q=hello')
    const params = useUrlSearchParams()
    const q = useUrlSearchParam(params, 'q')
    expect(q.get()).toBe('hello')
    expect(useUrlSearchParam(params, 'missing').get()).toBe('')
    params.destroy()
  })

  it('writing the key flows back to the URL', () => {
    const params = useUrlSearchParams()
    const q = useUrlSearchParam(params, 'q')
    q.set('boots')
    expect(window.location.search).toBe('?q=boots')
    expect(params.get()).toEqual({ q: 'boots' })
    params.destroy()
  })

  it('writing empty string removes the key', () => {
    window.history.replaceState(null, '', '/?q=x&keep=1')
    const params = useUrlSearchParams()
    const q = useUrlSearchParam(params, 'q')
    q.set('')
    expect(params.get()).toEqual({ keep: '1' })
    expect(window.location.search).toBe('?keep=1')
    params.destroy()
  })
})
