import { describe, expect, test } from 'vitest'
import {
  notAsked, loading, failure, success,
  isNotAsked, isLoading, isFailure, isSuccess,
  map, mapError, chain, getOrElse, fold,
  fromPromise, fromAsync, fromAsyncImperative, toNextValue,
} from './async-data.ts'

describe('constructors', () => {
  test('notAsked', () => expect(notAsked.status).toBe('notAsked'))
  test('loading',  () => expect(loading.status).toBe('loading'))
  test('failure',  () => expect(failure('oops')).toEqual({ status: 'failure', error: 'oops' }))
  test('success',  () => expect(success(42)).toEqual({ status: 'success', value: 42 }))
})

describe('guards', () => {
  test('isNotAsked', () => expect(isNotAsked(notAsked)).toBe(true))
  test('isLoading',  () => expect(isLoading(loading)).toBe(true))
  test('isFailure',  () => expect(isFailure(failure('e'))).toBe(true))
  test('isSuccess',  () => expect(isSuccess(success(1))).toBe(true))
  test('cross-guards are false', () => {
    expect(isSuccess(notAsked)).toBe(false)
    expect(isSuccess(loading)).toBe(false)
    expect(isSuccess(failure('e'))).toBe(false)
  })
})

describe('map', () => {
  test('transforms success',      () => expect(map(success(2), x => x * 3)).toEqual(success(6)))
  test('passes through notAsked', () => expect(map(notAsked, x => x)).toBe(notAsked))
  test('passes through loading',  () => expect(map(loading, x => x)).toBe(loading))
  test('passes through failure',  () => {
    const f = failure('err')
    expect(map(f, x => x)).toBe(f)
  })
})

describe('mapError', () => {
  test('transforms failure',     () => expect(mapError(failure('oops'), e => e + '!')).toEqual(failure('oops!')))
  test('passes through success', () => {
    const s = success(1)
    expect(mapError(s, e => e)).toBe(s)
  })
})

describe('chain', () => {
  test('chains on success',          () => expect(chain(success(2), x => success(x + 1))).toEqual(success(3)))
  test('short-circuits on failure',  () => {
    const f = failure('err')
    expect(chain(f, () => success(1))).toBe(f)
  })
  test('short-circuits on loading',  () => expect(chain(loading,  () => success(1))).toBe(loading))
  test('short-circuits on notAsked', () => expect(chain(notAsked, () => success(1))).toBe(notAsked))
})

describe('getOrElse', () => {
  test('returns value on success',     () => expect(getOrElse(success(5), 0)).toBe(5))
  test('returns fallback on notAsked', () => expect(getOrElse(notAsked, 0)).toBe(0))
  test('returns fallback on loading',  () => expect(getOrElse(loading,  0)).toBe(0))
  test('returns fallback on failure',  () => expect(getOrElse(failure('e'), 0)).toBe(0))
})

describe('fold', () => {
  const cases = {
    notAsked: () => 'notAsked',
    loading:  () => 'loading',
    failure:  (e: unknown) => `fail:${e}`,
    success:  (v: unknown) => `ok:${v}`,
  }
  test('notAsked', () => expect(fold(notAsked, cases)).toBe('notAsked'))
  test('loading',  () => expect(fold(loading,  cases)).toBe('loading'))
  test('failure',  () => expect(fold(failure('x'), cases)).toBe('fail:x'))
  test('success',  () => expect(fold(success(42), cases)).toBe('ok:42'))
})

// ---------------------------------------------------------------------------
// Signal adapters
// ---------------------------------------------------------------------------

import { signal } from './signal.ts'

describe('fromPromise', () => {
  test('starts in loading', () => {
    const s = fromPromise(new Promise(() => {}))
    expect(s.get()).toEqual(loading)
  })

  test('transitions to success when promise resolves', async () => {
    const s = fromPromise(Promise.resolve(42))
    await Promise.resolve() // flush microtask
    expect(s.get()).toEqual(success(42))
  })

  test('transitions to failure when promise rejects', async () => {
    const s = fromPromise(Promise.reject(new Error('oops')))
    await Promise.resolve()
    expect(s.get()).toEqual(failure(new Error('oops')))
  })

  test('notifies subscribers on resolve', async () => {
    const s = fromPromise(Promise.resolve('done'))
    const values: unknown[] = []
    s.subscribe(v => values.push(v))
    await Promise.resolve()
    expect(values).toEqual([success('done')])
  })
})

describe('fromAsync', () => {
  test('starts in loading and resolves', async () => {
    const deps = signal('query')
    const [s, dispose] = fromAsync(deps, (q) => Promise.resolve(`result:${q}`))
    expect(s.get()).toEqual(loading)
    await Promise.resolve()
    expect(s.get()).toEqual(success('result:query'))
    dispose()
  })

  test('re-runs when deps change', async () => {
    const deps = signal('a')
    const [s, dispose] = fromAsync(deps, (q) => Promise.resolve(`r:${q}`))
    await Promise.resolve()
    expect(s.get()).toEqual(success('r:a'))
    deps.set('b')
    expect(s.get()).toEqual(loading) // reset to loading immediately
    await Promise.resolve()
    expect(s.get()).toEqual(success('r:b'))
    dispose()
  })

  test('aborts previous request when deps change', async () => {
    const deps = signal('a')
    const aborted: boolean[] = []
    const [s, dispose] = fromAsync(deps, (_q, abort) => {
      abort.addEventListener('abort', () => aborted.push(true))
      return new Promise(() => {}) // never resolves
    })
    deps.set('b') // triggers abort of first request
    expect(aborted).toEqual([true])
    dispose()
    expect(s.get()).toEqual(loading)
  })

  test('dispose aborts in-flight request and unsubscribes', async () => {
    const deps = signal('q')
    let notified = 0
    const [s, dispose] = fromAsync(deps, () => Promise.resolve(1))
    s.subscribe(() => notified++)
    await Promise.resolve()
    dispose()
    deps.set('q2') // should not trigger a new run
    await Promise.resolve()
    const after = notified
    deps.set('q3')
    await Promise.resolve()
    expect(notified).toBe(after) // no new notifications after dispose
  })
})

describe('fromAsyncImperative', () => {
  test('starts as notAsked', () => {
    const { result } = fromAsyncImperative((_input: string, _signal: AbortSignal) => Promise.resolve(1))
    expect(result.get()).toEqual(notAsked)
  })

  test('transitions to loading when triggered', () => {
    const { result, trigger, dispose } = fromAsyncImperative((_input: string) => new Promise(() => {}))
    trigger('x')
    expect(result.get()).toEqual(loading)
    dispose()
  })

  test('transitions to success on resolution', async () => {
    const { result, trigger, dispose } = fromAsyncImperative((input: string) => Promise.resolve(`ok:${input}`))
    trigger('hello')
    await Promise.resolve()
    expect(result.get()).toEqual(success('ok:hello'))
    dispose()
  })

  test('transitions to failure on rejection', async () => {
    const { result, trigger, dispose } = fromAsyncImperative((_input: string) => Promise.reject(new Error('bad')))
    trigger('hello')
    await Promise.resolve()
    expect(result.get()).toEqual(failure(new Error('bad')))
    dispose()
  })

  test('aborts previous call when triggered again while in-flight', async () => {
    const aborted: boolean[] = []
    const { result, trigger, dispose } = fromAsyncImperative((_input: string, signal: AbortSignal) => {
      signal.addEventListener('abort', () => aborted.push(true))
      return new Promise(() => {}) // never resolves
    })
    trigger('first')
    trigger('second') // aborts 'first'
    expect(aborted).toEqual([true])
    dispose()
    expect(result.get()).toEqual(loading)
  })

  test('dispose aborts in-flight and prevents further updates', async () => {
    let notified = 0
    const { result, trigger, dispose } = fromAsyncImperative((_input: string) => Promise.resolve(42))
    result.subscribe(() => notified++)
    trigger('x')
    dispose()
    await Promise.resolve()
    expect(notified).toBe(1) // only the loading transition
  })
})

describe('toNextValue', () => {
  test('resolves immediately if current value matches predicate', async () => {
    const s = signal(success<number, never>(5))
    const result = await toNextValue(s, isSuccess)
    expect(result).toEqual(success(5))
  })

  test('resolves immediately with no predicate', async () => {
    const s = signal(42)
    const result = await toNextValue(s)
    expect(result).toBe(42)
  })

  test('resolves on next matching update', async () => {
    const s = signal<number>(0)
    const p = toNextValue(s, v => v > 10)
    s.set(5)
    s.set(15)
    const result = await p
    expect(result).toBe(15)
  })

  test('only resolves once (unsubscribes after first match)', async () => {
    const s = signal<number>(0)
    const p = toNextValue(s, v => v > 10)
    let resolveCount = 0
    p.then(() => resolveCount++)
    s.set(20)
    s.set(30)
    await Promise.resolve()
    expect(resolveCount).toBe(1)
  })
})
