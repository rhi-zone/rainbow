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

/** Lens into the first element of a tuple */
export const fst = <A, B>(): Lens<[A, B], A> =>
  lens(([a]) => a, ([, b], a) => [a, b])

/** Lens into the second element of a tuple */
export const snd = <A, B>(): Lens<[A, B], B> =>
  lens(([, b]) => b, ([a], b) => [a, b])

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
