import { signal, batch, focusSignal, narrowSignal } from './signal.ts'
import type { Signal, ReadonlySignal } from './signal.ts'
import type { Lens } from './lens.ts'
import type { Prism } from './prism.ts'

type Subscriber<T> = (value: T) => void

/**
 * A Signal<[A, B]> backed by two independent signals.
 *
 * Reads from both; writes decompose and route to each child.
 *
 * Note: calling set([a, b]) fires subscribers twice (once per child signal).
 * In practice, prefer focus(fst()) and focus(snd()) over direct set().
 */
class ProductSignal<A, B> implements Signal<[A, B]> {
  constructor(private _a: Signal<A>, private _b: Signal<B>) {}

  get(): [A, B] {
    return [this._a.get(), this._b.get()]
  }

  set([a, b]: [A, B]): void {
    batch(() => {
      this._a.set(a)
      this._b.set(b)
    })
  }

  subscribe(fn: Subscriber<[A, B]>): () => void {
    // Share a single notify function so batch() can deduplicate it:
    // both child subscriptions point to the same function object,
    // so if both fire in one batch the Map key deduplicates them.
    const notify = () => fn(this.get())
    const unsub1 = this._a.subscribe(notify)
    const unsub2 = this._b.subscribe(notify)
    return () => { unsub1(); unsub2() }
  }

  map<C>(f: (v: [A, B]) => C): ReadonlySignal<C> {
    let prev = f(this.get())
    const s = signal(prev)
    this.subscribe((v) => {
      const next = f(v)
      if (!Object.is(prev, next)) { prev = next; s.set(next) }
    })
    return s
  }

  focus<C>(lens: Lens<[A, B], C>): Signal<C> {
    return focusSignal(this, lens)
  }

  narrow<C>(prism: Prism<[A, B], C>): Signal<C | undefined> {
    return narrowSignal(this, prism)
  }
}

/**
 * Create a signal over a pair [A, B] backed by two independent signals.
 */
export function product<A, B>(a: Signal<A>, b: Signal<B>): Signal<[A, B]> {
  return new ProductSignal(a, b)
}

/**
 * Encapsulate internal state S alongside external signal A.
 *
 * The S state starts as `init` and lives locally — not accessible
 * from outside except via the returned signal's focus(fst()) / focus(snd()).
 *
 * Unicorn equivalent: `stateful init widget`
 *
 * Usage:
 *   const combined = stateful("", itemsSignal)  // Signal<[string, Item[]]>
 *   const draft = combined.focus(fst())          // Signal<string>  — local
 *   const items = combined.focus(snd())          // Signal<Item[]>  — external
 */
export function stateful<S, A>(init: S, outer: Signal<A>): Signal<[S, A]> {
  return product(signal(init), outer)
}
