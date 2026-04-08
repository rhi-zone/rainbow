/**
 * A Lens<A, B> focuses on a field of type B within a structure of type A.
 *
 * Laws:
 *   get(set(a, b)) = b
 *   set(a, get(a)) = a
 *   set(set(a, b1), b2) = set(a, b2)
 */
export interface Lens<A, B> {
  get(a: A): B
  set(a: A, b: B): A
}

/**
 * Construct a lens from explicit get and set functions.
 * @param get - Extract B from A.
 * @param set - Return a new A with the B replaced.
 */
export function lens<A, B>(get: (a: A) => B, set: (a: A, b: B) => A): Lens<A, B> {
  return { get, set }
}

/**
 * Compose two lenses. If `ab` focuses on B within A, and `bc` focuses on C within B,
 * the result focuses on C within A.
 */
export function composeLens<A, B, C>(ab: Lens<A, B>, bc: Lens<B, C>): Lens<A, C> {
  return {
    get: (a) => bc.get(ab.get(a)),
    set: (a, c) => ab.set(a, bc.set(ab.get(a), c)),
  }
}

/** Lens into a tuple element by index. `index(0)` replaces `fst`, `index(1)` replaces `snd`. */
export function index<T extends readonly unknown[], N extends number & keyof T>(n: N): Lens<T, T[N]> {
  return lens(
    (t) => t[n],
    (t, v) => { const copy = [...t] as unknown[]; copy[n] = v; return copy as unknown as T },
  )
}

/**
 * Lens into a record field by key.
 * @param key - The key of the field to focus on.
 */
export function field<A, K extends keyof A>(key: K): Lens<A, A[K]> {
  return lens(
    (a) => a[key],
    (a, v) => ({ ...a, [key]: v }),
  )
}

/** Identity lens — focuses on the whole value. */
export function id<A>(): Lens<A, A> {
  return lens((a) => a, (_, a) => a)
}

/**
 * Lift a `Lens<S, A>` to `Lens<S[], A[]>`, applying it pointwise over an array.
 *
 * Laws hold as long as the `A[]` written back has the same length as the `S[]`
 * it came from — which is guaranteed when the only source of `A[]` values is
 * `get` on the same array.
 *
 * Useful for two-way bindings over arrays of objects:
 *   signal<User[]>.focus(arrayOf(field("name")))  // Signal<string[]>
 */
export function arrayOf<S, A>(l: Lens<S, A>): Lens<S[], A[]> {
  return lens(
    (ss) => ss.map(s => l.get(s)),
    (ss, as) => ss.map((s, i) => l.set(s, as[i]!)),
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
    (rec) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, l.get(v as S)])) as Record<K, A>,
    (rec, out) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, l.set(v as S, (out as Record<string, A>)[k]!)])) as Record<K, S>,
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
    (m) => new Map([...m].map(([k, v]) => [k, l.get(v)])),
    (m, out) => new Map([...m].map(([k, v]) => [k, l.set(v, out.get(k)!)])),
  )
}
