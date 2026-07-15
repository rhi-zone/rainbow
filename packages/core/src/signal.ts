import type { Lens } from './lens.ts'
import type { Prism } from './prism.ts'
import { track } from './tracking.ts'

type Subscriber<A> = (value: A) => void

// ---------------------------------------------------------------------------
// Synchronous batch queue
// ---------------------------------------------------------------------------
// During a batch, RootSignal.set() queues notifications rather than firing
// them immediately. The Map key is the subscriber function itself, providing
// automatic deduplication: if the same subscriber is queued twice (e.g. via
// two child signals of a ProductSignal), it is only called once at flush.
let _batchDepth = 0
const _pending = new Map<object, () => void>()

/**
 * Run `fn` synchronously; defer and deduplicate all signal notifications
 * until `fn` returns, then flush them in one pass.
 *
 * Batches may nest — flush only happens when the outermost batch completes.
 */
export function batch(fn: () => void): void {
  _batchDepth++
  try {
    fn()
  } finally {
    _batchDepth--
    if (_batchDepth === 0) {
      // Drain in a loop to handle subscribers that trigger further signals.
      while (_pending.size > 0) {
        const thunks = [..._pending.values()]
        _pending.clear()
        for (const thunk of thunks) thunk()
      }
    }
  }
}

/**
 * A Signal<A> is a reactive cell holding a value of type A.
 * Reading tracks the dependency; writing propagates to subscribers.
 */
export interface Signal<A> {
  /** Return the current value. */
  get(): A
  /** Update the value and notify subscribers. No-op if the value is unchanged (`Object.is`). */
  set(a: A): void
  /**
   * Subscribe to value changes.
   * @returns An unsubscribe function.
   */
  subscribe(fn: Subscriber<A>): () => void
  /** Return a read-only derived signal by applying `f` to each value. */
  map<B>(f: (a: A) => B): ReadonlySignal<B>
  /** Return a read-write signal focused on B via a lens. */
  focus<B>(lens: Lens<A, B>): Signal<B>
  /** Return a read-write signal focused via a prism; yields `undefined` when the case doesn't match. */
  narrow<B>(prism: Prism<A, B>): Signal<B | undefined>
  /**
   * Shallow-merge `partial` into the current value and set the result.
   * Sugar for `this.set({ ...this.get(), ...partial })`. Only meaningful
   * when `A` is an object type — calling it on a non-object `A` (e.g.
   * `Signal<number>`) is a type error since `Partial<A>` collapses to `{}`,
   * which does not accept arbitrary keys.
   */
  patch(partial: Partial<A>): void
}

/** A read-only view of a reactive value. */
export interface ReadonlySignal<A> {
  /** Return the current value. */
  get(): A
  /**
   * Subscribe to value changes.
   * @returns An unsubscribe function.
   */
  subscribe(fn: Subscriber<A>): () => void
  /** Return a read-only derived signal by applying `f` to each value. */
  map<B>(f: (a: A) => B): ReadonlySignal<B>
}

class RootSignal<A> implements Signal<A> {
  private _value: A
  private _subscribers: Set<Subscriber<A>> = new Set()

  constructor(initial: A) {
    this._value = initial
  }

  get(): A {
    track(this)
    return this._value
  }

  set(a: A): void {
    if (Object.is(this._value, a)) return
    this._value = a
    if (_batchDepth > 0) {
      for (const fn of this._subscribers) {
        // Capture `fn` and `this` in a closure; at flush time `this._value`
        // is the final value, so late-reading subscribers see it correctly.
        _pending.set(fn, () => fn(this._value))
      }
    } else {
      for (const fn of this._subscribers) fn(a)
    }
  }

  subscribe(fn: Subscriber<A>): () => void {
    this._subscribers.add(fn)
    return () => this._subscribers.delete(fn)
  }

  map<B>(f: (a: A) => B): ReadonlySignal<B> {
    return new DerivedSignal(this, f)
  }

  focus<B>(lens: Lens<A, B>): Signal<B> {
    return new FocusedSignal(this, lens)
  }

  narrow<B>(prism: Prism<A, B>): Signal<B | undefined> {
    return new NarrowedSignal(this, prism)
  }

  patch(partial: Partial<A>): void {
    this.set({ ...(this._value as object), ...partial } as A)
  }
}

class DerivedSignal<A, B> implements ReadonlySignal<B> {
  private _source: Signal<A> | ReadonlySignal<A>
  private _f: (a: A) => B

  constructor(source: Signal<A> | ReadonlySignal<A>, f: (a: A) => B) {
    this._source = source
    this._f = f
  }

  get(): B {
    return this._f(this._source.get())
  }

  subscribe(fn: Subscriber<B>): () => void {
    let prev = this.get()
    return this._source.subscribe(() => {
      const next = this.get()
      if (!Object.is(prev, next)) {
        prev = next
        fn(next)
      }
    })
  }

  map<C>(f: (b: B) => C): ReadonlySignal<C> {
    return new DerivedSignal(this, f)
  }
}

class FocusedSignal<A, B> implements Signal<B> {
  private _source: Signal<A>
  private _lens: Lens<A, B>

  constructor(source: Signal<A>, lens: Lens<A, B>) {
    this._source = source
    this._lens = lens
  }

  get(): B {
    return this._lens.view(this._source.get())
  }

  set(b: B): void {
    this._source.set(this._lens.review(b, this._source.get()))
  }

  subscribe(fn: Subscriber<B>): () => void {
    let prev = this.get()
    return this._source.subscribe(() => {
      const next = this.get()
      if (!Object.is(prev, next)) {
        prev = next
        fn(next)
      }
    })
  }

  map<C>(f: (b: B) => C): ReadonlySignal<C> {
    return new DerivedSignal(this, f)
  }

  focus<C>(lens: Lens<B, C>): Signal<C> {
    return new FocusedSignal(this, lens)
  }

  narrow<C>(prism: Prism<B, C>): Signal<C | undefined> {
    return new NarrowedSignal(this, prism)
  }

  patch(partial: Partial<B>): void {
    this.set({ ...(this.get() as object), ...partial } as B)
  }
}

class NarrowedSignal<A, B> implements Signal<B | undefined> {
  private _source: Signal<A>
  private _prism: Prism<A, B>

  constructor(source: Signal<A>, prism: Prism<A, B>) {
    this._source = source
    this._prism = prism
  }

  get(): B | undefined {
    return this._prism.view(this._source.get())
  }

  set(b: B | undefined): void {
    if (b !== undefined) {
      this._source.set(this._prism.review(b))
    }
  }

  subscribe(fn: Subscriber<B | undefined>): () => void {
    let prev = this.get()
    return this._source.subscribe(() => {
      const next = this.get()
      if (!Object.is(prev, next)) {
        prev = next
        fn(next)
      }
    })
  }

  map<C>(f: (b: B | undefined) => C): ReadonlySignal<C> {
    return new DerivedSignal(this, f)
  }

  focus<C>(lens: Lens<B | undefined, C>): Signal<C> {
    return new FocusedSignal(this, lens)
  }

  narrow<C>(prism: Prism<B | undefined, C>): Signal<C | undefined> {
    return new NarrowedSignal(this, prism)
  }

  patch(partial: Partial<B | undefined>): void {
    this.set({ ...(this.get() as object), ...partial } as B | undefined)
  }
}

/**
 * Create a root signal with the given initial value.
 * @param initial - The starting value.
 */
export function signal<A>(initial: A): Signal<A> {
  return new RootSignal(initial)
}

/**
 * Create a signal focused on part of another signal via a lens.
 * Reads and writes pass through the lens; the source signal is the source of truth.
 */
export function focusSignal<A, B>(source: Signal<A>, lens: Lens<A, B>): Signal<B> {
  return new FocusedSignal(source, lens)
}

/**
 * Create a signal focused on a prism case of another signal.
 * Yields `undefined` when the prism doesn't match; writes are no-ops when `b` is `undefined`.
 */
export function narrowSignal<A, B>(source: Signal<A>, prism: Prism<A, B>): Signal<B | undefined> {
  return new NarrowedSignal(source, prism)
}
