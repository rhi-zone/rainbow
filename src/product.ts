import { signal } from './signal.ts'
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
    this._a.set(a)
    this._b.set(b)
  }

  subscribe(fn: Subscriber<[A, B]>): () => void {
    const unsub1 = this._a.subscribe(() => fn(this.get()))
    const unsub2 = this._b.subscribe(() => fn(this.get()))
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
    const self = this
    let prevC = lens.get(self.get())

    const subscribers = new Set<Subscriber<C>>()

    self.subscribe((ab) => {
      const next = lens.get(ab)
      if (!Object.is(prevC, next)) {
        prevC = next
        for (const fn of subscribers) fn(next)
      }
    })

    return {
      get: () => lens.get(self.get()),
      set: (c) => self.set(lens.set(self.get(), c)),
      subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn) },
      map: (f) => {
        const s = signal(f(lens.get(self.get())))
        subscribers.add((c) => s.set(f(c)))
        return s
      },
      focus: (innerLens) => self.focus({
        get: (ab) => innerLens.get(lens.get(ab)),
        set: (ab, d) => lens.set(ab, innerLens.set(lens.get(ab), d)),
      }),
      narrow: (prism) => self.narrow({
        match: (ab) => prism.match(lens.get(ab)),
        inject: (c) => lens.set(self.get(), prism.inject(c)),
      }),
    }
  }

  narrow<C>(prism: Prism<[A, B], C>): Signal<C | undefined> {
    const self = this
    let prevC = prism.match(self.get())

    const subscribers = new Set<Subscriber<C | undefined>>()

    self.subscribe((ab) => {
      const next = prism.match(ab)
      if (!Object.is(prevC, next)) {
        prevC = next
        for (const fn of subscribers) fn(next)
      }
    })

    return {
      get: () => prism.match(self.get()),
      set: (c) => { if (c !== undefined) self.set(prism.inject(c)) },
      subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn) },
      map: (f) => {
        const s = signal(f(prism.match(self.get())))
        subscribers.add((c) => s.set(f(c)))
        return s
      },
      // TODO: focus/narrow on a narrowed product signal requires rethinking
      // the C | undefined threading. Not needed for current use cases.
      focus: (_lens) => { throw new Error('focus on narrowed product signal not yet implemented') },
      narrow: (_prism) => { throw new Error('narrow on narrowed product signal not yet implemented') },
    }
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
