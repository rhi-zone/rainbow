import { describe, it, expect, vi } from 'vitest'
import { signal } from './signal.ts'
import { computed } from './computed.ts'

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
