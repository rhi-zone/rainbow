/**
 * query / mutation tests.
 *
 * Signal-level — no DOM/widget-context dependency, so no happy-dom needed.
 */

import { describe, it, expect, vi } from 'vitest'
import { query, mutation } from './query.ts'

/** Flush microtasks (promise callbacks). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

// ── query ────────────────────────────────────────────────────────────────────

describe('query', () => {
  it('calls fetcher immediately and starts in loading state', async () => {
    const fetcher = vi.fn(() => Promise.resolve(42))
    const result = query(fetcher)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.state.get().status).toBe('loading')

    await flush()
    const s = result.state.get()
    expect(s.status).toBe('success')
    if (s.status === 'success') expect(s.value).toBe(42)

    result.dispose()
  })

  it('transitions to failure on rejected promise', async () => {
    const err = new Error('boom')
    const result = query(() => Promise.reject(err))

    await flush()
    const s = result.state.get()
    expect(s.status).toBe('failure')
    if (s.status === 'failure') expect(s.error).toBe(err)

    result.dispose()
  })

  it('refetch resets to loading and re-calls fetcher', async () => {
    let n = 0
    const fetcher = vi.fn(() => Promise.resolve(++n))
    const result = query(fetcher)

    await flush()
    expect(result.state.get().status).toBe('success')

    result.refetch()
    expect(result.state.get().status).toBe('loading')
    expect(fetcher).toHaveBeenCalledTimes(2)

    await flush()
    const s = result.state.get()
    expect(s.status).toBe('success')
    if (s.status === 'success') expect(s.value).toBe(2)

    result.dispose()
  })

  it('aborts in-flight request on dispose', async () => {
    // A fetcher that never resolves
    const fetcher = vi.fn(() => new Promise<number>(() => {}))
    const result = query(fetcher)

    expect(result.state.get().status).toBe('loading')
    result.dispose()
    // After dispose, even if the promise were to resolve, the state stays loading
    // (abort flag prevents set)
  })

  it('select returns fallback while loading, then derived value on success', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ items: [1, 2, 3] }))
    const result = query(fetcher)

    const count = result.select((v) => v.items.length, -1)
    expect(count.get()).toBe(-1)

    await flush()
    expect(count.get()).toBe(3)

    result.dispose()
  })

  it('select returns fallback on failure', async () => {
    const result = query(() => Promise.reject(new Error('boom')))

    const value = result.select((v: { x: number }) => v.x, 0)
    await flush()
    expect(value.get()).toBe(0)

    result.dispose()
  })
})

// ── mutation ─────────────────────────────────────────────────────────────────

describe('mutation', () => {
  it('submit calls execute and tracks busy state', async () => {
    const execute = vi.fn((n: number) => Promise.resolve(n * 2))
    const { state, submit } = mutation(execute)

    expect(state.get().busy).toBe(false)
    const p = submit(5)
    expect(state.get().busy).toBe(true)

    const result = await p
    expect(result).toBe(10)
    expect(state.get().busy).toBe(false)
    expect(state.get().error).toBeUndefined()
  })

  it('captures error on rejection', async () => {
    const err = new Error('fail')
    const { state, submit } = mutation(() => Promise.reject(err))

    await expect(submit(0)).rejects.toThrow('fail')
    expect(state.get().busy).toBe(false)
    expect(state.get().error).toBe(err)
  })

  it('wraps non-Error thrown values', async () => {
    const { state, submit } = mutation(() => Promise.reject('string-err'))

    await expect(submit(0)).rejects.toBe('string-err')
    expect(state.get().error).toBeInstanceOf(Error)
    expect(state.get().error!.message).toBe('string-err')
  })

  it('calls onSuccess callback after successful mutation', async () => {
    const onSuccess = vi.fn()
    const { submit } = mutation((n: number) => Promise.resolve(n), { onSuccess })

    await submit(7)
    expect(onSuccess).toHaveBeenCalledWith(7)
  })

  it('reset clears error state', async () => {
    const { state, submit, reset } = mutation(() => Promise.reject(new Error('x')))

    await expect(submit(0)).rejects.toThrow()
    expect(state.get().error).toBeDefined()

    reset()
    expect(state.get().error).toBeUndefined()
    expect(state.get().busy).toBe(false)
  })
})
