import { describe, it, expect } from 'vitest'
import { prism, composePrism, some, iso } from './prism.ts'

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
