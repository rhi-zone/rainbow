/**
 * A Prism<A, B> focuses on a case of type B within a sum type A.
 *
 * Laws:
 *   match(inject(b)) = b
 *   if match(a) = b then inject(b) = a
 */
export interface Prism<A, B> {
  match(a: A): B | undefined
  inject(b: B): A
}

/**
 * Construct a prism from explicit match and inject functions.
 * @param match - Extract B from A, or return undefined if the case doesn't apply.
 * @param inject - Construct an A from a B.
 */
export function prism<A, B>(match: (a: A) => B | undefined, inject: (b: B) => A): Prism<A, B> {
  return { match, inject }
}

/**
 * Compose two prisms. If `ab` focuses on B within A, and `bc` focuses on C within B,
 * the result focuses on C within A.
 */
export function composePrism<A, B, C>(ab: Prism<A, B>, bc: Prism<B, C>): Prism<A, C> {
  return {
    match: (a) => {
      const b = ab.match(a)
      return b !== undefined ? bc.match(b) : undefined
    },
    inject: (c) => ab.inject(bc.inject(c)),
  }
}

/** Prism for the Some case of an optional value */
export function some<A>(): Prism<A | undefined, A> {
  return prism(
    (a) => a,
    (a) => a,
  )
}

/**
 * Prism that always matches — models an isomorphism between A and B.
 * @param to - Convert A to B.
 * @param from - Convert B back to A.
 */
export function iso<A, B>(to: (a: A) => B, from: (b: B) => A): Prism<A, B> {
  return prism(to, from)
}
