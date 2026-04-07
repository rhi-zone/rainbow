/**
 * Property-based tests for the algebraic laws of Lens, Prism, and Signal.
 *
 * Laws verified with fast-check over arbitrary inputs.
 */
import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import { lens, field, composeLens, fst, snd, id } from './lens.ts'
import { prism, composePrism, some, iso } from './prism.ts'
import { signal } from './signal.ts'
import { cond } from './cond.ts'

// ---------------------------------------------------------------------------
// Lens laws
// ---------------------------------------------------------------------------
describe('Lens laws', () => {
  // get(set(a, b)) = b
  it('get-set: reading back what was written', () => {
    fc.assert(fc.property(
      fc.record({ name: fc.string(), age: fc.integer() }),
      fc.string(),
      (obj, name) => {
        const l = field<{ name: string; age: number }, 'name'>('name')
        return l.get(l.set(obj, name)) === name
      },
    ))
  })

  // set(a, get(a)) = a
  it('set-get: writing what was already there is a no-op', () => {
    fc.assert(fc.property(
      fc.record({ name: fc.string(), age: fc.integer() }),
      (obj) => {
        const l = field<{ name: string; age: number }, 'name'>('name')
        return JSON.stringify(l.set(obj, l.get(obj))) === JSON.stringify(obj)
      },
    ))
  })

  // set(set(a, b1), b2) = set(a, b2)
  it('set-set: writing twice is same as writing once with last value', () => {
    fc.assert(fc.property(
      fc.record({ name: fc.string(), age: fc.integer() }),
      fc.string(),
      fc.string(),
      (obj, name1, name2) => {
        const l = field<{ name: string; age: number }, 'name'>('name')
        const double = l.set(l.set(obj, name1), name2)
        const single = l.set(obj, name2)
        return JSON.stringify(double) === JSON.stringify(single)
      },
    ))
  })

  // Composition: (ab . bc).get(a) = bc.get(ab.get(a))
  it('composeLens preserves get', () => {
    fc.assert(fc.property(
      fc.record({ inner: fc.record({ value: fc.integer() }) }),
      (obj) => {
        const outer = field<typeof obj, 'inner'>('inner')
        const inner = field<{ value: number }, 'value'>('value')
        const composed = composeLens(outer, inner)
        return composed.get(obj) === inner.get(outer.get(obj))
      },
    ))
  })

  // fst / snd laws
  it('fst focuses on first element of a pair', () => {
    fc.assert(fc.property(fc.integer(), fc.string(), (a, b) => {
      const l = fst<number, string>()
      return l.get([a, b]) === a && JSON.stringify(l.set([a, b], 99)) === JSON.stringify([99, b])
    }))
  })

  it('snd focuses on second element of a pair', () => {
    fc.assert(fc.property(fc.integer(), fc.string(), (a, b) => {
      const l = snd<number, string>()
      return l.get([a, b]) === b && JSON.stringify(l.set([a, b], 'z')) === JSON.stringify([a, 'z'])
    }))
  })

  it('id is the identity lens', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const l = id<number>()
      return l.get(n) === n && l.set(n, 42) === 42
    }))
  })
})

// ---------------------------------------------------------------------------
// Prism laws
// ---------------------------------------------------------------------------
describe('Prism laws', () => {
  // match(inject(b)) = b
  it('match-inject: round-trip from B back to A then back to B', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const p = some<number>()
      return p.match(p.inject(n)) === n
    }))
  })

  // if match(a) = Some(b) then inject(b) = a
  it('inject-match: if prism matches, injecting the result reconstructs a', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const a: number | undefined = n > 0 ? n : undefined
      const p = some<number>()
      const b = p.match(a)
      if (b === undefined) return true   // prism didn't match — law vacuously holds
      return p.inject(b) === a
    }))
  })

  // iso always matches
  it('iso match is total (always returns a value)', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const p = iso<number, string>(String, Number)
      return p.match(n) !== undefined
    }))
  })

  // composePrism: match(inject(b)) = b when both prisms match
  it('composePrism round-trips', () => {
    const p1 = some<number | undefined>()           // A | undefined | undefined → A | undefined
    const p2 = some<number>()                       // A | undefined → A
    const composed = composePrism(p1, p2)
    fc.assert(fc.property(fc.integer({ min: 1 }), (n) => {
      return composed.match(composed.inject(n)) === n
    }))
  })
})

// ---------------------------------------------------------------------------
// Signal laws
// ---------------------------------------------------------------------------
describe('Signal laws', () => {
  it('get returns the last set value', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (init, next) => {
      const s = signal(init)
      s.set(next)
      return s.get() === next
    }))
  })

  it('map is referentially transparent', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const s = signal(n)
      const doubled = s.map(x => x * 2)
      return doubled.get() === n * 2
    }))
  })

  it('subscribe fires with the new value on change', () => {
    fc.assert(fc.property(fc.integer(), fc.integer().filter(b => b !== 0).map(b => b + 100), (a, b) => {
      fc.pre(a !== b)
      const s = signal(a)
      let received: number | undefined
      s.subscribe(v => { received = v })
      s.set(b)
      return received === b
    }))
  })

  it('subscribe does not fire when value is unchanged', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const s = signal(n)
      let calls = 0
      s.subscribe(() => { calls++ })
      s.set(n)   // same value
      return calls === 0
    }))
  })
})

// ---------------------------------------------------------------------------
// cond laws
// ---------------------------------------------------------------------------
describe('cond laws', () => {
  // cond(p, cond(q, w)) ≡ cond(x => q(x) && p(x), w)
  it('composition law: cond(p, cond(q, w)) = cond(p && q, w)', () => {
    const isPositive = (n: number) => n > 0
    const isEven = (n: number) => n % 2 === 0

    fc.assert(fc.property(fc.integer({ min: -10, max: 10 }), (n) => {
      const w = signal(n)
      const composed = cond(isEven, cond(isPositive, w))
      const direct = cond((x: number) => isPositive(x) && isEven(x), w)
      return composed.get() === direct.get()
    }))
  })

  // cond(always, w) ≡ w (modulo undefined wrapping)
  it('always-true predicate propagates value unchanged', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const w = signal(n)
      return cond(() => true, w).get() === n
    }))
  })

  // cond(never, w) ≡ undefined
  it('always-false predicate always returns undefined', () => {
    fc.assert(fc.property(fc.integer(), (n) => {
      const w = signal(n)
      return cond(() => false, w).get() === undefined
    }))
  })
})
