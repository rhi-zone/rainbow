import { describe, it, expect, vi } from 'vitest'
import { signal } from './signal.ts'
import { cond } from './cond.ts'

describe('cond', () => {
  it('returns the value when predicate holds', () => {
    const s = signal(5)
    expect(cond(n => n > 0, s).get()).toBe(5)
  })

  it('returns undefined when predicate does not hold', () => {
    const s = signal(-1)
    expect(cond(n => n > 0, s).get()).toBeUndefined()
  })

  it('propagates when predicate flips to true', () => {
    const s = signal(-1)
    const c = cond(n => n > 0, s)
    const fn = vi.fn()
    c.subscribe(fn)
    s.set(5)
    expect(fn).toHaveBeenCalledWith(5)
  })

  it('propagates undefined when predicate flips to false', () => {
    const s = signal(5)
    const c = cond(n => n > 0, s)
    const fn = vi.fn()
    c.subscribe(fn)
    s.set(-1)
    expect(fn).toHaveBeenCalledWith(undefined)
  })

  it('does not fire when value changes but predicate stays false', () => {
    const s = signal(-1)
    const c = cond(n => n > 0, s)
    const fn = vi.fn()
    c.subscribe(fn)
    s.set(-2)      // still negative — still undefined
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not fire when value changes but predicate stays true and derived value is same', () => {
    // cond passes the value through, so value changes always propagate when pred holds
    const s = signal(5)
    const fn = vi.fn()
    cond(n => n > 0, s).subscribe(fn)
    s.set(5)  // same value, Object.is dedup
    expect(fn).not.toHaveBeenCalled()
  })

  it('law: cond(p, cond(q, w)) ≡ cond(x => q(x) && p(x), w)', () => {
    const isPositive = (n: number) => n > 0
    const isEven = (n: number) => n % 2 === 0

    for (const v of [-2, -1, 0, 1, 2, 3, 4]) {
      const w = signal(v)
      const composed = cond(isEven, cond(isPositive, w))
      const direct = cond((n: number) => isPositive(n) && isEven(n), w)
      expect(composed.get()).toBe(direct.get())
    }
  })
})
