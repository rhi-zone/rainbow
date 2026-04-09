import type { Lens } from './lens.ts'

/**
 * A Traversal<A, B> focuses on zero or more B values within A.
 *
 * Laws:
 *   modify(a, id) = a
 *   modify(modify(a, f), g) = modify(a, g ∘ f)   [when f, g commute on elements]
 */
export interface Traversal<A, B> {
  /** Extract all focused values from `a`. */
  getAll(a: A): B[]
  /** Apply `f` to every focused value and return the updated `a`. */
  modify(a: A, f: (b: B) => B): A
}

/**
 * Construct a traversal from explicit getAll and modify functions.
 * @param getAll - Extract all focused values.
 * @param modify - Apply a function to every focused value.
 */
export function traversal<A, B>(
  getAll: (a: A) => B[],
  modify: (a: A, f: (b: B) => B) => A,
): Traversal<A, B> {
  return { getAll, modify }
}

/** Focus on every element of an array */
export function each<B>(): Traversal<B[], B> {
  return traversal(
    (a) => [...a],
    (a, f) => a.map(f),
  )
}

/**
 * Focus on elements matching a predicate.
 * Non-matching elements pass through unmodified.
 */
export function filtered<B>(pred: (b: B) => boolean): Traversal<B[], B> {
  return traversal(
    (a) => a.filter(pred),
    (a, f) => a.map((b) => (pred(b) ? f(b) : b)),
  )
}

/**
 * Focus on a single element by index.
 * If the index is out of bounds, `getAll` returns `[]` and `modify` is a no-op.
 */
export function nth<B>(index: number): Traversal<B[], B> {
  return traversal(
    (a) => a.filter((_, i) => i === index),
    (a, f) => a.map((b, i) => (i === index ? f(b) : b)),
  )
}

/**
 * Compose a lens with a traversal.
 * Focuses the lens on B within A, then the traversal on C within B.
 */
export function composeWithLens<A, B extends object, C>(
  lens: Lens<A, B>,
  t: Traversal<B, C>,
): Traversal<A, C> {
  return traversal(
    (a) => t.getAll(lens.view(a)),
    (a, f) => lens.review(t.modify(lens.view(a), f), a),
  )
}

/**
 * Compose two traversals.
 * `getAll` flatMaps; `modify` nests.
 */
export function composeTraversal<A, B, C>(
  ab: Traversal<A, B>,
  bc: Traversal<B, C>,
): Traversal<A, C> {
  return traversal(
    (a) => ab.getAll(a).flatMap((b) => bc.getAll(b)),
    (a, f) => ab.modify(a, (b) => bc.modify(b, f)),
  )
}
