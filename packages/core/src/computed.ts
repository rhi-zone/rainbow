import type { ReadonlySignal } from './signal.ts'

type Subscriber<A> = (value: A) => void

/**
 * Derive a read-only signal from multiple source signals.
 *
 * Unlike signal.map (one source), computed accepts any number of sources
 * and recomputes when any of them change.
 */
export function computed<T>(fn: () => T, deps: ReadonlySignal<unknown>[]): ReadonlySignal<T> {
  return new ComputedSignal(fn, deps)
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
