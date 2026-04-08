import { describe, it, expect } from 'vitest'
import { prism, composePrism, some, iso, guard, nullable, tagged } from './prism.ts'

type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }

const circlePrism = prism<Shape, { r: number }>(
  (s) => s.kind === 'circle' ? { r: s.r } : undefined,
  ({ r }) => ({ kind: 'circle', r }),
)

describe('prism laws', () => {
  it('match(inject(b)) = b', () => {
    const b = { r: 5 }
    expect(circlePrism.match(circlePrism.inject(b))).toEqual(b)
  })

  it('if match(a) = b then inject(b) = a', () => {
    const a: Shape = { kind: 'circle', r: 5 }
    const b = circlePrism.match(a)!
    expect(circlePrism.inject(b)).toEqual(a)
  })

  it('returns undefined for non-matching case', () => {
    const a: Shape = { kind: 'rect', w: 3, h: 4 }
    expect(circlePrism.match(a)).toBeUndefined()
  })
})

describe('composePrism', () => {
  type Wrapper = { shape: Shape } | { empty: true }

  const shapePrism = prism<Wrapper, Shape>(
    (w) => 'shape' in w ? w.shape : undefined,
    (shape) => ({ shape }),
  )

  const composed = composePrism(shapePrism, circlePrism)

  it('matches through composition', () => {
    const w: Wrapper = { shape: { kind: 'circle', r: 3 } }
    expect(composed.match(w)).toEqual({ r: 3 })
  })

  it('returns undefined when outer does not match', () => {
    const w: Wrapper = { empty: true }
    expect(composed.match(w)).toBeUndefined()
  })

  it('returns undefined when inner does not match', () => {
    const w: Wrapper = { shape: { kind: 'rect', w: 1, h: 2 } }
    expect(composed.match(w)).toBeUndefined()
  })

  it('injects through composition', () => {
    expect(composed.inject({ r: 7 })).toEqual({ shape: { kind: 'circle', r: 7 } })
  })
})

describe('some', () => {
  it('matches defined values', () => expect(some<number>().match(5)).toBe(5))
  it('matches undefined', () => expect(some<number>().match(undefined)).toBeUndefined())
  it('injects', () => expect(some<number>().inject(5)).toBe(5))
})

describe('iso', () => {
  const strNum = iso<string, number>(Number, String)
  it('matches via to', () => expect(strNum.match('42')).toBe(42))
  it('injects via from', () => expect(strNum.inject(42)).toBe('42'))
})

describe('guard', () => {
  const positive = guard((n: number): n is number => n > 0)
  it('matches when predicate holds', () => expect(positive.match(5)).toBe(5))
  it('returns undefined when predicate fails', () => expect(positive.match(-1)).toBeUndefined())
  it('injects', () => expect(positive.inject(3)).toBe(3))
})

describe('nullable', () => {
  const p = nullable<number>()
  it('matches non-null values', () => expect(p.match(0)).toBe(0))
  it('returns undefined for null', () => expect(p.match(null)).toBeUndefined())
  it('injects', () => expect(p.inject(5)).toBe(5))
})

describe('tagged', () => {
  type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }
  const circle = tagged<Shape>('kind', 'circle')
  const rect   = tagged<Shape>('kind', 'rect')

  it('matches the correct variant', () => {
    expect(circle.match({ kind: 'circle', r: 3 })).toEqual({ kind: 'circle', r: 3 })
  })
  it('returns undefined for non-matching variant', () => {
    expect(circle.match({ kind: 'rect', w: 1, h: 2 })).toBeUndefined()
  })
  it('injects preserving the full shape', () => {
    expect(circle.inject({ kind: 'circle', r: 7 })).toEqual({ kind: 'circle', r: 7 })
  })
  it('match(inject(b)) = b', () => {
    const b = { kind: 'circle' as const, r: 5 }
    expect(circle.match(circle.inject(b))).toEqual(b)
  })
  it('handles the other variant independently', () => {
    expect(rect.match({ kind: 'rect', w: 2, h: 4 })).toEqual({ kind: 'rect', w: 2, h: 4 })
    expect(rect.match({ kind: 'circle', r: 1 })).toBeUndefined()
  })
})
