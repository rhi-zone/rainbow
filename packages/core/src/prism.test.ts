import { describe, it, expect } from 'vitest'
import { prism, composePrism, some, iso, guard, nullable, tagged, taggedIn } from './prism.ts'

type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }

const circlePrism = prism<Shape, { r: number }>(
  (s) => s.kind === 'circle' ? { r: s.r } : undefined,
  ({ r }) => ({ kind: 'circle', r }),
)

describe('prism laws', () => {
  it('match(inject(b)) = b', () => {
    const b = { r: 5 }
    expect(circlePrism.view(circlePrism.review(b))).toEqual(b)
  })

  it('if match(a) = b then inject(b) = a', () => {
    const a: Shape = { kind: 'circle', r: 5 }
    const b = circlePrism.view(a)!
    expect(circlePrism.review(b)).toEqual(a)
  })

  it('returns undefined for non-matching case', () => {
    const a: Shape = { kind: 'rect', w: 3, h: 4 }
    expect(circlePrism.view(a)).toBeUndefined()
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
    expect(composed.view(w)).toEqual({ r: 3 })
  })

  it('returns undefined when outer does not match', () => {
    const w: Wrapper = { empty: true }
    expect(composed.view(w)).toBeUndefined()
  })

  it('returns undefined when inner does not match', () => {
    const w: Wrapper = { shape: { kind: 'rect', w: 1, h: 2 } }
    expect(composed.view(w)).toBeUndefined()
  })

  it('injects through composition', () => {
    expect(composed.review({ r: 7 })).toEqual({ shape: { kind: 'circle', r: 7 } })
  })
})

describe('some', () => {
  it('matches defined values', () => expect(some<number>().view(5)).toBe(5))
  it('matches undefined', () => expect(some<number>().view(undefined)).toBeUndefined())
  it('injects', () => expect(some<number>().review(5)).toBe(5))
})

describe('iso', () => {
  const strNum = iso<string, number>(Number, String)
  it('matches via to', () => expect(strNum.view('42')).toBe(42))
  it('injects via from', () => expect(strNum.review(42)).toBe('42'))
})

describe('guard', () => {
  const positive = guard((n: number): n is number => n > 0)
  it('matches when predicate holds', () => expect(positive.view(5)).toBe(5))
  it('returns undefined when predicate fails', () => expect(positive.view(-1)).toBeUndefined())
  it('injects', () => expect(positive.review(3)).toBe(3))
})

describe('nullable', () => {
  const p = nullable<number>()
  it('matches non-null values', () => expect(p.view(0)).toBe(0))
  it('returns undefined for null', () => expect(p.view(null)).toBeUndefined())
  it('injects', () => expect(p.review(5)).toBe(5))
})

describe('tagged', () => {
  type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }
  const circle = tagged<Shape, 'kind', 'circle'>('kind', 'circle')
  const rect   = tagged<Shape, 'kind', 'rect'>('kind', 'rect')

  it('matches the correct variant', () => {
    expect(circle.view({ kind: 'circle', r: 3 })).toEqual({ kind: 'circle', r: 3 })
  })
  it('returns undefined for non-matching variant', () => {
    expect(circle.view({ kind: 'rect', w: 1, h: 2 })).toBeUndefined()
  })
  it('injects preserving the full shape', () => {
    expect(circle.review({ kind: 'circle', r: 7 })).toEqual({ kind: 'circle', r: 7 })
  })
  it('match(inject(b)) = b', () => {
    const b = { kind: 'circle' as const, r: 5 }
    expect(circle.view(circle.review(b))).toEqual(b)
  })
  it('handles the other variant independently', () => {
    expect(rect.view({ kind: 'rect', w: 2, h: 4 })).toEqual({ kind: 'rect', w: 2, h: 4 })
    expect(rect.view({ kind: 'circle', r: 1 })).toBeUndefined()
  })
})

describe('taggedIn', () => {
  type State =
    | { tag: 'idle' }
    | { tag: 'loading' }
    | { tag: 'editing'; draft: string }
    | { tag: 'error'; draft: string; message: string }

  const editingOrError = taggedIn<State, 'tag', 'editing' | 'error'>('tag', ['editing', 'error'])

  it('matches when tag is one of the specified values', () => {
    const editing: State = { tag: 'editing', draft: 'hello' }
    expect(editingOrError.view(editing)).toEqual(editing)

    const error: State = { tag: 'error', draft: 'hello', message: 'oops' }
    expect(editingOrError.view(error)).toEqual(error)
  })

  it('returns undefined when tag is not in the values', () => {
    const idle: State = { tag: 'idle' }
    expect(editingOrError.view(idle)).toBeUndefined()

    const loading: State = { tag: 'loading' }
    expect(editingOrError.view(loading)).toBeUndefined()
  })

  it('build returns the value unchanged', () => {
    const editing = { tag: 'editing' as const, draft: 'test' }
    expect(editingOrError.review(editing)).toBe(editing)
  })
})
