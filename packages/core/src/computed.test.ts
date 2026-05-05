import { describe, it, expect, vi } from 'vitest'
import { signal } from './signal.ts'
import { computed } from './computed.ts'

describe('computed (auto-tracked)', () => {
  it('derives value from root signals', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get())
    expect(sum.get()).toBe(5)
  })

  it('updates when a dep changes', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get())
    const fn = vi.fn()
    sum.subscribe(fn)
    a.set(10)
    expect(fn).toHaveBeenCalledWith(13)
    b.set(7)
    expect(fn).toHaveBeenCalledWith(17)
  })

  it('does not notify when computed value unchanged', () => {
    const a = signal(2)
    const same = computed(() => { a.get(); return 42 })
    const fn = vi.fn()
    same.subscribe(fn)
    a.set(99)
    expect(fn).not.toHaveBeenCalled()
  })

  it('tracks conditional deps dynamically', () => {
    const flag = signal(true)
    const a = signal(1)
    const b = signal(2)
    const result = computed(() => flag.get() ? a.get() : b.get())
    const fn = vi.fn()
    result.subscribe(fn)

    a.set(10)
    expect(fn).toHaveBeenCalledWith(10)
    fn.mockClear()

    flag.set(false)
    expect(fn).toHaveBeenCalledWith(2) // switched to b
    fn.mockClear()

    // a is no longer a dep — changes to it should not trigger
    a.set(99)
    expect(fn).not.toHaveBeenCalled()

    b.set(20)
    expect(fn).toHaveBeenCalledWith(20)
  })

  it('stops updating after unsubscribe', () => {
    const a = signal(1)
    const c = computed(() => a.get() * 2)
    const fn = vi.fn()
    const unsub = c.subscribe(fn)
    unsub()
    a.set(5)
    expect(fn).not.toHaveBeenCalled()
  })

  it('maps over auto-computed', () => {
    const a = signal(3)
    const result = computed(() => a.get() * 2).map((x) => x + 1)
    expect(result.get()).toBe(7)
    const fn = vi.fn()
    result.subscribe(fn)
    a.set(5)
    expect(fn).toHaveBeenCalledWith(11)
  })

  it('works with no deps (constant)', () => {
    const c = computed(() => 42)
    expect(c.get()).toBe(42)
    const fn = vi.fn()
    c.subscribe(fn)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('computed', () => {
  it('derives value from multiple signals', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get(), [a, b])
    expect(sum.get()).toBe(5)
  })

  it('updates when first dep changes', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get(), [a, b])
    const fn = vi.fn()
    sum.subscribe(fn)
    a.set(10)
    expect(fn).toHaveBeenCalledWith(13)
  })

  it('updates when second dep changes', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get(), [a, b])
    const fn = vi.fn()
    sum.subscribe(fn)
    b.set(10)
    expect(fn).toHaveBeenCalledWith(12)
  })

  it('does not notify when computed value unchanged', () => {
    const a = signal(2)
    const b = signal(3)
    const same = computed(() => 42, [a, b])
    const fn = vi.fn()
    same.subscribe(fn)
    a.set(99)
    expect(fn).not.toHaveBeenCalled()
  })

  it('unsubscribes from all deps', () => {
    const a = signal(1)
    const b = signal(2)
    const sum = computed(() => a.get() + b.get(), [a, b])
    const fn = vi.fn()
    const unsub = sum.subscribe(fn)
    unsub()
    a.set(10)
    b.set(10)
    expect(fn).not.toHaveBeenCalled()
  })

  it('maps over computed', () => {
    const a = signal(3)
    const doubled = computed(() => a.get() * 2, [a]).map((x) => x + 1)
    expect(doubled.get()).toBe(7)
    const fn = vi.fn()
    doubled.subscribe(fn)
    a.set(5)
    expect(fn).toHaveBeenCalledWith(11)
  })
})
