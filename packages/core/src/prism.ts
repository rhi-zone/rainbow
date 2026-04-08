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

/**
 * Prism from a type predicate. The most general constructor — `some` and
 * `nullable` are both special cases.
 *
 * @example
 *   const positive = guard((n: number): n is number => n > 0)
 *   signal(signal.narrow(positive))  // Signal<number | undefined>
 */
export function guard<A, B extends A>(predicate: (a: A) => a is B): Prism<A, B> {
  return prism(
    (a) => predicate(a) ? a : undefined,
    (b) => b,
  )
}

/**
 * Prism for the non-null case. Use `some` for `T | undefined`,
 * `nullable` for `T | null`.
 */
export function nullable<A>(): Prism<A | null, A> {
  return prism(
    (a) => a !== null ? a : undefined,
    (a) => a,
  )
}

/**
 * Prism for a specific variant of a discriminated union, matched by a tag field.
 *
 * `A` cannot be inferred from the key/value arguments alone — provide it
 * explicitly when not in a `.narrow()` context where it can be inferred:
 *
 * @example
 *   type Shape = { kind: "circle"; r: number } | { kind: "rect"; w: number; h: number }
 *
 *   // In a narrow() call — A inferred from the signal's type:
 *   shapeSignal.narrow(tagged("kind", "circle"))
 *   // Signal<{ kind: "circle"; r: number } | undefined>
 *
 *   // Standalone — provide A explicitly (K and V are inferred from the args):
 *   const circle = tagged<Shape>("kind", "circle")
 *   // Prism<Shape, { kind: "circle"; r: number }>
 */
export function tagged<A, K extends keyof A, V extends A[K]>(
  key: K,
  value: V,
): Prism<A, Extract<A, Record<K, V>>> {
  return prism(
    (a) => a[key] === value ? a as Extract<A, Record<K, V>> : undefined,
    // Extract<A, Record<K,V>> extends A, so this upcast is safe
    (b) => b,
  )
}
