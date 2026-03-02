import type { Lens } from './lens.ts'

/**
 * A Traversal<A, B> focuses on zero or more B values within A.
 *
 * Laws:
 *   modify(a, id) = a
 *   modify(modify(a, f), g) = modify(a, g ∘ f)   [when f, g commute on elements]
 */
export interface Traversal<A, B> {
  getAll(a: A): B[]
  modify(a: A, f: (b: B) => B): A
}

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

/** Focus on elements matching a predicate */
export function filtered<B>(pred: (b: B) => boolean): Traversal<B[], B> {
  return traversal(
    (a) => a.filter(pred),
    (a, f) => a.map((b) => (pred(b) ? f(b) : b)),
  )
}

/** Focus on a single element by index */
export function nth<B>(index: number): Traversal<B[], B> {
  return traversal(
    (a) => a.filter((_, i) => i === index),
    (a, f) => a.map((b, i) => (i === index ? f(b) : b)),
  )
}

/** Compose a lens with a traversal */
export function composeWithLens<A, B extends object, C>(
  lens: Lens<A, B>,
  t: Traversal<B, C>,
): Traversal<A, C> {
  return traversal(
    (a) => t.getAll(lens.get(a)),
    (a, f) => lens.set(a, t.modify(lens.get(a), f)),
  )
}

/** Compose two traversals */
export function composeTraversal<A, B, C>(
  ab: Traversal<A, B>,
  bc: Traversal<B, C>,
): Traversal<A, C> {
  return traversal(
    (a) => ab.getAll(a).flatMap((b) => bc.getAll(b)),
    (a, f) => ab.modify(a, (b) => bc.modify(b, f)),
  )
}
