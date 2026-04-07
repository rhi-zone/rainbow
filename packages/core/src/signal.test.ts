import { describe, it, expect, vi } from 'vitest'
import { signal } from './signal.ts'
import { field, composeLens } from './lens.ts'
import { prism } from './prism.ts'

describe('signal basics', () => {
  it('gets initial value', () => {
    const s = signal(42)
    expect(s.get()).toBe(42)
  })

  it('sets value', () => {
    const s = signal(42)
    s.set(99)
    expect(s.get()).toBe(99)
  })

  it('notifies subscribers on change', () => {
    const s = signal(0)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(1)
    expect(fn).toHaveBeenCalledWith(1)
  })

  it('does not notify when value unchanged', () => {
    const s = signal(0)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(0)
    expect(fn).not.toHaveBeenCalled()
  })

  it('unsubscribes', () => {
    const s = signal(0)
    const fn = vi.fn()
    const unsub = s.subscribe(fn)
    unsub()
    s.set(1)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('signal.map', () => {
  it('derives value', () => {
    const s = signal(2)
    const doubled = s.map((x) => x * 2)
    expect(doubled.get()).toBe(4)
  })

  it('updates when source changes', () => {
    const s = signal(2)
    const doubled = s.map((x) => x * 2)
    const fn = vi.fn()
    doubled.subscribe(fn)
    s.set(3)
    expect(fn).toHaveBeenCalledWith(6)
  })

  it('does not notify when derived value unchanged', () => {
    const s = signal(2)
    const parity = s.map((x) => x % 2)
    const fn = vi.fn()
    parity.subscribe(fn)
    s.set(4) // still even
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('signal.focus (lens)', () => {
  type User = { name: string; age: number }
  const nameLens = field<User, 'name'>('name')

  it('gets focused value', () => {
    const s = signal<User>({ name: 'Alice', age: 30 })
    expect(s.focus(nameLens).get()).toBe('Alice')
  })

  it('sets focused value without touching other fields', () => {
    const s = signal<User>({ name: 'Alice', age: 30 })
    s.focus(nameLens).set('Bob')
    expect(s.get()).toEqual({ name: 'Bob', age: 30 })
  })

  it('notifies when focused field changes', () => {
    const s = signal<User>({ name: 'Alice', age: 30 })
    const name = s.focus(nameLens)
    const fn = vi.fn()
    name.subscribe(fn)
    name.set('Bob')
    expect(fn).toHaveBeenCalledWith('Bob')
  })

  it('does not notify when other field changes', () => {
    const s = signal<User>({ name: 'Alice', age: 30 })
    const name = s.focus(nameLens)
    const fn = vi.fn()
    name.subscribe(fn)
    s.set({ name: 'Alice', age: 31 })
    expect(fn).not.toHaveBeenCalled()
  })

  it('composes focuses', () => {
    type Outer = { user: User }
    const userLens = field<Outer, 'user'>('user')
    const s = signal<Outer>({ user: { name: 'Alice', age: 30 } })
    const name = s.focus(userLens).focus(nameLens)
    expect(name.get()).toBe('Alice')
    name.set('Bob')
    expect(s.get()).toEqual({ user: { name: 'Bob', age: 30 } })
  })
})

describe('signal.narrow (prism)', () => {
  type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }

  const circlePrism = prism<Shape, { r: number }>(
    (s) => s.kind === 'circle' ? { r: s.r } : undefined,
    ({ r }) => ({ kind: 'circle', r }),
  )

  it('matches when case holds', () => {
    const s = signal<Shape>({ kind: 'circle', r: 5 })
    expect(s.narrow(circlePrism).get()).toEqual({ r: 5 })
  })

  it('returns undefined when case does not hold', () => {
    const s = signal<Shape>({ kind: 'rect', w: 3, h: 4 })
    expect(s.narrow(circlePrism).get()).toBeUndefined()
  })

  it('sets through prism', () => {
    const s = signal<Shape>({ kind: 'circle', r: 5 })
    s.narrow(circlePrism).set({ r: 10 })
    expect(s.get()).toEqual({ kind: 'circle', r: 10 })
  })

  it('ignores set of undefined', () => {
    const s = signal<Shape>({ kind: 'circle', r: 5 })
    s.narrow(circlePrism).set(undefined)
    expect(s.get()).toEqual({ kind: 'circle', r: 5 })
  })
})
