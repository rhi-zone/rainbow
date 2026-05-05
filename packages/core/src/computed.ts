import type { ReadonlySignal } from './signal.ts'
import { runWithTracker } from './tracking.ts'

type Subscriber<A> = (value: A) => void

/**
 * Derive a read-only signal from multiple source signals.
 *
 * Two forms:
 * - `computed(fn, deps)` — explicit deps; re-evaluates when any dep changes.
 * - `computed(fn)` — auto-tracked; deps are discovered by observing which root
 *   signals are read during `fn`, and refreshed on every re-run (Vue-style).
 */
export function computed<T>(fn: () => T): ReadonlySignal<T>
export function computed<T>(fn: () => T, deps: ReadonlySignal<unknown>[]): ReadonlySignal<T>
export function computed<T>(fn: () => T, deps?: ReadonlySignal<unknown>[]): ReadonlySignal<T> {
  return deps !== undefined ? new ComputedSignal(fn, deps) : new AutoComputedSignal(fn)
}

class ComputedSignal<T> implements ReadonlySignal<T> {
  private _fn: () => T
  private _deps: ReadonlySignal<unknown>[]

  constructor(fn: () => T, deps: ReadonlySignal<unknown>[]) {
    this._fn = fn
    this._deps = deps
  }

  get(): T {
    return this._fn()
  }

  subscribe(fn: Subscriber<T>): () => void {
    let prev = this.get()
    const unsubs = this._deps.map((dep) =>
      dep.subscribe(() => {
        const next = this.get()
        if (!Object.is(prev, next)) {
          prev = next
          fn(next)
        }
      }),
    )
    return () => unsubs.forEach((u) => u())
  }

  map<B>(f: (t: T) => B): ReadonlySignal<B> {
    return computed(() => f(this.get()), [this])
  }
}

// Minimal interface needed to subscribe to a tracked dep without importing
// ReadonlySignal (which would create a circular module dependency via tracking.ts).
type SubscribableDep = { subscribe(fn: () => void): () => void }

class AutoComputedSignal<T> implements ReadonlySignal<T> {
  private _fn: () => T

  constructor(fn: () => T) {
    this._fn = fn
  }

  get(): T {
    return this._fn()
  }

  subscribe(fn: Subscriber<T>): () => void {
    let prev: T
    // Map from dep → unsub. Updated incrementally on each re-run: new deps are
    // subscribed, removed deps are unsubscribed. Avoids clear-and-resubscribe,
    // which would cause the Set iterator in RootSignal.set() to re-visit newly
    // added entries during the same notification pass (infinite loop).
    const depUnsubs = new Map<object, () => void>()

    const onDepChange = () => {
      const newSeen = new Set<object>()
      const next = runWithTracker({ add(dep) { newSeen.add(dep) } }, this._fn)

      for (const dep of newSeen) {
        if (!depUnsubs.has(dep)) {
          depUnsubs.set(dep, (dep as SubscribableDep).subscribe(onDepChange))
        }
      }
      for (const [dep, unsub] of depUnsubs) {
        if (!newSeen.has(dep)) {
          unsub()
          depUnsubs.delete(dep)
        }
      }

      if (!Object.is(prev, next)) {
        prev = next
        fn(next)
      }
    }

    const initialSeen = new Set<object>()
    prev = runWithTracker({ add(dep) { initialSeen.add(dep) } }, this._fn)
    for (const dep of initialSeen) {
      depUnsubs.set(dep, (dep as SubscribableDep).subscribe(onDepChange))
    }

    return () => {
      for (const unsub of depUnsubs.values()) unsub()
      depUnsubs.clear()
    }
  }

  map<B>(f: (t: T) => B): ReadonlySignal<B> {
    return new AutoComputedSignal(() => f(this.get()))
  }
}
