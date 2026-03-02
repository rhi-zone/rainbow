import type { Lens } from './lens.ts'
import type { Prism } from './prism.ts'

type Subscriber<A> = (value: A) => void

/**
 * A Signal<A> is a reactive cell holding a value of type A.
 * Reading tracks the dependency; writing propagates to subscribers.
 */
export interface Signal<A> {
  get(): A
  set(a: A): void
  subscribe(fn: Subscriber<A>): () => void
  /** Read-only derived signal */
  map<B>(f: (a: A) => B): ReadonlySignal<B>
  /** Read-write focused signal via lens */
  focus<B>(lens: Lens<A, B>): Signal<B>
  /** Read-write focused signal via prism (undefined when case doesn't match) */
  narrow<B>(prism: Prism<A, B>): Signal<B | undefined>
}

export interface ReadonlySignal<A> {
  get(): A
  subscribe(fn: Subscriber<A>): () => void
  map<B>(f: (a: A) => B): ReadonlySignal<B>
}

class RootSignal<A> implements Signal<A> {
  private _value: A
  private _subscribers: Set<Subscriber<A>> = new Set()

  constructor(initial: A) {
    this._value = initial
  }

  get(): A {
    return this._value
  }

  set(a: A): void {
    if (Object.is(this._value, a)) return
    this._value = a
    for (const fn of this._subscribers) fn(a)
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
    return this._lens.get(this._source.get())
  }

  set(b: B): void {
    this._source.set(this._lens.set(this._source.get(), b))
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
}

class NarrowedSignal<A, B> implements Signal<B | undefined> {
  private _source: Signal<A>
  private _prism: Prism<A, B>

  constructor(source: Signal<A>, prism: Prism<A, B>) {
    this._source = source
    this._prism = prism
  }

  get(): B | undefined {
    return this._prism.match(this._source.get())
  }

  set(b: B | undefined): void {
    if (b !== undefined) {
      this._source.set(this._prism.inject(b))
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
}

export function signal<A>(initial: A): Signal<A> {
  return new RootSignal(initial)
}
