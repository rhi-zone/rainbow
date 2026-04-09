import type { Optic } from './optic.ts'

/**
 * A Lens<A, B> focuses on a field of type B within a structure of type A.
 *
 * Laws:
 *   view(review(b, a)) = b
 *   review(view(a), a) = a
 *   review(b, review(b1, a)) = review(b, a)
 */
export interface Lens<A, B> extends Optic<A, B> {
  view(a: A): B
  review(b: B, a: A): A
}

/**
 * Construct a lens from explicit view and review functions.
 * @param view   - Extract B from A.
 * @param review - Return a new A with B replaced.
 */
export function lens<A, B>(view: (a: A) => B, review: (b: B, a: A) => A): Lens<A, B> {
  return { view, review }
}

/**
 * Compose two lenses. If `ab` focuses on B within A, and `bc` focuses on C within B,
 * the result focuses on C within A.
 */
export function composeLens<A, B, C>(ab: Lens<A, B>, bc: Lens<B, C>): Lens<A, C> {
  return {
    view:   (a) => bc.view(ab.view(a)),
    review: (c, a) => ab.review(bc.review(c, ab.view(a)), a),
  }
}

/** Lens into a tuple element by index. `index(0)` replaces `fst`, `index(1)` replaces `snd`. */
export function index<T extends readonly unknown[], N extends number & keyof T>(n: N): Lens<T, T[N]> {
  return lens(
    (t) => t[n],
    (v, t) => { const copy = [...t] as unknown[]; copy[n] = v; return copy as unknown as T },
  )
}

/**
 * Lens into a record field by key.
 * @param key - The key of the field to focus on.
 */
export function field<A, K extends keyof A>(key: K): Lens<A, A[K]> {
  return lens(
    (a) => a[key],
    (v, a) => ({ ...a, [key]: v }),
  )
}

/** Identity lens — focuses on the whole value. */
export function id<A>(): Lens<A, A> {
  return lens((a) => a, (a) => a)
}

/**
 * Lift a `Lens<S, A>` to `Lens<S[], A[]>`, applying it pointwise over an array.
 *
 * Laws hold as long as the `A[]` written back has the same length as the `S[]`
 * it came from — which is guaranteed when the only source of `A[]` values is
 * `view` on the same array.
 *
 * Useful for two-way bindings over arrays of objects:
 *   signal<User[]>.focus(arrayOf(field("name")))  // Signal<string[]>
 */
export function arrayOf<S, A>(l: Lens<S, A>): Lens<S[], A[]> {
  return lens(
    (ss) => ss.map(s => l.view(s)),
    (as, ss) => ss.map((s, i) => l.review(as[i]!, s)),
  )
}

/**
 * Lift a `Lens<S, A>` to `Lens<Record<K, S>, Record<K, A>>`, applying it to
 * every value in the record.
 *
 * Useful for normalized state keyed by branded IDs:
 *   signal<Record<UserId, User>>.focus(recordOf(field("name")))  // Signal<Record<UserId, string>>
 */
export function recordOf<K extends string, S, A>(l: Lens<S, A>): Lens<Record<K, S>, Record<K, A>> {
  return lens(
    (rec) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, l.view(v as S)])) as Record<K, A>,
    (out, rec) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, l.review((out as Record<string, A>)[k]!, v as S)])) as Record<K, S>,
  )
}

/**
 * Lift a `Lens<S, A>` to `Lens<Map<K, S>, Map<K, A>>`, applying it to every
 * value in the map.
 *
 * Prefer this over `recordOf` when keys are arbitrary strings — `Map` avoids
 * prototype-pollution footguns with special keys like `__proto__`.
 */
export function mapOf<K, S, A>(l: Lens<S, A>): Lens<Map<K, S>, Map<K, A>> {
  return lens(
    (m) => new Map([...m].map(([k, v]) => [k, l.view(v)])),
    (out, m) => new Map([...m].map(([k, v]) => [k, l.review(out.get(k)!, v)])),
  )
}
